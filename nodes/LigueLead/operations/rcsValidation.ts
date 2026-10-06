import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { apiFailureOf, llRequest } from './request';

type Agent = {
	id?: string;
	app_id?: string | null;
	status?: string;
	sender_name?: string;
	rejection_reason?: string | null;
};
type Template = { id?: string; title?: string; agent_id?: string } & Record<string, unknown>;
type TemplateVariable = { key: string; value: string };

function fail(
	ctx: IExecuteFunctions,
	itemIndex: number,
	message: string,
	description?: string,
): never {
	throw new NodeOperationError(ctx.getNode(), message, { itemIndex, description });
}

// ── Local checks: run before the send and never call the API ─────────────

export function validatePhones(ctx: IExecuteFunctions, itemIndex: number, phones: string[]) {
	const invalid = phones.filter((phone) => {
		const digits = phone.replace(/\D/g, '');
		return !(digits.length === 11 || (digits.length === 13 && digits.startsWith('55')));
	});
	if (invalid.length) {
		fail(
			ctx,
			itemIndex,
			`Telefone(s) inválido(s): ${invalid.join(', ')}`,
			'Use o formato nacional com DDD (11999999999), com +55 (+5511999999999) ou com DDI sem + (5511999999999).',
		);
	}
}

export function validateAgentIdFormat(ctx: IExecuteFunctions, itemIndex: number, agentId: string) {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId)) {
		fail(
			ctx,
			itemIndex,
			`Agent ID "${agentId}" não é um ID válido`,
			'O Agent ID é um UUID (ex.: 7b3c1e90-4d2a-4f11-9c8e-2a5b6d0f3e47). Use a operação "List RCS Agents" para copiá-lo.',
		);
	}
}

export function validateVariableKeys(
	ctx: IExecuteFunctions,
	itemIndex: number,
	variables: TemplateVariable[],
) {
	const badKeys = variables.filter((v) => !/^\d+$/.test(v.key.trim())).map((v) => v.key);
	if (badKeys.length) {
		fail(
			ctx,
			itemIndex,
			`Chave(s) de variável inválida(s): ${badKeys.join(', ')}`,
			'As chaves das Template Variables são números que correspondem aos placeholders do template: "1" para {{1}}, "2" para {{2}}, etc.',
		);
	}
}

// ── Diagnosis: only after the API refuses a send, at most 2 lookups per run ──

// Lookups are shared by every failed item of the same execution, so a batch failing
// for the same reason costs one GET instead of one per item
const lookups = new WeakMap<object, Map<string, Promise<unknown[] | null>>>();

function fetchList<T>(ctx: IExecuteFunctions, itemIndex: number, url: string): Promise<T[] | null> {
	let perRun = lookups.get(ctx);
	if (!perRun) {
		perRun = new Map();
		lookups.set(ctx, perRun);
	}
	let pending = perRun.get(url);
	if (!pending) {
		pending = llRequest<unknown[] | { data?: unknown[] }>(ctx, itemIndex, {
			method: 'GET',
			url,
			retryOnThrottle: true,
		})
			.then((response) => {
				const list = Array.isArray(response) ? response : response?.data;
				return Array.isArray(list) ? list : null;
			})
			.catch(() => null);
		perRun.set(url, pending);
	}
	return pending as Promise<T[] | null>;
}

type Diagnosis = { message: string; description: string };

async function diagnoseAgent(
	ctx: IExecuteFunctions,
	agentId: string,
	agents: Agent[],
): Promise<Diagnosis | undefined> {
	const credentials = await ctx.getCredentials('llApi');
	const appId = String(credentials.appId ?? '');
	const agent = agents.find((a) => a.id === agentId);
	const name = agent?.sender_name ? ` (${agent.sender_name})` : '';

	if (!agent) {
		return {
			message: `Agente RCS ${agentId} não existe nesta conta`,
			description:
				'Confira o Agent ID ou use a operação "List RCS Agents" com esta mesma credencial para ver os agentes disponíveis.',
		};
	}
	if (agent.app_id !== appId) {
		return {
			message: `Agente RCS ${agentId}${name} não pertence ao App ID desta credencial`,
			description:
				`O agente está cadastrado no App ID ${agent.app_id ?? '(nenhum)'}, mas a credencial usa o App ID ${appId}. ` +
				'Use a credencial do app onde o agente foi cadastrado, ou escolha um agente com "can_send_with_this_credential = true" em "List RCS Agents".',
		};
	}
	if (agent.status !== 'approved') {
		return {
			message: `Agente RCS ${agentId}${name} não está aprovado (status: ${agent.status})`,
			description: agent.rejection_reason
				? `Motivo da reprovação: ${agent.rejection_reason}`
				: 'Só agentes com status "approved" podem enviar RCS. Aguarde a aprovação ou use outro agente.',
		};
	}
	return undefined;
}

async function diagnoseTemplate(
	ctx: IExecuteFunctions,
	itemIndex: number,
	baseUrl: string,
	templateId: string,
	variables: TemplateVariable[],
): Promise<Diagnosis | undefined> {
	const templates = await fetchList<Template>(ctx, itemIndex, `${baseUrl}/rcs/templates`);
	if (!templates) return undefined;

	const template = templates.find((t) => t.id === templateId);
	if (!template) {
		return {
			message: `Template RCS ${templateId} não existe nesta conta`,
			description:
				'Confira o Template ID no painel da LigueLead (RCS Templates) e se ele foi criado na mesma conta da credencial.',
		};
	}

	if (template.agent_id) {
		const agents = await fetchList<Agent>(ctx, itemIndex, `${baseUrl}/rcs/agents`);
		const agent = agents?.find((a) => a.id === template.agent_id);
		if (agent && agent.status !== 'approved') {
			const name = agent.sender_name ? ` (${agent.sender_name})` : '';
			return {
				message: `O agente do template "${template.title ?? templateId}"${name} não está aprovado (status: ${agent.status})`,
				description: agent.rejection_reason
					? `Motivo da reprovação: ${agent.rejection_reason}`
					: 'Templates só enviam quando o agente vinculado a eles está aprovado. Aguarde a aprovação ou use outro template.',
			};
		}
	}

	// The listing may omit the template content; only check placeholders when it is there
	const hasContent = ['body', 'header', 'cards', 'fallback_message'].some(
		(k) => template[k] !== undefined,
	);
	if (!hasContent) return undefined;
	const placeholders = new Set(
		[...JSON.stringify(template).matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]),
	);
	const unknownKeys = variables.map((v) => v.key.trim()).filter((k) => !placeholders.has(k));
	if (unknownKeys.length) {
		const available = placeholders.size
			? [...placeholders].map((k) => `{{${k}}}`).join(', ')
			: 'nenhum';
		return {
			message: `Variável(is) ${unknownKeys.map((k) => `{{${k}}}`).join(', ')} não existe(m) no template "${template.title ?? templateId}"`,
			description: `Placeholders disponíveis neste template: ${available}.`,
		};
	}
	return undefined;
}

// Rethrows a refused RCS send, enriched with the concrete cause when a lookup can find it.
// Throttling, auth and server errors are passed through untouched (no extra calls).
export async function explainRcsFailure(
	ctx: IExecuteFunctions,
	itemIndex: number,
	baseUrl: string,
	error: unknown,
	send: { agentId?: string; templateId?: string; variables: TemplateVariable[] },
): Promise<never> {
	const failure = apiFailureOf(error);
	const diagnosable =
		failure &&
		[400, 403, 404, 422].includes(failure.status) &&
		/agent|template|variable|placeholder/i.test(failure.reason);
	if (!diagnosable) throw error;

	let diagnosis: Diagnosis | undefined;
	if (send.agentId && /agent/i.test(failure.reason)) {
		const agents = await fetchList<Agent>(ctx, itemIndex, `${baseUrl}/rcs/agents`);
		if (agents) diagnosis = await diagnoseAgent(ctx, send.agentId, agents);
	}
	if (!diagnosis && send.templateId) {
		diagnosis = await diagnoseTemplate(ctx, itemIndex, baseUrl, send.templateId, send.variables);
	}
	if (!diagnosis) throw error;

	const original = error as NodeOperationError;
	throw new NodeOperationError(ctx.getNode(), diagnosis.message, {
		itemIndex,
		description: `${diagnosis.description}\n\nResposta da API: ${original.message}\n${original.description ?? ''}`,
	});
}

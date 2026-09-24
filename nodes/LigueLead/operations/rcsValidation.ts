import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

type Agent = { id?: string; app_id?: string | null; status?: string; sender_name?: string };
type Template = { id?: string; title?: string } & Record<string, unknown>;
type TemplateVariable = { key: string; value: string };

// Agents and templates are fetched once per execution, not once per item
const cache = new WeakMap<object, { agents?: Promise<Agent[] | null>; templates?: Promise<Template[] | null> }>();

function getCache(ctx: IExecuteFunctions) {
	let entry = cache.get(ctx);
	if (!entry) {
		entry = {};
		cache.set(ctx, entry);
	}
	return entry;
}

// Returns null when the lookup itself fails, so the API gets the final say
async function fetchList<T>(ctx: IExecuteFunctions, url: string): Promise<T[] | null> {
	try {
		const response = (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'llApi', {
			method: 'GET',
			url,
			json: true,
		})) as T[] | { data?: T[] };
		const list = Array.isArray(response) ? response : response?.data;
		return Array.isArray(list) ? list : null;
	} catch {
		return null;
	}
}

function fail(ctx: IExecuteFunctions, itemIndex: number, message: string, description?: string): never {
	throw new NodeOperationError(ctx.getNode(), message, { itemIndex, description });
}

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

export async function validateAgent(
	ctx: IExecuteFunctions,
	itemIndex: number,
	baseUrl: string,
	agentId: string,
) {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId)) {
		fail(
			ctx,
			itemIndex,
			`Agent ID "${agentId}" não é um ID válido`,
			'O Agent ID é um UUID (ex.: 7b3c1e90-4d2a-4f11-9c8e-2a5b6d0f3e47). Use a operação "List RCS Agents" para copiá-lo.',
		);
	}

	const entry = getCache(ctx);
	entry.agents ??= fetchList<Agent>(ctx, `${baseUrl}/rcs/agents`);
	const agents = await entry.agents;
	if (!agents) return;

	const credentials = await ctx.getCredentials('llApi');
	const appId = String(credentials.appId ?? '');
	const agent = agents.find((a) => a.id === agentId);
	const name = agent?.sender_name ? ` (${agent.sender_name})` : '';

	if (!agent) {
		fail(
			ctx,
			itemIndex,
			`Agente RCS ${agentId} não existe nesta conta`,
			'Confira o Agent ID ou use a operação "List RCS Agents" com esta mesma credencial para ver os agentes disponíveis.',
		);
	}
	if (agent.app_id !== appId) {
		fail(
			ctx,
			itemIndex,
			`Agente RCS ${agentId}${name} não pertence ao App ID desta credencial`,
			`O agente está cadastrado no App ID ${agent.app_id ?? '(nenhum)'}, mas a credencial usa o App ID ${appId}. ` +
				'Use a credencial do app onde o agente foi cadastrado, ou escolha um agente com "can_send_with_this_credential = true" em "List RCS Agents".',
		);
	}
	if (agent.status !== 'approved') {
		fail(
			ctx,
			itemIndex,
			`Agente RCS ${agentId}${name} ainda não está aprovado (status: ${agent.status})`,
			'Só agentes com status "approved" podem enviar RCS. Aguarde a aprovação ou use outro agente.',
		);
	}
}

export async function validateTemplate(
	ctx: IExecuteFunctions,
	itemIndex: number,
	baseUrl: string,
	templateId: string,
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

	const entry = getCache(ctx);
	entry.templates ??= fetchList<Template>(ctx, `${baseUrl}/rcs/templates`);
	const templates = await entry.templates;
	if (!templates) return;

	const template = templates.find((t) => t.id === templateId);
	if (!template) {
		fail(
			ctx,
			itemIndex,
			`Template RCS ${templateId} não existe nesta conta`,
			'Confira o Template ID no painel da LigueLead (RCS Templates) e se ele foi criado na mesma conta da credencial.',
		);
	}

	const placeholders = new Set(
		[...JSON.stringify(template).matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]),
	);
	const unknownKeys = variables.map((v) => v.key.trim()).filter((k) => !placeholders.has(k));
	if (unknownKeys.length) {
		const available = placeholders.size
			? [...placeholders].map((k) => `{{${k}}}`).join(', ')
			: 'nenhum';
		fail(
			ctx,
			itemIndex,
			`Variável(is) ${unknownKeys.map((k) => `{{${k}}}`).join(', ')} não existe(m) no template "${template.title ?? templateId}"`,
			`Placeholders disponíveis neste template: ${available}.`,
		);
	}
}

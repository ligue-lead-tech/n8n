import type { IDataObject, IExecuteFunctions, IHttpRequestMethods } from 'n8n-workflow';
import { NodeOperationError, sleep } from 'n8n-workflow';

declare const require: (id: string) => unknown;
export const NODE_VERSION = (() => {
	try {
		return (require('../../../package.json') as { version?: string }).version ?? 'unknown';
	} catch {
		return 'unknown';
	}
})();

type FullResponse = {
	body: unknown;
	headers: Record<string, string | string[] | undefined>;
	statusCode: number;
	statusMessage?: string;
};

// Counts this node's API calls per execution, so rate-limit errors can show the real volume
const usage = new WeakMap<object, { count: number; firstAt: number; accepted: number }>();

function track(ctx: IExecuteFunctions) {
	let entry = usage.get(ctx);
	if (!entry) {
		entry = { count: 0, firstAt: Date.now(), accepted: 0 };
		usage.set(ctx, entry);
	}
	entry.count++;
	return entry;
}

function header(headers: FullResponse['headers'], name: string): string | undefined {
	const key = Object.keys(headers ?? {}).find((k) => k.toLowerCase() === name);
	const value = key ? headers[key] : undefined;
	return Array.isArray(value) ? value.join(', ') : value;
}

function parseBody(value: unknown): unknown {
	if (value === null || value === undefined) return undefined;
	if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) value = value.toString('utf8');
	if (typeof value === 'string') {
		try {
			return JSON.parse(value);
		} catch {
			return value.trim() ? value.trim() : undefined;
		}
	}
	return value;
}

// The API answers { error: string } or { error: [{ field, message }] }; other layers may send text/HTML
export function describeBody(body: unknown): string | undefined {
	if (typeof body === 'string') {
		// Gateways sometimes answer with an HTML page; keep only its text
		const text = /<[a-z!/][\s\S]*>/i.test(body)
			? body.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
			: body;
		return text.replace(/\s+/g, ' ').trim().slice(0, 1000) || undefined;
	}
	if (!body || typeof body !== 'object') return undefined;
	const data = body as { error?: unknown; errors?: unknown; message?: unknown; detail?: unknown };
	const err = data.error ?? data.errors ?? data.detail;
	if (typeof err === 'string') return err;
	if (Array.isArray(err) && err.length) {
		return err
			.map((item: { field?: string; message?: string } | string) =>
				typeof item === 'string'
					? item
					: item?.field
						? `${item.field}: ${item.message}`
						: String(item?.message ?? JSON.stringify(item)),
			)
			.join('; ');
	}
	if (err && typeof err === 'object') return describeBody(err);
	if (typeof data.message === 'string') return data.message;
	return JSON.stringify(body).slice(0, 1000);
}

function explainStatus(status: number, itemsInRun: number): string {
	if (status === 400) return 'A requisição veio malformada. Confira os campos preenchidos no node.';
	if (status === 401)
		return 'Credencial recusada: o API Token ou o App ID da credencial estão errados, expirados ou bloqueados. Gere/confira em Integrações → API Token no painel da LigueLead.';
	if (status === 402) return 'A conta não tem saldo/créditos suficientes para este envio.';
	if (status === 403)
		return 'A credencial não tem permissão para este recurso (ex.: produto não habilitado na conta ou App ID diferente do dono do recurso).';
	if (status === 404)
		return 'O recurso informado não existe para esta credencial (ID de áudio, template ou agente errado, ou de outro App ID).';
	if (status === 408 || status === 504)
		return 'A API demorou demais para responder (timeout). Tente novamente; se repetir, envie os dados abaixo ao suporte da LigueLead.';
	if (status === 413)
		return 'O conteúdo enviado é grande demais (ex.: arquivo de áudio acima do limite).';
	if (status === 415) return 'Formato do conteúdo não aceito pela API.';
	if (status === 422)
		return 'A API recusou os dados enviados. O motivo acima diz qual campo ou regra falhou.';
	if (status === 429)
		return (
			'Limite de requisições atingido, ou a camada de infraestrutura da LigueLead não conseguiu atender a chamada (throttling no gateway). ' +
			(itemsInRun > 1
				? `Este node recebeu ${itemsInRun} itens e faz 1 envio por item. Para volumes grandes, agrupe vários telefones no campo "Phones" de um mesmo item (até 10.000 por envio) ou use um node "Loop Over Items" com "Wait" entre os lotes. `
				: '') +
			'Evite "Retry On Fail" com espera curta e execuções paralelas com a mesma credencial. Se o volume for baixo e o erro persistir, é limite/instabilidade do lado da LigueLead: envie os dados abaixo ao suporte.'
		);
	if (status >= 500)
		return 'Erro interno ou instabilidade na API da LigueLead. Não é problema de configuração do node. Tente novamente; se repetir, envie os dados abaixo ao suporte.';
	return 'A API recusou a requisição.';
}

export type LlRequest = {
	method: IHttpRequestMethods;
	url: string;
	body?: unknown;
	headers?: IDataObject;
	// GETs used for validation can be retried safely; sends never are, to avoid duplicates
	retryOnThrottle?: boolean;
};

export async function llRequest<T = unknown>(
	ctx: IExecuteFunctions,
	itemIndex: number,
	req: LlRequest,
): Promise<T> {
	const credentials = await ctx.getCredentials('llApi');
	const appId = String(credentials.appId ?? '');
	const path = req.url.replace(/^https?:\/\/[^/]+/, '');
	const itemsInRun = ctx.getInputData().length;
	const attempts = req.retryOnThrottle ? 3 : 1;

	let response: FullResponse | undefined;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		const stats = track(ctx);
		const startedAt = new Date();
		try {
			response = (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'llApi', {
				method: req.method,
				url: req.url,
				headers: req.headers,
				body: req.body as IDataObject,
				json: true,
				returnFullResponse: true,
				ignoreHttpStatusErrors: true,
			})) as FullResponse;
		} catch (error) {
			// No HTTP response at all: DNS, connection reset, TLS, timeout...
			const e = error as {
				message?: string;
				code?: string;
				cause?: { code?: string; message?: string };
			};
			const code = e?.code ?? e?.cause?.code;
			throw new NodeOperationError(
				ctx.getNode(),
				`Não foi possível falar com a LigueLead (${req.method} ${path}): ${e?.cause?.message ?? e?.message ?? String(error)}`,
				{
					itemIndex,
					description: [
						'A requisição não chegou a ter resposta da API (falha de rede, DNS, certificado ou timeout).',
						code ? `Código do erro: ${code}` : '',
						`Base URL da credencial: ${String(credentials.baseUrl ?? '')}`,
						`Horário: ${startedAt.toISOString()}`,
						`(LigueLead node v${NODE_VERSION})`,
					]
						.filter(Boolean)
						.join('\n'),
				},
			);
		}

		// Some n8n versions may ignore returnFullResponse and hand back only the body
		if (typeof response?.statusCode !== 'number') {
			if (req.method !== 'GET') stats.accepted++;
			return parseBody(response) as T;
		}
		const status = response.statusCode;
		const retryable = status === 429 || status === 502 || status === 503 || status === 504;
		if (status < 400) {
			if (req.method !== 'GET') stats.accepted++;
			return parseBody(response.body) as T;
		}
		if (retryable && attempt < attempts) {
			const retryAfter = Number(header(response.headers, 'retry-after'));
			const waitMs =
				Number.isFinite(retryAfter) && retryAfter > 0
					? Math.min(retryAfter, 10) * 1000
					: attempt * 1500;
			await sleep(waitMs);
			continue;
		}

		const body = parseBody(response.body);
		const reason = describeBody(body) ?? response.statusMessage ?? 'sem corpo na resposta';
		const elapsed = ((Date.now() - stats.firstAt) / 1000).toFixed(1);
		const limitHeaders = [
			'retry-after',
			'x-ratelimit-limit',
			'x-ratelimit-remaining',
			'x-ratelimit-reset',
		]
			.map((name) => [name, header(response!.headers, name)])
			.filter(([, value]) => value)
			.map(([name, value]) => `${name}: ${value}`);
		const traceIds = [
			'x-amz-cf-id',
			'x-request-id',
			'x-amzn-requestid',
			'x-amzn-trace-id',
			'cf-ray',
		]
			.map((name) => [name, header(response!.headers, name)])
			.filter(([, value]) => value)
			.map(([name, value]) => `${name}: ${value}`);

		throw new NodeOperationError(
			ctx.getNode(),
			`A LigueLead recusou a requisição (HTTP ${status}): ${reason}`,
			{
				itemIndex,
				description: [
					`Chamada: ${req.method} ${path}`,
					`Motivo informado pela API: ${reason}`,
					`O que significa: ${explainStatus(status, itemsInRun)}`,
					limitHeaders.length ? `Limites informados pela API: ${limitHeaders.join(' | ')}` : '',
					`Volume deste node nesta execução: ${stats.count} requisição(ões) em ${elapsed}s; item ${itemIndex + 1} de ${itemsInRun}` +
						(attempts > 1 ? `; ${attempt} tentativa(s) nesta chamada` : ''),
					stats.accepted
						? `Atenção: ${stats.accepted} envio(s) anterior(es) desta execução JÁ foram aceitos pela API. Reexecutar todos os itens vai enviar de novo para esses contatos; reenvie só a partir do item ${itemIndex + 1}.`
						: '',
					`Para o suporte LigueLead: horário ${header(response.headers, 'date') ?? startedAt.toUTCString()} | App ID ${appId}` +
						(traceIds.length ? ` | ${traceIds.join(' | ')}` : ''),
					`(LigueLead node v${NODE_VERSION})`,
				]
					.filter(Boolean)
					.join('\n'),
			},
		);
	}
	throw new NodeOperationError(ctx.getNode(), 'Falha inesperada ao chamar a LigueLead', {
		itemIndex,
	});
}

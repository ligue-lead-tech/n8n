import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { getOperation, operationOptions, operationProperties } from './operations';

// The LigueLead API returns { error: string } or { error: [{ field, message }] }, but the
// body reaches us in different shapes depending on the n8n version (object, JSON string,
// Buffer, nested in cause/response/context). Dig it out so the real reason is shown
// instead of n8n's generic "request is invalid" message.
function parseBody(value: unknown): unknown {
	if (value === null || value === undefined) return undefined;
	// Buffer is a Uint8Array, so this also covers Node buffers
	if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
		const bytes = Array.from(new Uint8Array(value), (b) => '%' + b.toString(16).padStart(2, '0'));
		try {
			value = decodeURIComponent(bytes.join(''));
		} catch {
			return undefined;
		}
	}
	if (typeof value === 'string') {
		try {
			return JSON.parse(value);
		} catch {
			return value.trim() ? value : undefined;
		}
	}
	return value;
}

function describeBody(body: unknown): string | undefined {
	if (typeof body === 'string') return body;
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
	return undefined;
}

function findApiBody(error: unknown, depth = 0): string | undefined {
	if (!error || typeof error !== 'object' || depth > 4) return undefined;
	const e = error as Record<string, unknown>;
	const response = e.response as Record<string, unknown> | undefined;
	const context = e.context as Record<string, unknown> | undefined;
	const candidates = [context?.data, response?.data, response?.body, e.error, e.body];
	for (const candidate of candidates) {
		const detail = describeBody(parseBody(candidate));
		if (detail) return detail;
	}
	return findApiBody(e.cause, depth + 1) ?? findApiBody(e.errorResponse, depth + 1);
}

function findHttpStatus(error: unknown, depth = 0): string | undefined {
	if (!error || typeof error !== 'object' || depth > 4) return undefined;
	const e = error as Record<string, unknown>;
	const response = e.response as Record<string, unknown> | undefined;
	const status = e.httpCode ?? e.statusCode ?? response?.status ?? response?.statusCode;
	if (status) return String(status);
	return findHttpStatus(e.cause, depth + 1) ?? findHttpStatus(e.errorResponse, depth + 1);
}

// Shown in error descriptions so screenshots tell us which package version is installed
declare const require: (id: string) => unknown;
const NODE_VERSION = (() => {
	try {
		return (require('../../../package.json') as { version?: string }).version ?? 'unknown';
	} catch {
		return 'unknown';
	}
})();

function rawBody(error: unknown, depth = 0): string | undefined {
	if (!error || typeof error !== 'object' || depth > 4) return undefined;
	const e = error as Record<string, unknown>;
	const response = e.response as Record<string, unknown> | undefined;
	const context = e.context as Record<string, unknown> | undefined;
	for (const candidate of [context?.data, response?.data, response?.body, e.error, e.body]) {
		const body = parseBody(candidate);
		if (body === undefined) continue;
		const text = typeof body === 'string' ? body : JSON.stringify(body);
		if (text && text !== '{}') return text.slice(0, 1000);
	}
	return rawBody(e.cause, depth + 1);
}

function describeUnknownError(error: unknown): { message: string; description: string } {
	const e = error as { message?: string; description?: string; messages?: string[] };
	const status = findHttpStatus(error);
	const body = rawBody(error);
	const original = [e?.description, ...(e?.messages ?? [])].filter(
		(m, idx, all): m is string => !!m && all.indexOf(m) === idx,
	);
	const message = status
		? `A LigueLead recusou a requisição (HTTP ${status})${body ? `: ${body}` : ''}`
		: `Erro ao chamar a LigueLead: ${e?.message ?? String(error)}`;
	const description = [
		body ? `Resposta da API: ${body}` : 'A API não devolveu corpo na resposta.',
		original.length ? `Detalhes: ${original.join(' | ')}` : '',
	]
		.filter(Boolean)
		.join('\n');
	return { message, description };
}

function extractApiErrorMessage(error: unknown): string | undefined {
	const detail = findApiBody(error);
	if (!detail) return undefined;
	const status = findHttpStatus(error);
	return status ? `A LigueLead recusou a requisição (HTTP ${status}): ${detail}` : detail;
}

export class LigueLead implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LigueLead',
		name: 'ligueLead',
		group: ['output'],
		version: 3,
		description: 'Send SMS and calls via LigueLead API',
		subtitle: '={{$parameter["operation"]}}',
		usableAsTool: true,
		defaults: { name: 'LigueLead' },
		icon: 'file:logo.svg',
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'llApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true, // ✅ required
				options: operationOptions as unknown as INodePropertyOptions[],
				default: '', // ✅ fixed
			} as INodeProperties,

			...operationProperties,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operationValue = this.getNodeParameter('operation', i) as string;
				const op = getOperation(this, operationValue);

				const json = (await op.execute(this, i)) as Record<string, unknown>;

				returnData.push({
					json: {
						ok: true,
						operation: operationValue,
						...json,
					},
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: extractApiErrorMessage(error) ?? (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				if ((error as Error)?.name === 'NodeOperationError') {
					const opError = error as NodeOperationError;
					opError.description = `${opError.description ?? opError.message}\n\n(LigueLead node v${NODE_VERSION})`;
					throw opError;
				}
				const apiMessage = extractApiErrorMessage(error);
				if (apiMessage) {
					throw new NodeOperationError(this.getNode(), apiMessage, {
						itemIndex: i,
						description: `${apiMessage}\n\n(LigueLead node v${NODE_VERSION})`,
					});
				}
				// Never fall back to n8n's generic "request is invalid" text: show whatever we have
				const fallback = describeUnknownError(error);
				throw new NodeOperationError(this.getNode(), fallback.message, {
					itemIndex: i,
					description: `${fallback.description}\n\n(LigueLead node v${NODE_VERSION})`,
				});
			}
		}

		return [returnData];
	}
}

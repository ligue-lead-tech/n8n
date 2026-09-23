import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	INodeProperties,
	INodePropertyOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeApiError } from 'n8n-workflow';

import { getOperation, operationOptions, operationProperties } from './operations';

// The LigueLead API returns { error: string } or { error: [{ field, message }] };
// n8n hides that body behind a generic "request is invalid" message, so surface it.
function extractApiErrorMessage(error: unknown): string | undefined {
	const e = error as {
		context?: { data?: unknown };
		cause?: { response?: { data?: unknown; body?: unknown } };
		response?: { data?: unknown; body?: unknown };
	};
	const data = (e?.context?.data ??
		e?.cause?.response?.data ??
		e?.cause?.response?.body ??
		e?.response?.data ??
		e?.response?.body) as { error?: unknown; message?: unknown } | undefined;
	if (!data || typeof data !== 'object') return undefined;

	const err = data.error ?? data.message;
	if (typeof err === 'string') return err;
	if (Array.isArray(err)) {
		return err
			.map((item: { field?: string; message?: string }) =>
				item?.field ? `${item.field}: ${item.message}` : String(item?.message ?? item),
			)
			.join('; ');
	}
	return undefined;
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
				const apiMessage = extractApiErrorMessage(error);
				if (error instanceof NodeApiError || (error as Error)?.name === 'NodeApiError') {
					if (apiMessage) {
						(error as NodeApiError).message = apiMessage;
						(error as NodeApiError).description = apiMessage;
					}
					throw error;
				}
				throw new NodeApiError(
					this.getNode(),
					error as JsonObject,
					apiMessage ? { message: apiMessage, description: apiMessage } : undefined,
				);
			}
		}

		return [returnData];
	}
}

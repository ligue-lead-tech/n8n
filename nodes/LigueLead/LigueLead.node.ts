import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	INodeProperties,
	INodePropertyOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeApiError } from 'n8n-workflow';

import { getOperation, operationOptions, operationProperties } from './operations';

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

	methods = {
		loadOptions: {
			async getRcsTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('llApi');
				const baseUrl = (credentials.baseUrl as string).replace(/\/$/, '');
				const appId = credentials.appId as string;

				const response = await this.helpers.httpRequestWithAuthentication.call(this, 'llApi', {
					method: 'GET',
					url: `${baseUrl}/rcs/templates`,
					json: true,
				}) as Array<Record<string, unknown>>;

				const allTemplates = Array.isArray(response)
					? response
					: ((response as unknown as { data: Array<Record<string, unknown>> }).data ?? []);

				const APP_ID_FIELDS = ['app_id', 'appId', 'application_id', 'applicationId'];
				const appIdField = APP_ID_FIELDS.find((f) => allTemplates[0]?.[f] !== undefined);

				const templates = appIdField
					? allTemplates.filter((t) => String(t[appIdField]) === String(appId))
					: allTemplates;

				const POSSIBLE_NAME_FIELDS = ['name', 'title', 'template_name', 'label', 'display_name'];
				const nameField = POSSIBLE_NAME_FIELDS.find((f) => templates[0]?.[f] !== undefined)
					?? POSSIBLE_NAME_FIELDS.find((f) => allTemplates[0]?.[f] !== undefined);

				return templates.map((t) => {
					const displayName = nameField
						? String(t[nameField])
						: Object.entries(t)
								.filter(([k, v]) => !['id', 'template_id', ...(appIdField ? [appIdField] : [])].includes(k) && typeof v === 'string' && !(v as string).match(/^[0-9a-f-]{36}$/i))
								.map(([k, v]) => `${k}: ${v}`)
								.join(' | ') || String(t['id'] ?? t['template_id']);

					const idValue = String(t['id'] ?? t['template_id'] ?? '');

					return { name: displayName, value: idValue };
				});
			},
		},
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
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeApiError(this.getNode(), error as JsonObject);
			}
		}

		return [returnData];
	}
}

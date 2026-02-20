import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';

import { getOperation, operationOptions, operationProperties } from './operations';

export class LigueLead implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LigueLead',
		name: 'ligueLead',
		group: ['output'],
		version: 3,
		description: 'Send SMS and calls via LigueLead API',
		usableAsTool: true,
		defaults: { name: 'LigueLead' },
		icon: 'file:logo.svg',
		inputs: ['main'],
		outputs: ['main'],
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
			const operationValue = this.getNodeParameter('operation', i) as string;
			const op = getOperation(this, operationValue);

			const json = (await op.execute(this, i)) as Record<string, unknown>;

			returnData.push({
				json: {
					ok: true,
					operation: operationValue,
					...json,
				},
			pairedItem: {item: i},
			});
		}

		return [returnData];
	}
}

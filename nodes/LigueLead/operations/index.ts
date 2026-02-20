import { NodeOperationError, type IExecuteFunctions, type INodeProperties } from 'n8n-workflow';
import type { OperationDef } from './types';

import { sendSmsOperation } from './sendSms.operation';
import { sendVoiceOperation } from './sendVoice.operation';

export const operations: OperationDef[] = [sendSmsOperation, sendVoiceOperation];

// 1) Dropdown options (dynamic)
export const operationOptions = operations.map((op) => ({
	name: op.name,
	value: op.value,
	description: op.description,
})) satisfies Array<{ name: string; value: string; description?: string }>;

// 2) All properties (dynamic)
export const operationProperties: INodeProperties[] = operations.flatMap((op) => op.properties);

// 3) Resolve operation by value
export function getOperation(ctx: IExecuteFunctions, value: string) {
	const op = operations.find((o) => o.value === value);
	if (!op) throw new NodeOperationError(ctx.getNode(), `Invalid operation: "${value}"`);
	return op;
}

import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';

export type OperationContext = IExecuteFunctions;

export type OperationDef = {
	value: string;
	name: string;
	description?: string;
	properties: INodeProperties[];
	execute: (ctx: OperationContext, itemIndex: number) => Promise<unknown>;
};

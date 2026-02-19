import type { OperationDef } from './types';
import { getBaseUrl } from './utils';
import { NodeOperationError } from 'n8n-workflow';

export const sendSmsOperation: OperationDef = {
	value: 'sendSms',
	name: 'Send SMS',
	description: 'Sends SMS via endpoint /v1/sms',
	properties: [
		{
			displayName: 'Title',
			name: 'title',
			type: 'string',
			required: true,
			default: '',
			displayOptions: { show: { operation: ['sendSms'] } },
			description: 'Title of the dispatch',
		},
		{
			displayName: 'Message',
			name: 'message',
			type: 'string',
			required: true,
			default: '',
			displayOptions: { show: { operation: ['sendSms'] } },
			description: 'Message to be sent',
		},
		{
			displayName: 'Phones',
			name: 'phones',
			type: 'string',
			required: true,
			default: '',
			placeholder: '5519995554219,551988877766',
			displayOptions: { show: { operation: ['sendSms'] } },
			description: 'List of phone numbers separated by comma',
		},
		{
			displayName: 'Is Flash',
			name: 'isFlash',
			type: 'boolean',
			default: false,
			displayOptions: { show: { operation: ['sendSms'] } },
			description: 'Whether true, sends as Flash SMS (is_flash)',
		},
	],

	async execute(ctx, itemIndex) {
		const baseUrl = await getBaseUrl();
		const url = `${baseUrl}/sms`;

		const title = ctx.getNodeParameter('title', itemIndex) as string;
		const message = ctx.getNodeParameter('message', itemIndex) as string;
		const phones = ctx.getNodeParameter('phones', itemIndex) as Array<string>;
		const isFlash = ctx.getNodeParameter('isFlash', itemIndex) as boolean;

		if (!title?.trim()) throw new NodeOperationError(ctx.getNode(), 'Please provide "Title".');
		if (!message?.trim()) throw new NodeOperationError(ctx.getNode(), 'Please provide "Message".');
		if (!phones.length) throw new NodeOperationError(ctx.getNode(), 'Please provide at least 1 phone number in "Phones".');

		type bodyType = {
			title: string;
			message: string;
			phones: Array<string>;
			is_flash?: boolean;
		};

		const body: bodyType = {
			title: title.trim(),
			message: message.trim(),
			phones,
		};

		// API uses is_flash (boolean)
		if (isFlash) body.is_flash = true;

		const response = await ctx.helpers.requestWithAuthentication.call(ctx, 'llApi', {
			method: 'POST',
			url,
			json: true,
			body,
		});

		return { request: { url, body }, response };
	},
};

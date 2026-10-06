import type { OperationDef } from './types';
import { llRequest } from './request';
import { getBaseUrl, validateWebhookUrl } from './utils';
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
		{
			displayName: 'Additional Fields',
			name: 'additionalFields',
			type: 'collection',
			placeholder: 'Add Field',
			default: {},
			displayOptions: { show: { operation: ['sendSms'] } },
			options: [
				{
					displayName: 'Webhook URL',
					name: 'webhookUrl',
					type: 'string',
					default: '',
					placeholder: 'https://example.com/webhook?order=123',
					description:
						'URL that receives the status events of this send instead of the app webhook URL. Called exactly as written, query string included. Must be public http/https, max 512 chars.',
				},
			],
		},
	],

	async execute(ctx, itemIndex) {
		const baseUrl = await getBaseUrl(ctx);
		const url = `${baseUrl}/sms`;

		const title = ctx.getNodeParameter('title', itemIndex) as string;
		const message = ctx.getNodeParameter('message', itemIndex) as string;
		const phonesRaw = ctx.getNodeParameter('phones', itemIndex) as string | string[];
		const isFlash = ctx.getNodeParameter('isFlash', itemIndex) as boolean;

		const phones = Array.isArray(phonesRaw)
			? phonesRaw.map((p) => p.trim()).filter(Boolean)
			: phonesRaw
					.split(',')
					.map((p) => p.trim())
					.filter(Boolean);

		if (!title?.trim()) throw new NodeOperationError(ctx.getNode(), 'Please provide "Title".');
		if (!message?.trim()) throw new NodeOperationError(ctx.getNode(), 'Please provide "Message".');
		if (!phones.length)
			throw new NodeOperationError(
				ctx.getNode(),
				'Please provide at least 1 phone number in "Phones".',
			);

		type bodyType = {
			title: string;
			message: string;
			phones: Array<string>;
			is_flash?: boolean;
			webhook_url?: string;
		};

		const body: bodyType = {
			title: title.trim(),
			message: message.trim(),
			phones,
		};

		// API uses is_flash (boolean)
		if (isFlash) body.is_flash = true;

		const additional = ctx.getNodeParameter('additionalFields', itemIndex, {}) as {
			webhookUrl?: string;
		};
		if (additional.webhookUrl?.trim()) {
			body.webhook_url = validateWebhookUrl(ctx, itemIndex, additional.webhookUrl);
		}

		const response = await llRequest(ctx, itemIndex, { method: 'POST', url, body });

		return { request: { url, body }, response };
	},
};

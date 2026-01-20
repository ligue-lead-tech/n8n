import type { OperationDef } from './types';
import { getBaseUrl } from './utils';

export const sendSmsOperation: OperationDef = {
	value: 'sendSms',
	name: 'Enviar SMS',
	description: 'Envia SMS via endpoint /v1/sms',
	properties: [
		{
			displayName: 'Title',
			name: 'title',
			type: 'string',
			required: true,
			default: '',
			displayOptions: { show: { operation: ['sendSms'] } },
			description: 'Título do disparo',
		},
		{
			displayName: 'Message',
			name: 'message',
			type: 'string',
			required: true,
			default: '',
			displayOptions: { show: { operation: ['sendSms'] } },
			description: 'Mensagem que será enviada',
		},
		{
			displayName: 'Phones',
			name: 'phones',
			type: 'string',
			required: true,
			default: '',
			placeholder: '5519995554219,551988877766',
			displayOptions: { show: { operation: ['sendSms'] } },
			description: 'Lista de telefones separados por vírgula',
		},
		{
			displayName: 'Is Flash',
			name: 'isFlash',
			type: 'boolean',
			default: false,
			displayOptions: { show: { operation: ['sendSms'] } },
			description: 'Whether true, envia como SMS Flash (is_flash)',
		},
	],

	async execute(ctx, itemIndex) {
		const baseUrl = await getBaseUrl();
		const url = `${baseUrl}/sms`;

		const title = ctx.getNodeParameter('title', itemIndex) as string;
		const message = ctx.getNodeParameter('message', itemIndex) as string;
		const phones = ctx.getNodeParameter('phones', itemIndex) as Array<string>;
		const isFlash = ctx.getNodeParameter('isFlash', itemIndex) as boolean;

		if (!title?.trim()) throw new Error('Informe "Title".');
		if (!message?.trim()) throw new Error('Informe "Message".');
		if (!phones.length) throw new Error('Informe ao menos 1 telefone em "Phones".');

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

		// API usa is_flash (boolean)
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

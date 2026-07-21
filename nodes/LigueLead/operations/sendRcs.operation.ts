import type { OperationDef } from './types';
import { getBaseUrl } from './utils';
import { NodeOperationError } from 'n8n-workflow';

export const sendRcsOperation: OperationDef = {
	value: 'sendRcs',
	name: 'Send RCS',
	description: 'Sends RCS via endpoint /v1/rcs',
	properties: [
		{
			displayName: 'Phones',
			name: 'phones',
			type: 'string',
			required: true,
			default: '',
			placeholder: '5519995554219,551988877766',
			displayOptions: { show: { operation: ['sendRcs'] } },
			description: 'List of phone numbers separated by comma (national 11-digit, with +55, or DDI)',
		},
		{
			displayName: 'Send As',
			name: 'sendAs',
			type: 'options',
			required: true,
			default: 'message',
			displayOptions: { show: { operation: ['sendRcs'] } },
			description: 'Choose between typing a plain text message or using a pre-created RCS template',
			options: [
				{
					name: 'Text Message (no template)',
					value: 'message',
					description: 'Type the message text directly — max 306 chars. If the recipient\'s device does not support RCS, the same text is sent as an SMS fallback.',
				},
				{
					name: 'Template',
					value: 'template',
					description: 'Use a template created in advance via POST /rcs/templates. Supports rich formatting and reusable content with dynamic placeholders.',
				},
			],
		},
		{
			displayName: 'Message',
			name: 'message',
			type: 'string',
			required: true,
			default: '',
			typeOptions: { rows: 4 },
			displayOptions: { show: { operation: ['sendRcs'], sendAs: ['message'] } },
			description: 'Plain text to send (max 306 chars). This same text is also used as the SMS fallback if the recipient\'s device does not support RCS.',
		},
		{
			displayName: 'Template Name or ID',
			name: 'templateId',
			type: 'options',
			required: true,
			default: '',
			typeOptions: { loadOptionsMethod: 'getRcsTemplates' },
			displayOptions: { show: { operation: ['sendRcs'], sendAs: ['template'] } },
			description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		},
		{
			displayName: 'Template Variables',
			name: 'templateVariables',
			type: 'fixedCollection',
			default: {},
			typeOptions: { multipleValues: true },
			displayOptions: { show: { operation: ['sendRcs'], sendAs: ['template'] } },
			description: 'Overrides placeholder values in the template',
			options: [
				{
					name: 'variable',
					displayName: 'Variable',
					values: [
						{
							displayName: 'Key',
							name: 'key',
							type: 'string',
							default: '',
							description: 'Placeholder name in the template',
						},
						{
							displayName: 'Value',
							name: 'value',
							type: 'string',
							default: '',
							description: 'Value to replace the placeholder',
						},
					],
				},
			],
		},
	],

	async execute(ctx, itemIndex) {
		const baseUrl = await getBaseUrl(ctx);
		const url = `${baseUrl}/rcs`;

		const phonesRaw = ctx.getNodeParameter('phones', itemIndex) as string | string[];
		const sendAs = ctx.getNodeParameter('sendAs', itemIndex) as 'message' | 'template';

		const phones = Array.isArray(phonesRaw)
			? phonesRaw.map((p) => p.trim()).filter(Boolean)
			: phonesRaw.split(',').map((p) => p.trim()).filter(Boolean);

		if (!phones.length) {
			throw new NodeOperationError(ctx.getNode(), 'Please provide at least 1 phone number in "Phones".');
		}

		type TemplateVariable = { key: string; value: string };

		type BodyType = {
			phones: string[];
			message?: string;
			template_id?: string;
			template_variables?: TemplateVariable[];
		};

		const body: BodyType = { phones };

		if (sendAs === 'message') {
			const message = ctx.getNodeParameter('message', itemIndex) as string;
			if (!message?.trim()) {
				throw new NodeOperationError(ctx.getNode(), 'Please provide "Message".');
			}
			if (message.trim().length > 306) {
				throw new NodeOperationError(ctx.getNode(), '"Message" must be 306 characters or less.');
			}
			body.message = message.trim();
		} else {
			const templateId = ctx.getNodeParameter('templateId', itemIndex) as string;
			if (!templateId?.trim()) {
				throw new NodeOperationError(ctx.getNode(), 'Please provide "Template ID".');
			}
			body.template_id = templateId.trim();

			const rawVars = ctx.getNodeParameter('templateVariables', itemIndex, {}) as {
				variable?: TemplateVariable[];
			};
			if (rawVars.variable?.length) {
				body.template_variables = rawVars.variable.filter((v) => v.key?.trim());
			}
		}

		const response = await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'llApi', {
			method: 'POST',
			url,
			json: true,
			body,
		});

		return { request: { url, body }, response };
	},
};

import type { OperationDef } from './types';
import { llRequest } from './request';
import { getBaseUrl } from './utils';
import { NodeOperationError, sleep } from 'n8n-workflow';
import {
	explainRcsFailure,
	validateAgentIdFormat,
	validatePhones,
	validateVariableKeys,
} from './rcsValidation';

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
					description:
						"Type the message text directly — max 306 chars. If the recipient's device does not support RCS, the same text is sent as an SMS fallback.",
				},
				{
					name: 'Template',
					value: 'template',
					description:
						'Use a template created in advance via POST /rcs/templates. Supports rich formatting and reusable content with dynamic placeholders.',
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
			description:
				"Plain text to send (max 306 chars). This same text is also used as the SMS fallback if the recipient's device does not support RCS.",
		},
		{
			displayName: 'Agent ID',
			name: 'agentId',
			type: 'string',
			required: true,
			default: '',
			placeholder: '7b3c1e90-4d2a-4f11-9c8e-2a5b6d0f3e47',
			displayOptions: { show: { operation: ['sendRcs'], sendAs: ['message'] } },
			description:
				'ID of the approved RCS agent (sender brand shown on the device). Required only for text messages — template sends use the template\'s own agent. It must belong to the same App ID as the credential. Use the "List RCS Agents" operation to find it.',
		},
		{
			displayName: 'Template ID',
			name: 'templateId',
			type: 'string',
			required: true,
			default: '',
			placeholder: '449dff4b-08c0-40a6-aa18-86dc6f9745bd',
			displayOptions: { show: { operation: ['sendRcs'], sendAs: ['template'] } },
			description:
				'ID of the RCS template. Find it in your LigueLead account under RCS Templates. The message goes out as the agent linked to the template.',
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
		{
			displayName: 'Options',
			name: 'rcsOptions',
			type: 'collection',
			placeholder: 'Add Option',
			default: {},
			displayOptions: { show: { operation: ['sendRcs'] } },
			options: [
				{
					displayName: 'Delay Between Items (Ms)',
					name: 'delayMs',
					type: 'number',
					default: 0,
					typeOptions: { minValue: 0, maxValue: 60000 },
					description:
						'Wait this long before each send after the first one. Use it when sending many items to avoid LigueLead throttling (e.g. 1000 = 1 send per second).',
				},
				{
					displayName: 'Retry When LigueLead Is Busy',
					name: 'retryWhenBusy',
					type: 'boolean',
					default: false,
					description:
						'Whether to retry up to 3 times (2s, 4s, 8s) when LigueLead answers 429 "Failed to call ligueapi-backend". That error happens while validating the agent, before the message is queued, so retrying does not duplicate sends.',
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
			: phonesRaw
					.split(',')
					.map((p) => p.trim())
					.filter(Boolean);

		if (!phones.length) {
			throw new NodeOperationError(ctx.getNode(), 'Informe pelo menos 1 telefone em "Phones".', {
				itemIndex,
			});
		}
		validatePhones(ctx, itemIndex, phones);

		type TemplateVariable = { key: string; value: string };

		type BodyType = {
			phones: string[];
			agent_id?: string;
			message?: string;
			template_id?: string;
			template_variables?: TemplateVariable[];
		};

		const body: BodyType = { phones };

		if (sendAs === 'message') {
			const message = ctx.getNodeParameter('message', itemIndex) as string;
			if (!message?.trim()) {
				throw new NodeOperationError(ctx.getNode(), 'Informe o texto em "Message".', { itemIndex });
			}
			if (message.trim().length > 306) {
				throw new NodeOperationError(
					ctx.getNode(),
					`"Message" tem ${message.trim().length} caracteres; o limite do RCS sem template é 306.`,
					{ itemIndex },
				);
			}
			body.message = message.trim();

			// Freeform sends must name the agent; template sends must not (the API rejects it)
			const agentId = (ctx.getNodeParameter('agentId', itemIndex, '') as string)?.trim();
			if (!agentId) {
				throw new NodeOperationError(
					ctx.getNode(),
					'Informe o "Agent ID". Ele é obrigatório no envio de texto sem template.',
					{ itemIndex, description: 'Use a operação "List RCS Agents" para encontrá-lo.' },
				);
			}
			validateAgentIdFormat(ctx, itemIndex, agentId);
			body.agent_id = agentId;
		} else {
			const templateId = ctx.getNodeParameter('templateId', itemIndex) as string;
			if (!templateId?.trim()) {
				throw new NodeOperationError(ctx.getNode(), 'Informe o "Template ID".', { itemIndex });
			}
			body.template_id = templateId.trim();

			const rawVars = ctx.getNodeParameter('templateVariables', itemIndex, {}) as {
				variable?: TemplateVariable[];
			};
			const variables = (rawVars.variable ?? []).filter((v) => v.key?.trim());
			validateVariableKeys(ctx, itemIndex, variables);
			if (variables.length) {
				body.template_variables = variables;
			}
		}

		const options = ctx.getNodeParameter('rcsOptions', itemIndex, {}) as {
			delayMs?: number;
			retryWhenBusy?: boolean;
		};
		const delayMs = Math.min(Math.max(Number(options.delayMs) || 0, 0), 60000);
		if (delayMs && itemIndex > 0) await sleep(delayMs);

		// Send straight away: agent/template are only looked up if the API refuses the send
		let response: unknown;
		try {
			response = await llRequest(ctx, itemIndex, {
				method: 'POST',
				url,
				body,
				retryWhenBusy: options.retryWhenBusy === true,
			});
		} catch (error) {
			await explainRcsFailure(ctx, itemIndex, baseUrl, error, {
				agentId: body.agent_id,
				templateId: body.template_id,
				variables: body.template_variables ?? [],
			});
		}

		return { request: { url, body }, response };
	},
};

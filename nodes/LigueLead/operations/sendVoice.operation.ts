import { NodeOperationError } from 'n8n-workflow';
import type { OperationDef } from './types';
import { getBaseUrl, validateWebhookUrl } from './utils';

export const sendVoiceOperation: OperationDef = {
	value: 'sendVoice',
	name: 'Send Call',
	description: 'Sends a call using an existing voice_upload_id',
	properties: [
		{
			displayName: 'Title',
			name: 'title',
			type: 'string',
			default: '',
			required: true,
			displayOptions: { show: { operation: ['sendVoice'] } },
			description: 'Title for the voice call dispatch',
		},
		{
			displayName: 'Voice Upload ID',
			name: 'voiceUploadId',
			type: 'number',
			default: 0,
			required: true,
			displayOptions: { show: { operation: ['sendVoice'] } },
			description: 'ID of the previously uploaded audio (voice_upload_id)',
		},
		{
			displayName: 'Phones',
			name: 'phones',
			type: 'string',
			default: '',
			required: true,
			displayOptions: { show: { operation: ['sendVoice'] } },
			description: 'Comma-separated list of phone numbers to call',
		},
		{
			displayName: 'Additional Fields',
			name: 'additionalFields',
			type: 'collection',
			placeholder: 'Add Field',
			default: {},
			displayOptions: { show: { operation: ['sendVoice'] } },
			options: [
				{
					displayName: 'Retry Attempts',
					name: 'retryAttempts',
					type: 'number',
					default: 3,
					typeOptions: { minValue: 1, maxValue: 3 },
					description: 'Number of retry attempts after a failed call (1–3, API default 3)',
				},
				{
					displayName: 'Retry End Time',
					name: 'retryEndTime',
					type: 'string',
					default: '',
					placeholder: '21:00',
					description:
						'Cutoff time for retries in HH:MM (America/Sao_Paulo). Must be between 08:00 and 21:45 and at least 10 minutes in the future.',
				},
				{
					displayName: 'Retry Interval (Minutes)',
					name: 'retryIntervalMin',
					type: 'number',
					default: 15,
					typeOptions: { minValue: 5, maxValue: 180 },
					description: 'Interval in minutes between retry attempts (5–180, API default 15)',
				},
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
		const url = `${baseUrl}/voice`;

		const title = ctx.getNodeParameter('title', itemIndex) as string;
		const phonesRaw = ctx.getNodeParameter('phones', itemIndex) as string | string[];
		const phones = Array.isArray(phonesRaw)
			? phonesRaw.map((p) => p.trim()).filter(Boolean)
			: phonesRaw
					.split(',')
					.map((p) => p.trim())
					.filter(Boolean);

		const voiceUploadId = ctx.getNodeParameter('voiceUploadId', itemIndex) as number;
		if (!voiceUploadId || Number.isNaN(voiceUploadId)) {
			throw new NodeOperationError(ctx.getNode(), 'Please provide a valid Voice Upload ID.');
		}

		const body: {
			title: string;
			voice_upload_id: number;
			phones: string[];
			retry_attempts?: number;
			retry_interval_min?: number;
			retry_end_time?: string;
			webhook_url?: string;
		} = { title, voice_upload_id: voiceUploadId, phones };

		const additional = ctx.getNodeParameter('additionalFields', itemIndex, {}) as {
			retryAttempts?: number;
			retryIntervalMin?: number;
			retryEndTime?: string;
			webhookUrl?: string;
		};
		const fail = (message: string, description?: string): never => {
			throw new NodeOperationError(ctx.getNode(), message, { itemIndex, description });
		};

		if (additional.retryAttempts !== undefined) {
			const n = Number(additional.retryAttempts);
			if (!Number.isInteger(n) || n < 1 || n > 3) {
				fail(
					`"Retry Attempts" inválido: ${additional.retryAttempts}`,
					'Use um número inteiro de 1 a 3.',
				);
			}
			body.retry_attempts = n;
		}
		if (additional.retryIntervalMin !== undefined) {
			const n = Number(additional.retryIntervalMin);
			if (!Number.isInteger(n) || n < 5 || n > 180) {
				fail(
					`"Retry Interval (Minutes)" inválido: ${additional.retryIntervalMin}`,
					'Use um número inteiro de 5 a 180 minutos.',
				);
			}
			body.retry_interval_min = n;
		}
		if (additional.retryEndTime?.trim()) {
			const time = additional.retryEndTime.trim();
			const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(time);
			if (!match) {
				return fail(
					`"Retry End Time" inválido: "${time}"`,
					'Use o formato HH:MM com 2 dígitos, por exemplo 09:30 ou 21:00.',
				);
			}
			const minutes = Number(match[1]) * 60 + Number(match[2]);
			if (minutes < 8 * 60 || minutes > 21 * 60 + 45) {
				fail(
					`"Retry End Time" ${time} está fora do horário permitido`,
					'O horário limite precisa estar entre 08:00 e 21:45 (horário de Brasília).',
				);
			}
			const [nowH, nowM] = new Intl.DateTimeFormat('en-GB', {
				timeZone: 'America/Sao_Paulo',
				hour: '2-digit',
				minute: '2-digit',
				hourCycle: 'h23',
			})
				.format(new Date())
				.split(':')
				.map(Number);
			const nowMinutes = nowH * 60 + nowM;
			if (minutes < nowMinutes + 10) {
				fail(
					`"Retry End Time" ${time} precisa ser pelo menos 10 minutos depois de agora`,
					`Agora são ${String(nowH).padStart(2, '0')}:${String(nowM).padStart(2, '0')} em Brasília. Escolha um horário a partir de ${String(Math.floor((nowMinutes + 10) / 60)).padStart(2, '0')}:${String((nowMinutes + 10) % 60).padStart(2, '0')}.`,
				);
			}
			body.retry_end_time = time;
		}
		if (additional.webhookUrl?.trim()) {
			body.webhook_url = validateWebhookUrl(ctx, itemIndex, additional.webhookUrl);
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

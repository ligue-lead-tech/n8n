import type { OperationDef } from './types';
import { getBaseUrl, getVoiceCommon } from './utils';

export const sendVoiceOperation: OperationDef = {
	value: 'sendVoice',
	name: 'Enviar Ligação',
	description: 'Envia ligação usando voice_upload_id já existente',
	properties: [
		{
			displayName: 'Voice Upload ID',
			name: 'voiceUploadId',
			type: 'number',
			default: 0,
			required: true,
			displayOptions: { show: { operation: ['sendVoice'] } },
			description: 'ID do áudio previamente enviado (voice_upload_id)',
		},
		{
			displayName: 'Phones Field',
			name: 'phonesField',
			type: 'string',
			default: 'phones',
			required: true,
			displayOptions: { show: { operation: ['sendVoice', 'sendVoiceWithUpload'] } },
			description: 'Nome do campo no input JSON com array de telefones',
		},
		{
			displayName: 'Title Field',
			name: 'titleField',
			type: 'string',
			default: 'title',
			required: true,
			displayOptions: { show: { operation: ['sendVoice', 'sendVoiceWithUpload'] } },
			description: 'Nome do campo no input JSON com o title',
		},
	],

	async execute(ctx, itemIndex) {
		const baseUrl = await getBaseUrl();
		const url = `${baseUrl}/voice`;

		const { phones, title } = getVoiceCommon(ctx, itemIndex);

		const voiceUploadId = ctx.getNodeParameter('voiceUploadId', itemIndex) as number;
		if (!voiceUploadId || Number.isNaN(voiceUploadId)) {
			throw new Error('Informe um Voice Upload ID válido.');
		}

		const body = { title, voice_upload_id: voiceUploadId, phones };

		const response = await ctx.helpers.requestWithAuthentication.call(ctx, 'llApi', {
			method: 'POST',
			url,
			json: true,
			body,
		});

		return { request: { url, body }, response };
	},
};

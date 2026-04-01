import { NodeOperationError } from 'n8n-workflow';
import type { OperationDef } from './types';
import { getBaseUrl } from './utils';

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
	],

	async execute(ctx, itemIndex) {
		const baseUrl = await getBaseUrl(ctx);
		const url = `${baseUrl}/voice`;

		const title = ctx.getNodeParameter('title', itemIndex) as string;
		const phonesRaw = ctx.getNodeParameter('phones', itemIndex) as string | string[];
		const phones = Array.isArray(phonesRaw)
			? phonesRaw.map((p) => p.trim()).filter(Boolean)
			: phonesRaw.split(',').map((p) => p.trim()).filter(Boolean);

		const voiceUploadId = ctx.getNodeParameter('voiceUploadId', itemIndex) as number;
		if (!voiceUploadId || Number.isNaN(voiceUploadId)) {
			throw new NodeOperationError(ctx.getNode(), 'Please provide a valid Voice Upload ID.');
		}

		const body = { title, voice_upload_id: voiceUploadId, phones };

		const response = await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'llApi', {
			method: 'POST',
			url,
			json: true,
			body,
		});

		return { request: { url, body }, response };
	},
};

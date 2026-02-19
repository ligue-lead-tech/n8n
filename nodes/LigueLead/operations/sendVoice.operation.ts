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
			default: 'title',
			required: true,
			displayOptions: { show: { operation: ['sendVoice'] } },
			description: 'Name of the field in the input JSON with the title',
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
			default: 'phones',
			required: true,
			displayOptions: { show: { operation: ['sendVoice'] } },
			description: 'Name of the field in the input JSON with the phone number array',
		},
	],

	async execute(ctx, itemIndex) {
		const baseUrl = await getBaseUrl();
		const url = `${baseUrl}/voice`;

		const title = ctx.getNodeParameter('title', itemIndex) as string;
		const phones = ctx.getNodeParameter('phones', itemIndex) as Array<string>;

		const voiceUploadId = ctx.getNodeParameter('voiceUploadId', itemIndex) as number;
		if (!voiceUploadId || Number.isNaN(voiceUploadId)) {
			throw new NodeOperationError(ctx.getNode(), 'Please provide a valid Voice Upload ID.');
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

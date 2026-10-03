import type { OperationDef } from './types';
import { getBaseUrl } from './utils';
import { uploadAudio } from './voiceUpload';

export const uploadAudioOperation: OperationDef = {
	value: 'uploadAudio',
	name: 'Upload Audio',
	description: 'Uploads an MP3 or WAV file and returns its audio ID for use in "Send Call"',
	properties: [
		{
			displayName: 'Input Binary Field',
			name: 'binaryPropertyName',
			type: 'string',
			required: true,
			default: 'data',
			displayOptions: { show: { operation: ['uploadAudio'] } },
			description: 'Name of the binary field that holds the audio file (MP3 or WAV, max 50 MB)',
		},
		{
			displayName: 'Audio Title',
			name: 'audioTitle',
			type: 'string',
			default: '',
			displayOptions: { show: { operation: ['uploadAudio'] } },
			description: 'Name used to identify the audio. Defaults to the file name.',
		},
	],

	async execute(ctx, itemIndex) {
		const baseUrl = await getBaseUrl(ctx);
		const binaryPropertyName = ctx.getNodeParameter(
			'binaryPropertyName',
			itemIndex,
			'data',
		) as string;
		const audioTitle = ctx.getNodeParameter('audioTitle', itemIndex, '') as string;

		const audio = await uploadAudio(ctx, itemIndex, baseUrl, binaryPropertyName, audioTitle);

		return { audio_id: audio.id, title: audio.title, response: audio.response };
	},
};

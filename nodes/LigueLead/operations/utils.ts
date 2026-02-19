import type { IExecuteFunctions } from 'n8n-workflow';

export async function getBaseUrl() {
	return 'https://api.liguelead.com.br/v1'
}

export function getVoiceCommon(ctx: IExecuteFunctions, itemIndex: number) {
	const items = ctx.getInputData();

	const phonesField = ctx.getNodeParameter('phonesField', itemIndex) as string;
	const titleField = ctx.getNodeParameter('titleField', itemIndex) as string;

	const phones = (items[itemIndex].json)?.[phonesField];
	const title = (items[itemIndex].json)?.[titleField];

	if (!Array.isArray(phones) || phones.length === 0) {
		throw new Error(`Field "${phonesField}" must be an array of phones (phones: string[]).`);
	}
	if (typeof title !== 'string' || !title.trim()) {
		throw new Error(`Field "${titleField}" must be a string (title).`);
	}

	return { phonesField, titleField, phones, title };
}

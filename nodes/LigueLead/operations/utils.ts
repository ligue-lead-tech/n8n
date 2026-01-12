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
		throw new Error(`Campo "${phonesField}" precisa ser um array de telefones (phones: string[]).`);
	}
	if (typeof title !== 'string' || !title.trim()) {
		throw new Error(`Campo "${titleField}" precisa ser uma string (title).`);
	}

	return { phonesField, titleField, phones, title };
}

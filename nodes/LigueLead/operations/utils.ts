import type { IExecuteFunctions } from 'n8n-workflow';

export async function getBaseUrl(ctx: IExecuteFunctions): Promise<string> {
	const credentials = await ctx.getCredentials('llApi');
	return (credentials.baseUrl as string).replace(/\/$/, '');
}

import type { OperationDef } from './types';
import { getBaseUrl } from './utils';

export const listRcsTemplatesOperation: OperationDef = {
	value: 'listRcsTemplates',
	name: 'List RCS Templates',
	description: 'Returns all RCS templates in the account with their names and IDs',
	properties: [
		{
			displayName: 'Notice',
			name: 'listRcsTemplatesNotice',
			type: 'notice',
			default: '',
			displayOptions: { show: { operation: ['listRcsTemplates'] } },
			typeOptions: {},
			description: 'Use the <b>name</b> field from the output to identify your template, and copy the <b>ID</b> field to use in "Send RCS" with the Template option',
		},
	],

	async execute(ctx) {
		const baseUrl = await getBaseUrl(ctx);
		const url = `${baseUrl}/rcs/templates`;

		const response = await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'llApi', {
			method: 'GET',
			url,
			json: true,
		});

		return { request: { url }, response };
	},
};

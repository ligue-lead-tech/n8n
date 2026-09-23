import type { OperationDef } from './types';
import { getBaseUrl } from './utils';

export const listRcsAgentsOperation: OperationDef = {
	value: 'listRcsAgents',
	name: 'List RCS Agents',
	description: 'Returns all RCS agents (sender brands) in the account with their IDs and review status',
	properties: [
		{
			displayName: 'Notice',
			name: 'listRcsAgentsNotice',
			type: 'notice',
			default: '',
			displayOptions: { show: { operation: ['listRcsAgents'] } },
			typeOptions: {},
			description: 'Use the <b>sender_name</b> field to identify your agent, and copy the <b>ID</b> of an agent with status <b>approved</b> to use in "Send RCS"',
		},
	],

	async execute(ctx) {
		const baseUrl = await getBaseUrl(ctx);
		const url = `${baseUrl}/rcs/agents`;

		const response = await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'llApi', {
			method: 'GET',
			url,
			json: true,
		});

		return { request: { url }, response };
	},
};

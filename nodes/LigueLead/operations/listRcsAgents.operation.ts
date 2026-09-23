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
			description: 'Use the <b>sender_name</b> field to identify your agent, and copy the <b>ID</b> of an agent with <b>can_send_with_this_credential = true</b> (approved and registered under the credential App ID) to use in "Send RCS"',
		},
	],

	async execute(ctx) {
		const baseUrl = await getBaseUrl(ctx);
		const url = `${baseUrl}/rcs/agents`;

		const credentials = await ctx.getCredentials('llApi');
		const appId = String(credentials.appId ?? '');

		const response = await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'llApi', {
			method: 'GET',
			url,
			json: true,
		});

		const list = (Array.isArray(response) ? response : (response?.data ?? [])) as Array<
			Record<string, unknown>
		>;

		// Sends only accept agents registered under the same app as the credential
		const agents = list.map((agent) => ({
			id: agent.id,
			sender_name: agent.sender_name,
			status: agent.status,
			app_id: agent.app_id,
			can_send_with_this_credential: agent.app_id === appId && agent.status === 'approved',
		}));

		return { request: { url }, credential_app_id: appId, agents };
	},
};

import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	Icon
} from 'n8n-workflow';

export class LlApi implements ICredentialType {
	name = 'llApi';
	displayName = 'LigueLead API';
	documentationUrl = 'https://github.com/ligue-lead-tech/n8n';
	icon: Icon = 'file:logo.svg'; 
	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.liguelead.com.br/v1',
			required: true,
		},
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
		},
		{
			displayName: 'App ID',
			name: 'appId',
			type: 'string',
			required: true,
			default: '',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'api-token': '={{$credentials.apiToken}}',
				'app-id': '={{$credentials.appId}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			url: '={{$credentials.baseUrl}}/health',
		},
	};
}

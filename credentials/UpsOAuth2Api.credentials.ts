import type { ICredentialType, INodeProperties, Icon } from 'n8n-workflow';

export class UpsOAuth2Api implements ICredentialType {
	name = 'upsOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'UPS OAuth2 API';

	icon: Icon = 'file:ups.svg';

	documentationUrl =
		'https://github.com/nodrel-dev/n8n-nodes-ups?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'clientCredentials',
		},
		{
			// UPS production token endpoint. Sandbox: https://wwwcie.ups.com/security/v1/oauth/token
			// VERIFY LIVE against the sandbox before relying on this (Principle 12).
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: 'https://onlinetools.ups.com/security/v1/oauth/token',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			// UPS client-credentials does not use OAuth scopes.
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: '',
		},
		{
			// UPS expects client_id/secret as HTTP Basic on the token request.
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'header',
		},
	];
}

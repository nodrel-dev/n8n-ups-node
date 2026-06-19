import type { ICredentialTestRequest, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

// Single OAuth2 client-credentials credential covering all four UPS APIs (Principle 6, ADR-0002).
// One UPS OAuth app entitles every endpoint (delta 13.1), so one credential type is correct.
//
// `environment` drives BOTH hosts off the SAME field so token exchange and API calls can never
// split hosts (the host-split guard, research.md / contracts/credential-test.md):
//   - token URL via `$self["environment"]` here (no `/api` segment, delta 13.2)
//   - API base URL via `$credentials.environment` in Ups.node.ts (`requestDefaults.baseURL`, includes `/api`)
const TOKEN_URL = {
	sandbox: 'https://wwwcie.ups.com/security/v1/oauth/token',
	production: 'https://onlinetools.ups.com/security/v1/oauth/token',
};

// API base host per environment (no `/api` — appended by the node's requestDefaults and the test path).
const API_HOST = {
	sandbox: 'https://wwwcie.ups.com',
	production: 'https://onlinetools.ups.com',
};

export class UpsOAuth2Api implements ICredentialType {
	name = 'upsOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'UPS OAuth2 API';

	icon: Icon = 'file:ups.svg';

	documentationUrl = 'https://github.com/nodrel-dev/n8n-ups-node?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Environment',
			name: 'environment',
			type: 'options',
			options: [
				{ name: 'Sandbox (CIE)', value: 'sandbox' },
				{ name: 'Production', value: 'production' },
			],
			default: 'sandbox',
			description:
				'Which UPS environment to use. Sandbox is the Customer Integration Environment (CIE). Drives both the token URL and the API base URL.',
		},
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'clientCredentials',
		},
		{
			// Token endpoint is environment-derived (no `/api` segment, delta 13.2). VERIFY-LIVE: empty
			// scope + Basic client credentials accepted at wwwcie.ups.com (gotchas §2, research.md #2).
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: `={{ $self["environment"] === "production" ? "${TOKEN_URL.production}" : "${TOKEN_URL.sandbox}" }}`,
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			// UPS client-credentials does not use OAuth scopes — empty scope (research.md #2).
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: '',
		},
		{
			// UPS expects client_id/secret as HTTP Basic on the token request. This is n8n's generic
			// OAuth2 "send as header" setting — leave intact (Principle 11, gotchas §1).
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'header',
		},
	];

	// Authentication is handled by the inherited `oAuth2Api` (clientCredentials grant) — the bearer
	// token attaches automatically to every authenticated request, including this test. Do not
	// hand-roll an `authenticate` block (Principle 6: "do not hand-roll").
	//
	// Authenticated credential test (ADR-0002): a Track probe against the environment-derived base
	// URL. Reaching UPS's Track business layer — even a "not found" — proves App Credentials + host +
	// single-app entitlement. 401/403 means bad client id/secret or wrong environment.
	// VERIFY-LIVE: Track not-found HTTP status (200+error-body vs 4xx) decides whether a
	// responseCode/responseSuccessBody rule is needed (research.md #3, contracts/credential-test.md).
	test: ICredentialTestRequest = {
		request: {
			baseURL: `={{ $credentials.environment === "production" ? "${API_HOST.production}" : "${API_HOST.sandbox}" }}`,
			url: '/api/track/v1/details/1Z00000000000000000',
			method: 'GET',
			// Track v1 requires both headers or it 400s (TV0011/TV0001) — without them the test would
			// fail even with valid credentials (verified live CIE 2026-06-19, gotchas §13). CIE returns
			// a canned 200 for any well-formed 1Z number, so a valid token → 200 PASS; 401/403 → bad
			// client id/secret or wrong environment.
			headers: {
				transId: 'n8n-nodes-ups-credtest',
				transactionSrc: 'n8n-nodes-ups',
			},
		},
	};
}

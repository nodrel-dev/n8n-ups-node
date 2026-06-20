import {
	NodeConnectionTypes,
	type ICredentialsDecrypted,
	type ICredentialTestFunctions,
	type IDataObject,
	type INodeCredentialTestResult,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { trackingDescription } from './resources/tracking';
import { addressDescription } from './resources/address';
import { shippingDescription } from './resources/shipping';

export class Ups implements INodeType {
	// Fully declarative node (Principle 5). Every operation — including Create — runs through n8n's
	// declarative routing engine (request + preSend + postReceive). The node deliberately has NO
	// `execute()` method: n8n bypasses routing for any node that defines one, which would break the
	// declarative Track/Validate/Rate operations. Create's binary + customs assembly happens in its
	// preSend/postReceive hooks instead (see resources/shipping/create.operation.ts).
	description: INodeTypeDescription = {
		displayName: 'UPS',
		name: 'ups',
		icon: { light: 'file:ups.svg', dark: 'file:ups.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Track shipments, validate addresses, rate, and create UPS shipments',
		defaults: {
			name: 'UPS',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			// n8n's declarative router (RoutingNode.prepareCredentials) takes the single-credential fast
			// path ONLY when the node declares exactly one credential. The moment a second credential is
			// declared (the profile, below) it UNCONDITIONALLY reads a node parameter named `authentication`
			// to pick which credential authenticates the request, and `.find()`s the entry whose
			// `displayOptions.show.authentication` matches — throwing "Could not get parameter:
			// authentication" if that param is absent (gotchas §1, verified live n8n 2.25.7). So the OAuth2
			// entry is gated on the hidden `authentication` param (default 'upsOAuth2'); it is always the
			// resolved auth credential. The profile is intentionally left UNgated: it is non-auth, never
			// matched by `.find()`, and read manually via getCredentials() in the preSend (ADR-0005) — but
			// it must still be declared here so its picker renders and getCredentials can resolve it.
			{
				name: 'upsOAuth2Api',
				required: true,
				displayOptions: { show: { authentication: ['upsOAuth2'] } },
			},
			// Optional, non-auth config credential (ADR-0005). Holds reusable Shipper fields + account
			// number; read at run time in the Get Rates / Create preSend and merged into the Shipper
			// block (explicit field > profile > default). Only `upsOAuth2Api` authenticates requests.
			// `displayName` overrides the per-credential label in the node panel (INodeCredentialDescription),
			// so this row reads "Shipper Profile (Optional)" instead of a second generic "Credential" header —
			// it is config, not auth (ADR-0005). The OAuth entry has no override, so it stays "Credential".
			{
				name: 'upsShipperProfileApi',
				displayName: 'Shipper Profile (Optional)',
				required: false,
				testedBy: 'upsShipperProfileTest',
			},
		],
		requestDefaults: {
			// baseURL is environment-derived from the SAME credential field that drives the token URL,
			// so token exchange and API calls can never split hosts (host-split guard, ADR-0001).
			// Includes `/api` (delta 13.2); the token endpoint does not.
			baseURL:
				'={{ $credentials.environment === "production" ? "https://onlinetools.ups.com/api" : "https://wwwcie.ups.com/api" }}',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			// Disambiguates which declared credential authenticates the request. Required because the node
			// carries two credentials (OAuth2 + optional profile); n8n's router reads this param whenever a
			// node has >1 credential (gotchas §1). Hidden + single fixed value: UPS only ever authenticates
			// via OAuth2, so the user never chooses. This is a NODE parameter — distinct from the OAuth2
			// credential's own hidden `authentication: 'header'` field (the generic-OAuth2 send-as-header
			// setting), which lives in a different namespace and is unaffected.
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'hidden',
				default: 'upsOAuth2',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Address', value: 'address' },
					{ name: 'Shipping', value: 'shipping' },
					{ name: 'Tracking', value: 'tracking' },
				],
				default: 'tracking',
			},
			...trackingDescription,
			...addressDescription,
			...shippingDescription,
		],
	};

	// The optional `upsShipperProfileApi` credential is non-auth (ADR-0005) — there is nothing to call
	// to "test" it, so this runs an OFFLINE validation: the Test button confirms the profile is
	// internally usable (a recognizable account number and, if present, a 2-letter country code)
	// rather than reaching UPS. Declaring `methods` does not disable declarative routing (only an
	// `execute()` method would), so Track/Validate/Rate/Create stay declarative.
	methods = {
		credentialTest: {
			async upsShipperProfileTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const data = (credential.data ?? {}) as IDataObject;
				const str = (key: string): string => String(data[key] ?? '').trim();

				const filled = [
					'accountNumber',
					'shipperName',
					'addressLine1',
					'city',
					'stateProvinceCode',
					'postalCode',
					'countryCode',
					'phone',
				].some((key) => str(key).length > 0);
				if (!filled) {
					return {
						status: 'Error',
						message: 'Shipper profile is empty — fill at least an account number or address.',
					};
				}

				const country = str('countryCode');
				if (country.length > 0 && !/^[A-Za-z]{2}$/.test(country)) {
					return {
						status: 'Error',
						message: `Country Code "${country}" must be a two-letter code (e.g. US, CA).`,
					};
				}

				return { status: 'OK', message: 'Shipper profile looks valid.' };
			},
		},
	};
}

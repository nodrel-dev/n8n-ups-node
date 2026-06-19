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
			{ name: 'upsOAuth2Api', required: true },
			// Optional, non-auth config credential (ADR-0005). Holds reusable Shipper fields + account
			// number; read at run time in the Get Rates / Create preSend and merged into the Shipper
			// block (explicit field > profile > default). Only `upsOAuth2Api` authenticates requests.
			{ name: 'upsShipperProfileApi', required: false, testedBy: 'upsShipperProfileTest' },
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

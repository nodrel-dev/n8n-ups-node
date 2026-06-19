import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
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
		credentials: [{ name: 'upsOAuth2Api', required: true }],
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
}

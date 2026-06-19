import {
	NodeOperationError,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type IN8nHttpFullResponse,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';
import { buildRateRequest } from '../../core/buildRateRequest';
import { flattenRates } from '../../core/flattenRates';
import { mapUpsError } from '../../core/mapUpsError';
import { addressFields, packageFields, CURRENCY_OPTIONS } from './shippingFields';
import { readPackage, resolveShipmentParties, type ParamGetter } from './readParties';
import { loadShipperProfile } from './shipperProfile';

const showOnlyForRates = {
	operation: ['getRates'],
	resource: ['shipping'],
};

// preSend builds the RateRequest and enforces the two boundary invariants BEFORE any UPS call
// (FR-010/FR-014): an account number is mandatory, and an international lane requires a customs value.
// We throw NodeOperationError, but n8n's declarative routing rewraps any preSend throw into
// NodeApiError with httpCode='none' (verified live) — message preserved; httpCode='none' marks a
// pre-call boundary failure vs a real UPS HTTP error.
async function ratesPreSend(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const node = this.getNode();
	// IExecuteSingleFunctions.getNodeParameter is (name, fallback) — bridge it to the shared readers.
	const get: ParamGetter = (name, fallback) => this.getNodeParameter(name, fallback as never);

	// resolveShipmentParties owns the shared "resolve Shipper (profile precedence, ADR-0005) → read
	// ShipTo/ShipFrom → pick the Effective Origin → classify international" sequence (ADR-0003), so Get
	// Rates and Create can never disagree on it. loadShipperProfile returns null when no profile is set.
	const profile = await loadShipperProfile(this);
	const parties = resolveShipmentParties(get, profile);
	if (!parties.accountNumber) {
		throw new NodeOperationError(node, 'An account number is required to request rates.', {
			description:
				'Enter your UPS account number (ShipperNumber) on the Get Rates operation, or attach a UPS Shipper Profile credential that supplies one.',
		});
	}

	const customsValue = (get('customsValue', 0) as number) || 0;
	if (parties.international && customsValue <= 0) {
		throw new NodeOperationError(
			node,
			'A customs value is required for an international shipment.',
			{
				description:
					'The origin and destination countries differ; enter the customs value of the goods.',
			},
		);
	}

	// Body assembly lives in the pure buildRateRequest core (fixture-tested for the Shoptimeintransit
	// twin-container rule and the negotiated-rate / InvoiceLineTotal shape); the preSend only reads.
	requestOptions.body = buildRateRequest({
		accountNumber: parties.accountNumber,
		shipper: parties.shipper.address,
		shipTo: parties.shipTo,
		effectiveShipFrom: parties.effectiveShipFrom,
		package: readPackage(get),
		weight: (get('weight', 1) as number) || 0,
		weightUnit: (get('weightUnit', 'LBS') as string) || 'LBS',
		customsValue,
		currency: (get('customsCurrency', 'USD') as string) || 'USD',
	});
	return requestOptions;
}

// postReceive surfaces UPS errors and fans out one output item per service (flattenRates).
async function ratesPostReceive(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	if (response.statusCode >= 400) {
		mapUpsError(this.getNode(), response.body, response.statusCode);
	}
	const lines = flattenRates(response.body as object, { wantTransit: true });
	return lines.map((line) => ({ json: line as unknown as INodeExecutionData['json'] }));
}

export const getRatesOperationDescription: INodeProperties[] = [
	{
		displayName: 'Account Number',
		name: 'accountNumber',
		type: 'string',
		default: '',
		displayOptions: { show: showOnlyForRates },
		description:
			'Your UPS account number (ShipperNumber). Required (also requests negotiated rates) — leave blank only if a UPS Shipper Profile credential supplies it.',
	},
	{
		displayName:
			'The Shipper fields below (and Account Number) can be supplied by an optional UPS Shipper Profile credential. An explicit value here always overrides the profile; leave a field blank to inherit it from the profile.',
		name: 'shipperProfileNoticeRates',
		type: 'notice',
		default: '',
		displayOptions: { show: showOnlyForRates },
	},
	...addressFields({
		prefix: 'shipper',
		label: 'Shipper',
		show: showOnlyForRates,
		countryDefault: '',
	}),
	...addressFields({
		prefix: 'shipFrom',
		label: 'Ship From',
		show: showOnlyForRates,
		hint: 'Optional. Defaults to the Shipper address when left blank.',
	}),
	...addressFields({
		prefix: 'shipTo',
		label: 'Ship To',
		show: showOnlyForRates,
		required: true,
		includeResidential: true,
	}),
	...packageFields(showOnlyForRates),
	{
		displayName:
			'The customs fields below are REQUIRED when the origin and destination countries differ (international). Leave them at their defaults for domestic shipments.',
		name: 'ratesCustomsNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: showOnlyForRates },
	},
	{
		displayName: 'Customs Value',
		name: 'customsValue',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		displayOptions: { show: showOnlyForRates },
		description:
			'Declared value of goods. Required when origin and destination countries differ (international).',
	},
	{
		displayName: 'Customs Currency',
		name: 'customsCurrency',
		type: 'options',
		options: CURRENCY_OPTIONS,
		default: 'USD',
		displayOptions: { show: showOnlyForRates },
		description:
			'Currency for the customs value. Pick a common code, or use an expression to set any ISO 4217 code.',
	},
];

export const getRatesOperationOption = {
	name: 'Get Rates',
	value: 'getRates',
	action: 'Get rate quotes',
	description: 'Get service options with published and negotiated rates plus transit times',
	routing: {
		request: {
			method: 'POST' as const,
			// Shoptimeintransit returns all services + transit times; no Service.Code sent.
			url: '/rating/v2409/Shoptimeintransit',
			ignoreHttpStatusErrors: true,
		},
		send: { preSend: [ratesPreSend] },
		output: { postReceive: [ratesPostReceive] },
	},
};

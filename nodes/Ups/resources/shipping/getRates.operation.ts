import {
	NodeOperationError,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type IN8nHttpFullResponse,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';
import { toUpsAddress } from '../../core/toUpsAddress';
import { flattenRates } from '../../core/flattenRates';
import { isInternational } from '../../core/isInternational';
import { mapUpsError } from '../../core/mapUpsError';
import { addressFields, readAddress, readPackage, packageFields, type ParamGetter } from './shared';

const showOnlyForRates = {
	operation: ['getRates'],
	resource: ['shipping'],
};

// preSend builds the RateRequest and enforces the two boundary invariants BEFORE any UPS call
// (FR-010/FR-014): an account number is mandatory, and an international lane requires a customs value.
// Boundary failures throw NodeOperationError (never NodeApiError — data-model.md).
async function ratesPreSend(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const node = this.getNode();
	// IExecuteSingleFunctions.getNodeParameter is (name, fallback) — bridge it to the shared readers.
	const get: ParamGetter = (name, fallback) => this.getNodeParameter(name, fallback as never);
	const accountNumber = (get('accountNumber', '') as string).trim();
	if (!accountNumber) {
		throw new NodeOperationError(node, 'An account number is required to request rates.', {
			description: 'Enter your UPS account number (ShipperNumber) on the Get Rates operation.',
		});
	}

	const shipper = readAddress(get, 'shipper');
	const shipTo = readAddress(get, 'shipTo');
	const shipFrom = readAddress(get, 'shipFrom');
	const hasShipFrom = shipFrom.addressLines.length > 0 || shipFrom.city.length > 0;
	const effectiveShipFrom = hasShipFrom ? shipFrom : shipper;

	const customsValue = (get('customsValue', 0) as number) || 0;
	if (isInternational({ shipFrom: effectiveShipFrom, shipper, shipTo }) && customsValue <= 0) {
		throw new NodeOperationError(
			node,
			'A customs value is required for an international shipment.',
			{
				description:
					'The origin and destination countries differ; enter the customs value of the goods.',
			},
		);
	}

	const pkg = readPackage(get);
	const currency = (get('customsCurrency', 'USD') as string) || 'USD';
	const weight = (get('weight', 1) as number) || 0;
	const weightUnit = (get('weightUnit', 'LBS') as string) || 'LBS';

	const shipment: Record<string, unknown> = {
		Shipper: { ShipperNumber: accountNumber, Address: toUpsAddress(shipper) },
		ShipTo: { Address: toUpsAddress(shipTo) },
		ShipFrom: { Address: toUpsAddress(effectiveShipFrom) },
		PickupType: { Code: '01' },
		// Shoptimeintransit REQUIRES both DeliveryTimeInformation and ShipmentTotalWeight or UPS
		// rejects the request — 111563 (missing DeliveryTimeInformation) and 111546 ("Invalid
		// Weight", actually the missing ShipmentTotalWeight). Both verified live against CIE.
		// PackageBillType 03 = non-document (standard package); 02 = document, 04 = pallet.
		// v1 is single-package, so the shipment total weight equals the package weight.
		DeliveryTimeInformation: { PackageBillType: '03' },
		ShipmentTotalWeight: {
			UnitOfMeasurement: { Code: weightUnit, Description: weightUnit },
			Weight: String(weight),
		},
		// Empty NegotiatedRatesIndicator still requests negotiated rates (verified live: the
		// NegotiatedRateCharges come back populated alongside published rates).
		ShipmentRatingOptions: { NegotiatedRatesIndicator: '' },
		Package: { PackagingType: { Code: '02' }, ...pkg },
	};

	if (customsValue > 0) {
		shipment.InvoiceLineTotal = { CurrencyCode: currency, MonetaryValue: String(customsValue) };
	}

	requestOptions.body = {
		RateRequest: {
			Request: { TransactionReference: { CustomerContext: 'n8n-nodes-ups rate' } },
			PickupType: { Code: '01' },
			Shipment: shipment,
		},
	};
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
		required: true,
		default: '',
		displayOptions: { show: showOnlyForRates },
		description:
			'Your UPS account number (ShipperNumber). Required; also requests negotiated rates.',
	},
	...addressFields({ prefix: 'shipper', label: 'Shipper', show: showOnlyForRates, required: true }),
	...addressFields({
		prefix: 'shipFrom',
		label: 'Ship From (optional, defaults to Shipper)',
		show: showOnlyForRates,
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
		displayName: 'Customs Value',
		name: 'customsValue',
		type: 'number',
		default: 0,
		displayOptions: { show: showOnlyForRates },
		description:
			'Declared value of goods. Required when origin and destination countries differ (international).',
	},
	{
		displayName: 'Customs Currency',
		name: 'customsCurrency',
		type: 'string',
		default: 'USD',
		displayOptions: { show: showOnlyForRates },
		description: 'Currency code for the customs value',
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

import {
	NodeOperationError,
	type IDataObject,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type IN8nHttpFullResponse,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';
import { toUpsAddress } from '../../core/toUpsAddress';
import { isInternational } from '../../core/isInternational';
import { buildCommodities, type CommodityLineInput } from '../../core/buildCommodities';
import { buildInternationalForms, type CustomsInput } from '../../core/buildInternationalForms';
import { extractLabel, type LabelFormat } from '../../core/extractLabel';
import { extractForms } from '../../core/extractForms';
import { extractCharges } from '../../core/extractCharges';
import { mapUpsError } from '../../core/mapUpsError';
import { addressFields, readAddress, readPackage, type ParamGetter } from './shared';

const showOnlyForCreate = {
	operation: ['create'],
	resource: ['shipping'],
};

// Create is the constitution's permitted exception for binary + customs assembly (Principle 5,
// ADR-0004). n8n bypasses declarative routing entirely once a node defines an `execute()` method, so
// to keep Track/Validate/Rate declarative the WHOLE node stays declarative — Create realizes the
// "programmatic" behaviour through a `preSend` (assemble body + boundary guards) and a `postReceive`
// (decode label/invoice base64 → n8n binary), both still in the declarative engine.
// RequestOption is hardcoded `nonvalidate` (12.10, not exposed); billing is Type 01 BillShipper;
// international duties are DDU (receiver-billed, no Type 02 in v1).

interface CommodityRow {
	description?: string;
	quantity?: number;
	unitValue?: number;
	unitOfMeasure?: string;
	commodityCode?: string;
	originCountry?: string;
}

function readCommodities(get: ParamGetter): CommodityLineInput[] {
	const rows = (get('commodities.line', []) as CommodityRow[]) ?? [];
	return rows
		.filter((r) => (r.description ?? '').trim().length > 0)
		.map((r) => ({
			description: r.description as string,
			quantity: r.quantity ?? 1,
			unitValue: r.unitValue ?? 0,
			unitOfMeasure: r.unitOfMeasure || 'EA',
			commodityCode: r.commodityCode || undefined,
			originCountry: r.originCountry || undefined,
		}));
}

// UPS requires InvoiceDate (yyyyMMdd) on the commercial invoice for international shipments —
// omitting it returns 128066 "Invalid or missing invoice date" (verified live CIE). Default to
// today (UTC) when the user leaves it blank, matching the typical ship-today expectation.
function todayYyyyMmdd(): string {
	return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function readCustoms(get: ParamGetter): CustomsInput {
	const soldTo = readAddress(get, 'soldTo');
	return {
		reasonForExport: get('customsReasonForExport', 'SALE') as string,
		currency: get('customsCurrency', 'USD') as string,
		termsOfShipment: get('customsTermsOfShipment', 'DDU') as string,
		invoiceNumber: (get('customsInvoiceNumber', '') as string) || undefined,
		invoiceDate: (get('customsInvoiceDate', '') as string).trim() || todayYyyyMmdd(),
		soldTo: {
			name: get('soldToName', '') as string,
			addressLines: soldTo.addressLines,
			city: soldTo.city,
			stateProvinceCode: soldTo.stateProvinceCode || undefined,
			postalCode: soldTo.postalCode || undefined,
			countryCode: soldTo.countryCode,
		},
	};
}

function buildShipmentBody(get: ParamGetter, international: boolean): IDataObject {
	const accountNumber = (get('accountNumber', '') as string).trim();
	const service = get('service', '03') as string;
	const labelFormat = get('labelFormat', 'GIF') as string;

	const shipper = readAddress(get, 'shipper');
	const shipTo = readAddress(get, 'shipTo');
	const shipFrom = readAddress(get, 'shipFrom');
	const hasShipFrom = shipFrom.addressLines.length > 0 || shipFrom.city.length > 0;
	const effectiveShipFrom = hasShipFrom ? shipFrom : shipper;

	const shipperName = get('shipperName', '') as string;
	const shipToName = get('shipToName', '') as string;
	const shipFromName = (get('shipFromName', shipperName) as string) || shipperName;
	const shipperPhone = get('shipperPhone', '') as string;
	const shipToPhone = get('shipToPhone', '') as string;

	// UPS requires an AttentionName on each party for international shipments — omitting ShipFrom's
	// returns 120301 "Missing or invalid ship from attention name" (verified live CIE). Mirror the
	// party Name into AttentionName when present; harmless on domestic, mandatory cross-border.
	const shipment: IDataObject = {
		Description: 'Shipment',
		Shipper: {
			Name: shipperName,
			...(shipperName ? { AttentionName: shipperName } : {}),
			ShipperNumber: accountNumber,
			...(shipperPhone ? { Phone: { Number: shipperPhone } } : {}),
			Address: toUpsAddress(shipper),
		},
		ShipTo: {
			Name: shipToName,
			...(shipToName ? { AttentionName: shipToName } : {}),
			...(shipToPhone ? { Phone: { Number: shipToPhone } } : {}),
			Address: toUpsAddress(shipTo),
		},
		ShipFrom: {
			Name: shipFromName,
			...(shipFromName ? { AttentionName: shipFromName } : {}),
			Address: toUpsAddress(effectiveShipFrom),
		},
		// Billing: shipper pays transportation (Type 01). International duties are DDU — no Type 02.
		PaymentInformation: {
			ShipmentCharge: { Type: '01', BillShipper: { AccountNumber: accountNumber } },
		},
		// Request negotiated rates so the response carries NegotiatedRateCharges (the actually-billed
		// cost) alongside published — same mechanism as Get Rates; presence of the tag is the trigger.
		// extractCharges surfaces both; negotiated stays null when the account isn't entitled on the lane.
		ShipmentRatingOptions: { NegotiatedRatesIndicator: '' },
		Service: { Code: service },
		Package: {
			Packaging: { Code: '02' },
			...readPackage(get),
		},
	};

	if (international) {
		const commodities = buildCommodities(readCommodities(get));
		shipment.ShipmentServiceOptions = {
			InternationalForms: buildInternationalForms(readCustoms(get), commodities),
		};
	}

	// GIF is an image label and needs no stock size; the thermal formats (ZPL/EPL/SPL) are rejected
	// with 9120244 "Missing label specification label stock size" unless LabelStockSize is supplied.
	// 4x6 in is the standard thermal label (Height 6, Width 4). Verified live CIE.
	const labelSpecification: IDataObject = { LabelImageFormat: { Code: labelFormat } };
	if (labelFormat !== 'GIF') {
		labelSpecification.LabelStockSize = { Height: '6', Width: '4' };
	}

	return {
		ShipmentRequest: {
			Request: { RequestOption: 'nonvalidate' },
			Shipment: shipment,
			LabelSpecification: labelSpecification,
		},
	};
}

// preSend: enforce the two boundary invariants (FR-010/FR-014) BEFORE any UPS call, then assemble
// the ShipmentRequest body. We throw NodeOperationError, but n8n's declarative routing engine
// rewraps any preSend throw into NodeApiError with httpCode='none' (verified live; routing-node
// wraps non-NodeApiError errors) — the message is preserved and httpCode='none' marks it as a
// pre-call boundary failure rather than a real UPS HTTP error. (A literal-empty required param is
// caught even earlier by n8n's own field validation, before the node runs at all.)
async function createPreSend(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const node = this.getNode();
	const get: ParamGetter = (name, fallback) => this.getNodeParameter(name, fallback as never);

	const accountNumber = (get('accountNumber', '') as string).trim();
	if (!accountNumber) {
		throw new NodeOperationError(node, 'An account number is required to create a shipment.');
	}

	const shipper = readAddress(get, 'shipper');
	const shipTo = readAddress(get, 'shipTo');
	const shipFrom = readAddress(get, 'shipFrom');
	const hasShipFrom = shipFrom.addressLines.length > 0 || shipFrom.city.length > 0;
	const international = isInternational({
		shipFrom: hasShipFrom ? shipFrom : shipper,
		shipper,
		shipTo,
	});

	if (international && readCommodities(get).length === 0) {
		throw new NodeOperationError(
			node,
			'International shipments require at least one customs commodity line.',
		);
	}

	requestOptions.body = buildShipmentBody(get, international);
	return requestOptions;
}

// postReceive: surface UPS errors, then decode the label (key `label`) and — for international —
// the customs invoice (key `customsInvoice`) into n8n binary. The base64 never lands in JSON (FR-009).
async function createPostReceive(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	if (response.statusCode >= 400) {
		mapUpsError(this.getNode(), response.body, response.statusCode);
	}

	const labelFormat = this.getNodeParameter('labelFormat', 'GIF') as string;
	const label = extractLabel(response.body as object, labelFormat as LabelFormat);
	const forms = extractForms(response.body as object);
	const charges = extractCharges(response.body as object);

	const binary: INodeExecutionData['binary'] = {};
	if (label.labels[0]) {
		const l = label.labels[0];
		binary.label = await this.helpers.prepareBinaryData(
			Buffer.from(l.base64, 'base64'),
			l.filename,
			l.mime,
		);
	}
	if (forms[0]) {
		binary.customsInvoice = await this.helpers.prepareBinaryData(
			Buffer.from(forms[0].base64, 'base64'),
			forms[0].filename,
			forms[0].mime,
		);
	}

	return [
		{
			json: {
				shipmentId: label.shipmentId,
				trackingNumbers: label.labels.map((x) => x.trackingNumber),
				international: forms.length > 0,
				charges,
			},
			binary: Object.keys(binary).length > 0 ? binary : undefined,
		},
	];
}

export const createOperationDescription: INodeProperties[] = [
	{
		displayName: 'Account Number',
		name: 'accountNumber',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: showOnlyForCreate },
		description: 'Your UPS account number (ShipperNumber). Billed as the shipper (Type 01).',
	},
	{
		displayName: 'Service Code',
		name: 'service',
		type: 'string',
		required: true,
		default: '03',
		placeholder: '03 = Ground',
		displayOptions: { show: showOnlyForCreate },
		description: 'UPS service code (e.g. 03 Ground, 02 2nd Day Air, 01 Next Day Air)',
	},
	...addressFields({
		prefix: 'shipper',
		label: 'Shipper',
		show: showOnlyForCreate,
		includeName: true,
		includePhone: true,
		required: true,
	}),
	...addressFields({
		prefix: 'shipFrom',
		label: 'Ship From (optional, defaults to Shipper)',
		show: showOnlyForCreate,
		includeName: true,
	}),
	...addressFields({
		prefix: 'shipTo',
		label: 'Ship To',
		show: showOnlyForCreate,
		includeName: true,
		includePhone: true,
		includeResidential: true,
		required: true,
	}),
	{
		displayName: 'Weight',
		name: 'weight',
		type: 'number',
		default: 1,
		required: true,
		displayOptions: { show: showOnlyForCreate },
	},
	{
		displayName: 'Weight Unit',
		name: 'weightUnit',
		type: 'options',
		options: [
			{ name: 'Pounds (LBS)', value: 'LBS' },
			{ name: 'Kilograms (KGS)', value: 'KGS' },
		],
		default: 'LBS',
		displayOptions: { show: showOnlyForCreate },
	},
	{
		displayName: 'Dimensions',
		name: 'dimensions',
		type: 'fixedCollection',
		default: {},
		displayOptions: { show: showOnlyForCreate },
		options: [
			{
				displayName: 'Dimension',
				name: 'dimension',
				values: [
					{ displayName: 'Height', name: 'height', type: 'number', default: 0 },
					{ displayName: 'Length', name: 'length', type: 'number', default: 0 },
					{ displayName: 'Width', name: 'width', type: 'number', default: 0 },
				],
			},
		],
	},
	{
		displayName: 'Dimension Unit',
		name: 'dimensionUnit',
		type: 'options',
		options: [
			{ name: 'Centimeters (CM)', value: 'CM' },
			{ name: 'Inches (IN)', value: 'IN' },
		],
		default: 'IN',
		displayOptions: { show: showOnlyForCreate },
	},
	{
		displayName: 'Label Format',
		name: 'labelFormat',
		type: 'options',
		options: [
			{ name: 'EPL', value: 'EPL' },
			{ name: 'GIF', value: 'GIF' },
			{ name: 'SPL', value: 'SPL' },
			{ name: 'ZPL', value: 'ZPL' },
		],
		default: 'GIF',
		displayOptions: { show: showOnlyForCreate },
		description: 'Label image format. No PDF label is offered (delta 13.6).',
	},
	{
		displayName:
			'The customs fields below are REQUIRED when the origin and destination countries differ (international). Leave them empty for domestic shipments.',
		name: 'customsNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: showOnlyForCreate },
	},
	{
		displayName: 'Reason For Export',
		name: 'customsReasonForExport',
		type: 'string',
		default: 'SALE',
		displayOptions: { show: showOnlyForCreate },
	},
	{
		displayName: 'Customs Currency',
		name: 'customsCurrency',
		type: 'string',
		default: 'USD',
		displayOptions: { show: showOnlyForCreate },
	},
	{
		displayName: 'Terms Of Shipment',
		name: 'customsTermsOfShipment',
		type: 'string',
		default: 'DDU',
		displayOptions: { show: showOnlyForCreate },
		description: 'Incoterms. v1 bills duties to the receiver (DDU).',
	},
	{
		displayName: 'Invoice Number',
		name: 'customsInvoiceNumber',
		type: 'string',
		default: '',
		displayOptions: { show: showOnlyForCreate },
	},
	{
		displayName: 'Invoice Date',
		name: 'customsInvoiceDate',
		type: 'string',
		default: '',
		placeholder: 'yyyyMMdd',
		displayOptions: { show: showOnlyForCreate },
		description:
			'Commercial-invoice date in yyyyMMdd format. UPS requires it for international shipments; leave blank to use today (UTC).',
	},
	...addressFields({
		prefix: 'soldTo',
		label: 'Sold To (International)',
		show: showOnlyForCreate,
		includeName: true,
	}),
	{
		displayName: 'Commodities',
		name: 'commodities',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: {},
		displayOptions: { show: showOnlyForCreate },
		description: 'Customs commodity lines (international only)',
		options: [
			{
				displayName: 'Commodity',
				name: 'line',
				values: [
					{ displayName: 'Commodity Code', name: 'commodityCode', type: 'string', default: '' },
					{ displayName: 'Description', name: 'description', type: 'string', default: '' },
					{ displayName: 'Origin Country', name: 'originCountry', type: 'string', default: '' },
					{ displayName: 'Quantity', name: 'quantity', type: 'number', default: 1 },
					{ displayName: 'Unit Of Measure', name: 'unitOfMeasure', type: 'string', default: 'EA' },
					{ displayName: 'Unit Value', name: 'unitValue', type: 'number', default: 0 },
				],
			},
		],
	},
];

export const createOperationOption = {
	name: 'Create',
	value: 'create',
	action: 'Create a shipment and get a label',
	description:
		'Create a shipment and return the tracking number plus a label (and customs invoice for international)',
	routing: {
		request: {
			method: 'POST' as const,
			url: '/shipments/v2409/ship',
			ignoreHttpStatusErrors: true,
		},
		send: { preSend: [createPreSend] },
		output: { postReceive: [createPostReceive] },
	},
};

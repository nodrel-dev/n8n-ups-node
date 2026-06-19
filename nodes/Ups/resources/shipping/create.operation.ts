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
import {
	addressFields,
	packageFields,
	readAddress,
	readPackage,
	loadShipperProfile,
	readShipper,
	CURRENCY_OPTIONS,
	type ParamGetter,
	type ResolvedShipper,
} from './shared';

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

interface CustomsCollection {
	reasonForExport?: string;
	currency?: string;
	termsOfShipment?: string;
	invoiceNumber?: string;
	invoiceDate?: string;
}

function readCustoms(get: ParamGetter): CustomsInput {
	const soldTo = readAddress(get, 'soldTo');
	// Customs scalars live in a `customs` collection (collapsed for domestic users). The collection
	// defaults to `{}` until the user adds fields, so each value falls back to the same default that
	// used to live on the flat field (SALE / USD / DDU / today). Fallback must NOT be undefined or
	// getNodeParameter throws "Could not get parameter" (see readPackage).
	const customs = get('customs', {}) as CustomsCollection;
	return {
		reasonForExport: customs.reasonForExport || 'SALE',
		currency: customs.currency || 'USD',
		termsOfShipment: customs.termsOfShipment || 'DDU',
		invoiceNumber: (customs.invoiceNumber || '').trim() || undefined,
		invoiceDate: (customs.invoiceDate || '').trim() || todayYyyyMmdd(),
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

function buildShipmentBody(
	get: ParamGetter,
	international: boolean,
	resolvedShipper: ResolvedShipper,
): IDataObject {
	// Shipper (address + name + phone + account number) is already resolved with profile precedence
	// (explicit field > profile > default, ADR-0005). The other parties read straight from fields.
	const accountNumber = resolvedShipper.accountNumber;
	const service = get('service', '03') as string;
	const labelFormat = get('labelFormat', 'GIF') as string;

	const shipper = resolvedShipper.address;
	const shipTo = readAddress(get, 'shipTo');
	const shipFrom = readAddress(get, 'shipFrom');
	const hasShipFrom = shipFrom.addressLines.length > 0 || shipFrom.city.length > 0;
	const effectiveShipFrom = hasShipFrom ? shipFrom : shipper;

	const shipperName = resolvedShipper.name;
	const shipToName = get('shipToName', '') as string;
	const shipFromName = (get('shipFromName', shipperName) as string) || shipperName;
	const shipperPhone = resolvedShipper.phone;
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

	// Resolve Shipper (incl. account number + country) with profile precedence BEFORE the
	// internationality check, so a profile-supplied Shipper country correctly drives it (ADR-0005).
	const profile = await loadShipperProfile(this);
	const resolvedShipper = readShipper(get, profile);
	const accountNumber = resolvedShipper.accountNumber;
	if (!accountNumber) {
		throw new NodeOperationError(node, 'An account number is required to create a shipment.', {
			description:
				'Enter your UPS account number (ShipperNumber), or attach a UPS Shipper Profile credential that supplies one.',
		});
	}

	const shipper = resolvedShipper.address;
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

	requestOptions.body = buildShipmentBody(get, international, resolvedShipper);
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
		default: '',
		displayOptions: { show: showOnlyForCreate },
		description:
			'Your UPS account number (ShipperNumber). Billed as the shipper (Type 01). Leave blank only if a UPS Shipper Profile credential supplies it.',
	},
	{
		displayName: 'Service',
		name: 'service',
		type: 'options',
		required: true,
		// Full Service.Code enum from the UPS Shipping API spec (Shipping.yaml). Not every code is
		// valid on every lane — availability depends on origin/destination and account entitlement —
		// so an unlisted code can still be supplied via an expression. Stored value is the raw code.
		options: [
			{ name: 'Next Day Air (01)', value: '01' },
			{ name: '2nd Day Air (02)', value: '02' },
			{ name: 'Ground (03)', value: '03' },
			{ name: 'Express (07)', value: '07' },
			{ name: 'Expedited (08)', value: '08' },
			{ name: 'UPS Standard (11)', value: '11' },
			{ name: '3 Day Select (12)', value: '12' },
			{ name: 'Next Day Air Saver (13)', value: '13' },
			{ name: 'Next Day Air Early (14)', value: '14' },
			{ name: 'Worldwide Economy DDU (17)', value: '17' },
			{ name: 'Express Plus (54)', value: '54' },
			{ name: '2nd Day Air A.M. (59)', value: '59' },
			{ name: 'UPS Saver (65)', value: '65' },
			{ name: 'Access Point Economy (70)', value: '70' },
			{ name: 'Worldwide Express Freight Midday (71)', value: '71' },
			{ name: 'Worldwide Economy DDP (72)', value: '72' },
			{ name: 'Express 12:00 (74)', value: '74' },
			{ name: 'UPS Heavy Goods (75)', value: '75' },
			{ name: 'UPS Today Standard (82)', value: '82' },
			{ name: 'UPS Today Dedicated Courier (83)', value: '83' },
			{ name: 'UPS Today Intercity (84)', value: '84' },
			{ name: 'First Class Mail (M2)', value: 'M2' },
			{ name: 'Priority Mail (M3)', value: 'M3' },
			{ name: 'Expedited Mail Innovations (M4)', value: 'M4' },
			{ name: 'Priority Mail Innovations (M5)', value: 'M5' },
			{ name: 'Economy Mail Innovations (M6)', value: 'M6' },
			{ name: 'Mail Innovations Returns (M7)', value: 'M7' },
		],
		default: '03',
		displayOptions: { show: showOnlyForCreate },
		description:
			'UPS service. Availability depends on the lane and account; codes shown in parentheses match UPS Service.Code.',
	},
	{
		displayName:
			'The Shipper fields below (and Account Number) can be supplied by an optional UPS Shipper Profile credential. An explicit value here always overrides the profile; leave a field blank to inherit it from the profile.',
		name: 'shipperProfileNoticeCreate',
		type: 'notice',
		default: '',
		displayOptions: { show: showOnlyForCreate },
	},
	...addressFields({
		prefix: 'shipper',
		label: 'Shipper',
		show: showOnlyForCreate,
		includeName: true,
		includePhone: true,
		countryDefault: '',
	}),
	...addressFields({
		prefix: 'shipFrom',
		label: 'Ship From',
		show: showOnlyForCreate,
		includeName: true,
		hint: 'Optional. Defaults to the Shipper address when left blank.',
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
	...packageFields(showOnlyForCreate),
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
			'The Customs, Sold To, and Commodities fields below are REQUIRED when the origin and destination countries differ (international). Leave them empty for domestic shipments — sensible defaults are applied automatically.',
		name: 'customsNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: showOnlyForCreate },
	},
	{
		// International customs scalars, grouped so domestic users see one collapsed row instead of
		// five always-on fields (restores the `customs` collection from contracts/create-shipment.md).
		// Each value still falls back to its prior default in readCustoms when the user adds nothing.
		displayName: 'Customs',
		name: 'customs',
		type: 'collection',
		placeholder: 'Add Customs Field',
		default: {},
		displayOptions: { show: showOnlyForCreate },
		description: 'Commercial-invoice details for international shipments',
		options: [
			{
				displayName: 'Customs Currency',
				name: 'currency',
				type: 'options',
				options: CURRENCY_OPTIONS,
				default: 'USD',
				description:
					'Commercial-invoice currency. Pick a common code, or use an expression for any ISO 4217 code.',
			},
			{
				displayName: 'Invoice Date',
				name: 'invoiceDate',
				type: 'string',
				default: '',
				placeholder: 'yyyyMMdd',
				description:
					'Commercial-invoice date in yyyyMMdd format. UPS requires it for international shipments; leave blank to use today (UTC).',
			},
			{
				displayName: 'Invoice Number',
				name: 'invoiceNumber',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Reason For Export',
				name: 'reasonForExport',
				type: 'string',
				default: 'SALE',
			},
			{
				displayName: 'Terms Of Shipment',
				name: 'termsOfShipment',
				type: 'string',
				default: 'DDU',
				description: 'Incoterms. v1 bills duties to the receiver (DDU).',
			},
		],
	},
	...addressFields({
		prefix: 'soldTo',
		label: 'Sold To',
		show: showOnlyForCreate,
		includeName: true,
		hint: 'International shipments only. The party the goods are sold to (commercial invoice).',
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
					{
						displayName: 'Quantity',
						name: 'quantity',
						type: 'number',
						default: 1,
						typeOptions: { minValue: 0 },
					},
					{ displayName: 'Unit Of Measure', name: 'unitOfMeasure', type: 'string', default: 'EA' },
					{
						displayName: 'Unit Value',
						name: 'unitValue',
						type: 'number',
						default: 0,
						typeOptions: { minValue: 0 },
					},
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

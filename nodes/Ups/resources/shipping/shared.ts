import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';
import type { NormalizedAddressInput } from '../../core/toXavAddress';

// Shared field generators + parameter readers for the Shipping operations (Get Rates + Create), so
// the two never drift on address/weight/dimension shapes. The whole node is declarative (no
// `execute()`, ADR-0004): BOTH operations read these from their `preSend` hooks via
// IExecuteSingleFunctions, whose `getNodeParameter` is `(name, fallback)`. The readers below take a
// ParamGetter closure so each caller bridges its own context.

export type ParamGetter = (name: string, fallback: unknown) => unknown;

// Curated currency codes shared by Get Rates (customsValue) and Create (customs invoice) so the two
// can't drift and typos can't reach UPS (C1). An expression can still supply any other ISO code.
export const CURRENCY_OPTIONS = [
	{ name: 'US Dollar (USD)', value: 'USD' },
	{ name: 'Canadian Dollar (CAD)', value: 'CAD' },
	{ name: 'Euro (EUR)', value: 'EUR' },
	{ name: 'British Pound (GBP)', value: 'GBP' },
	{ name: 'Mexican Peso (MXN)', value: 'MXN' },
	{ name: 'Australian Dollar (AUD)', value: 'AUD' },
	{ name: 'Japanese Yen (JPY)', value: 'JPY' },
	{ name: 'Swiss Franc (CHF)', value: 'CHF' },
	{ name: 'Chinese Yuan (CNY)', value: 'CNY' },
	{ name: 'Hong Kong Dollar (HKD)', value: 'HKD' },
];

export interface AddressFieldOptions {
	prefix: string; // e.g. 'shipper'
	label: string; // e.g. 'Shipper'
	show: IDisplayOptions['show'];
	includeName?: boolean;
	includePhone?: boolean;
	includeResidential?: boolean;
	required?: boolean;
	// Block-level help (e.g. "Optional. Defaults to the Shipper address."). Rendered as the
	// description on the block's Address Line 1, so the `label` stays a clean noun (display-name
	// hygiene) instead of carrying parenthetical help into every generated sub-field name.
	hint?: string;
	// Default for the Country Code field. Defaults to 'US' for every block. The Shipper block passes
	// '' so a Shipper Profile credential can override the country at run time (ADR-0005): with a 'US'
	// field default, n8n can't distinguish "left default" from "typed US", so the profile could never
	// win. readShipper restores 'US' as the final fallback, so non-profile behaviour is unchanged.
	countryDefault?: string;
}

export function addressFields(opts: AddressFieldOptions): INodeProperties[] {
	const { prefix, label, show } = opts;
	const fields: INodeProperties[] = [];

	// Built with a literal 'US' default, then cleared for the Shipper block (countryDefault '') so a
	// Shipper Profile credential can override the country at run time (ADR-0005); readShipper restores
	// 'US' as the final fallback. Kept a literal-default object so the n8n lint default rule is happy.
	const countryField: INodeProperties = {
		displayName: `${label} Country Code`,
		name: `${prefix}CountryCode`,
		type: 'string',
		default: 'US',
		displayOptions: { show },
	};
	if (opts.countryDefault !== undefined) {
		countryField.default = opts.countryDefault;
		if (opts.countryDefault === '') countryField.placeholder = 'US';
	}

	if (opts.includeName) {
		fields.push({
			displayName: `${label} Name`,
			name: `${prefix}Name`,
			type: 'string',
			default: '',
			displayOptions: { show },
			description: `${label} contact/company name`,
		});
	}

	fields.push(
		{
			displayName: `${label} Address Line 1`,
			name: `${prefix}AddressLine1`,
			type: 'string',
			default: '',
			required: opts.required ?? false,
			displayOptions: { show },
			...(opts.hint ? { description: opts.hint } : {}),
		},
		{
			displayName: `${label} Address Line 2`,
			name: `${prefix}AddressLine2`,
			type: 'string',
			default: '',
			displayOptions: { show },
		},
		{
			displayName: `${label} City`,
			name: `${prefix}City`,
			type: 'string',
			default: '',
			displayOptions: { show },
		},
		{
			displayName: `${label} State / Province Code`,
			name: `${prefix}StateProvinceCode`,
			type: 'string',
			default: '',
			placeholder: 'NY',
			displayOptions: { show },
		},
		{
			displayName: `${label} Postal Code`,
			name: `${prefix}PostalCode`,
			type: 'string',
			default: '',
			placeholder: '10001',
			displayOptions: { show },
		},
		countryField,
	);

	if (opts.includePhone) {
		fields.push({
			displayName: `${label} Phone`,
			name: `${prefix}Phone`,
			type: 'string',
			default: '',
			displayOptions: { show },
			description: `${label} phone number. UPS may require this for cross-border shipments.`,
		});
	}

	if (opts.includeResidential) {
		fields.push({
			displayName: `${label} Is Residential`,
			name: `${prefix}Residential`,
			type: 'boolean',
			default: false,
			displayOptions: { show },
		});
	}

	return fields;
}

export function readAddress(
	get: ParamGetter,
	prefix: string,
): NormalizedAddressInput & { residential?: boolean } {
	const line1 = get(`${prefix}AddressLine1`, '') as string;
	const line2 = get(`${prefix}AddressLine2`, '') as string;
	return {
		addressLines: [line1, line2].filter((l) => l && l.trim().length > 0),
		city: get(`${prefix}City`, '') as string,
		stateProvinceCode: get(`${prefix}StateProvinceCode`, '') as string,
		postalCode: get(`${prefix}PostalCode`, '') as string,
		countryCode: get(`${prefix}CountryCode`, 'US') as string,
		residential: get(`${prefix}Residential`, false) as boolean,
	};
}

// --- Shipper Profile (ADR-0005) -------------------------------------------------------------------
// Optional, non-auth `upsShipperProfileApi` credential holding reusable Shipper config. Read at run time
// and merged into the Shipper block ONLY, with precedence: explicit node field > profile > default.
// Lives here so Get Rates and Create resolve the Shipper identically (same single-source discipline
// as toUpsAddress / isInternational).

export interface ShipperProfile {
	accountNumber?: string;
	shipperName?: string;
	addressLine1?: string;
	addressLine2?: string;
	city?: string;
	stateProvinceCode?: string;
	postalCode?: string;
	countryCode?: string;
	phone?: string;
}

export interface ResolvedShipper {
	address: NormalizedAddressInput & { residential?: boolean };
	name: string;
	phone: string;
	accountNumber: string;
}

// Precedence: a non-blank explicit field wins; else a non-blank profile value; else the fallback.
function pickField(explicit: unknown, profileValue: string | undefined, fallback = ''): string {
	const e = typeof explicit === 'string' ? explicit.trim() : '';
	if (e.length > 0) return e;
	const p = (profileValue ?? '').trim();
	if (p.length > 0) return p;
	return fallback;
}

// Load the optional profile credential. Absent/unconfigured → null (getCredentials throws for an
// optional credential that isn't attached, so the throw is the "no profile" signal, not an error).
export async function loadShipperProfile(ctx: {
	getCredentials(type: string): Promise<unknown>;
}): Promise<ShipperProfile | null> {
	try {
		const cred = (await ctx.getCredentials('upsShipperProfileApi')) as ShipperProfile | undefined;
		return cred ?? null;
	} catch {
		return null;
	}
}

// Resolve the Shipper block (address + name + phone + account number) from the explicit node fields,
// falling back to the profile, then to built-in defaults. Only the Shipper uses this; ShipTo /
// ShipFrom / SoldTo keep plain readAddress (unchanged) so their behaviour is untouched.
export function readShipper(get: ParamGetter, profile: ShipperProfile | null): ResolvedShipper {
	const p = profile ?? {};
	const line1 = pickField(get('shipperAddressLine1', ''), p.addressLine1);
	const line2 = pickField(get('shipperAddressLine2', ''), p.addressLine2);
	return {
		address: {
			addressLines: [line1, line2].filter((l) => l.length > 0),
			city: pickField(get('shipperCity', ''), p.city),
			stateProvinceCode: pickField(get('shipperStateProvinceCode', ''), p.stateProvinceCode),
			postalCode: pickField(get('shipperPostalCode', ''), p.postalCode),
			// Shipper country field defaults to '' (ADR-0005) so the profile can win; 'US' is the final
			// fallback, preserving pre-profile behaviour for users who set no profile and leave it blank.
			countryCode: pickField(get('shipperCountryCode', ''), p.countryCode, 'US'),
		},
		name: pickField(get('shipperName', ''), p.shipperName),
		phone: pickField(get('shipperPhone', ''), p.phone),
		accountNumber: pickField(get('accountNumber', ''), p.accountNumber),
	};
}

// Package weight + optional dimension fields, shared by Rate and Create.
export function packageFields(show: IDisplayOptions['show']): INodeProperties[] {
	return [
		{
			displayName: 'Weight',
			name: 'weight',
			type: 'number',
			default: 1,
			required: true,
			typeOptions: { minValue: 0 },
			displayOptions: { show },
			description: 'Package weight',
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
			displayOptions: { show },
		},
		{
			displayName: 'Dimensions',
			name: 'dimensions',
			type: 'fixedCollection',
			default: {},
			displayOptions: { show },
			description: 'Optional package dimensions',
			options: [
				{
					displayName: 'Dimension',
					name: 'dimension',
					values: [
						{
							displayName: 'Length',
							name: 'length',
							type: 'number',
							default: 0,
							typeOptions: { minValue: 0 },
						},
						{
							displayName: 'Width',
							name: 'width',
							type: 'number',
							default: 0,
							typeOptions: { minValue: 0 },
						},
						{
							displayName: 'Height',
							name: 'height',
							type: 'number',
							default: 0,
							typeOptions: { minValue: 0 },
						},
					],
				},
			],
		},
		{
			displayName: 'Dimension Unit',
			name: 'dimensionUnit',
			type: 'options',
			options: [
				{ name: 'Inches (IN)', value: 'IN' },
				{ name: 'Centimeters (CM)', value: 'CM' },
			],
			default: 'IN',
			displayOptions: { show },
		},
	];
}

export interface UpsPackage {
	PackageWeight: { UnitOfMeasurement: { Code: string }; Weight: string };
	Dimensions?: {
		UnitOfMeasurement: { Code: string };
		Length: string;
		Width: string;
		Height: string;
	};
}

export function readPackage(get: ParamGetter): UpsPackage {
	const weight = get('weight', 1) as number;
	const weightUnit = get('weightUnit', 'LBS') as string;
	const pkg: UpsPackage = {
		PackageWeight: { UnitOfMeasurement: { Code: weightUnit }, Weight: String(weight) },
	};

	// Fallback must NOT be `undefined`: n8n's getNodeParameter throws "Could not get parameter"
	// when both the resolved value and the fallback are undefined. `dimensions` is a fixedCollection
	// that defaults to `{}`, so `dimensions.dimension` is absent until the user adds a row — an
	// `undefined` fallback would throw on every dimension-less Rate/Create call (verified live CIE).
	const dims = get('dimensions.dimension', {}) as {
		length?: number;
		width?: number;
		height?: number;
	};
	if (dims.length || dims.width || dims.height) {
		const dimUnit = get('dimensionUnit', 'IN') as string;
		pkg.Dimensions = {
			UnitOfMeasurement: { Code: dimUnit },
			Length: String(dims.length ?? 0),
			Width: String(dims.width ?? 0),
			Height: String(dims.height ?? 0),
		};
	}

	return pkg;
}

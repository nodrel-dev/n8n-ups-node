import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

// UI field generators for the Shipping operations (Get Rates + Create). Pure description builders —
// no runtime parameter reading (see readParties.ts) and no profile precedence (see shipperProfile.ts).
// Kept together so the two operations render identical address / weight / dimension / currency fields.

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

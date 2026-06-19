import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';
import type { NormalizedAddressInput } from '../../core/toXavAddress';

// Shared field generators + parameter readers for the Shipping operations (Get Rates + Create), so
// the two never drift on address/weight/dimension shapes. Declarative (Rate) reads these in preSend
// via IExecuteSingleFunctions; programmatic (Create) reads them in execute() via IExecuteFunctions —
// the two have DIFFERENT getNodeParameter signatures (single: (name, fallback); multi: (name, index,
// fallback)). The readers below take a ParamGetter closure so each caller bridges its own context.

export type ParamGetter = (name: string, fallback: unknown) => unknown;

export interface AddressFieldOptions {
	prefix: string; // e.g. 'shipper'
	label: string; // e.g. 'Shipper'
	show: IDisplayOptions['show'];
	includeName?: boolean;
	includePhone?: boolean;
	includeResidential?: boolean;
	required?: boolean;
}

export function addressFields(opts: AddressFieldOptions): INodeProperties[] {
	const { prefix, label, show } = opts;
	const fields: INodeProperties[] = [];

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
			displayOptions: { show },
		},
		{
			displayName: `${label} Postal Code`,
			name: `${prefix}PostalCode`,
			type: 'string',
			default: '',
			displayOptions: { show },
		},
		{
			displayName: `${label} Country Code`,
			name: `${prefix}CountryCode`,
			type: 'string',
			default: 'US',
			displayOptions: { show },
		},
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

// Package weight + optional dimension fields, shared by Rate and Create.
export function packageFields(show: IDisplayOptions['show']): INodeProperties[] {
	return [
		{
			displayName: 'Weight',
			name: 'weight',
			type: 'number',
			default: 1,
			required: true,
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
						{ displayName: 'Length', name: 'length', type: 'number', default: 0 },
						{ displayName: 'Width', name: 'width', type: 'number', default: 0 },
						{ displayName: 'Height', name: 'height', type: 'number', default: 0 },
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

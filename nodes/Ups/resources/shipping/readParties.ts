import type { NormalizedAddressInput } from '../../core/toXavAddress';
import { isInternational } from '../../core/isInternational';
import { readShipper, type ResolvedShipper, type ShipperProfile } from './shipperProfile';

// Runtime parameter readers for the Shipping operations. The whole node is declarative (no `execute()`,
// ADR-0004): BOTH operations read these from their `preSend` hooks via IExecuteSingleFunctions, whose
// `getNodeParameter` is `(name, fallback)`. The readers take a ParamGetter closure so each caller
// bridges its own context, which also keeps them pure and unit-testable (Principle 10).

export type ParamGetter = (name: string, fallback: unknown) => unknown;

export type ReadAddress = NormalizedAddressInput & { residential?: boolean };

export function readAddress(get: ParamGetter, prefix: string): ReadAddress {
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

// --- Effective Origin / shipment parties (ADR-0003, ADR-0005) -------------------------------------
// Single owner for the "resolve shipper with profile precedence → read ShipTo/ShipFrom → pick the
// effective origin → classify international" sequence that Get Rates and Create both perform. CONTEXT.md
// names "Effective Origin" as a concept; this is the module that owns it, so a fix to the hasShipFrom
// rule lands once and the two operations can never silently disagree. The internationality call and the
// profile precedence are unchanged (ADR-0003 / ADR-0005) — this only de-duplicates their composition.

export interface ResolvedParties {
	// Shipper resolved with profile precedence (address + name + phone + account number).
	shipper: ResolvedShipper;
	shipTo: ReadAddress;
	// ShipFrom as typed by the user (may be blank), plus the effective origin actually sent to UPS.
	shipFrom: ReadAddress;
	effectiveShipFrom: ReadAddress;
	// True when the user supplied a ShipFrom (address line or city) — the same test isInternational and
	// the request builders use to decide whether ShipFrom overrides the Shipper as the origin.
	hasShipFrom: boolean;
	// Effective Origin country (effectiveShipFrom) differs from ShipTo country (ADR-0003).
	international: boolean;
	// Convenience mirror of shipper.accountNumber (the boundary-required value both preSends guard on).
	accountNumber: string;
}

// `profile` is loaded by the caller (await loadShipperProfile(this)) so this stays pure plain-in /
// plain-out and unit-testable without IExecuteSingleFunctions (Principle 10).
export function resolveShipmentParties(
	get: ParamGetter,
	profile: ShipperProfile | null,
): ResolvedParties {
	const shipper = readShipper(get, profile);
	const shipTo = readAddress(get, 'shipTo');
	const shipFrom = readAddress(get, 'shipFrom');
	const hasShipFrom = shipFrom.addressLines.length > 0 || shipFrom.city.length > 0;
	const effectiveShipFrom = hasShipFrom ? shipFrom : shipper.address;
	const international = isInternational({
		shipFrom: effectiveShipFrom,
		shipper: shipper.address,
		shipTo,
	});
	return {
		shipper,
		shipTo,
		shipFrom,
		effectiveShipFrom,
		hasShipFrom,
		international,
		accountNumber: shipper.accountNumber,
	};
}

import type { NormalizedAddressInput } from '../../core/toXavAddress';
import type { ParamGetter } from './readParties';

// Shipper Profile precedence (ADR-0005). The optional, non-auth `upsShipperProfileApi` credential
// holds reusable Shipper config; it is read at run time and merged into the Shipper block ONLY, with
// precedence: explicit node field > profile > default. Isolated here as the single owner of that rule
// so Get Rates and Create resolve the Shipper identically (same single-source discipline as the cores).

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

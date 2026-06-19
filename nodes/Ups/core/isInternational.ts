// Pure core: the Effective-Origin predicate shared by Rate and Create (ADR-0003) so the two never
// disagree on whether a shipment is international. International ⟺ Effective Origin country differs
// from the ShipTo country. Effective Origin = ShipFrom country if present, else Shipper country.

export interface CountryRef {
	countryCode?: string;
}

export interface InternationalInput {
	shipFrom?: CountryRef;
	shipper: CountryRef;
	shipTo: CountryRef;
}

function normalize(code: string | undefined): string {
	return (code ?? '').trim().toUpperCase();
}

export function isInternational(input: InternationalInput): boolean {
	const origin = normalize(input.shipFrom?.countryCode) || normalize(input.shipper?.countryCode);
	const destination = normalize(input.shipTo?.countryCode);
	// Only call it international when both countries are known and differ; unknowns default to domestic.
	if (!origin || !destination) return false;
	return origin !== destination;
}

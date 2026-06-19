// Pure core: map a normalized address into UPS's XAV `AddressKeyFormat` shape (Validate only).
// Field names differ from the Rate/Ship Address shape (PoliticalDivision2 = city, etc.), so this
// is a separate core from `toUpsAddress` (data-model.md, contracts/validate-address.md).

export interface NormalizedAddressInput {
	addressLines: string[];
	city: string;
	stateProvinceCode: string;
	postalCode: string;
	countryCode: string;
}

export interface XavAddressKeyFormat {
	AddressLine: string[];
	PoliticalDivision2: string;
	PoliticalDivision1: string;
	PostcodePrimaryLow: string;
	PostcodeExtendedLow?: string;
	CountryCode: string;
}

// Split a US-style ZIP+4 ("92656-1521") into primary + extended; pass other formats through whole.
function splitPostcode(postalCode: string): { primary: string; extended?: string } {
	const trimmed = (postalCode ?? '').trim();
	const dash = trimmed.indexOf('-');
	if (dash > -1) {
		return { primary: trimmed.slice(0, dash), extended: trimmed.slice(dash + 1) || undefined };
	}
	return { primary: trimmed };
}

export function toXavAddress(input: NormalizedAddressInput): XavAddressKeyFormat {
	const { primary, extended } = splitPostcode(input.postalCode);
	const result: XavAddressKeyFormat = {
		AddressLine: (input.addressLines ?? []).map((l) => l.trim()).filter((l) => l.length > 0),
		PoliticalDivision2: input.city,
		PoliticalDivision1: input.stateProvinceCode,
		PostcodePrimaryLow: primary,
		CountryCode: input.countryCode,
	};
	if (extended) result.PostcodeExtendedLow = extended;
	return result;
}

import type { NormalizedAddressInput } from './toXavAddress';

// Pure core: map a normalized address into UPS's Rate/Ship `Address` shape (data-model.md).
// Distinct from `toXavAddress` (Validate uses PoliticalDivision* field names). The
// ResidentialAddressIndicator is an empty-tag presence flag — included only when residential.

export interface UpsAddress {
	AddressLine: string[];
	City: string;
	StateProvinceCode: string;
	PostalCode: string;
	CountryCode: string;
	ResidentialAddressIndicator?: string;
}

export function toUpsAddress(
	input: NormalizedAddressInput & { residential?: boolean },
): UpsAddress {
	const address: UpsAddress = {
		AddressLine: (input.addressLines ?? []).map((l) => l.trim()).filter((l) => l.length > 0),
		City: input.city,
		StateProvinceCode: input.stateProvinceCode,
		PostalCode: input.postalCode,
		CountryCode: input.countryCode,
	};
	if (input.residential) address.ResidentialAddressIndicator = '';
	return address;
}

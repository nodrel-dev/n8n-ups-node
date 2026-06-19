import type { Money } from './types';

// Pure core: shape a UPS charge `{ CurrencyCode, MonetaryValue }` into `{ amount, currency } | null`.
// Shared by `flattenRates` and Create so the two operations never disagree on money (data-model.md).
// Returns null whenever UPS omitted the charge (e.g. no negotiated rate entitlement).

export interface UpsCharge {
	CurrencyCode?: string;
	MonetaryValue?: string;
}

export function toMoney(charge: UpsCharge | undefined | null): Money | null {
	if (!charge) return null;
	const { CurrencyCode, MonetaryValue } = charge;
	if (
		!CurrencyCode ||
		MonetaryValue === undefined ||
		MonetaryValue === null ||
		MonetaryValue === ''
	) {
		return null;
	}
	return { amount: MonetaryValue, currency: CurrencyCode };
}

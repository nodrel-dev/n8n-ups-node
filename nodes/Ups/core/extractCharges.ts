import type { Money } from './types';
import { toMoney, type UpsCharge } from './toMoney';

// Pure core: pull the shipment-level charges out of the UPS Ship response so Create surfaces what
// the shipment cost, not just the tracking number. `published` is ShipmentCharges.TotalCharges;
// `negotiated` is NegotiatedRateCharges.TotalCharge (present only when the account is entitled on
// the lane — null otherwise, mirroring flattenRates). Money goes through the shared `toMoney` shape
// so Create and Get Rates never disagree (data-model.md, Principle 10).

export interface ExtractedCharges {
	published: Money | null;
	negotiated: Money | null;
}

interface ShipChargeResponse {
	ShipmentResponse?: {
		ShipmentResults?: {
			ShipmentCharges?: { TotalCharges?: UpsCharge };
			NegotiatedRateCharges?: { TotalCharge?: UpsCharge };
		};
	};
}

export function extractCharges(response: ShipChargeResponse): ExtractedCharges {
	const results = response.ShipmentResponse?.ShipmentResults;
	return {
		published: toMoney(results?.ShipmentCharges?.TotalCharges),
		negotiated: toMoney(results?.NegotiatedRateCharges?.TotalCharge),
	};
}

import type { RateLine } from './types';
import { toMoney, type UpsCharge } from './toMoney';

// Pure core: flatten the UPS rate response into RateLine[] — one per service (the operation fans
// these out, one output item per service). Published is never null; Negotiated is nullable via the
// shared `toMoney`. Per-service alerts attach to their line; request-level alerts attach to the
// FIRST emitted item only; when EVERY line's negotiated rate is null, one synthetic request-level
// alert is added to the first item (FR-007, contracts/get-rates.md).

const NO_NEGOTIATED_ALERT =
	'No negotiated rates were returned. Confirm your account number is enabled for negotiated rates.';

interface RawAlert {
	Code?: string;
	Description?: string;
}

interface RawRatedShipment {
	Service?: { Code?: string; Description?: string };
	BillingWeight?: { Weight?: string };
	TotalCharges?: UpsCharge;
	NegotiatedRateCharges?: { TotalCharge?: UpsCharge };
	GuaranteedDelivery?: { BusinessDaysInTransit?: string; DeliveryByTime?: string };
	RatedShipmentAlert?: RawAlert[] | RawAlert;
}

interface RateResponse {
	RateResponse?: {
		Response?: { Alert?: RawAlert[] | RawAlert };
		RatedShipment?: RawRatedShipment[] | RawRatedShipment;
	};
}

function toArray<T>(value: T[] | T | undefined): T[] {
	if (value === undefined || value === null) return [];
	return Array.isArray(value) ? value : [value];
}

function alertText(alert: RawAlert): string {
	return alert.Description ?? alert.Code ?? '';
}

function parseTransitDays(value: string | undefined): number | null {
	if (value === undefined || value === '') return null;
	const n = Number.parseInt(value, 10);
	return Number.isNaN(n) ? null : n;
}

export function flattenRates(
	response: RateResponse,
	options: { wantTransit: boolean },
): RateLine[] {
	const rate = response.RateResponse;
	const shipments = toArray(rate?.RatedShipment);

	const lines: RateLine[] = shipments.map((shipment) => {
		const published = toMoney(shipment.TotalCharges) ?? { amount: '0', currency: 'USD' };
		return {
			serviceCode: shipment.Service?.Code ?? '',
			serviceName: shipment.Service?.Description ?? '',
			negotiated: toMoney(shipment.NegotiatedRateCharges?.TotalCharge),
			published,
			billingWeight: shipment.BillingWeight?.Weight ?? null,
			// Transit fields are populated only when the caller asked for them (Shoptimeintransit).
			transitDays: options.wantTransit
				? parseTransitDays(shipment.GuaranteedDelivery?.BusinessDaysInTransit)
				: null,
			guaranteedBy: options.wantTransit
				? (shipment.GuaranteedDelivery?.DeliveryByTime ?? null)
				: null,
			alerts: toArray(shipment.RatedShipmentAlert)
				.map(alertText)
				.filter((a) => a.length > 0),
		};
	});

	if (lines.length === 0) return lines;

	// Request-level alerts → first item only.
	const requestAlerts = toArray(rate?.Response?.Alert)
		.map(alertText)
		.filter((a) => a.length > 0);
	if (requestAlerts.length > 0) {
		lines[0].alerts = [...lines[0].alerts, ...requestAlerts];
	}

	// Synthetic "no negotiated rates" alert when every line is null (FR-007).
	if (lines.every((l) => l.negotiated === null)) {
		lines[0].alerts = [...lines[0].alerts, NO_NEGOTIATED_ALERT];
	}

	return lines;
}

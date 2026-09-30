import { describe, it, expect } from 'vitest';
import { flattenRates } from '../../nodes/Ups/core/flattenRates';
import fixture from '../fixtures/rate-shoptimeintransit.json';

describe('flattenRates', () => {
	it('returns one RateLine per service', () => {
		const lines = flattenRates(fixture, { wantTransit: true });
		expect(lines).toHaveLength(2);
		expect(lines[0].serviceCode).toBe('03');
		expect(lines[0].serviceName).toBe('UPS Ground');
	});

	// Issue #44. UPS sends `Service.Description: ""` (verified live against CIE), so the name is
	// resolved from the code. The fixture now carries that empty string, which means the assertion
	// above is genuinely exercising the lookup rather than echoing a fabricated fixture value.
	it('never emits an empty service name, even though UPS sends an empty Description', () => {
		const lines = flattenRates(fixture, { wantTransit: true });
		expect(fixture.RateResponse.RatedShipment[0].Service.Description).toBe('');
		for (const line of lines) {
			expect(line.serviceName).not.toBe('');
		}
	});

	it('names services for the ORIGIN country, not a single hardcoded market', () => {
		// The same code is a different product per origin: 02 is 2nd Day Air from the US but
		// Expedited from Canada. Getting this wrong would confidently mislabel every rate for a
		// Canadian shipper — including this project's own Canada-registered CIE account.
		const us = flattenRates(fixture, { wantTransit: true, originCountry: 'US' });
		const ca = flattenRates(fixture, { wantTransit: true, originCountry: 'CA' });
		expect(us[1].serviceCode).toBe('02');
		expect(ca[1].serviceCode).toBe('02');
		expect(us[1].serviceName).toBe('UPS 2nd Day Air');
		expect(ca[1].serviceName).toBe('UPS Expedited');
	});

	it('maps published (never null) and negotiated (nullable) via the shared money shape', () => {
		const [ground] = flattenRates(fixture, { wantTransit: true });
		expect(ground.published).toEqual({ amount: '12.50', currency: 'USD' });
		expect(ground.negotiated).toEqual({ amount: '10.10', currency: 'USD' });
	});

	it('carries transit days and guaranteed-by when present', () => {
		const [ground] = flattenRates(fixture, { wantTransit: true });
		expect(ground.transitDays).toBe(3);
		expect(ground.guaranteedBy).toBe('End of Day');
		expect(ground.billingWeight).toBe('10');
	});

	it('captures per-service alerts', () => {
		const [ground] = flattenRates(fixture, { wantTransit: true });
		expect(ground.alerts).toContain('Ground saver eligible');
	});

	it('attaches request-level alerts to the first emitted item only', () => {
		const lines = flattenRates(fixture, { wantTransit: true });
		expect(lines[0].alerts.some((a) => a.includes('invoice may vary'))).toBe(true);
		expect(lines[1].alerts.some((a) => a.includes('invoice may vary'))).toBe(false);
	});

	it('emits a single request-level alert on the first item when EVERY negotiated rate is null', () => {
		const noNegotiated = {
			RateResponse: {
				Response: { ResponseStatus: { Code: '1' } },
				RatedShipment: [
					{
						Service: { Code: '03' },
						TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '12.50' },
					},
					{
						Service: { Code: '02' },
						TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '28.40' },
					},
				],
			},
		};
		const lines = flattenRates(noNegotiated, { wantTransit: false });
		expect(lines.every((l) => l.negotiated === null)).toBe(true);
		const negotiatedAlerts = lines[0].alerts.filter((a) => /negotiated/i.test(a));
		expect(negotiatedAlerts).toHaveLength(1);
		// And not duplicated onto later items.
		expect(lines[1].alerts.filter((a) => /negotiated/i.test(a))).toHaveLength(0);
	});

	it('normalizes a single RatedShipment object into an array (versions < v2409 safety)', () => {
		const single = {
			RateResponse: {
				Response: { ResponseStatus: { Code: '1' } },
				RatedShipment: {
					Service: { Code: '03' },
					TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '5.00' },
				},
			},
		};
		expect(flattenRates(single, { wantTransit: false })).toHaveLength(1);
	});
});

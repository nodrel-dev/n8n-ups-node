/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import { extractCharges } from '../../nodes/Ups/core/extractCharges';

describe('extractCharges', () => {
	it('pulls published (TotalCharges) and negotiated (TotalCharge) via the shared money shape', () => {
		const response = {
			ShipmentResponse: {
				ShipmentResults: {
					ShipmentCharges: { TotalCharges: { CurrencyCode: 'CAD', MonetaryValue: '82.82' } },
					NegotiatedRateCharges: { TotalCharge: { CurrencyCode: 'CAD', MonetaryValue: '81.99' } },
				},
			},
		};
		expect(extractCharges(response)).toEqual({
			published: { amount: '82.82', currency: 'CAD' },
			negotiated: { amount: '81.99', currency: 'CAD' },
		});
	});

	it('returns negotiated null when the account is not entitled on the lane', () => {
		const response = {
			ShipmentResponse: {
				ShipmentResults: {
					ShipmentCharges: { TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '40.00' } },
				},
			},
		};
		expect(extractCharges(response)).toEqual({
			published: { amount: '40.00', currency: 'USD' },
			negotiated: null,
		});
	});

	it('returns both null when charges are absent', () => {
		expect(extractCharges({})).toEqual({ published: null, negotiated: null });
	});
});

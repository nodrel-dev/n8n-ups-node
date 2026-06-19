/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import { isInternational } from '../../nodes/Ups/core/isInternational';

describe('isInternational', () => {
	it('is false when Effective Origin and ShipTo share a country', () => {
		expect(isInternational({ shipper: { countryCode: 'US' }, shipTo: { countryCode: 'US' } })).toBe(
			false,
		);
	});

	it('is true when Effective Origin differs from ShipTo', () => {
		expect(isInternational({ shipper: { countryCode: 'US' }, shipTo: { countryCode: 'CA' } })).toBe(
			true,
		);
	});

	it('prefers ShipFrom country over Shipper as the Effective Origin', () => {
		// Shipper is US but the goods actually ship from CA → vs US destination is international.
		expect(
			isInternational({
				shipFrom: { countryCode: 'CA' },
				shipper: { countryCode: 'US' },
				shipTo: { countryCode: 'US' },
			}),
		).toBe(true);
	});

	it('falls back to Shipper when ShipFrom country is absent', () => {
		expect(
			isInternational({
				shipFrom: {},
				shipper: { countryCode: 'US' },
				shipTo: { countryCode: 'US' },
			}),
		).toBe(false);
	});

	it('is case-insensitive on country codes', () => {
		expect(isInternational({ shipper: { countryCode: 'us' }, shipTo: { countryCode: 'US' } })).toBe(
			false,
		);
	});
});

/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import {
	resolveShipmentParties,
	type ParamGetter,
} from '../../nodes/Ups/resources/shipping/readParties';
import { type ShipperProfile } from '../../nodes/Ups/resources/shipping/shipperProfile';

// Same n8n getNodeParameter (name, fallback) contract used by readShipper/readPackage tests:
// throws when both the resolved value and the fallback are undefined.
function makeN8nGetter(params: Record<string, unknown>): ParamGetter {
	return (name, fallback) => {
		const value = name.split('.').reduce<unknown>((acc, key) => {
			if (acc && typeof acc === 'object' && key in (acc as object)) {
				return (acc as Record<string, unknown>)[key];
			}
			return undefined;
		}, params);
		const resolved = value === undefined ? fallback : value;
		if (resolved === undefined) throw new Error(`Could not get parameter: ${name}`);
		return resolved;
	};
}

const usShipper = {
	accountNumber: 'ACME1',
	shipperAddressLine1: '1 Main St',
	shipperCity: 'Buffalo',
	shipperStateProvinceCode: 'NY',
	shipperPostalCode: '14201',
	shipperCountryCode: 'US',
};

describe('resolveShipmentParties — Effective Origin (ADR-0003) + profile precedence (ADR-0005)', () => {
	it('uses the Shipper as the effective origin when no ShipFrom is supplied', () => {
		const get = makeN8nGetter({
			...usShipper,
			shipToCity: 'Boston',
			shipToCountryCode: 'US',
		});
		const parties = resolveShipmentParties(get, null);
		expect(parties.hasShipFrom).toBe(false);
		expect(parties.effectiveShipFrom).toEqual(parties.shipper.address);
		expect(parties.accountNumber).toBe('ACME1');
		expect(parties.international).toBe(false);
	});

	it('uses ShipFrom as the effective origin when it is supplied (address line OR city)', () => {
		const get = makeN8nGetter({
			...usShipper,
			shipFromCity: 'Newark', // city alone counts as a supplied ShipFrom
			shipFromCountryCode: 'US',
			shipToCity: 'Boston',
			shipToCountryCode: 'US',
		});
		const parties = resolveShipmentParties(get, null);
		expect(parties.hasShipFrom).toBe(true);
		expect(parties.effectiveShipFrom.city).toBe('Newark');
		// Origin is ShipFrom, not the Shipper, even though both are US here.
		expect(parties.effectiveShipFrom).not.toEqual(parties.shipper.address);
	});

	it('classifies international when Effective Origin country differs from ShipTo', () => {
		const get = makeN8nGetter({
			...usShipper, // US shipper, no ShipFrom → origin US
			shipToCity: 'Toronto',
			shipToStateProvinceCode: 'ON',
			shipToCountryCode: 'CA',
		});
		const parties = resolveShipmentParties(get, null);
		expect(parties.international).toBe(true);
	});

	it('lets a Shipper Profile country drive internationality when the field is left blank', () => {
		// Blank shipper country (ADR-0005) → the CA profile supplies it → CA origin vs US ShipTo.
		const get = makeN8nGetter({
			accountNumber: '',
			shipperAddressLine1: '',
			shipperCity: '',
			shipperStateProvinceCode: '',
			shipperPostalCode: '',
			shipperCountryCode: '',
			shipToCity: 'Buffalo',
			shipToCountryCode: 'US',
		});
		const profile: ShipperProfile = {
			accountNumber: '0C395V',
			addressLine1: '100 King St W',
			city: 'Toronto',
			stateProvinceCode: 'ON',
			postalCode: 'M5E1E5',
			countryCode: 'CA',
		};
		const parties = resolveShipmentParties(get, profile);
		expect(parties.accountNumber).toBe('0C395V');
		expect(parties.shipper.address.countryCode).toBe('CA');
		expect(parties.international).toBe(true);
	});

	it('reports a blank account number so the caller can boundary-reject', () => {
		const get = makeN8nGetter({
			accountNumber: '',
			shipperCity: 'Buffalo',
			shipperCountryCode: 'US',
			shipToCity: 'Boston',
			shipToCountryCode: 'US',
		});
		const parties = resolveShipmentParties(get, null);
		expect(parties.accountNumber).toBe('');
	});
});

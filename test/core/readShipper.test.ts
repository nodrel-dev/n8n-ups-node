/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import { type ParamGetter } from '../../nodes/Ups/resources/shipping/readParties';
import {
	readShipper,
	loadShipperProfile,
	type ShipperProfile,
} from '../../nodes/Ups/resources/shipping/shipperProfile';

// Mirrors n8n's getNodeParameter (name, fallback) contract, including the throw when both the
// resolved value and the fallback are undefined (see readPackage.test.ts).
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

describe('readShipper — profile precedence (ADR-0005)', () => {
	it('uses explicit fields and ignores the profile when fields are filled (explicit wins)', () => {
		const get = makeN8nGetter({
			accountNumber: 'EXPLICIT1',
			shipperName: 'Explicit Co',
			shipperAddressLine1: '1 Real St',
			shipperCity: 'Buffalo',
			shipperStateProvinceCode: 'NY',
			shipperPostalCode: '14201',
			shipperCountryCode: 'US',
			shipperPhone: '716-555-0000',
		});
		const profile: ShipperProfile = {
			accountNumber: 'PROFILE9',
			shipperName: 'Profile Co',
			addressLine1: '9 Profile Rd',
			city: 'Toronto',
			stateProvinceCode: 'ON',
			postalCode: 'M5E1E5',
			countryCode: 'CA',
			phone: '416-555-9999',
		};
		const sh = readShipper(get, profile);
		expect(sh.accountNumber).toBe('EXPLICIT1');
		expect(sh.name).toBe('Explicit Co');
		expect(sh.phone).toBe('716-555-0000');
		expect(sh.address).toEqual({
			addressLines: ['1 Real St'],
			city: 'Buffalo',
			stateProvinceCode: 'NY',
			postalCode: '14201',
			countryCode: 'US',
		});
	});

	it('fills blank fields from the profile (including a CA country override)', () => {
		// Every shipper field left blank — the headline CAN swap: profile supplies the whole block.
		const get = makeN8nGetter({
			accountNumber: '',
			shipperName: '',
			shipperAddressLine1: '',
			shipperAddressLine2: '',
			shipperCity: '',
			shipperStateProvinceCode: '',
			shipperPostalCode: '',
			shipperCountryCode: '',
			shipperPhone: '',
		});
		const profile: ShipperProfile = {
			accountNumber: '0C395V',
			shipperName: 'Maple Co',
			addressLine1: '100 King St W',
			city: 'Toronto',
			stateProvinceCode: 'ON',
			postalCode: 'M5E1E5',
			countryCode: 'CA',
			phone: '416-555-1234',
		};
		const sh = readShipper(get, profile);
		expect(sh.accountNumber).toBe('0C395V');
		expect(sh.name).toBe('Maple Co');
		expect(sh.phone).toBe('416-555-1234');
		expect(sh.address.countryCode).toBe('CA');
		expect(sh.address.addressLines).toEqual(['100 King St W']);
	});

	it('mixes explicit and profile per field (explicit overrides only where present)', () => {
		const get = makeN8nGetter({
			accountNumber: '',
			shipperAddressLine1: '200 Override Ave', // explicit
			shipperCountryCode: '', // inherit from profile
			shipperCity: 'Montreal', // explicit
		});
		const profile: ShipperProfile = {
			accountNumber: 'ACCT77',
			addressLine1: '1 Profile Way',
			city: 'Toronto',
			countryCode: 'CA',
		};
		const sh = readShipper(get, profile);
		expect(sh.accountNumber).toBe('ACCT77'); // from profile
		expect(sh.address.addressLines).toEqual(['200 Override Ave']); // explicit wins
		expect(sh.address.city).toBe('Montreal'); // explicit wins
		expect(sh.address.countryCode).toBe('CA'); // profile fills blank
	});

	it('falls back to US country and empties when no profile is attached (pre-profile behaviour)', () => {
		const get = makeN8nGetter({
			accountNumber: 'ACME1',
			shipperAddressLine1: '1 Main St',
			shipperCity: 'Buffalo',
			shipperCountryCode: '', // blank shipper country default (ADR-0005) → US fallback
		});
		const sh = readShipper(get, null);
		expect(sh.accountNumber).toBe('ACME1');
		expect(sh.address.countryCode).toBe('US');
		expect(sh.address.addressLines).toEqual(['1 Main St']);
	});

	it('trims surrounding whitespace and treats whitespace-only as blank', () => {
		const get = makeN8nGetter({
			accountNumber: '   ',
			shipperCity: '  Buffalo  ',
		});
		const profile: ShipperProfile = { accountNumber: 'ACCT5' };
		const sh = readShipper(get, profile);
		expect(sh.accountNumber).toBe('ACCT5'); // whitespace-only explicit → profile fills
		expect(sh.address.city).toBe('Buffalo'); // trimmed
	});
});

describe('loadShipperProfile', () => {
	it('returns the credential data when present', async () => {
		const ctx = { getCredentials: async () => ({ accountNumber: '0C395V', countryCode: 'CA' }) };
		await expect(loadShipperProfile(ctx)).resolves.toEqual({
			accountNumber: '0C395V',
			countryCode: 'CA',
		});
	});

	it('returns null when the optional credential is not attached (getCredentials throws)', async () => {
		const ctx = {
			getCredentials: async () => {
				throw new Error('Credentials not found');
			},
		};
		await expect(loadShipperProfile(ctx)).resolves.toBeNull();
	});
});

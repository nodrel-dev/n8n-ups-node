/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import { toUpsAddress } from '../../nodes/Ups/core/toUpsAddress';

describe('toUpsAddress', () => {
	it('maps a normalized address to the Rate/Ship Address shape', () => {
		const result = toUpsAddress({
			addressLines: ['100 Main St', 'Suite 2'],
			city: 'Alpharetta',
			stateProvinceCode: 'GA',
			postalCode: '30005',
			countryCode: 'US',
		});
		expect(result.AddressLine).toEqual(['100 Main St', 'Suite 2']);
		expect(result.City).toBe('Alpharetta');
		expect(result.StateProvinceCode).toBe('GA');
		expect(result.PostalCode).toBe('30005');
		expect(result.CountryCode).toBe('US');
		expect(result.ResidentialAddressIndicator).toBeUndefined();
	});

	it('adds an (empty) ResidentialAddressIndicator only when residential', () => {
		const result = toUpsAddress({
			addressLines: ['1 Home Rd'],
			city: 'Buffalo',
			stateProvinceCode: 'NY',
			postalCode: '14201',
			countryCode: 'US',
			residential: true,
		});
		expect(result).toHaveProperty('ResidentialAddressIndicator');
		expect(result.ResidentialAddressIndicator).toBe('');
	});

	it('drops empty address lines', () => {
		const result = toUpsAddress({
			addressLines: ['100 Main St', '', '   '],
			city: 'Alpharetta',
			stateProvinceCode: 'GA',
			postalCode: '30005',
			countryCode: 'US',
		});
		expect(result.AddressLine).toEqual(['100 Main St']);
	});
});

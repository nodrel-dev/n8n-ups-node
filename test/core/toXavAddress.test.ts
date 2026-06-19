/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import { toXavAddress } from '../../nodes/Ups/core/toXavAddress';

describe('toXavAddress', () => {
	it('maps a normalized address to the XAV AddressKeyFormat shape', () => {
		const result = toXavAddress({
			addressLines: ['26601 Aliso Creek Rd', 'Suite D'],
			city: 'Aliso Viejo',
			stateProvinceCode: 'CA',
			postalCode: '92656',
			countryCode: 'US',
		});
		expect(result.AddressLine).toEqual(['26601 Aliso Creek Rd', 'Suite D']);
		expect(result.PoliticalDivision2).toBe('Aliso Viejo'); // city
		expect(result.PoliticalDivision1).toBe('CA'); // state
		expect(result.PostcodePrimaryLow).toBe('92656');
		expect(result.CountryCode).toBe('US');
	});

	it('splits a ZIP+4 postal code into primary and extended', () => {
		const result = toXavAddress({
			addressLines: ['100 Main St'],
			city: 'Aliso Viejo',
			stateProvinceCode: 'CA',
			postalCode: '92656-1521',
			countryCode: 'US',
		});
		expect(result.PostcodePrimaryLow).toBe('92656');
		expect(result.PostcodeExtendedLow).toBe('1521');
	});

	it('omits the extended postcode when none is present', () => {
		const result = toXavAddress({
			addressLines: ['100 Main St'],
			city: 'Buffalo',
			stateProvinceCode: 'NY',
			postalCode: '14201',
			countryCode: 'US',
		});
		expect(result.PostcodeExtendedLow).toBeUndefined();
	});

	it('drops empty address lines', () => {
		const result = toXavAddress({
			addressLines: ['100 Main St', '', '  '],
			city: 'Buffalo',
			stateProvinceCode: 'NY',
			postalCode: '14201',
			countryCode: 'US',
		});
		expect(result.AddressLine).toEqual(['100 Main St']);
	});
});

/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import { toMoney } from '../../nodes/Ups/core/toMoney';

describe('toMoney', () => {
	it('maps a UPS charge to {amount, currency}', () => {
		expect(toMoney({ CurrencyCode: 'USD', MonetaryValue: '12.50' })).toEqual({
			amount: '12.50',
			currency: 'USD',
		});
	});

	it('returns null for an undefined charge', () => {
		expect(toMoney(undefined)).toBeNull();
	});

	it('returns null when the monetary value is missing or empty', () => {
		expect(toMoney({ CurrencyCode: 'USD' })).toBeNull();
		expect(toMoney({ CurrencyCode: 'USD', MonetaryValue: '' })).toBeNull();
	});

	it('returns null when currency is missing', () => {
		expect(toMoney({ MonetaryValue: '10.00' })).toBeNull();
	});
});

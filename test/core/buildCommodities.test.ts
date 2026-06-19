/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import { buildCommodities } from '../../nodes/Ups/core/buildCommodities';

const items = [
	{
		description: 'Cotton T-Shirts',
		quantity: 10,
		unitValue: 5.5,
		unitOfMeasure: 'EA',
		commodityCode: '610910',
		originCountry: 'US',
	},
	{ description: 'Ceramic Mugs', quantity: 4, unitValue: 3.0, unitOfMeasure: 'EA' },
];

describe('buildCommodities', () => {
	it('maps each line to a UPS Product', () => {
		const products = buildCommodities(items);
		expect(products).toHaveLength(2);
		expect(products[0].Description).toBe('Cotton T-Shirts');
		expect(products[0].Unit.Number).toBe('10');
		expect(products[0].Unit.Value).toBe('5.5');
		expect(products[0].Unit.UnitOfMeasurement.Code).toBe('EA');
	});

	it('includes optional commodity code and origin country when provided', () => {
		const [first, second] = buildCommodities(items);
		expect(first.CommodityCode).toBe('610910');
		expect(first.OriginCountryCode).toBe('US');
		expect(second.CommodityCode).toBeUndefined();
		expect(second.OriginCountryCode).toBeUndefined();
	});
});

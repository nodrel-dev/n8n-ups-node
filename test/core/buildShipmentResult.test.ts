/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import { buildShipmentResult } from '../../nodes/Ups/core/buildShipmentResult';

const domesticResponse = {
	ShipmentResponse: {
		ShipmentResults: {
			ShipmentIdentificationNumber: '1Z9999999999999999',
			PackageResults: {
				TrackingNumber: '1Z9999999999999999',
				ShippingLabel: { ImageFormat: { Code: 'GIF' }, GraphicImage: 'R0lGODdhBASE64' },
			},
			ShipmentCharges: { TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '12.34' } },
		},
	},
};

const internationalResponse = {
	ShipmentResponse: {
		ShipmentResults: {
			ShipmentIdentificationNumber: '1Z8888888888888888',
			PackageResults: {
				TrackingNumber: '1Z8888888888888888',
				ShippingLabel: { ImageFormat: { Code: 'GIF' }, GraphicImage: 'R0lGODdhLABEL' },
			},
			Form: { Image: { GraphicImage: 'JVBERi0xBASE64PDF', ImageFormat: { Code: 'PDF' } } },
			ShipmentCharges: { TotalCharges: { CurrencyCode: 'CAD', MonetaryValue: '88.00' } },
		},
	},
};

describe('buildShipmentResult', () => {
	it('returns the label as the only binary part for a domestic shipment', () => {
		const result = buildShipmentResult(domesticResponse, 'GIF');
		expect(result.json.shipmentId).toBe('1Z9999999999999999');
		expect(result.json.trackingNumbers).toEqual(['1Z9999999999999999']);
		expect(result.json.international).toBe(false);
		expect(result.json.charges.published).toEqual({ amount: '12.34', currency: 'USD' });

		expect(result.binaryParts).toHaveLength(1);
		expect(result.binaryParts[0].key).toBe('label');
		expect(result.binaryParts[0].base64).toBe('R0lGODdhBASE64');
		expect(result.binaryParts[0].mime).toBe('image/gif');
	});

	it('adds the customs invoice as a second binary part for an international shipment', () => {
		const result = buildShipmentResult(internationalResponse, 'GIF');
		expect(result.json.international).toBe(true);
		expect(result.binaryParts.map((p) => p.key)).toEqual(['label', 'customsInvoice']);
		const invoice = result.binaryParts[1];
		expect(invoice.base64).toBe('JVBERi0xBASE64PDF');
		expect(invoice.mime).toBe('application/pdf');
		expect(invoice.filename).toContain('customs-invoice');
	});

	it('keeps base64 out of the json payload (FR-009)', () => {
		const result = buildShipmentResult(domesticResponse, 'GIF');
		expect(JSON.stringify(result.json)).not.toContain('R0lGODdhBASE64');
	});

	it('returns no binary parts when the response carries no label or form', () => {
		const result = buildShipmentResult({ ShipmentResponse: { ShipmentResults: {} } }, 'GIF');
		expect(result.binaryParts).toEqual([]);
		expect(result.json.trackingNumbers).toEqual([]);
		expect(result.json.international).toBe(false);
	});
});

/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import { extractLabel } from '../../nodes/Ups/core/extractLabel';
import domestic from '../fixtures/ship-domestic.json';
import international from '../fixtures/ship-international.json';

describe('extractLabel', () => {
	it('extracts shipment id and one label per package', () => {
		const result = extractLabel(domestic, 'GIF');
		expect(result.shipmentId).toBe('1Z12345E8791315509');
		expect(result.labels).toHaveLength(1);
		expect(result.labels[0].trackingNumber).toBe('1Z12345E8791315509');
		expect(result.labels[0].base64).toBe('R0lGODlhAQABAAAAACw=');
	});

	it('names the label file after the tracking number with a format extension', () => {
		const result = extractLabel(domestic, 'GIF');
		expect(result.labels[0].filename).toBe('1Z12345E8791315509.gif');
		expect(result.labels[0].mime).toBe('image/gif');
	});

	it('uses text/plain for printer formats like ZPL', () => {
		const result = extractLabel(international, 'ZPL');
		expect(result.labels[0].mime).toBe('text/plain');
		expect(result.labels[0].filename).toBe('1Z12345E6605272234.zpl');
	});

	it('never exposes the base64 string anywhere other than the labels[].base64 field', () => {
		const result = extractLabel(domestic, 'GIF');
		// shipmentId + filename + tracking must not be the raw base64
		expect(result.shipmentId).not.toContain('R0lGOD');
		expect(result.labels[0].filename).not.toContain('R0lGOD');
	});
});

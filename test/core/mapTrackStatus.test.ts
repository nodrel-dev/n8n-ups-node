/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import { mapTrackStatus } from '../../nodes/Ups/core/mapTrackStatus';
import fixture from '../fixtures/track-delivered.json';

describe('mapTrackStatus', () => {
	it('maps the UPS track response to TrackResult[] with status fields', () => {
		const [result] = mapTrackStatus(fixture, { detail: 'detailed' });
		expect(result.trackingNumber).toBe('1Z023E2X0214323462');
		expect(result.statusType).toBe('D');
		expect(result.statusCode).toBe('011');
		expect(result.statusDescription).toBe('Delivered');
		expect(result.service).toBe('UPS Ground');
		expect(result.deliveryDate).toBe('20260615');
	});

	it('keeps activity history when Detailed', () => {
		const [result] = mapTrackStatus(fixture, { detail: 'detailed' });
		expect(result.activity).toBeDefined();
		expect(result.activity).toHaveLength(2);
		expect(result.activity?.[0].statusDescription).toBe('Delivered');
		expect(result.activity?.[0].location).toContain('Wayne');
	});

	it('suppresses activity history when Status-only', () => {
		const [result] = mapTrackStatus(fixture, { detail: 'status' });
		expect(result.activity).toBeUndefined();
		// Status fields are still present.
		expect(result.statusDescription).toBe('Delivered');
	});

	it('returns one TrackResult per package across all shipments', () => {
		const results = mapTrackStatus(fixture, { detail: 'detailed' });
		expect(results).toHaveLength(1);
	});

	it('tolerates a missing activity array without throwing', () => {
		const noActivity = {
			trackResponse: {
				shipment: [
					{
						package: [
							{
								trackingNumber: '1Z9999',
								currentStatus: { type: 'M', code: 'MP', description: 'Order Processed' },
							},
						],
					},
				],
			},
		};
		const [result] = mapTrackStatus(noActivity, { detail: 'detailed' });
		expect(result.trackingNumber).toBe('1Z9999');
		expect(result.activity ?? []).toHaveLength(0);
	});
});

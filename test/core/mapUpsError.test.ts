/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import { NodeApiError } from 'n8n-workflow';
import type { INode } from 'n8n-workflow';
import { mapUpsError } from '../../nodes/Ups/core/mapUpsError';

// A minimal fake node — mapUpsError only needs it to construct NodeApiError.
const node = {
	id: '1',
	name: 'UPS',
	type: 'n8n-nodes-ups.ups',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
} as unknown as INode;

// Common envelope shared by Rating / Shipping / Validate (CommonErrorResponse).
const commonEnvelope = {
	response: {
		errors: [{ code: '120100', message: 'Missing or invalid ship to name' }],
	},
};

// Track's distinct error chain (Response → response → ErrorResponse → errors[] → Error). The JSON
// shape collapses to `response.errors[]`; mapUpsError must parse it with the same extractor.
const trackEnvelope = {
	response: {
		errors: [{ code: 'TW001', message: 'Tracking number not found' }],
	},
};

describe('mapUpsError', () => {
	it('always throws a NodeApiError (signature: () => never)', () => {
		expect(() => mapUpsError(node, commonEnvelope, 400)).toThrow(NodeApiError);
	});

	it('surfaces the UPS code and message verbatim from the common envelope', () => {
		try {
			mapUpsError(node, commonEnvelope, 400);
			throw new Error('should have thrown');
		} catch (err) {
			const e = err as NodeApiError;
			expect(e).toBeInstanceOf(NodeApiError);
			const text = `${e.message} ${e.description ?? ''}`;
			expect(text).toContain('120100');
			expect(text).toContain('Missing or invalid ship to name');
		}
	});

	it('parses Track’s distinct envelope with the same extractor', () => {
		try {
			mapUpsError(node, trackEnvelope, 404);
			throw new Error('should have thrown');
		} catch (err) {
			const e = err as NodeApiError;
			const text = `${e.message} ${e.description ?? ''}`;
			expect(text).toContain('TW001');
			expect(text).toContain('Tracking number not found');
		}
	});

	it('classifies 401/403 as an authentication problem', () => {
		for (const status of [401, 403]) {
			try {
				mapUpsError(
					node,
					{
						response: {
							errors: [{ code: '250002', message: 'Invalid Authentication Information' }],
						},
					},
					status,
				);
				throw new Error('should have thrown');
			} catch (err) {
				const e = err as NodeApiError;
				expect(e.httpCode).toBe(String(status));
				expect(e.message.toLowerCase()).toContain('auth');
			}
		}
	});

	it('classifies other 4xx as an input/validation problem', () => {
		try {
			mapUpsError(node, commonEnvelope, 400);
			throw new Error('should have thrown');
		} catch (err) {
			const e = err as NodeApiError;
			expect(e.httpCode).toBe('400');
			expect(e.message.toLowerCase()).toMatch(/request|invalid|reject/);
		}
	});

	it('classifies 5xx and 429 as transient', () => {
		for (const status of [500, 503, 429]) {
			try {
				mapUpsError(
					node,
					{ response: { errors: [{ code: '999', message: 'Service down' }] } },
					status,
				);
				throw new Error('should have thrown');
			} catch (err) {
				const e = err as NodeApiError;
				expect(e.httpCode).toBe(String(status));
				expect(e.message.toLowerCase()).toMatch(/temporar|transient|again|unavailable/);
			}
		}
	});

	it('falls back gracefully when the envelope has no recognizable error array', () => {
		expect(() => mapUpsError(node, { something: 'unexpected' }, 500)).toThrow(NodeApiError);
	});
});

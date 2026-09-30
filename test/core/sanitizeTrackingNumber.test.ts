import { describe, it, expect } from 'vitest';
import { sanitizeTrackingNumber } from '../../nodes/Ups/core/sanitizeTrackingNumber';

// Track is the ONLY operation that interpolates a user value into the URL path
// (`/track/v1/details/{{$parameter.trackingNumber}}`). Every real UPS inquiry number is
// alphanumeric, so an alphanumeric-only allowlist blocks path/query injection without
// rejecting any legitimate format.

describe('sanitizeTrackingNumber', () => {
	it('accepts a standard 1Z inquiry number', () => {
		expect(sanitizeTrackingNumber('1Z9999999999999999')).toBe('1Z9999999999999999');
	});

	it('accepts the other UPS number formats (Mail Innovations, T-prefixed, bare digits)', () => {
		expect(sanitizeTrackingNumber('T1234567890')).toBe('T1234567890');
		expect(sanitizeTrackingNumber('123456789')).toBe('123456789');
		expect(sanitizeTrackingNumber('92748999997563245677811')).toBe('92748999997563245677811');
	});

	it('trims surrounding whitespace rather than rejecting it', () => {
		expect(sanitizeTrackingNumber('  1Z9999999999999999\n')).toBe('1Z9999999999999999');
	});

	it('rejects path traversal that would retarget the authenticated call', () => {
		expect(sanitizeTrackingNumber('../../rating/v2409/Shop')).toBeNull();
		expect(sanitizeTrackingNumber('1Z999/../../shipments/v2409/ship')).toBeNull();
	});

	it('rejects encoded traversal and separators', () => {
		expect(sanitizeTrackingNumber('..%2f..%2fship')).toBeNull();
		expect(sanitizeTrackingNumber('1Z999%2e%2e')).toBeNull();
		expect(sanitizeTrackingNumber('1Z999\\..\\ship')).toBeNull();
	});

	it('rejects query and fragment injection', () => {
		expect(sanitizeTrackingNumber('1Z999?locale=xx')).toBeNull();
		expect(sanitizeTrackingNumber('1Z999#frag')).toBeNull();
		expect(sanitizeTrackingNumber('1Z999&x=1')).toBeNull();
	});

	it('rejects empty, whitespace-only, and non-string input', () => {
		expect(sanitizeTrackingNumber('')).toBeNull();
		expect(sanitizeTrackingNumber('   ')).toBeNull();
		expect(sanitizeTrackingNumber(undefined)).toBeNull();
		expect(sanitizeTrackingNumber(null)).toBeNull();
		expect(sanitizeTrackingNumber(42)).toBeNull();
	});

	it('rejects an over-long value rather than forwarding it to UPS', () => {
		expect(sanitizeTrackingNumber('1Z'.repeat(40))).toBeNull();
	});
});

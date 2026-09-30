import { describe, it, expect } from 'vitest';
import { serviceName } from '../../nodes/Ups/core/serviceName';

// UPS returns `Service: { Code: "14", Description: "" }` from Rating — the description field is
// PRESENT but EMPTY (verified live against CIE 2026-09-06), so the name has to be resolved locally.
// The same numeric code means DIFFERENT services depending on the origin country, which is the
// whole reason this core takes an origin rather than being a flat lookup table.

describe('serviceName', () => {
	it('prefers a description UPS actually populated, so we never fight the API', () => {
		expect(serviceName('01', 'US', 'UPS Next Day Air')).toBe('UPS Next Day Air');
		// Even when it disagrees with our table — UPS is authoritative about its own names.
		expect(serviceName('11', 'US', 'Some New UPS Product')).toBe('Some New UPS Product');
	});

	it('ignores the empty description UPS actually sends', () => {
		expect(serviceName('03', 'US', '')).toBe('UPS Ground');
		expect(serviceName('03', 'US', '   ')).toBe('UPS Ground');
		expect(serviceName('03', 'US', undefined)).toBe('UPS Ground');
	});

	it('resolves US-origin codes', () => {
		expect(serviceName('01', 'US')).toBe('UPS Next Day Air');
		expect(serviceName('02', 'US')).toBe('UPS 2nd Day Air');
		expect(serviceName('03', 'US')).toBe('UPS Ground');
		expect(serviceName('12', 'US')).toBe('UPS 3 Day Select');
		expect(serviceName('13', 'US')).toBe('UPS Next Day Air Saver');
		expect(serviceName('14', 'US')).toBe('UPS Next Day Air Early');
	});

	it('resolves CA-origin codes to their DIFFERENT Canadian names', () => {
		// The bug this core exists to prevent: 01/13/14 are Express products from Canada,
		// not the US "Next Day Air" family. The CIE test account is Canada-registered, so a
		// US-only table would have mislabelled every rate it returns.
		expect(serviceName('01', 'CA')).toBe('UPS Express');
		expect(serviceName('13', 'CA')).toBe('UPS Express Saver');
		expect(serviceName('14', 'CA')).toBe('UPS Express Early');
		expect(serviceName('02', 'CA')).toBe('UPS Expedited');
	});

	it('keeps the codes that mean the same thing everywhere consistent', () => {
		for (const origin of ['US', 'CA']) {
			expect(serviceName('11', origin)).toBe('UPS Standard');
			expect(serviceName('07', origin)).toBe('UPS Worldwide Express');
			expect(serviceName('08', origin)).toBe('UPS Worldwide Expedited');
			expect(serviceName('65', origin)).toBe('UPS Worldwide Saver');
		}
	});

	it('treats an unknown origin as the US table rather than returning nothing', () => {
		expect(serviceName('03', 'GB')).toBe('UPS Ground');
		expect(serviceName('11', '')).toBe('UPS Standard');
	});

	it('is case-insensitive about the origin country', () => {
		expect(serviceName('01', 'ca')).toBe('UPS Express');
		expect(serviceName('01', 'Ca')).toBe('UPS Express');
	});

	it('falls back to a readable label for an unmapped code instead of an empty string', () => {
		expect(serviceName('99', 'US')).toBe('UPS Service 99');
	});

	it('returns empty only when there is genuinely nothing to name', () => {
		expect(serviceName('', 'US')).toBe('');
		expect(serviceName('', '', '')).toBe('');
	});
});

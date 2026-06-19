/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import { readPackage, type ParamGetter } from '../../nodes/Ups/resources/shipping/shared';

/**
 * n8n's getNodeParameter THROWS "Could not get parameter" when both the resolved value
 * and the fallback are `undefined` (node-execution-context: `if (value === undefined) throw`).
 * This getter replicates that contract so the test exercises real n8n behaviour, not a
 * forgiving mock — the gap that let the dimension-less bug ship to the live CIE path.
 */
function makeN8nGetter(params: Record<string, unknown>): ParamGetter {
	return (name, fallback) => {
		const value = name.split('.').reduce<unknown>((acc, key) => {
			if (acc && typeof acc === 'object' && key in (acc as object)) {
				return (acc as Record<string, unknown>)[key];
			}
			return undefined;
		}, params);
		const resolved = value === undefined ? fallback : value;
		if (resolved === undefined) {
			throw new Error(`Could not get parameter: ${name}`);
		}
		return resolved;
	};
}

describe('readPackage', () => {
	it('does not throw when dimensions are absent (fixedCollection default {})', () => {
		// Regression: a `dimensions.dimension` read with an `undefined` fallback threw
		// "Could not get parameter" on every dimension-less Rate/Create call.
		const get = makeN8nGetter({ weight: 5, weightUnit: 'LBS', dimensions: {} });
		expect(() => readPackage(get)).not.toThrow();
		const pkg = readPackage(get);
		expect(pkg.PackageWeight).toEqual({ UnitOfMeasurement: { Code: 'LBS' }, Weight: '5' });
		expect(pkg.Dimensions).toBeUndefined();
	});

	it('includes Dimensions only when a dimension is provided', () => {
		const get = makeN8nGetter({
			weight: 2,
			weightUnit: 'KGS',
			dimensions: { dimension: { length: 10, width: 8, height: 6 } },
			dimensionUnit: 'CM',
		});
		const pkg = readPackage(get);
		expect(pkg.Dimensions).toEqual({
			UnitOfMeasurement: { Code: 'CM' },
			Length: '10',
			Width: '8',
			Height: '6',
		});
	});
});

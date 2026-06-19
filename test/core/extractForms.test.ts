/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import { extractForms } from '../../nodes/Ups/core/extractForms';
import domestic from '../fixtures/ship-domestic.json';
import international from '../fixtures/ship-international.json';

describe('extractForms', () => {
	it('extracts the customs invoice PDF from an international response', () => {
		const forms = extractForms(international);
		expect(forms).toHaveLength(1);
		expect(forms[0].base64).toBe('JVBERi0xLjQKJSBQ');
		expect(forms[0].mime).toBe('application/pdf');
		expect(forms[0].filename).toMatch(/\.pdf$/);
	});

	it('returns an empty array for a domestic response with no forms', () => {
		expect(extractForms(domestic)).toEqual([]);
	});
});

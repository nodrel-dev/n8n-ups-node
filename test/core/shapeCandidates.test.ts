/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import { shapeCandidates } from '../../nodes/Ups/core/shapeCandidates';

const validResponse = {
	XAVResponse: {
		ValidAddressIndicator: '',
		AddressClassification: { Code: '1', Description: 'Commercial' },
		Candidate: [
			{
				AddressClassification: { Code: '1', Description: 'Commercial' },
				AddressKeyFormat: {
					AddressLine: ['26601 ALISO CREEK RD'],
					PoliticalDivision2: 'ALISO VIEJO',
					PoliticalDivision1: 'CA',
					PostcodePrimaryLow: '92656',
					PostcodeExtendedLow: '1521',
					CountryCode: 'US',
				},
			},
		],
	},
};

const ambiguousResponse = {
	XAVResponse: {
		AmbiguousAddressIndicator: '',
		Candidate: [
			{
				AddressKeyFormat: {
					AddressLine: ['1 MAIN ST'],
					PoliticalDivision2: 'BUFFALO',
					PoliticalDivision1: 'NY',
					PostcodePrimaryLow: '14201',
					CountryCode: 'US',
				},
			},
			{
				AddressKeyFormat: {
					AddressLine: ['1 MAIN AVE'],
					PoliticalDivision2: 'BUFFALO',
					PoliticalDivision1: 'NY',
					PostcodePrimaryLow: '14202',
					CountryCode: 'US',
				},
			},
		],
	},
};

const noneResponse = { XAVResponse: { NoCandidatesIndicator: '' } };

describe('shapeCandidates', () => {
	it('reports resolution "valid" and a classification when the address validates', () => {
		const result = shapeCandidates(validResponse);
		expect(result.resolution).toBe('valid');
		expect(result.classification.code).toBe('1');
		expect(result.classification.label).toBe('Commercial');
		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0].city).toBe('ALISO VIEJO');
		expect(result.candidates[0].stateProvinceCode).toBe('CA');
		expect(result.candidates[0].postalCode).toBe('92656-1521');
	});

	it('reports resolution "ambiguous" and returns every candidate without fanning out', () => {
		const result = shapeCandidates(ambiguousResponse);
		expect(result.resolution).toBe('ambiguous');
		expect(result.candidates).toHaveLength(2);
	});

	it('reports an explicit "none" rather than a silent empty result', () => {
		const result = shapeCandidates(noneResponse);
		expect(result.resolution).toBe('none');
		expect(result.candidates).toHaveLength(0);
	});

	it('maps classification code 2 to Residential and 0 to UnClassified', () => {
		expect(
			shapeCandidates({
				XAVResponse: {
					ValidAddressIndicator: '',
					AddressClassification: { Code: '2' },
					Candidate: [],
				},
			}).classification.label,
		).toBe('Residential');
		expect(
			shapeCandidates({
				XAVResponse: {
					ValidAddressIndicator: '',
					AddressClassification: { Code: '0' },
					Candidate: [],
				},
			}).classification.label,
		).toBe('UnClassified');
	});
});

import type { Address } from './types';

// Pure core: shape the UPS XAV response into a single Resolution + classification + candidate list
// (contracts/validate-address.md). Returns ONE item (does not fan out per candidate). An
// unresolvable address is reported as an explicit `none`, never a silent empty result.

export type Resolution = 'valid' | 'ambiguous' | 'none';

export interface AddressValidationResult {
	resolution: Resolution;
	classification: { code: string; label: string };
	candidates: Address[];
}

interface RawAddressKeyFormat {
	AddressLine?: string[] | string;
	PoliticalDivision2?: string;
	PoliticalDivision1?: string;
	PostcodePrimaryLow?: string;
	PostcodeExtendedLow?: string;
	CountryCode?: string;
}

interface RawClassification {
	Code?: string;
	Description?: string;
}

interface RawCandidate {
	AddressClassification?: RawClassification;
	AddressKeyFormat?: RawAddressKeyFormat;
}

interface XavResponse {
	XAVResponse?: {
		ValidAddressIndicator?: unknown;
		AmbiguousAddressIndicator?: unknown;
		NoCandidatesIndicator?: unknown;
		AddressClassification?: RawClassification;
		Candidate?: RawCandidate[] | RawCandidate;
	};
}

// UPS classification codes (contracts/validate-address.md): 0 UnClassified / 1 Commercial / 2 Residential.
const CLASSIFICATION_LABELS: Record<string, string> = {
	'0': 'UnClassified',
	'1': 'Commercial',
	'2': 'Residential',
};

function labelFor(code: string | undefined, description?: string): { code: string; label: string } {
	const safeCode = code ?? '0';
	return {
		code: safeCode,
		label: description ?? CLASSIFICATION_LABELS[safeCode] ?? 'UnClassified',
	};
}

function resolutionOf(xav: NonNullable<XavResponse['XAVResponse']>): Resolution {
	if (xav.ValidAddressIndicator !== undefined) return 'valid';
	if (xav.AmbiguousAddressIndicator !== undefined) return 'ambiguous';
	return 'none';
}

function toAddress(
	akf: RawAddressKeyFormat,
	classification: RawClassification | undefined,
): Address {
	const lines = Array.isArray(akf.AddressLine)
		? akf.AddressLine
		: akf.AddressLine
			? [akf.AddressLine]
			: [];
	const postal = akf.PostcodeExtendedLow
		? `${akf.PostcodePrimaryLow ?? ''}-${akf.PostcodeExtendedLow}`
		: (akf.PostcodePrimaryLow ?? '');
	const address: Address = {
		addressLines: lines,
		city: akf.PoliticalDivision2 ?? '',
		stateProvinceCode: akf.PoliticalDivision1 ?? '',
		postalCode: postal,
		countryCode: akf.CountryCode ?? '',
	};
	// Per-candidate residential/commercial when the candidate carries its own classification.
	if (classification?.Code === '2') address.residential = true;
	if (classification?.Code === '1') address.residential = false;
	return address;
}

export function shapeCandidates(response: XavResponse): AddressValidationResult {
	const xav = response.XAVResponse;
	if (!xav) {
		return { resolution: 'none', classification: labelFor('0'), candidates: [] };
	}

	const rawCandidates = Array.isArray(xav.Candidate)
		? xav.Candidate
		: xav.Candidate
			? [xav.Candidate]
			: [];

	const topClassification = labelFor(
		xav.AddressClassification?.Code,
		xav.AddressClassification?.Description,
	);

	const candidates = rawCandidates
		.filter((c) => c.AddressKeyFormat)
		.map((c) => toAddress(c.AddressKeyFormat as RawAddressKeyFormat, c.AddressClassification));

	return {
		resolution: resolutionOf(xav),
		classification: topClassification,
		candidates,
	};
}

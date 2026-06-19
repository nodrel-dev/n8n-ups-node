# Contract: Validate Address (resource `Address`)

Declarative routing + `postReceive` → `shapeCandidates`; input shaped by `toXavAddress`.

## Request
`POST /api/addressvalidation/v2/{requestoption}` with `requestoption = 3` (validation +
classification). Body `XAVRequest.AddressKeyFormat` via `toXavAddress`:
`{ AddressLine[], PoliticalDivision2 (city), PoliticalDivision1 (state), PostcodePrimaryLow,
PostcodeExtendedLow, CountryCode }`.

## Response → one item
`shapeCandidates(XAVResponse) → { resolution: 'valid'|'ambiguous'|'none', classification:{code,label}, candidates: Address[] }`.
- `resolution` derived from `ValidAddressIndicator` / `AmbiguousAddressIndicator` /
  `NoCandidatesIndicator` presence.
- `classification` code `0` UnClassified / `1` Commercial / `2` Residential (per-candidate when
  top-level is `0`).
- Returns **one** item carrying Resolution + `candidates[]` — does not fan out.

## Constraints
- CIE returns street-level validation for **NY/CA addresses only** (`[VERIFY-LIVE]`, test data
  must reflect this).
- Unresolvable → explicit `none`, never a silent empty result.

## Acceptance / Maps to
Spec US2 scenarios 1–3; FR-006, FR-012; SC-002.

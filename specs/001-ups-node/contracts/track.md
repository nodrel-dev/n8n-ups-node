# Contract: Track (resource `Tracking`)

Declarative routing + `postReceive` → `mapTrackStatus`; errors via `mapUpsError`.

## Request
`GET /api/track/v1/details/{inquiryNumber}`. No body. Only `locale` (default `en_US`) sent in v1.
One inquiry number per call → native item iteration (one input item per number).
**Required headers** (✅ VERIFIED-LIVE 2026-06-19): `transId` (per-request unique id) +
`transactionSrc` — Track v1 `400`s (`TV0011`/`TV0001`) without them. Track is the only one of the
four UPS APIs that needs these (gotchas §13).

## Parameters
- `trackingNumber` (string, required) — the inquiry number.
- `detail` (options: `Detailed` default / `Status-only`) — Status-only suppresses `activity[]`
  client-side in `mapTrackStatus`.
- `locale` (string, default `en_US`).
- Deferred (NOT shipped): `returnPOD`, `returnSignature`, `returnMilestones`.

## Response → `TrackResult`
`{ trackingNumber, statusType, statusCode, statusDescription, activity?: Activity[], deliveryDate?, service? }`.

## Errors
- ✅ **VERIFIED-LIVE 2026-06-19**: the observed Track error envelope is the **common**
  `response.errors[]` shape (e.g. `{code:"TV0011", message:...}`), which `mapUpsError` parses — no
  distinct Track schema chain in practice (ADR-0004 amendment). CIE has no real not-found (canned
  `200`); a genuine 4xx not-found in production is classified `input` and surfaced verbatim.
- Not-found flags that one item; under Continue On Fail other items still process (FR-013).
- `mapUpsError` surfaces UPS `code`/`message` verbatim, classifies auth/input/transient.

## Acceptance / Maps to
Spec US1 scenarios 1–6; FR-005, FR-012, FR-013; SC-003, SC-005, SC-007.

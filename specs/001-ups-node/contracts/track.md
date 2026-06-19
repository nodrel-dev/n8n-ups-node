# Contract: Track (resource `Tracking`)

Declarative routing + `postReceive` → `mapTrackStatus`; errors via `mapUpsError`.

## Request
`GET /api/track/v1/details/{inquiryNumber}`. No body. Only `locale` (default `en_US`) sent in v1.
One inquiry number per call → native item iteration (one input item per number).

## Parameters
- `trackingNumber` (string, required) — the inquiry number.
- `detail` (options: `Detailed` default / `Status-only`) — Status-only suppresses `activity[]`
  client-side in `mapTrackStatus`.
- `locale` (string, default `en_US`).
- Deferred (NOT shipped): `returnPOD`, `returnSignature`, `returnMilestones`.

## Response → `TrackResult`
`{ trackingNumber, statusType, statusCode, statusDescription, activity?: Activity[], deliveryDate?, service? }`.

## Errors
- Track's distinct error envelope `[VERIFY-LIVE]` (schema chain + not-found HTTP status).
- Not-found flags that one item; under Continue On Fail other items still process (FR-013).
- `mapUpsError` surfaces UPS `code`/`message` verbatim, classifies auth/input/transient.

## Acceptance / Maps to
Spec US1 scenarios 1–6; FR-005, FR-012, FR-013; SC-003, SC-005, SC-007.

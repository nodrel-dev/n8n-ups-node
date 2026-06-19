# Contract: Get Rates (resource `Shipping`)

Declarative routing + `postReceive` → `flattenRates` (fan-out one item per service); addresses via
`toUpsAddress`; money via `toMoney`.

## Request
`POST /api/rating/v2409/{requestoption}` with `requestoption = Shoptimeintransit` (returns all
services + transit times; no `Shipment.Service.Code` sent). `NegotiatedRatesIndicator` + account
number requests negotiated rates. Container is `PackagingType` (Rate side).

## Parameters
- `accountNumber` (string, required) — `ShipperNumber`; rejected at boundary if absent (FR-010).
- ShipFrom / Shipper / ShipTo addresses.
- `weight` (required) + `weightUnit` (`lbs` default / `kgs`); `dimensions` optional +
  `dimensionUnit` (`in` default / `cm`) — FR-014a/b.
- `requestOption` hidden = `Shoptimeintransit`. No service selector.
- International: `customsValue` group — always visible + `notice`; **required at runtime** when
  `isInternational` (ADR-0003).

## Response → `RateLine[]` (one output item per service)
`{ serviceCode, serviceName, negotiated:{amount,currency}|null, published:{amount,currency}, billingWeight, transitDays:number|null, guaranteedBy:string|null, alerts:string[] }`.
- Negotiated nullable; Published never null. When **every** line's negotiated is null → one
  request-level alert on the first emitted item (FR-007). `[VERIFY-LIVE]` negotiated return.
- Per-service alerts in `RateLine.alerts`; request-level `RateResponse.Response.Alert[]` attaches
  to the first item only. Always emits ≥1 item (zero-service lanes + request alerts never dropped).

## Acceptance / Maps to
Spec US3 scenarios 1–5; FR-007, FR-007a, FR-010, FR-012, FR-014, FR-014a, FR-014b; SC-002.

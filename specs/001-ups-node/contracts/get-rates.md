# Contract: Get Rates (resource `Shipping`)

Declarative routing + `postReceive` → `flattenRates` (fan-out one item per service); addresses via
`toUpsAddress`; money via `toMoney`.

## Request
`POST /api/rating/v2409/{requestoption}` with `requestoption = Shoptimeintransit` (returns all
services + transit times; no `Shipment.Service.Code` sent). `NegotiatedRatesIndicator` + account
number requests negotiated rates. Container is `PackagingType` (Rate side).

> **[VERIFIED-LIVE 2026-06-18, CIE]** `Shoptimeintransit` requires TWO containers or it 400s:
> 1. `Shipment.DeliveryTimeInformation` (else `111563`) — node sends `PackageBillType: '03'`.
> 2. `Shipment.ShipmentTotalWeight` (else `111546 "Invalid Weight"`, a misleading message; the
>    UPS Rating spec marks it Required for ratetimeintransit/shoptimeintransit). v1 is single-package
>    so it equals the package weight; `UnitOfMeasurement` needs both `Code` and `Description`.
>
> With both present, CA→CA returned 8 services with published + **negotiated** charges + transit
> days. Confirmed: empty `NegotiatedRatesIndicator: ''` DOES return `NegotiatedRateCharges`
> (negotiated `[VERIFY-LIVE]` gate satisfied). Also confirmed: the account's registered country
> MUST equal the Shipper address country, else `111617` (Rate) / `120120` (Ship). Single OAuth
> app entitled for Track, Validate, Rate, AND Ship (Gate 0 entitlement PASS).

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

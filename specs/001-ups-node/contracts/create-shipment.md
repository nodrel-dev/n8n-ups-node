# Contract: Create Shipment (resource `Shipping`)

**Programmatic `execute()`** (the one permitted exception, Principle 5): `isInternational` guard →
`buildInternationalForms`/`buildCommodities` → UPS call → `extractLabel`/`extractForms` → decode
base64 → n8n binary.

## Request
`POST /api/shipments/v2409/ship`. `RequestOption` hardcoded `nonvalidate` (not exposed, 12.10);
`additionaladdressvalidation` query omitted. Container is `Packaging` (Ship side). Billing:
`PaymentInformation.ShipmentCharge` Type `01` BillShipper. International duties DDU (receiver-billed;
no Type 02 in v1).

## Parameters
- `accountNumber` (required) — rejected at boundary if absent (FR-010).
- Shipper / ShipFrom / ShipTo, `service`, package `weight` (+unit) / optional `dimensions` (+unit).
- `labelFormat` — GIF default; ZPL / EPL / SPL (**no PDF label**, FR-009).
- International `customs` collection — always visible + `notice`; **required at runtime** when
  `isInternational` (ADR-0003): commodity lines (description*, quantity*, unitValue*,
  unitOfMeasure*, commodityCode?, originCountry?), reasonForExport, currency, termsOfShipment,
  soldTo. `FormType ["01"]` commercial Invoice only.

## Response → binary
- `extractLabel(shipResponse, requestedFormat) → { shipmentId, labels:[{ trackingNumber, base64, mime, filename }] }`
  → n8n binary key `label`, filename = tracking number, **never** a base64 string in JSON
  (no `GraphicImage` leak — `[VERIFY-LIVE]`).
- International: `extractForms(shipResponse)` → PDF binary key `customsInvoice`.
- `[VERIFY-LIVE]`: GIF `HTTPUserAgent`/`LabelStockSize` need; cross-border phone requirement.

## Boundary failures (FR-014)
International + missing customs, or missing account number → `NodeOperationError` before any UPS
call; no shipment created. UPS validation errors → `mapUpsError` (`NodeApiError`).

## Acceptance / Maps to
Spec US4 scenarios 1–5; FR-008, FR-008a, FR-008b, FR-009, FR-010, FR-012, FR-014; SC-004.

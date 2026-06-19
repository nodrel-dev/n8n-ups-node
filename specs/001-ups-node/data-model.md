# Phase 1 Data Model: n8n-nodes-ups

Domain entities (from spec §Key Entities and `CONTEXT.md`) and the **pure-core type contracts**
they map to. The cores are plain-in / plain-out (no `IExecuteFunctions`), unit-tested test-first
(Principle 10). Field names follow `CONTEXT.md` ubiquitous language.

## Entities

### UPS Account Connection (credential)
The user's App Credentials (Client ID + Secret) plus `environment`. Sensitive; basis of every
operation. Realized as the `UpsOAuth2Api` credential, not a runtime object.
- `clientId`, `clientSecret` — OAuth `client_credentials` pair (HTTP Basic on token request).
- `environment` — `sandbox` (default, CIE) | `production`. Drives token URL + API base URL.
- **Validation**: secrets never hardcoded/logged/exposed (FR-011); test request must pass.

### Shipment Tracking Result
Current status + optional activity (scan) history for one tracking number.
- Maps to `TrackResult = { trackingNumber, statusType, statusCode, statusDescription, activity?: Activity[], deliveryDate?, service? }`.
- `activity` omitted when the `detail` toggle is Status-only (client-side suppression).

### Address Validation Result
Standardized candidate address(es), residential/commercial Classification, and a Resolution.
- Maps to `{ resolution: 'valid'|'ambiguous'|'none', classification: {code, label}, candidates: Address[] }`.
- One output item (does not fan out per candidate).

### Rate Quote
A set of services, each with negotiated rate (nullable), published rate, currency, transit time.
- Maps to `RateLine[]`, fanned out **one output item per service**.
- When every line's negotiated rate is null → one request-level alert on the first item.
- Request side: `Shoptimeintransit` requires both `DeliveryTimeInformation` and
  `ShipmentTotalWeight` containers in the body, or UPS 400s (`111563` / misleading `111546`);
  `ratesPreSend` adds both (verified CIE — gotchas §12, contracts/get-rates.md).

### Shipment / Label
A created shipment: tracking number(s), label document, and (international) customs invoice.
- Maps to `extractLabel` output + `extractForms` output, decoded to n8n binary
  (`label`, `customsInvoice`).

### Customs Declaration
Commodity lines, reason for export, terms of shipment, currency, sold-to party for a cross-border
shipment.
- Maps to `InternationalForms` via `buildInternationalForms` + `buildCommodities`.

## Pure-core type contracts (Principle 10 list)

| Core | Signature (plain-in → plain-out) | Notes |
|------|----------------------------------|-------|
| `toUpsAddress` | `(input) → { AddressLine[], City, StateProvinceCode, PostalCode, CountryCode, ResidentialAddressIndicator? }` | Rate + Ship `Address` shape |
| `toXavAddress` | `(input) → { AddressLine[], PoliticalDivision2, PoliticalDivision1, PostcodePrimaryLow, PostcodeExtendedLow, CountryCode }` | Validate's `AddressKeyFormat`; field names differ, so separate core |
| `shapeCandidates` | `(xavResponse) → { resolution, classification:{code,label}, candidates: Address[] }` | Resolution from Valid/Ambiguous/NoCandidates indicators |
| `mapTrackStatus` | `(trackResponse, { detail }) → TrackResult[]` | suppress `activity[]` when Status-only |
| `flattenRates` | `(rateResponse, { wantTransit }) → RateLine[]` where `RateLine = { serviceCode, serviceName, negotiated:{amount,currency}|null, published:{amount,currency}, billingWeight, transitDays:number|null, guaranteedBy:string|null, alerts:string[] }` | per-service alerts captured here |
| `toMoney` | `(upsCharge) → { amount, currency } | null` | shared by `flattenRates` + Create so they never disagree |
| `buildCommodities` | `(items, currency) → Product[]` | for `InternationalForms.Product` |
| `buildInternationalForms` | `(customs, commodities) → InternationalForms` | `FormType ["01"]`, `Contacts.SoldTo`, `ReasonForExport`, `TermsOfShipment`, `InvoiceNumber`, `CurrencyCode` |
| `extractLabel` | `(shipResponse, requestedFormat) → { shipmentId, labels:[{ trackingNumber, base64, mime, filename }] }` | filename = tracking number |
| `extractForms` | `(shipResponse) → [{ base64, mime:'application/pdf', filename }]` | customs invoice PDF |
| `mapUpsError` | `(responseData) → never (throws NodeApiError)` | parses both envelope shapes; classifies by `statusCode` |
| `isInternational` | `(input) → boolean` | Effective Origin (ShipFrom country else Shipper) vs ShipTo; shared by Rate + Create |

## Cross-field invariants

- **Effective Origin** (`isInternational`): international ⟺ Effective Origin country ≠ ShipTo
  country. Enforced at the boundary (FR-014); same predicate in Rate and Create (ADR-0003).
- **Money shape**: Negotiated/Published always `{amount, currency} | null` via `toMoney`;
  Published never null, Negotiated nullable (FR-007).
- **Account number** required for Get Rates + Create only; rejected at the boundary if absent
  (FR-010) — `NodeOperationError`, never `NodeApiError`.
- **Error class**: boundary failures (missing account/customs) → `NodeOperationError` before any
  UPS call; UPS responses → `NodeApiError` via `mapUpsError` (ADR-0004).

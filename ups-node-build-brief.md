# UPS Community Node: Build Requirements Brief (v3)

**Package:** `n8n-nodes-ups`  ·  **Org:** nodrel-dev  ·  **Status:** build-ready, feeds `/speckit.specify`

> **v3 changelog (review pass, 2026-06-18).** Reconciled contradictions and corrected two
> claims against the shipped FedEx code. Base URL now follows the proven FedEx pattern
> (`requestDefaults.baseURL` reads `$credentials.environment` directly; credential
> `accessTokenUrl` via `$self["environment"]`; no `baseUrl` property). Credential test is an
> explicit authenticated Track request, not the token grant alone. `ProductWeight` dropped
> from the Invoice commodity block (it is CO/EEI-only). Track simplified: `detail` is the only
> toggle (client-side `activity[]` suppression); `returnMilestones`, `returnSignature`, and
> `returnPOD` are all deferred to v2. §7 retry aligned to native Retry On Fail. FR-005 and the
> Story 1 scenario reworded to native item iteration. Added `toXavAddress` and
> `buildInternationalForms` cores. International phone marked required. Added GIF/LabelStockSize,
> commodity Unit-of-Measure appendix, and category verify items. Added a Key Entities list.
>
> **v2 changelog (grilling pass, 2026-06-18).** Closed twelve gaps before SpecKit:
> Track is declarative one-number-per-item (no in-item list); three resources with
> Rate+Create under `Shipping`; `returnPOD` deferred and `detail` decoupled from
> `returnMilestones`; Rate gains international customs-value fields; international trigger
> defined as Effective Origin (ShipFrom else Shipper) vs ShipTo; `environment` on the
> credential drives the host (base-URL mechanism and credential-test approach later
> corrected in v3); address UI is two inputs with `shipperName`/`shipToName` + optional phones;
> Create `RequestOption` hardcoded `nonvalidate`; native Retry On Fail replaces bounded
> backoff (see `docs/adr/0001-native-retry-over-backoff.md`); §16 names the verification
> blockers (codex node id, doc URLs, displayName, category). See `CONTEXT.md` for the
> resolved glossary.

This is the single source of requirements for the UPS node. It is detailed enough that the implementer
should not need to open a UPS YAML to know a field name, an enum value, or a required rule. Every API
fact here is verified against the local OpenAPI specs in `ups-api-documentation/` (the authoritative
source, per the constitution's schema-fidelity principle). It mirrors the artifact set that shipped
`n8n-nodes-fedex`: scope, ubiquitous language, per-operation contracts, functional and non-functional
requirements, user stories with acceptance scenarios, entities, deltas, verify-live gates, and the
scaffolding contract.

Markers used throughout: **[VERIFY-LIVE]** must be confirmed through the running n8n path against the
UPS Customer Integration Environment (CIE) before the matching operation is done (constitution
Principle 12). **[DECIDED]** is a resolved choice; an override note follows where one is worth keeping.

---

## 1. Summary and value proposition

A publishable n8n community node that talks directly to the UPS REST API so a business uses its own UPS
account and negotiated rates with no aggregator (Shippo, EasyPost, ShipStation) in between. Same thesis
as the FedEx node: existing npm UPS options are aggregator-fronted or stale, and a direct,
credential-native node fills an open gap. Requests authenticate with the user's own UPS OAuth app and
account number, so returned rates are the user's actual negotiated cost with zero markup.

## 2. v1 scope (decided)

Single declarative-style **UPS** node, four operations, full FedEx parity plus international with
customs. Build order is simplest-first, each verified against CIE before the next:

1. **Track shipment** : `GET /api/track/v1/details/{inquiryNumber}` (read-only; proves auth + base-URL plumbing).
2. **Validate address** : `POST /api/addressvalidation/{version}/{requestoption}`.
3. **Get rates** : `POST /api/rating/{version}/{requestoption}` (needs account number).
4. **Create shipment / label** : `POST /api/shipments/{version}/ship` (hardest; international customs lives here; do last).

International (cross-border) Rate and Ship are in scope for v1, including the customs and commodity data
UPS requires. This is the principal delta from the FedEx node, which deferred international to v2.

### Out of scope for v1 (deferred, "planned" only)

Void / Cancel (`/shipments/{version}/void/cancel`), Label Recovery (`/labels/{version}/recovery`),
Landed Cost duty and tax estimation (separate API; v1 rating returns transportation charges only),
Pickup, Locator, standalone Time in Transit, Paperless document upload, Quantum View, Dangerous Goods,
Delivery Intercept, and every other API in `ups-api-documentation/`. International form types beyond the
commercial Invoice (CO, USMCA, CN22, EEI, Premium Care) are deferred (see decision 12.3). Multi-package
shipments, DDP duty billing, reference-number and shipment-level tracking are deferred (decisions 12).

## 3. Ubiquitous language

- **Shipment:** the noun for the three shipment verbs (Track, Get Rates, Create). Avoid: parcel, package (a Shipment contains packages but is not one), order.
- **Address:** the thing Validate acts on. Standardize and classify residential vs commercial. Avoid: location, destination.
- **Negotiated Rate:** the price tied to the user's account number (`ShipperNumber`), from `NegotiatedRateCharges.TotalCharge`. The node's reason to exist. Avoid: account rate, our rate.
- **Published Rate:** UPS standard price for the same service, from `TotalCharges`, shown beside the Negotiated Rate. Avoid: list rate, retail rate.
- **Label:** the printable document from Create, emitted as n8n binary (GIF, ZPL, EPL, SPL), never a base64 string in JSON. Avoid: waybill, airbill.
- **Customs Forms:** the commercial-invoice documents UPS returns for an international shipment (`ShipmentResults.Form`), emitted as additional PDF binary. Avoid: paperwork.
- **App Credentials:** the UPS Client ID and Client Secret (the OAuth `client_credentials` pair). Identify the software, not the shipper. Avoid: API account, login.
- **Account Number / Shipper Number:** the UPS account number (`ShipperNumber`); whose negotiated rates apply and who a shipment bills to. Required for Get Rates and Create; irrelevant to Track and Validate.
- **Environment:** sandbox (CIE) or production. One user choice governing both the token URL and the API base URL. Avoid: mode, stage.

## 4. Authentication contract (verified)

- **Token endpoint:** `POST /security/v1/oauth/token` (no `/api` segment). Sandbox host `wwwcie.ups.com`, production `onlinetools.ups.com`.
- **Token request:** body `application/x-www-form-urlencoded` with `grant_type=client_credentials`; client id and secret sent as HTTP **Basic** in the `Authorization` header (security scheme `BasicAuth`); optional `x-merchant-id` header. n8n's built-in `oAuth2Api` with `grantType: clientCredentials` performs and caches this; do not hand-roll.
- **Scope:** empty (UPS client-credentials does not use scopes).
- **One app, one credential.** A single UPS OAuth app entitles all four APIs, so the node ships one credential type (`UpsOAuth2Api`, already scaffolded). Single-app entitlement across all four endpoints is **[VERIFY-LIVE]**.
- **Environment field drives both URLs (FedEx-proven mechanism).** `environment` (sandbox default, production) is a **credential** field. The credential sets `accessTokenUrl` as an expression on that field: `={{ $self["environment"] === "production" ? "https://onlinetools.ups.com/security/v1/oauth/token" : "https://wwwcie.ups.com/security/v1/oauth/token" }}`. The **node** sets `requestDefaults.baseURL` as an expression reading the same field directly: `={{ $credentials.environment === "production" ? "https://onlinetools.ups.com/api" : "https://wwwcie.ups.com/api" }}`. This is exactly how the shipped FedEx node and `fedexOAuth2Shared.ts` do it (ADR-0001), so token exchange and API calls can never split hosts (SC-006). Do **not** invent a derived `baseUrl` property on the credential and read `$credentials.baseUrl`: that variation is unverified, and the `$credentials.environment` ternary is the known-working approach. Today the credential hardcodes the production token URL and the node hardcodes `https://onlinetools.ups.com` with no `/api`; both are replaced by these expressions.

## 5. Per-operation API contracts (verified against local specs)

Notation: `*` marks a required field. `->` denotes a nested object. `[]` an array. Paths shown are the
JSON paths the node sends or reads. Version path params are pinned and flagged **[VERIFY-LIVE]**:
rating and ship `v2409`, address validation `v2`, track `v1`.

### 5.1 Track shipment

**Request:** `GET /api/track/v1/details/{inquiryNumber}`. No body. Only `locale` (e.g. `en_US`) is sent
in v1. UPS tracks **one inquiry number per call**; there is no batch endpoint, so the node is
declarative, one inquiry number per n8n item. "Multiple" is native item iteration with per-item
Continue On Fail, not an in-item list (decision 12.9, delta 13.3). The `detail` UI flag
(Detailed / Status-only) is the only behavioural toggle: it governs client-side `activity[]` suppression
in `mapTrackStatus`. `returnMilestones`, `returnSignature`, and `returnPOD` are all **deferred to v2**
(decision 12.11): each returns extra payload or a document image that a v1 status lookup neither
surfaces nor emits as binary, so requesting them would be an orphan.

**Response read path:** `trackResponse.shipment[].package[]`, each package carrying:

- `trackingNumber`
- `currentStatus` -> `{ code, description, simplifiedTextDescription, statusCode, type }`
- `activity[]` -> `{ date, time, gmtDate, gmtTime, gmtOffset, location, status }` (the scan history; suppress when the status-only toggle is set)
- `deliveryDate[]` -> `{ type, date }`, `deliveryTime` -> `{ type, startTime, endTime }`
- `service` -> `{ code, description }`, `weight`, `packageCount`, `packageAddress[]` -> `{ type, name, address }`, `referenceNumber[]`, `milestones[]`
- `deliveryInformation` -> `{ location, receivedBy }` (the `signature.image` and `pod.content` document images are **not** requested or emitted in v1; deferred with their toggles)

**Errors:** Track returns errors in a `response.errors[]` envelope (`code`, `message`); error schema
differs slightly from the other three APIs, so map it explicitly and **[VERIFY-LIVE]** the exact shape.

### 5.2 Validate address

**Request:** `POST /api/addressvalidation/v2/{requestoption}` with `requestoption = 3` (validation plus
classification). Query: `regionalrequestindicator`, `maximumcandidatelistsize` (e.g. 10). Body:

```
XAVRequest.AddressKeyFormat:
  ConsigneeName, AttentionName
  AddressLine[]                 // street lines
  PoliticalDivision2            // city
  PoliticalDivision1            // state/province
  PostcodePrimaryLow            // postal code
  PostcodeExtendedLow           // +4 (US)
  CountryCode *                 // ISO country/territory
```

**Response read path:** `XAVResponse` with:

- one of `ValidAddressIndicator`, `AmbiguousAddressIndicator`, `NoCandidatesIndicator` (presence flags; map to a `resolution` of `valid | ambiguous | none`)
- `AddressClassification` -> `{ Code, Description }` (the input's classification)
- `Candidate[]` -> each `{ AddressClassification {Code, Description}, AddressKeyFormat {AddressLine[], PoliticalDivision2, PoliticalDivision1, PostcodePrimaryLow, PostcodeExtendedLow, CountryCode} }`

Classification `Code`: `0` UnClassified, `1` Commercial, `2` Residential.

**CIE constraint [VERIFY-LIVE]:** the sandbox only returns street-level results for **New York and
California** addresses; test fixtures must use NY/CA.

### 5.3 Get rates

**Request:** `POST /api/rating/v2409/{requestoption}`. Use `requestoption = Shoptimeintransit` to return
all eligible services with transit times (decision 12.6). Body essentials:

```
RateRequest.Request.TransactionReference.CustomerContext        // optional echo string
RateRequest.PickupType.Code *                                   // default "01" Daily Pickup
RateRequest.Shipment:
  Shipper.Name, Shipper.ShipperNumber                           // account number; required for negotiated rates
  Shipper.Address { AddressLine[], City, StateProvinceCode, PostalCode, CountryCode* }
  ShipTo.Address  { AddressLine[], City, StateProvinceCode, PostalCode*, CountryCode*, ResidentialAddressIndicator? }
  ShipFrom.Address{ AddressLine[], City, StateProvinceCode, PostalCode, CountryCode* }
  PaymentDetails.ShipmentCharge[] { Type "01", BillShipper.AccountNumber }   // transportation, shipper-billed
  Package[] {
    PackagingType.Code *           // default "02" Customer Supplied Package
    PackageWeight.UnitOfMeasurement.Code * (LBS|KGS), PackageWeight.Weight *
    Dimensions.UnitOfMeasurement.Code (IN|CM), Dimensions.Length/Width/Height   // optional
  }
  ShipmentRatingOptions.NegotiatedRatesIndicator "Y"            // required to get negotiated rates
  InvoiceLineTotal.{CurrencyCode, MonetaryValue}                // REQUIRED for international (effective origin != ShipTo); from the Rate Customs Value group (currency*, invoiceValue*)
```

**Address mapping (Rate and Create share this).** The UI collects **two** addresses — `shipFrom` and
`shipTo` — plus `shipperNumber*` and `shipperName`. `shipFrom` populates **both** `ShipFrom.Address`
and `Shipper.Address` (the common case: the account holder ships from its own origin); `shipperNumber`
-> `Shipper.ShipperNumber`; `shipperName` -> `Shipper.Name`. A distinct drop-ship origin
(Shipper != ShipFrom) is deferred to v2.

For `requestoption = Shop`/`Shoptimeintransit` no `Shipment.Service.Code` is sent (UPS returns all
services). Only the single-service `Rate` option requires a `Service.Code`, and v1 never uses it: Get
Rates always sends `Shoptimeintransit`.

**Response read path:** `RateResponse.RatedShipment[]`, each:

- `Service` -> `{ Code, Description }`
- `TotalCharges` -> `{ CurrencyCode, MonetaryValue }` (published)
- `NegotiatedRateCharges.TotalCharge` -> `{ CurrencyCode, MonetaryValue }` (negotiated; present only when the indicator + account number were sent)
- `BillingWeight` -> `{ UnitOfMeasurement.Code, Weight }`
- `GuaranteedDelivery` -> `{ BusinessDaysInTransit, DeliveryByTime }` and/or `TimeInTransit.ServiceSummary.EstimatedArrival.BusinessDaysInTransit` (with `Shoptimeintransit`)
- `RatedShipmentAlert[]` -> `{ Code, Description }` (surface as non-fatal warnings)

### 5.4 Create shipment

**Request:** `POST /api/shipments/v2409/ship`. Query: `additionaladdressvalidation`. Body:

```
ShipmentRequest.Request.RequestOption                          // hardcoded "nonvalidate", not exposed (decision 12.10); the additionaladdressvalidation query is omitted. Address validation is its own Address operation.
ShipmentRequest.Shipment:
  Description                                                   // goods description (international)
  Shipper { Name*, ShipperNumber*, Phone (required when international [VERIFY-LIVE]), Address{ AddressLine[], City, StateProvinceCode, PostalCode, CountryCode* } }
  ShipTo  { Name*, Phone (required when international [VERIFY-LIVE]), Address{ AddressLine[], City, StateProvinceCode, PostalCode, CountryCode*, ResidentialAddressIndicator? } }
  ShipFrom{ Name, Address{...} }                                // defaults to Shipper if omitted
  PaymentInformation.ShipmentCharge[] { Type "01", BillShipper.AccountNumber* }   // transportation, shipper-billed
  Service { Code* }                                            // single chosen service, required for Create
  Package[] {                                                   // single package in v1 (decision 12.1)
    Description?, Packaging.Code* (default "02"),
    PackageWeight.UnitOfMeasurement.Code* (LBS|KGS), PackageWeight.Weight*,
    Dimensions.UnitOfMeasurement.Code (IN|CM), Dimensions.{Length,Width,Height}    // optional
  }
  ShipmentServiceOptions.InternationalForms { ... }            // required when cross-border (see 5.5)
ShipmentRequest.LabelSpecification:
  LabelImageFormat.Code *                                      // GIF (default) | ZPL | EPL | SPL
  LabelStockSize { Height*, Width* }                           // thermal (EPL/ZPL/SPL) sizing; GIF may ignore it [VERIFY-LIVE]; default 6 x 4 (HxW)
  HTTPUserAgent?                                               // spec calls this the preferred GIF-label identifier; send for GIF [VERIFY-LIVE]
```

Note the request-side container is `Package.Packaging.Code` here (Rate uses `Package.PackagingType.Code`).

**Response read path:** `ShipmentResponse.ShipmentResults`:

- `ShipmentIdentificationNumber` (shipment 1Z)
- `PackageResults[]` -> `{ TrackingNumber*, ShippingLabel { ImageFormat.Code*, GraphicImage* (base64), HTMLImage?, InternationalSignatureGraphicImage? } }`
- `ShipmentCharges.TotalCharges` (published) and `NegotiatedRateCharges.TotalCharge` (negotiated, when applicable)
- `BillingWeight`
- `Form` -> `{ Code, Description, Image { ImageFormat.Code (PDF), GraphicImage* (base64) } }` (the commercial invoice and related customs documents for international shipments)

### 5.5 International customs block (in scope, v1)

When the **Effective Origin** country differs from `ShipTo` country, Create MUST include the block
below. Effective Origin = `ShipFrom` country if ShipFrom is provided, otherwise `Shipper` country.
The identical rule gates the Rate Customs Value group, so Rate and Create never disagree on what
counts as international (see `CONTEXT.md`).

```
Shipment.ShipmentServiceOptions.InternationalForms:
  FormType[] *               // ["01"] = commercial Invoice (v1 supports Invoice only; others deferred)
  Contacts.SoldTo { Name, Address{...} }   // mirror the ShipTo Name + Address shape; defaults to ShipTo when same
  Product[] * (one per commodity line):
    Description[] *
    Unit { Number* (qty), UnitOfMeasurement.Code* (codes from the UPS Unit of Measure appendix [DOC-VERIFY], not the local YAMLs), Value* (unit price) }
    CommodityCode             // optional; 6-15 char HS/tariff code
    OriginCountryCode         // optional; country of manufacture
    // ProductWeight is NOT used: the spec scopes it to CO and EEI forms only, and v1 ships FormType 01 (Invoice).
  InvoiceNumber?, InvoiceDate?, PurchaseOrderNumber?
  TermsOfShipment            // incoterm / terms of sale
  ReasonForExport *          // SALE | GIFT | SAMPLE | RETURN | REPAIR | INTERCOMPANYDATA | other
  CurrencyCode               // currency for all invoice monetary values
  Comments?, DeclarationStatement?
```

The duties-and-taxes charge (`ShipmentCharge` Type `02`) is **not** sent in v1, so duties bill to the
receiver (DDU); see decision 12.2. UPS returns the generated invoice at `ShipmentResults.Form.Image`
(PDF), which the node emits as binary alongside the label.

## 6. Enum reference (verified, for field options and validation)

**UPS Service codes** (`Service.Code`): 01 Next Day Air, 02 2nd Day Air, 03 Ground, 07 Worldwide
Express, 08 Worldwide Expedited, 11 UPS Standard, 12 3 Day Select, 13 Next Day Air Saver, 14 Next Day
Air Early, 17 Worldwide Economy DDU, 54 Worldwide Express Plus, 59 2nd Day Air A.M., 65 UPS Worldwide
Saver, 72 Worldwide Economy DDP, 96 Worldwide Express Freight. (Mail Innovations M2..M7 and freight T0/T1
are out of scope.) Populate the Create Service dropdown from this list; the Rate `Shop` flow needs no
service input.

**Packaging codes** (`PackagingType.Code` / `Packaging.Code`): 01 UPS Letter, 02 Customer Supplied
Package (default), 03 Tube, 04 PAK, 21 UPS Express Box, 24 UPS 25KG Box, 25 UPS 10KG Box, 30 Pallet,
2a/2b/2c Small/Medium/Large Express Box.

**Label image format** (`LabelImageFormat.Code`): GIF, ZPL, EPL, SPL. PNG appears in the response enum
but is not a request option. **There is no PDF label option** (corrects an earlier assumption). PDF is
available only for the international **Form** image. Default GIF (decision 12.4).

**Shipment charge type** (`ShipmentCharge.Type`): 01 Transportation (required), 02 Duties and Taxes
(optional, invalid for qualified domestic shipments), 03 Broker of Choice. v1 sends 01 only.

**International form type** (`FormType`): 01 Invoice, 03 CO, 04 USMCA, 05 Partial Invoice, 06 Packing
List, 07 Customer Generated, 09 CN22, 10 Premium Care, 11 EEI. v1 sends `["01"]` only.

**Reason for export** (`ReasonForExport`): SALE, GIFT, SAMPLE, RETURN, REPAIR, INTERCOMPANYDATA, or other.

**Address classification** (`AddressClassification.Code`): 0 UnClassified, 1 Commercial, 2 Residential.

**Weight unit** (`UnitOfMeasurement.Code`): LBS (default), KGS. **Dimension unit**: IN (default), CM.

**Pickup type** (`PickupType.Code`, rating): 01 Daily Pickup (default), 03 Customer Counter, 06 One Time
Pickup, 07 On Call Air, 19 Letter Center, 20 Air Service Center.

**Rating request option**: Rate, Shop, Ratetimeintransit, Shoptimeintransit. **Address validation
request option**: 1 validation, 2 classification, 3 both.

## 7. Error model

- Rate, Ship, and Validate return errors as `response.errors[]`, each `{ code, message }`. Surface the UPS `code` and `message` verbatim via `NodeApiError`. Track uses a slightly different error schema; map it explicitly **[VERIFY-LIVE]**.
- Treat HTTP `4xx` as input/validation or auth problems; treat transient `5xx` and `429` as retryable. v1 leans on n8n's native **Retry On Fail** for transience rather than node-level error-class-selective backoff (NFR-007, decision 12.12, `docs/adr/0001-native-retry-over-backoff.md`). Distinguish auth failures (token/credential) from request-validation failures in the surfaced message.
- Response-level warnings differ from per-service ones: `RateResponse.Response.Alert[]` and `AlertDetail[]` are request-level, while `RatedShipment[].RatedShipmentAlert[]` is per service. `flattenRates` captures the per-service alerts; surface request-level alerts once on the operation result (decide placement in plan).
- Rate and Ship may also return non-fatal `Alert[]` / `RatedShipmentAlert[]`; surface these as warnings without failing the item.

## 8. n8n field inventory (UI fields to API mapping)

Representative, not exhaustive. Field `name` shown in code form; `displayName` is the human label.
Use `displayOptions.show` to gate fields by `resource` and `operation`. Sensitive values
(`shipperNumber`) come from node input or credential, never defaults.

**Common credential (`upsOAuth2Api`):** `environment` (options sandbox/production, default sandbox),
plus the inherited OAuth2 client-credentials fields (client id/secret, the derived token URL).

**Track:** `inquiryNumber` (string, required, single, one number per item; "multiple" is native n8n item
iteration with Continue On Fail, no in-item collection); `detail` (options: Detailed [default] / Status
only, client-side `activity[]` suppression in `mapTrackStatus`); `locale` (string, default `en_US`).
No signature, milestones, or POD toggles in v1 (`returnSignature` / `returnMilestones` / `returnPOD` all
deferred, decision 12.11).

**Validate:** `address` (fixedCollection: addressLine, city, stateProvinceCode, postalCode, country*);
`maxCandidates` (number, default 10).

**Get Rates:** `shipperNumber*` (account number); `shipperName` (-> `Shipper.Name`); `shipFrom`,
`shipTo` (address collections, country*; `shipFrom` maps to both `ShipFrom.Address` and
`Shipper.Address`); optional `shipperPhone`, `shipToPhone`; `pickupType` (options, default 01);
`package` (collection: weight*, weightUnit [LBS/KGS], length/width/height optional, dimUnit [IN/CM],
packagingType default 02); a **Customs Value** group shown when effective origin country !=
`shipTo.country`: `currency*`, `invoiceValue*` (-> `InvoiceLineTotal.{CurrencyCode, MonetaryValue}`);
`requestOption` (hidden, `Shoptimeintransit`). No service selector (Shop returns all).

**Create Shipment:** all Get Rates shipment inputs (including `shipperName`, the two-address mapping,
optional phones) plus `shipToName*` (-> `ShipTo.Name`, required for Create); `service*` (options from
the service-code table); `labelFormat` (options GIF [default]/ZPL/EPL/SPL); `labelStockSize`
(default 6x4); and an international `customs` collection shown when effective origin country !=
`shipTo.country`: `reasonForExport*`, `currency*`, `invoiceNumber`, `termsOfShipment`, and a
`commodities` list (description*, quantity*, unitValue*, unitOfMeasure*, commodityCode, originCountry). `RequestOption` is hardcoded `nonvalidate` (not a field).

## 9. Pure cores (test-first; plain-in / plain-out, no IExecuteFunctions)

Each ships vitest unit tests written before the implementation, asserted against fixtures captured from
the local specs (constitution Principle 10).

- `toUpsAddress(input) -> { AddressLine[], City, StateProvinceCode, PostalCode, CountryCode, ResidentialAddressIndicator? }` (Rate and Ship `Address` shape only)
- `toXavAddress(input) -> { AddressLine[], PoliticalDivision2, PoliticalDivision1, PostcodePrimaryLow, PostcodeExtendedLow, CountryCode }` (Validate's `AddressKeyFormat` shape; field names differ from `toUpsAddress`, so it is a separate core)
- `flattenRates(rateResponse, { wantTransit }) -> RateLine[]` where `RateLine = { serviceCode, serviceName, negotiated: {amount, currency} | null, published: {amount, currency}, billingWeight, transitDays: number | null, guaranteedBy: string | null, alerts: string[] }`
- `mapTrackStatus(trackResponse, { detail }) -> TrackResult[]` where `TrackResult = { trackingNumber, statusType, statusCode, statusDescription, activity?: Activity[], deliveryDate?, service? }` (`activity` omitted when `detail` is Status-only)
- `buildCommodities(items, currency) -> Product[]` for `InternationalForms.Product`
- `buildInternationalForms(customs, commodities) -> InternationalForms` (assembles the full block: `FormType ["01"]`, `Contacts.SoldTo`, `Product[]` via `buildCommodities`, `ReasonForExport`, `TermsOfShipment`, `InvoiceNumber`, `CurrencyCode`; this is the "customs assembly" NFR-002 reserves for programmatic code)
- `extractLabel(shipResponse, requestedFormat) -> { shipmentId, labels: [{ trackingNumber, base64, mime, filename }] }`
- `extractForms(shipResponse) -> [{ base64, mime: 'application/pdf', filename }]`
- `shapeCandidates(xavResponse) -> { resolution: 'valid'|'ambiguous'|'none', classification: {code, label}, candidates: Address[] }`

The programmatic `execute()` for Create calls `extractLabel` and `extractForms`, decodes the base64, and
attaches n8n binary. Track, Validate, and Get Rates use declarative routing with a `postReceive` hook
calling the matching pure core.

## 10. Binary handling spec (Create)

- **Label:** decode `PackageResults[].ShippingLabel.GraphicImage`; MIME by format code: GIF -> `image/gif`, ZPL/EPL/SPL -> `application/octet-stream`; filename `label-<trackingNumber>.<gif|zpl|epl|spl>`. Pass tracking number(s) and charges through on the main JSON output. Never leak `GraphicImage` into JSON.
- **Customs forms (international):** decode `ShipmentResults.Form.Image.GraphicImage`; MIME `application/pdf`; filename `customs-invoice-<shipmentId>.pdf`. Attach as an additional binary property.

## 11. Functional requirements

- **FR-001:** Connect the user's own UPS account via App Credentials; authenticate every request as that account with no intermediary.
- **FR-002:** Offer sandbox (CIE) or production; route both the token request and every API request to the chosen host, including the `/api` base segment.
- **FR-003:** Provide a credential test action giving immediate pass/fail. Implement it as an explicit
  authenticated `test` request, the way the shipped FedEx credential does (n8n's oAuth2Api credentials
  need a `test` request to drive the Test button; the token grant alone is not a UI test affordance).
  Use a minimal authenticated Track call (`GET /track/v1/details/{a UPS published test number}`) against
  the environment-derived base URL: a UPS "not found" still proves the App Credentials and host. No
  account number required. **[VERIFY-LIVE]** the chosen test endpoint returns a clean pass under valid
  credentials.
- **FR-004:** Keep the session alive and renew automatically via n8n's built-in OAuth2 client-credentials; no per-request re-entry; no hand-rolled token code.
- **FR-005:** **Track** returns status and detail for a tracking number, one inquiry number per input item. Several items each carrying a tracking number are processed by native n8n iteration, with any unresolved number reported per item under Continue On Fail without failing the rest. Detailed activity is returned by default, with a `detail` toggle to suppress the `activity[]` history client-side for a lighter status-only result. Signature, milestones, and POD are deferred to v2.
- **FR-006:** **Validate** returns standardized candidate(s) and a residential/commercial classification (request option 3), or a clear `none` resolution.
- **FR-007:** **Get rates** returns service options for supplied details and account number, each with the Negotiated Rate and, when UPS returns it, the Published Rate, plus currency and transit time. Output is flattened to one item per service, not UPS's nested `RatedShipment` array.
- **FR-007a:** Get rates supports domestic and international shipments; international accepts origin/destination countries and the commodity value UPS requires. Landed-cost duty/tax estimation is out of scope.
- **FR-008:** **Create shipment** returns the assigned tracking number and a label, for domestic and international shipments, single package per shipment in v1.
- **FR-008a:** Create bills transportation to the configured account (`ShipmentCharge` Type 01, BillShipper with the account number). v1 does not send the Type 02 duties charge, so international duties bill to the receiver (DDU).
- **FR-008b:** For an international shipment (Effective Origin country differs from ShipTo country), Create collects and sends the commercial-invoice customs data (commodity lines with description, quantity, unit value, unit of measure, and optional origin country and commodity/tariff code; reason for export; currency; terms of shipment; sold-to), and emits the returned customs document as PDF binary alongside the label.
- **FR-009:** Create lets the user select the label format (GIF, ZPL, EPL, SPL), delivered as binary in that format named with the tracking number, never an encoded string in the data. (No PDF label option exists in the UPS API.)
- **FR-010:** Operations needing an account number (Get rates, Create) obtain it from configuration and reject the request with a clear message if absent.
- **FR-011:** Never hardcode, default, or expose Client ID, Client Secret, account number, or environment URLs.
- **FR-012:** Surface UPS's specific error code and message, distinguishing input/validation from auth/transport problems, and surface non-fatal alerts as warnings.
- **FR-013:** Honor Continue On Fail with per-item errors.
- **FR-014:** Validate input at the boundary and fail fast before calling UPS (including the international-customs-required rule).
- **FR-014a:** Weight required, dimensions optional, for Rate and Create.
- **FR-014b:** Selectable weight unit (LBS default, KGS) and dimension unit (IN default, CM); send the selected UPS codes.
- **FR-015:** Installable from the community registry; `usableAsTool: true`; passes `npx @n8n/scan-community-package n8n-nodes-ups`; ships a README covering credential setup and each operation.

## 12. Resolved decisions (defaults locked; override notes kept)

1. **Multi-package:** single package per shipment in v1. **[DECIDED]** Override only if international multi-package is a launch requirement.
2. **International duties/taxes:** DDU (receiver-billed; no Type 02 charge, no duties payor UI). **[DECIDED]** DDP deferred to v2.
3. **International forms:** commercial Invoice (`FormType ["01"]`) only, UPS-generated image returned as PDF binary. **[DECIDED]** CO, USMCA, CN22, EEI, Premium Care, and the separate Paperless upload API deferred to v2.
4. **Label format:** GIF default; offer ZPL, EPL, SPL. **[DECIDED]** No PDF label (not a UPS label option). If a PDF label is later required it is a v2 render step.
5. **Validate placement:** standalone `Address` resource (clean given one credential). **[DECIDED]**
6. **Transit in rates:** default `Shoptimeintransit` so transit times come with the service list. **[DECIDED]**
7. **Tracking variants:** inquiry-number tracking only in v1. **[DECIDED]** Reference-number and shipment-level tracking deferred.
8. **Rate defaults:** `PickupType.Code` 01 (Daily Pickup), `PackagingType.Code` 02 (Customer Supplied Package), exposed with those defaults. **[DECIDED]**
9. **Resource structure:** three resources — `Tracking{track}`, `Address{validate}`, `Shipping{getRates, create}`. Rate and Create share the shipment input surface, so they co-locate under `Shipping` and gate shared fields on `resource = shipping`, differing by `operation`. Track is declarative, **one inquiry number per item**; "multiple" is native n8n item iteration with Continue On Fail (not an in-item collection). **[DECIDED]**
10. **Create address validation:** `RequestOption` hardcoded `nonvalidate`, not exposed; `additionaladdressvalidation` omitted. Address validation is the standalone `Address` operation, so Create stays narrow (make the label) and never hard-rejects an otherwise-fine address. **[DECIDED]** Override only if a "validate before ship" toggle is a launch requirement (v2).
11. **Track extras deferred:** `returnPOD`, `returnSignature`, and `returnMilestones` are all deferred to v2. Each returns extra payload or a document image that a v1 status lookup neither surfaces nor emits as binary, so requesting any of them would be an orphan. The only v1 toggle is `detail` (Detailed / Status-only), which suppresses `activity[]` client-side in `mapTrackStatus`. **[DECIDED]**
12. **Resilience:** native n8n Retry On Fail for v1; selective 5xx/429 bounded backoff deferred — a documented deviation from Constitution Principle 7, see `docs/adr/0001-native-retry-over-backoff.md`. **[DECIDED]**

## 13. UPS vs FedEx deltas (most likely to cause silent bugs)

1. **One credential, not two.** Single OAuth app entitles all four APIs.
2. **Base URL includes `/api`;** the token endpoint does not. The current node baseURL omits `/api`.
3. **Track is GET-per-number.** One inquiry number per n8n item, declarative routing; "multiple" is native item iteration with per-item Continue On Fail, **not** an in-item list and not one batch call.
4. **Transit folds into rating** via `Shoptimeintransit`; no separate Time-in-Transit operation.
5. **Validate uses request option 3;** CIE only validates NY/CA addresses.
6. **No PDF label.** UPS labels are GIF/ZPL/EPL/SPL; PDF applies only to the international Form image. (FedEx defaulted to PDF; do not copy that.)
7. **International customs is in v1:** `InternationalForms` with a commodity `Product[]` array, plus a returned invoice PDF emitted as binary.
8. **Billing is `PaymentInformation.ShipmentCharge`** Type 01 BillShipper; the request-side package container is `Packaging` in Ship but `PackagingType` in Rate.
9. **Toolchain is npm + release-please** (amended 2026-06-19, constitution v1.2.0; was release-it). The package manager stays npm — do not adopt pnpm.

## 14. User stories and acceptance scenarios

### Story 1: Track a shipment (P1)

A logistics operator connects their UPS account and looks up a parcel's status by tracking number so a
downstream step can branch on in-transit, delivered, or exception.

- Given a connected account and a valid tracking number, When Track runs, Then the workflow receives the latest status and activity history.
- Given an unknown or malformed tracking number, When Track runs, Then the operator sees the specific UPS reason, not a generic failure.
- Given an invalid or missing connection, When any operation runs, Then the operator is told the connection is the problem and how to fix it.
- Given the sandbox environment is chosen, When Track runs, Then the request goes to CIE, not production.
- Given several input items each carrying a tracking number, When Track runs, Then the workflow receives a result per item and any unresolvable number is flagged on its own item without failing the rest.

### Story 2: Validate and correct an address (P2)

Before rating or shipping, the operator checks a recipient address for deliverability and
residential/commercial classification and gets the standardized form.

- Given a resolvable address, When Validate runs, Then the operator receives the standardized candidate(s) and the classification.
- Given an unresolvable address, When Validate runs, Then the operator receives an explicit `none` resolution and why.

### Story 3: Get rate quotes (P3)

The operator supplies shipment details and their account number to receive service options and negotiated
prices so a workflow can choose by cost or speed.

- Given a connected account, a valid account number, and complete details, When Get rates runs, Then the operator receives a list of services each with the negotiated price (and published price where UPS returns it) and transit time.
- Given no account number, When Get rates runs, Then the operator is told it is required before the request is sent.
- Given details UPS considers invalid, When Get rates runs, Then the operator sees the specific UPS validation reason.

### Story 4: Create a shipment and get a label (P4)

The operator generates a label by submitting shipment details, the account number, the service, and the
label format, and for international shipments the customs data, and receives a downloadable label plus the
tracking number (and the customs invoice for international).

- Given a connected account, valid account number, and complete domestic details, When Create runs, Then the operator receives the tracking number and a label file attachment in the chosen format.
- Given a chosen label format, When Create runs, Then the returned label file is in that format and named recognizably.
- Given complete international details with customs data, When Create runs, Then the operator receives the tracking number, the label, and the commercial-invoice PDF as binary.
- Given invalid or incomplete details (including missing required customs data on a cross-border shipment), When Create runs, Then no shipment is created and the operator sees the specific UPS validation reason.

### Key entities

- **UPS Account Connection:** the App Credentials and environment choice; sensitive; the basis of every operation.
- **Shipment Tracking Result:** current status plus optional activity history for one inquiry number.
- **Address Validation Result:** standardized candidate(s), a residential/commercial classification, and a resolvable/unresolvable indication.
- **Rate Quote:** a set of services, each with service level, Negotiated Rate, Published Rate when returned, currency, and transit time.
- **Shipment / Label:** a created shipment carrying the tracking number(s), a label binary, and for international moves the customs invoice binary.
- **Customs Declaration:** the commodity lines, reason for export, terms of shipment, currency, and sold-to party required for a cross-border shipment.

## 15. Verify-live checklist (Principle 12 gates)

- [ ] Token exchange succeeds with Basic-header client credentials, empty scope, `grant_type=client_credentials`, against `wwwcie.ups.com`.
- [ ] The single app's token is accepted by Track, Validate, Rate, and Ship (entitlement).
- [ ] Track returns activity and current status for a CIE tracking number; status-only toggle works; error shape mapped.
- [ ] Validate returns candidates and classification for an NY or CA address.
- [ ] Rate `Shoptimeintransit` returns multiple services; `NegotiatedRatesIndicator` + account number yields `NegotiatedRateCharges`; transit times present.
- [ ] Domestic Create returns a valid GIF (and ZPL) label binary plus the tracking number, no `GraphicImage` leak.
- [ ] International Create returns the label, tracking number, and the customs invoice PDF binary, with the commodity payload accepted.
- [ ] Version path params `v2409` (rating, ship), `v2` (address validation), `v1` (track) still accepted; record any drift.
- [ ] `requestDefaults.baseURL` resolves correctly from `$credentials.environment` in `n8n-node dev`, and the credential `test` request passes under valid App Credentials.
- [ ] International Create is accepted with shipper and consignee phone present (confirm whether UPS rejects cross-border without phone).
- [ ] GIF label returns without `LabelStockSize`/`HTTPUserAgent` issues; confirm whether GIF needs `HTTPUserAgent`.

## 16. Scaffolding contract

**Fix/replace in the existing scaffold:**

- Remove placeholder `nodes/Ups/resources/user` and `nodes/Ups/resources/company` and their entries in `Ups.node.ts`; add **three** resources — `Tracking{track}`, `Address{validate}`, `Shipping{getRates, create}` (decision 12.9). Update the `n8n` block to match.
- Change `Ups.node.ts` `requestDefaults.baseURL` to the environment expression `'={{ $credentials.environment === "production" ? "https://onlinetools.ups.com/api" : "https://wwwcie.ups.com/api" }}'` (the FedEx pattern; no static host, no derived credential property).
- Add the `environment` field to `UpsOAuth2Api` (sandbox default) and set `accessTokenUrl` as an expression on it: `'={{ $self["environment"] === "production" ? "https://onlinetools.ups.com/security/v1/oauth/token" : "https://wwwcie.ups.com/security/v1/oauth/token" }}'` (today it hardcodes production). Do not add a `baseUrl` property; the node reads `$credentials.environment` directly per the line above.
- Add the explicit credential `test` request (FR-003): a Track call against the environment-derived base URL, matching the FedEx credential's `test` shape.

**Verification blockers (must-fix; tie to SC-008 / FR-015):**

- `nodes/Ups/Ups.node.json` `"node"` is `"n8n-nodes-ups"` -> must be **`"n8n-nodes-ups.ups"`** (`<package>.<nodeName>`). This is the exact "wrong identifier format" that bounced the FedEx submission; do not repeat it.
- `.node.json` `credentialDocumentation` / `primaryDocumentation` URLs use `org/repo` placeholders -> set to `nodrel-dev/n8n-nodes-ups`.
- Node `displayName: 'Ups'` -> **`'UPS'`**; fix description/subtitle copy ("Interact with the Ups API" -> "UPS"). The brand is uppercase; reviewers flag it.
- `.node.json` `categories` `["Development", "Developer Tools"]` (scaffold default) -> **`["Utility"]`** (n8n has no Shipping category). **[VERIFY]** `Utility` is an accepted codex category value before relying on it.
- The credential's existing hidden `authentication: 'header'` is n8n's generic-OAuth2 "send credentials as header" setting, **not** the gotchas-§1 disambiguation parameter. Single-credential node; leave it — do not "fix" it.
- Fill the constitution placeholders (`__SERVICE__` = UPS, `__FULLNAME__` = `n8n-nodes-ups`, date, version 1.0.0) and add the UPS-specific notes (single credential, `/api` base, GET-per-track, international customs in v1, no PDF label).
- Fill the `CLAUDE.md` placeholders and point its imports at the new spec and `docs/n8n-gotchas.md`.

**Add (mirroring FedEx's supporting layer):** `specs/001-ups-node/spec.md` + `checklists/requirements.md`
(generated by Spec Kit), `CONTEXT.md` (section 3), `documentation.yaml` (operation -> local spec + endpoint

- version + enums, flagging verify items), `docs/n8n-gotchas.md` (carry the FedEx burns that still apply:
the `authentication` parameter rule, `incremental` OFF, `npm pack --dry-run`, scope handling), and the
vitest config + pure-core tests.

**Confirm already correct:** `package.json` name, `n8n-community-node-package` keyword,
`usableAsTool: true`. The `package.json` `n8n` block **must** be updated — its `nodes`/`credentials`
paths stay, but the resource change (decision 12.9) means the node's internal resource/operation tree
changes; re-verify the block after the rewrite.

## 17. Non-functional requirements

- **NFR-001 Zero runtime dependencies.** Built-in n8n HTTP helpers only; shared logic copied, not imported as a runtime package.
- **NFR-002 Declarative-first.** Programmatic only for label/forms binary extraction, rate flattening, and customs assembly; each documented.
- **NFR-003 Schema-verified fidelity (non-negotiable).** Every field/path/enum verified against `ups-api-documentation/*.yaml`; version params pinned and re-confirmed.
- **NFR-004 AI-Agent tool parity (non-negotiable).** Every operation tested via the normal and tool paths; any future multi-credential disambiguation uses a param named `authentication`.
- **NFR-005 Verify against live (non-negotiable).** Token exchange and each endpoint's entitlement confirmed through the running n8n path against CIE.
- **NFR-006 Secrets and provenance.** Secrets only in gitignored `.env.local`; never in logs, errors, or URLs; rotate on leak. Publish via GitHub Actions with npm OIDC Trusted Publishing.
- **NFR-007 Resilience.** Transient-error resilience via n8n's native **Retry On Fail** (workflow-level); selective 5xx/429 bounded backoff is **deferred** (a documented deviation from Constitution Principle 7 — see `docs/adr/0001-native-retry-over-backoff.md`, since declarative routing has no error-class-selective retry knob). Respect UPS rate limits.
- **NFR-008 Toolchain.** npm + the `n8n-node` CLI; **release-please** for version/CHANGELOG/release (was release-it; amended v1.2.0); lefthook + commitlint; Node >= 22.22 locally and Node 24 in all GitHub Actions; TypeScript `incremental` OFF; `npm pack --dry-run` before release; releases via the merged release-please PR (the workflow publishes with provenance), never raw local `npm publish`; do not modify the eslint config; `n8n.strict: true`.
- **NFR-009 Layout and pure cores.** One resource folder per operation group under `nodes/Ups/resources/`, files under 800 lines; pure cores as in section 9, unit-tested test-first.
- **NFR-010 English-only** interface and documentation.
- **NFR-011 Versioning.** Conventional commits; version and CHANGELOG via release-please; npm and GitHub in lockstep.

## 18. Success criteria

- **SC-001:** A user connects their UPS account and confirms it works without writing code.
- **SC-002:** All four operations return correct results against CIE with UPS test credentials and account number.
- **SC-003:** Track works for a single item and across many input items, with per-item failure reporting under Continue On Fail.
- **SC-004:** Domestic Create yields a printable label file in the selected format plus the tracking number on the first successful attempt; international Create additionally yields the customs invoice PDF binary.
- **SC-005:** Every failed request shows the actual UPS code and message.
- **SC-006:** A sandbox request never reaches production and vice versa, for both token and API calls.
- **SC-007:** With Continue On Fail, a single bad item is reported individually and the rest still process.
- **SC-008:** The package installs from the registry, works through normal and AI-Agent tool paths, and passes `@n8n/scan-community-package` with zero errors.

## 19. Assumptions

- The user has or can self-register a UPS developer account, App Credentials, and an account number; provisioning UPS access is outside this feature.
- The four operations define v1; the deferrals in section 2 are planned, not promised.
- Verification is manual against CIE (note the NY/CA validation limit); UPS publishes the CIE test data.
- The node targets n8n's credential and workflow model; users interact with it as a node.
- UPS negotiated pricing is tied to the user's account; rate amounts are whatever UPS returns, no markup.
- This is a separate package from the FedEx node; patterns are reused, code is copied, not shared as a runtime dependency.

---

## Appendix A: Driving Spec Kit

This brief is the source of requirements. Commit it in the repo (e.g. `internal/ups-node-build-brief.md`),
then run the Spec Kit commands below in order. Each argument is deliberately short: it points the agent at
this brief rather than restating it, so there is one source of truth. Run `/speckit.checklist` at any point;
run `/speckit.analyze` after `/speckit.tasks` to catch gaps before implementing.

**1. `/speckit.constitution`**

```
Fill the template at .specify/memory/constitution.md from ups-node-build-brief.md. Replace __SERVICE__
with UPS, __FULLNAME__ with n8n-nodes-ups, set today's date and version 1.0.0. Keep all twelve principles
and fold in the brief's auth contract (section 4), resolved decisions (12), UPS-vs-FedEx deltas (13), and
NFRs (17). Add one principle: international Rate and Ship including customs are in v1 scope; Landed Cost is
out of scope.
```

**2. `/speckit.specify`**

```
Build n8n-nodes-ups, a publishable n8n community node that talks directly to the UPS REST API so a
business uses its own account and negotiated rates with no aggregator. Treat ups-node-build-brief.md in
this repo as the source of requirements and write the spec from it: the four v1 operations and scope
(section 2), the user stories and acceptance scenarios (section 14), and the functional requirements
(section 11). Operations are Track, Validate Address, Get Rates, and Create Shipment, domestic and
international with customs, on a single OAuth credential with a sandbox/production switch. Write in terms
of user value and acceptance scenarios; defer API field names and technology to the plan, which will draw
on the brief's verified contracts. The decisions in section 12 are locked; do not reopen them.
```

**3. `/speckit.clarify`**

```
Decisions are locked in ups-node-build-brief.md section 12; do not reopen them. Only raise clarifications
for genuine gaps in the acceptance scenarios or field-validation rules the brief does not already answer.
```

**4. `/speckit.plan`**

```
Plan against ups-node-build-brief.md: the per-operation contracts and JSON paths (section 5), the customs
block (5.5), the enum reference (6), the error model (7), the n8n field inventory (8), the pure-core
signatures (9), and the binary handling spec (10). Honor the toolchain and scaffolding contract (16) and
the NFRs (17): npm and the n8n-node CLI, zero runtime dependencies, declarative-first. Pin version params
v2409, v2, v1. Every item in the verify-live checklist (15) is a gate.
```

**5. `/speckit.tasks`**

```
Order tasks Track, Validate, Get Rates, Create, simplest first. Each operation includes its pure-core unit
tests first (brief section 9), a CIE verify-live step (15), and an AI-Agent tool-path test before it is
done. International customs on Create is its own task group after domestic Create works.
```

**6. `/speckit.implement`**

```
Implement task by task in planned order. After each operation, stop at its verify-live gate and confirm
against CIE through the running n8n instance before continuing. No runtime dependency. Surface real UPS
errors. Keep the label and customs forms as binary, never base64 strings in JSON.
```

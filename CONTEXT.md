# n8n-nodes-ups

Ubiquitous language for the UPS community node: a single declarative n8n node that
talks directly to the UPS REST API (Track, Validate Address, Get Rates, Create Shipment)
on the user's own UPS account and negotiated rates, no aggregator in between.

## Language

**Shipment**:
The noun for the three shipment verbs (Track, Get Rates, Create). A Shipment contains
packages but is not itself a package.
_Avoid_: parcel, package, order.

**Address**:
The thing Validate acts on — standardized and classified residential vs commercial.
_Avoid_: location, destination.

**Resolution**:
Validate's verdict on an Address: `valid` (one clean match), `ambiguous` (several
Candidates to choose from), or `none` (unresolvable). Derived from UPS's
`ValidAddressIndicator` / `AmbiguousAddressIndicator` / `NoCandidatesIndicator` presence
flags. Validate returns one item carrying the Resolution, the input Classification, and a
`candidates[]` array — it does not fan out per candidate (unlike Get Rates per service).
_Avoid_: status, match.

**Classification**:
The residential-vs-commercial verdict (`0` UnClassified, `1` Commercial, `2` Residential).
Returned both for the input Address (top level) and per Candidate. When a Resolution is
`ambiguous` the top-level Classification is often `0`, so each Candidate carries its own.
_Avoid_: address type.

**Negotiated Rate**:
The price tied to the user's account number (`ShipperNumber`), from
`NegotiatedRateCharges.TotalCharge`. The node's reason to exist. Present only when
`NegotiatedRatesIndicator` and a valid account number were sent and the account is enabled
for it, so a service line's negotiated rate is **nullable**; the Published Rate is not. When
every line is null, Get Rates emits a Request Alert so the absence is never silent. Get Rates
and Create surface the Negotiated/Published pair in the **same money shape**
(`{amount, currency} | null`), via one shared helper, so they never disagree.
_Avoid_: account rate, our rate.

**Published Rate**:
UPS standard price for the same service, from `TotalCharges`, shown beside the
Negotiated Rate.
_Avoid_: list rate, retail rate.

**Label**:
The printable document from Create, emitted as n8n binary under the key `label` (GIF, ZPL,
EPL, SPL), never a base64 string in JSON.
_Avoid_: waybill, airbill.

**Customs Forms**:
The commercial-invoice documents UPS returns for an international shipment
(`ShipmentResults.Form`), emitted as an additional PDF binary under the key
`customsInvoice`.
_Avoid_: paperwork.

**App Credentials**:
The UPS Client ID and Client Secret (the OAuth `client_credentials` pair). Identify the
software, not the shipper.
_Avoid_: API account, login.

**Account Number / Shipper Number**:
The UPS account number (`ShipperNumber`); whose negotiated rates apply and who a
shipment bills to. Required for Get Rates and Create; irrelevant to Track and Validate.
_Avoid_: API account.

**Environment**:
Sandbox (CIE) or production. One credential field governing both the token URL and the
API base URL.
_Avoid_: mode, stage.

**Request Alert** (`requestAlerts`):
A non-fatal UPS alert that applies to a whole Get Rates request, not one service
(`RateResponse.Response.Alert[]`). Distinct from a per-service alert
(`RatedShipment[].RatedShipmentAlert[]`, carried in each service line's `alerts`). Get Rates
fans out to one item per service; request alerts attach to the first emitted item only, and
Get Rates always emits at least one item so they (and zero-service lanes) are never dropped.
_Avoid_: warning, error (these are not failures).

**Effective Origin**:
The country a shipment ships *from* for the purpose of deciding whether it is
international: `ShipFrom` country if ShipFrom is provided, otherwise `Shipper` country.
Compared against `ShipTo` country to gate customs (Create) and customs-value (Rate)
fields. The same rule is used in both operations so they never disagree. Realized as a
single shared runtime predicate (`isInternational`), enforced at the boundary — not as n8n
field visibility, which cannot compare two fields (see `docs/adr/0003`).
_Avoid_: source, sender country (when the ShipFrom-vs-Shipper distinction matters).

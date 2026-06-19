# Feature Specification: n8n-nodes-ups — Direct UPS REST API Node

**Feature Branch**: `001-ups-node`

**Created**: 2026-06-18

**Status**: Draft

**Input**: User description: "Build n8n-nodes-ups, a publishable n8n community node that talks directly to the UPS REST API so a business uses its own account and negotiated rates with no aggregator. Operations are Track, Validate Address, Get Rates, and Create Shipment — domestic and international with customs — on a single OAuth credential with a sandbox/production switch. Source of requirements: ups-node-build-brief.md (scope §2, user stories §14, functional requirements §11). The decisions in §12 are locked."

## User Scenarios & Testing *(mandatory)*

A logistics or operations team already pays for a UPS account with negotiated pricing.
Today, automating UPS inside n8n means routing through an aggregator (Shippo, EasyPost,
ShipStation) that adds markup, latency, and a second account to manage. This node lets the
team connect their **own** UPS account directly so every tracking lookup, address check,
rate quote, and label is authenticated as their account, returning their actual negotiated
cost with zero intermediary.

The node ships four operations. Each is an independently shippable slice of value and is
prioritized simplest-first so the connection and account plumbing is proven before the
hardest operation (label creation with international customs) is attempted.

### User Story 1 - Track a shipment (Priority: P1)

A logistics operator connects their UPS account and looks up a parcel's current status and
scan history by tracking number, so a downstream workflow step can branch on in-transit,
delivered, or exception.

**Why this priority**: Tracking is read-only and needs only the account connection (no
account number, no shipment data). It is the smallest unit of value, the fastest path to a
working node, and it proves the connection, the sandbox/production routing, and the
credential test before any write operation is attempted.

**Independent Test**: With a connected account and a valid tracking number, run Track alone
and confirm the workflow receives the latest status and activity history — no other
operation required.

**Acceptance Scenarios**:

1. **Given** a connected account and a valid tracking number, **When** Track runs, **Then** the workflow receives the latest status and the activity (scan) history.
2. **Given** an unknown or malformed tracking number, **When** Track runs, **Then** the operator sees the specific UPS reason, not a generic failure.
3. **Given** an invalid or missing connection, **When** any operation runs, **Then** the operator is told the connection is the problem and how to fix it.
4. **Given** the sandbox environment is chosen, **When** Track runs, **Then** the request goes to the UPS Customer Integration Environment (CIE), not production.
5. **Given** several input items each carrying a tracking number, **When** Track runs, **Then** the workflow receives a result per item and any unresolvable number is flagged on its own item without failing the rest.
6. **Given** the operator chooses a status-only result, **When** Track runs, **Then** the detailed activity history is suppressed and only the current status is returned.

---

### User Story 2 - Validate and classify an address (Priority: P2)

Before rating or shipping, the operator checks a recipient address for deliverability and
whether it is residential or commercial, and gets back the standardized form of the address.

**Why this priority**: Validation is also read-only and connection-only (no account number),
so it is a natural second slice. It de-risks downstream rating and shipping by catching bad
addresses early, and it stands alone as a useful address-cleansing step.

**Independent Test**: With a connected account and a resolvable address, run Validate alone
and confirm the operator receives standardized candidate(s) plus a residential/commercial
classification.

**Acceptance Scenarios**:

1. **Given** a resolvable address, **When** Validate runs, **Then** the operator receives the standardized candidate(s) and the residential/commercial classification.
2. **Given** an unresolvable address, **When** Validate runs, **Then** the operator receives an explicit "none" resolution and a clear reason.
3. **Given** an ambiguous address with multiple matches, **When** Validate runs, **Then** the operator receives the set of candidate addresses to choose from.

---

### User Story 3 - Get rate quotes (Priority: P3)

The operator supplies shipment details and their account number to receive service options
with negotiated prices, so a workflow can choose a service by cost or speed. Domestic and
international shipments are both supported.

**Why this priority**: Rating is the first operation that requires the account number and
real shipment details, and it returns the negotiated pricing that is the node's core reason
to exist. It depends on the connection being proven (US1/US2) but does not create anything,
so it precedes label creation.

**Independent Test**: With a connected account, a valid account number, and complete
shipment details, run Get Rates alone and confirm the operator receives a list of services,
each with the negotiated price (and published price where UPS returns it) and transit time.

**Acceptance Scenarios**:

1. **Given** a connected account, a valid account number, and complete details, **When** Get Rates runs, **Then** the operator receives a list of services, each with the negotiated price (and the published price where UPS returns it), currency, and transit time, as one result item per service.
2. **Given** no account number, **When** Get Rates runs, **Then** the operator is told the account number is required before the request is sent.
3. **Given** details UPS considers invalid, **When** Get Rates runs, **Then** the operator sees the specific UPS validation reason.
4. **Given** a cross-border shipment, **When** Get Rates runs, **Then** the operator can supply the origin/destination countries and the commodity value UPS requires, and receives international service options (transportation charges only; duty/tax estimation is out of scope).
5. **Given** UPS returns non-fatal alerts alongside rates, **When** Get Rates runs, **Then** those alerts are surfaced as warnings without failing the item.

---

### User Story 4 - Create a shipment and get a label (Priority: P4)

The operator generates a label by submitting shipment details, the account number, the
chosen service, and the label format — and for international shipments, the customs data —
and receives a downloadable label file plus the tracking number (and, for international, the
customs invoice document).

**Why this priority**: Creation is the hardest operation: it writes (creates a real
shipment), emits binary documents, and carries the international customs complexity. It is
sequenced last so every prerequisite — connection, account number handling, address shaping,
and rating — is already proven.

**Independent Test**: With a connected account, a valid account number, and complete
domestic details, run Create alone and confirm the operator receives a tracking number and a
label file attachment in the chosen format.

**Acceptance Scenarios**:

1. **Given** a connected account, a valid account number, and complete domestic details, **When** Create runs, **Then** the operator receives the tracking number and a label file attachment in the chosen format.
2. **Given** a chosen label format, **When** Create runs, **Then** the returned label file is delivered in that format and named recognizably (by tracking number), never as an encoded string inside the data.
3. **Given** complete international details with customs data, **When** Create runs, **Then** the operator receives the tracking number, the label, and the commercial-invoice document as a downloadable PDF attachment.
4. **Given** invalid or incomplete details — including missing required customs data on a cross-border shipment — **When** Create runs, **Then** no shipment is created and the operator sees the specific UPS validation reason.
5. **Given** no account number, **When** Create runs, **Then** the operator is told the account number is required before the request is sent.

---

### Edge Cases

- **Missing account number** on Get Rates or Create: rejected with a clear message before any request is sent to UPS.
- **Cross-border shipment missing required customs data** on Create: rejected at the boundary with a clear reason; no shipment is created.
- **Unresolvable or ambiguous address** on Validate: explicit "none" or candidate list, never a silent empty result.
- **Unknown or malformed tracking number**: the specific UPS reason is surfaced on that item; other items continue under Continue On Fail.
- **Sandbox vs production isolation**: a request made in one environment never reaches the other, for both authentication and API calls.
- **Non-fatal UPS alerts** on rating or shipping: surfaced as warnings without failing the item.
- **Address-validation coverage in sandbox (CIE)**: street-level validation results are only available for New York and California addresses; test data must reflect this limit.
- **Connection/auth failure** vs **request-validation failure**: the operator is told which kind of problem occurred, so they fix credentials vs fix input appropriately.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The node MUST let a user connect their own UPS account via their UPS application credentials and authenticate every request as that account, with no intermediary or aggregator.
- **FR-002**: The node MUST offer a choice of sandbox (CIE) or production environment, and route both authentication and every API request to the chosen environment.
- **FR-003**: The node MUST provide a credential test action that gives the user an immediate pass/fail result for their connection, without requiring an account number.
- **FR-004**: The node MUST keep the authenticated session alive and renew it automatically, with no per-request re-entry of credentials by the user.
- **FR-005**: Track MUST return the current status and detail for a tracking number, one tracking number per input item. Multiple items each carrying a tracking number MUST be processed individually, and any unresolved number MUST be reported on its own item under Continue On Fail without failing the rest. Detailed activity history is returned by default, with a toggle to return a lighter status-only result.
- **FR-006**: Validate MUST return standardized candidate address(es) and a residential/commercial classification, or an explicit "none" resolution when the address cannot be resolved.
- **FR-007**: Get Rates MUST return the available service options for the supplied details and account number, each with the published rate (always returned) and — when the account returns it — the negotiated rate, plus currency and transit time, and MUST present the result as one item per service rather than a single nested structure. When every service line lacks a negotiated rate, the node MUST surface a single request-level alert noting that no negotiated rates were returned (check account entitlement and account number).
- **FR-007a**: Get Rates MUST support both domestic and international shipments; international quoting MUST accept origin/destination countries and the commodity value UPS requires. Landed-cost duty/tax estimation is out of scope (transportation charges only).
- **FR-008**: Create MUST return the assigned tracking number and a label for both domestic and international shipments (single package per shipment in v1).
- **FR-008a**: Create MUST bill transportation charges to the configured account. In v1, international duties are not prepaid by the shipper, so they bill to the receiver (DDU).
- **FR-008b**: For an international shipment (where the effective origin country differs from the destination country), Create MUST collect and send the commercial-invoice customs data (commodity lines with description, quantity, unit value, unit of measure, and optional origin country and tariff/commodity code; reason for export; currency; terms of shipment; sold-to party) and MUST emit the returned customs document as a downloadable PDF attachment alongside the label.
- **FR-009**: Create MUST let the user select the label format from the formats UPS supports, and deliver the label as a downloadable file in that format named with the tracking number — never as an encoded string inside the data. (No PDF label option exists in the UPS API.)
- **FR-010**: Operations that need an account number (Get Rates, Create) MUST obtain it from configuration and MUST reject the request with a clear message if it is absent.
- **FR-011**: The node MUST never hardcode, default, or expose the client ID, client secret, account number, or environment URLs.
- **FR-012**: The node MUST surface UPS's specific error code and message, distinguishing input/validation problems from authentication/transport problems, and MUST surface non-fatal alerts as warnings.
- **FR-013**: The node MUST honor Continue On Fail, reporting per-item errors without failing the whole run.
- **FR-014**: The node MUST validate input at the boundary and fail fast before calling UPS, including enforcing the rule that international shipments require customs data.
- **FR-014a**: For Get Rates and Create, weight MUST be required and dimensions MUST be optional.
- **FR-014b**: The node MUST let the user select the weight unit (pounds default, kilograms) and dimension unit (inches default, centimeters) and send the selected units.
- **FR-015**: The package MUST be installable from the n8n community registry, MUST be usable as an AI-Agent tool, MUST pass the n8n community-package verification scan, and MUST ship a README covering credential setup and each operation.

### Key Entities *(include if feature involves data)*

- **UPS Account Connection**: the user's UPS application credentials plus the environment choice (sandbox or production). Sensitive; the basis of every operation.
- **Shipment Tracking Result**: the current status, plus optional activity (scan) history, for one tracking number.
- **Address Validation Result**: the standardized candidate address(es), a residential/commercial classification, and a resolvable/unresolvable indication.
- **Rate Quote**: a set of services, each with its service level, negotiated rate, published rate when returned, currency, and transit time.
- **Shipment / Label**: a created shipment carrying its tracking number(s), a label document, and — for international moves — the customs invoice document.
- **Customs Declaration**: the commodity lines, reason for export, terms of shipment, currency, and sold-to party required for a cross-border shipment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can connect their UPS account and confirm it works without writing any code.
- **SC-002**: All four operations return correct results against the UPS sandbox (CIE) using UPS test credentials and an account number.
- **SC-003**: Track works for a single item and across many input items, reporting per-item failures individually under Continue On Fail.
- **SC-004**: A domestic Create yields a printable label file in the selected format plus the tracking number on the first successful attempt; an international Create additionally yields the customs invoice as a downloadable PDF.
- **SC-005**: Every failed request shows the user the actual UPS code and message.
- **SC-006**: A sandbox request never reaches production and a production request never reaches sandbox, for both authentication and API calls.
- **SC-007**: With Continue On Fail enabled, a single bad item is reported individually and the remaining items still process successfully.
- **SC-008**: The package installs from the registry, works through both the normal node path and the AI-Agent tool path, and passes the n8n community-package verification scan with zero errors.

## Assumptions

- The user has, or can self-register, a UPS developer account, application credentials, and a UPS account number; provisioning UPS access is outside the scope of this feature.
- The four operations (Track, Validate Address, Get Rates, Create Shipment) define v1. The deferrals noted in the source brief (e.g. void/cancel, label recovery, landed cost, pickup, multi-package, DDP duty billing, reference/shipment-level tracking, international form types beyond the commercial invoice) are planned-only, not promised in v1.
- Verification is performed manually against the UPS Customer Integration Environment (CIE), which only returns street-level address validation for New York and California addresses; UPS publishes the CIE test data.
- The node targets n8n's credential and workflow model; users interact with it as an n8n node (and as an AI-Agent tool).
- UPS negotiated pricing is tied to the user's account; returned rate amounts are exactly what UPS returns, with no markup added by the node.
- This is a separate package from the existing FedEx node; proven patterns are reused and code is copied, not shared as a runtime dependency.

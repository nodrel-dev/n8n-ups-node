---
description: "Task list for n8n-nodes-ups — Direct UPS REST API Node"
---

# Tasks: n8n-nodes-ups — Direct UPS REST API Node

**Input**: Design documents from `/specs/001-ups-node/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: Test tasks ARE included. Constitution Principle 10 mandates **test-first** vitest unit
tests for the 12 pure transform cores, asserted against fixtures captured from the local UPS specs.
No other automated test layer is in v1 scope (live verification is manual via the Docker harness,
Principle 12 / quickstart.md gates).

**Organization**: Tasks are grouped by user story (P1→P4) so each operation is an independently
shippable, independently testable slice (spec §User Scenarios).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1=Track, US2=Validate, US3=Get Rates, US4=Create Shipment
- All paths are repo-root relative (single n8n community-node package, plan.md §Project Structure)

## Path Conventions

- Credential: `credentials/UpsOAuth2Api.credentials.ts`
- Node: `nodes/Ups/Ups.node.ts`, `nodes/Ups/Ups.node.json`
- Resources: `nodes/Ups/resources/<group>/`
- Pure cores: `nodes/Ups/core/<name>.ts`
- Tests: `test/core/<name>.test.ts`, fixtures in `test/fixtures/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bring the scaffold to the real package shape; wire the test toolchain.

- [X] T001 Delete scaffold example resources `nodes/Ups/resources/user/` and `nodes/Ups/resources/company/` (create.ts, get.ts, getAll.ts, index.ts) — Principle 1 / plan.md §16; the node ships only Tracking/Address/Shipping.
- [X] T002 In `tsconfig.json` set `"incremental": false` and remove any `tsBuildInfoFile` — Constitution Inherited Guardrails / gotchas §6 (external build-info ships an incomplete `dist`).
- [X] T003 [P] Add `vitest` to `devDependencies` and add `"test": "vitest run"` + `"test:watch": "vitest"` scripts in `package.json`; create `vitest.config.ts` at repo root (Node test env, `test/**/*.test.ts`).
- [X] T004 [P] Create the test layout: `test/fixtures/` and `test/core/` directories with a `test/fixtures/README.md` noting fixtures are captured from `ups-api-documentation/*.yaml` and CIE responses (Principle 10).
- [X] T005 [P] Create the pure-core directory `nodes/Ups/core/` with a placeholder `nodes/Ups/core/types.ts` holding the shared types from data-model.md (`TrackResult`, `Activity`, `Address`, `RateLine`, `Money`, `Product`, `InternationalForms`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Credential, node description shell, and the error core that EVERY operation depends on.

**⚠️ CRITICAL**: No user story (Phase 3+) can be completed until this phase is done.

- [X] T006 Implement the `UpsOAuth2Api` credential in `credentials/UpsOAuth2Api.credentials.ts`: `clientId`, `clientSecret`, `environment` (sandbox default / production); built-in `oAuth2Api` with `grantType: clientCredentials`, empty `scope`, `authentication: header`; token URL via `$self["environment"]` (`/security/v1/oauth/token`, NO `/api`); hidden generic-OAuth2 settings left intact (contracts/credential-test.md, Principle 6).
- [X] T007 Add the authenticated credential `test` to `credentials/UpsOAuth2Api.credentials.ts`: `GET /api/track/v1/details/{fixed 1Z placeholder}` against the environment-derived base URL; a Track "not found" counts as PASS, `401/403` → "Check your Client ID, Secret, and Environment" (ADR-0002, contracts/credential-test.md). `[VERIFY-LIVE]` not-found HTTP status decides whether a `responseCode`/`responseSuccessBody` rule is needed.
- [X] T008 Update `nodes/Ups/Ups.node.ts` description shell: three resources `Tracking` / `Address` / `Shipping`, `requestDefaults.baseURL` from `$credentials.environment` (includes `/api`), `usableAsTool: true`, leave hidden `authentication: 'header'` (Principle 11, contracts/*, research.md host-split guard).
- [X] T009 Update `nodes/Ups/Ups.node.json` node identifier to `n8n-nodes-ups.ups` (`<package>.<nodeName>`) and codex metadata; confirm `package.json` `n8n` block points at `dist/nodes/Ups/Ups.node.js` + `dist/credentials/UpsOAuth2Api.credentials.js` (Principle 3, constitution §UPS contract).
- [X] T010 [P] Test-first: `test/core/mapUpsError.test.ts` — asserts both envelope shapes (common `response.errors[]` AND Track's distinct `Response→response→ErrorResponse→errors[]→Error` chain), verbatim `code`/`message`, and classification auth(401/403) / input(other 4xx) / transient(5xx,429). Capture fixtures from contracts + `ups-api-documentation`. MUST FAIL first (ADR-0004, data-model.md).
- [X] T011 Implement `nodes/Ups/core/mapUpsError.ts` to pass T010: `(responseData, statusCode) → never` throwing `NodeApiError`; shared by all declarative ops. (Boundary failures use `NodeOperationError`, not this — data-model.md cross-field invariants.)

**Checkpoint**: Credential connects, node loads with three empty resources, `mapUpsError` green. Run `npm run lint` and the credential **Test** button (quickstart Gate 0) before starting stories.

---

## Phase 3: User Story 1 - Track a shipment (Priority: P1) 🎯 MVP

**Goal**: Look up a parcel's current status + scan history by tracking number, one number per input item, with per-item Continue-On-Fail.

**Independent Test**: With a connected account and a valid CIE tracking number, run Track alone → workflow receives latest status + activity history; an unknown number is flagged on its own item without failing the rest (quickstart Gate 1).

### Tests for User Story 1 (test-first — write and watch FAIL) ⚠️

- [X] T012 [P] [US1] `test/core/mapTrackStatus.test.ts` — asserts `TrackResult[]` shape, and that the `Status-only` toggle suppresses `activity[]` while `Detailed` keeps it (data-model.md, contracts/track.md). MUST FAIL first.

### Implementation for User Story 1

- [X] T013 [US1] Implement `nodes/Ups/core/mapTrackStatus.ts` to pass T012: `(trackResponse, { detail }) → TrackResult[]`, client-side `activity[]` suppression for Status-only.
- [X] T014 [US1] Implement `nodes/Ups/resources/tracking/track.operation.ts`: declarative routing `GET /api/track/v1/details/{inquiryNumber}` (one number per item, native iteration), params `trackingNumber` (required), `detail` (Detailed default / Status-only), `locale` (`en_US`); `ignoreHttpStatusErrors: true`; `postReceive` → `mapTrackStatus`, errors → `mapUpsError` (contracts/track.md).
- [X] T015 [US1] Create `nodes/Ups/resources/tracking/index.ts` exporting the `Tracking` resource + `track` operation, and wire it into `nodes/Ups/Ups.node.ts`.
- [ ] T016 [US1] Verify against CIE through the running node (quickstart Gate 1): status + activity returned; Status-only suppresses activity; unknown number → specific UPS reason on its item under Continue On Fail; record Track's error-envelope + not-found HTTP status `[VERIFY-LIVE]`.

**Checkpoint**: Track works standalone on the normal path — the MVP slice (SC-001, SC-003, SC-005, SC-007).

---

## Phase 4: User Story 2 - Validate and classify an address (Priority: P2)

**Goal**: Return standardized candidate address(es) + residential/commercial classification, or an explicit `none`.

**Independent Test**: With a connected account and a resolvable NY/CA address, run Validate alone → standardized candidate(s) + classification; unresolvable → explicit `none`; ambiguous → candidate set (quickstart Gate 2).

### Tests for User Story 2 (test-first — write and watch FAIL) ⚠️

- [X] T017 [P] [US2] `test/core/toXavAddress.test.ts` — asserts the `AddressKeyFormat` shape (`PoliticalDivision2`=city, `PoliticalDivision1`=state, `PostcodePrimaryLow`/`PostcodeExtendedLow`, `CountryCode`, `AddressLine[]`). MUST FAIL first (data-model.md).
- [X] T018 [P] [US2] `test/core/shapeCandidates.test.ts` — asserts `resolution` derived from Valid/Ambiguous/NoCandidates indicators, `classification` code 0/1/2, and that one item carries `candidates[]` (no fan-out). MUST FAIL first (contracts/validate-address.md).

### Implementation for User Story 2

- [X] T019 [P] [US2] Implement `nodes/Ups/core/toXavAddress.ts` to pass T017.
- [X] T020 [P] [US2] Implement `nodes/Ups/core/shapeCandidates.ts` to pass T018.
- [X] T021 [US2] Implement `nodes/Ups/resources/address/validate.operation.ts`: declarative routing `POST /api/addressvalidation/v2/3` (validation + classification), body `XAVRequest.AddressKeyFormat` via `toXavAddress`, `ignoreHttpStatusErrors: true`, `postReceive` → `shapeCandidates`, errors → `mapUpsError` (contracts/validate-address.md).
- [X] T022 [US2] Create `nodes/Ups/resources/address/index.ts` exporting the `Address` resource + `validate` operation, and wire it into `nodes/Ups/Ups.node.ts`.
- [ ] T023 [US2] Verify against CIE (quickstart Gate 2): NY/CA address → candidate(s) + classification; unresolvable → `none`; ambiguous → candidate set (never a silent empty result); record CIE NY/CA-only limit `[VERIFY-LIVE]`.

**Checkpoint**: Track AND Validate both work independently (SC-002).

---

## Phase 5: User Story 3 - Get rate quotes (Priority: P3)

**Goal**: Return service options with published + negotiated price, currency, transit time — one output item per service — for domestic and international shipments.

**Independent Test**: With a connected account, a valid account number, and complete details, run Get Rates alone → list of services each with price + transit, one item per service; missing account number rejected at the boundary (quickstart Gate 3).

### Tests for User Story 3 (test-first — write and watch FAIL) ⚠️

- [X] T024 [P] [US3] `test/core/toMoney.test.ts` — `(upsCharge) → {amount,currency} | null`; shared shape used by Rate + Create (data-model.md). MUST FAIL first.
- [X] T025 [P] [US3] `test/core/isInternational.test.ts` — Effective Origin (ShipFrom country else Shipper) ≠ ShipTo ⟺ international; shared predicate (ADR-0003). MUST FAIL first.
- [X] T026 [P] [US3] `test/core/toUpsAddress.test.ts` — Rate/Ship `Address` shape with optional `ResidentialAddressIndicator` (data-model.md). MUST FAIL first.
- [X] T027 [P] [US3] `test/core/flattenRates.test.ts` — `RateLine[]`, Published never null / Negotiated nullable via `toMoney`, per-service `alerts[]`, and the single request-level "no negotiated rates" alert when EVERY line is null (FR-007, contracts/get-rates.md). MUST FAIL first.

### Implementation for User Story 3

- [X] T028 [P] [US3] Implement `nodes/Ups/core/toMoney.ts` to pass T024 (shared core).
- [X] T029 [P] [US3] Implement `nodes/Ups/core/isInternational.ts` to pass T025 (shared core).
- [X] T030 [P] [US3] Implement `nodes/Ups/core/toUpsAddress.ts` to pass T026 (shared core).
- [X] T031 [US3] Implement `nodes/Ups/core/flattenRates.ts` to pass T027 (depends on `toMoney`).
- [X] T032 [US3] Implement `nodes/Ups/resources/shipping/getRates.operation.ts`: declarative routing `POST /api/rating/v2409/Shoptimeintransit`, container `PackagingType`, `NegotiatedRatesIndicator` + `ShipperNumber`; params `accountNumber` (required, boundary-reject via `NodeOperationError` if absent), addresses via `toUpsAddress`, `weight` (required) + `weightUnit` (lbs/kgs), `dimensions` optional + `dimensionUnit` (in/cm), customs-value group always visible + `notice` (required at runtime when `isInternational`); `ignoreHttpStatusErrors: true`; `postReceive` → `flattenRates` (fan-out one item per service), errors → `mapUpsError` (contracts/get-rates.md, FR-010/014/014a/014b).
- [X] T033 [US3] Create `nodes/Ups/resources/shipping/index.ts` exporting the `Shipping` resource with the `getRates` operation, and wire it into `nodes/Ups/Ups.node.ts`.
- [ ] T034 [US3] Verify against CIE (quickstart Gate 3): multiple services + transit times, one item per service; negotiated returns with account number (else single request-level alert); missing account number rejected before any UPS call; cross-border quote accepts origin/destination + commodity value; non-fatal alerts surface as warnings; record negotiated-rate `[VERIFY-LIVE]`.

**Checkpoint**: Track, Validate, AND Get Rates work independently. Shipping resource exists with one operation, ready for Create.

---

## Phase 6: User Story 4 - Create a shipment and get a label (Priority: P4)

**Goal**: Create a real shipment (single package v1), return tracking number + label binary in the chosen format; for international, also collect customs and emit the commercial-invoice PDF.

**Independent Test**: With a connected account, a valid account number, and complete domestic details, run Create alone → tracking number + label file attachment in the chosen format; international adds the customs invoice PDF (quickstart Gate 4).

### Tests for User Story 4 (test-first — write and watch FAIL) ⚠️

- [X] T035 [P] [US4] `test/core/buildCommodities.test.ts` — `(items, currency) → Product[]` for `InternationalForms.Product` (data-model.md). MUST FAIL first.
- [X] T036 [P] [US4] `test/core/buildInternationalForms.test.ts` — `FormType ["01"]`, `Contacts.SoldTo`, `ReasonForExport`, `TermsOfShipment`, `InvoiceNumber`, `CurrencyCode` (contracts/create-shipment.md). MUST FAIL first.
- [X] T037 [P] [US4] `test/core/extractLabel.test.ts` — `{ shipmentId, labels:[{ trackingNumber, base64, mime, filename }] }`, filename = tracking number, no base64 leak into JSON (FR-009). MUST FAIL first.
- [X] T038 [P] [US4] `test/core/extractForms.test.ts` — customs invoice `{ base64, mime:'application/pdf', filename }[]` (data-model.md). MUST FAIL first.

### Implementation for User Story 4

- [X] T039 [P] [US4] Implement `nodes/Ups/core/buildCommodities.ts` to pass T035.
- [X] T040 [US4] Implement `nodes/Ups/core/buildInternationalForms.ts` to pass T036 (depends on `buildCommodities`).
- [X] T041 [P] [US4] Implement `nodes/Ups/core/extractLabel.ts` to pass T037.
- [X] T042 [P] [US4] Implement `nodes/Ups/core/extractForms.ts` to pass T038.
- [X] T043 [US4] Implement `nodes/Ups/resources/shipping/create.operation.ts` (programmatic `execute()` — the one permitted exception, Principle 5): boundary guard (missing account number, or `isInternational` + missing customs → `NodeOperationError`, no UPS call); `POST /api/shipments/v2409/ship`, `RequestOption` hardcoded `nonvalidate` (not exposed), container `Packaging`, `PaymentInformation.ShipmentCharge` Type `01` BillShipper (international DDU, no Type 02); reuse `toUpsAddress` / `isInternational` / `toMoney`; assemble customs via `buildInternationalForms`; on response `extractLabel` → binary key `label` (filename = tracking number) and `extractForms` → binary key `customsInvoice`; UPS errors → `mapUpsError` (contracts/create-shipment.md, FR-008/008a/008b/009/010/014).
- [X] T044 [US4] Add the `labelFormat` param (GIF default; ZPL/EPL/SPL; no PDF label) and the international `customs` collection (commodity lines description*/quantity*/unitValue*/unitOfMeasure*, optional commodityCode/originCountry; reasonForExport, currency, termsOfShipment, soldTo) to `create.operation.ts`, and register `create` on the `Shipping` resource in `nodes/Ups/resources/shipping/index.ts`.
- [ ] T045 [US4] Verify against CIE (quickstart Gate 4): domestic GIF + ZPL label binary + tracking number, no `GraphicImage` leak into JSON; international label + tracking + customs invoice PDF; missing account number / missing customs → `NodeOperationError`, no shipment created; record GIF `HTTPUserAgent`/`LabelStockSize` need and cross-border phone requirement `[VERIFY-LIVE]` (SC-004).

**Checkpoint**: All four operations independently functional on the normal node path.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verification gates, packaging, docs — concerns spanning all stories.

- [ ] T046 Verify every operation through the AI-Agent **tool** path in the Docker harness (`scripts/harness.sh`, `n8n execute --id`), not just the normal path (Principle 11, quickstart Gate 5, SC-008).
- [X] T047 Pinned versions confirmed live (2026-06-19): `v2409` (rating → 200, ship → 200), `v2` (address validation → 200), `v1` (track → 200 with required headers). No drift (quickstart Gate 5, `[VERIFY-LIVE]` #9).
- [~] T048 `npm pack --dry-run` → **PASS** (2026-06-19): tarball is LICENSE + README + dist only (77 files, 28 kB; no source `.ts`, no `.env`). Scan is a **post-publish** gate — `npx @n8n/scan-community-package n8n-nodes-ups` 404s pre-publish because it fetches the *published* npm package, not local source (gotchas §6/§7, commit 98ec838). Re-run the scan after the first `npm run release`.
- [X] T049 [P] Write/refresh `README.md`: credential setup + each of the four operations + sandbox/production switch + AI-Agent tool usage (FR-015).
- [X] T050 [P] Confirm `vitest run` is green across all 12 cores and `npm run lint` is clean (Principle 3, Principle 10).
- [ ] T051 Run the full `quickstart.md` gate checklist end-to-end against CIE and check every `[VERIFY-LIVE]` box (Principle 12 — operation not done until its gate is checked).

---

## Implementation Notes (added during /speckit-implement)

### ⚠️ Architecture deviation — Create is declarative, not a programmatic `execute()`

The plan (Complexity Tracking) and ADR-0004 specify Create as the one **programmatic `execute()`**
operation, with Track/Validate/Rate declarative. During implementation this proved **infeasible in
n8n**: n8n bypasses the declarative `routing` engine entirely for any node that defines an `execute()`
method — so adding `execute()` for Create would have silently broken the three declarative
operations (their `routing`/`postReceive` would never run).

**Resolution (taken):** the node is **fully declarative** (no `execute()` method). Create realizes
the same required behaviour — international customs assembly and label/invoice binary extraction —
through its declarative `preSend` (build body + boundary `NodeOperationError` guards) and
`postReceive` (decode base64 → n8n binary via `this.helpers.prepareBinaryData`). This is **more**
aligned with Principle 5 ("Declarative Style Preferred"), not less; it only contradicts the *letter*
of ADR-0004's "programmatic execute". All 12 pure cores, boundary rules, billing, DDU, and binary
contracts are unchanged.

**Action for the maintainer:** update ADR-0004 / plan Complexity Tracking to reflect declarative
Create, or revisit if a future requirement truly needs `execute()` (which would force converting
ALL operations to programmatic).

Minor: `buildCommodities(items)` dropped the unused `currency` parameter (currency is a form-level
field in `buildInternationalForms`, never per-product in the UPS schema).

### Live CIE verification — session 2026-06-18 (direct REST probes + bug fixes)

Ran the token exchange and per-API entitlement probes directly against the UPS CIE
(`wwwcie.ups.com`) with real sandbox credentials, ahead of the through-n8n gates. Results:

- **Gate 0 entitlement (PASS):** one OAuth app's client-credentials token (Basic auth, empty
  scope, HTTP 200) is accepted by Track, Validate, Rate AND Ship — the single-app entitlement
  risk (gotchas §3) is cleared.
- **Track / Validate (API-confirmed):** Track `200` with full activity history; Validate `200`
  with a standardized NY candidate.
- **Get Rates — TWO blocking bugs found and fixed in `getRates.operation.ts`:**
  1. `Shoptimeintransit` requires `DeliveryTimeInformation` (else `111563`). **Fixed.**
  2. `Shoptimeintransit` requires `ShipmentTotalWeight` (else misleading `111546 "Invalid
     Weight"`). **Fixed.** UPS `Rating.yaml` marks it Required for the time-in-transit options.
  With both, CA→CA returned 8 services + published + negotiated charges + transit days.
- **Negotiated rates [VERIFY-LIVE] (PASS):** empty `NegotiatedRatesIndicator: ''` returns
  `NegotiatedRateCharges`; the node's existing value is correct.
- **Account-country constraint recorded:** Shipper address country must equal the account's
  registered country, else `111617` (Rate) / `120120` (Ship). Documented in gotchas §12.

### Live CIE verification — session 2026-06-19 (full four-endpoint smoke + Track bug)

Re-probed all four endpoints against CIE with the node's **exact** request bodies (built from the
compiled `dist` cores), and prepared the through-n8n harness workflows (`test/workflows/`).

- **Track — blocking bug found and fixed.** UPS Track v1 `400`s without `transId` +
  `transactionSrc` headers (`TV0011`/`TV0001`); with them → `200 DELIVERED`. This broke every Track
  call AND the credential Test (a Track probe). Fixed in `track.operation.ts` + the credential
  `test` (gotchas §13, ADR-0002/0004 amendments). Resolves VERIFY-LIVE #3/#4.
- **Validate / Get Rates — confirmed.** Validate `200` (`Valid` + classification); Rate `200` with
  10 services + transit days. Negotiated rates were account-dependent this run (published-only) —
  not a bug; VERIFY-LIVE #6 refined.
- **Create — confirmed (domestic) + account fact.** A **Canadian** domestic shipment (Toronto→
  Vancouver, service `11`) returned tracking + a 36 KB **GIF label**; GIF needed no
  `HTTPUserAgent`/`LabelStockSize` (VERIFY-LIVE #7 resolved). Sandbox account `0C395V` is
  **Canada-registered**: Rating is lenient on account-country but **Ship enforces it** and `120120`s
  any US shipper (gotchas §12). International Create (#8) remains open — covered by
  `test/workflows/05-create-international.json`.
- **Pinned versions** `v2409`/`v2`/`v1` all returned 200 — no drift (T047 done).

### Remaining open tasks are all manual live-verification gates (Principle 12)

T016, T023, T034, T045, T046, T051 require the running n8n/Docker harness (the UPS-side payloads are
now proven by the smoke above; these re-run them through the node). T048's
`@n8n/scan-community-package` requires the package to be **published** (it fetches from
registry.npmjs.org — confirmed 404 on the unpublished package); the local half (`npm pack
--dry-run`) passes: tarball = LICENSE + README + dist. T047 (pinned versions) is done.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (credential, node shell, `mapUpsError`).
- **User Stories (Phase 3–6)**: All depend on Foundational. Sequenced by priority P1→P4 (each builds confidence for the next per the spec's simplest-first rationale), but each is independently testable. US4 reuses `toUpsAddress`/`toMoney`/`isInternational` authored in US3, and `create` registers on the `Shipping` resource created in US3 (T033) — so US4 depends on US3.
- **Polish (Phase 7)**: Depends on the desired stories being complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational only. No dependency on other stories. — MVP.
- **US2 (P2)**: After Foundational only. Independent of US1.
- **US3 (P3)**: After Foundational. Creates the `Shipping` resource + shared cores (`toUpsAddress`, `toMoney`, `isInternational`).
- **US4 (P4)**: After Foundational; **soft-depends on US3** (reuses 3 shared cores + the `Shipping` resource folder). Functionally independent otherwise.

### Within Each User Story

- Core tests (test-first) MUST be written and FAIL before the matching core implementation (Principle 10).
- Cores before operation files; operation files before wiring into `Ups.node.ts`; live verify last.

### Parallel Opportunities

- Setup T003/T004/T005 in parallel.
- Foundational T010 (test) runs alongside T006–T009 (different files); T011 waits on T010.
- Within a story, all `[P]` test tasks run together, then all `[P]` core implementations run together (different files), then the operation file (single shared file) is sequential.
- With staff, after Foundational: US1 and US2 can proceed fully in parallel; US3 can start in parallel; US4 starts once US3's shared cores + `Shipping` index land.

---

## Parallel Example: User Story 3

```bash
# Write all four core tests first (must fail):
Task: "test/core/toMoney.test.ts"
Task: "test/core/isInternational.test.ts"
Task: "test/core/toUpsAddress.test.ts"
Task: "test/core/flattenRates.test.ts"

# Then implement the independent shared cores together:
Task: "nodes/Ups/core/toMoney.ts"
Task: "nodes/Ups/core/isInternational.ts"
Task: "nodes/Ups/core/toUpsAddress.ts"
# flattenRates.ts follows (depends on toMoney); then getRates.operation.ts; then wire index.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → Phase 2 Foundational (credential Test passes — quickstart Gate 0).
2. Phase 3 US1 Track.
3. **STOP and VALIDATE**: Track standalone against CIE (Gate 1). This is a demoable node.

### Incremental Delivery

Foundation → US1 (MVP) → US2 → US3 → US4, validating each story's quickstart gate before the next.
Each story adds an operation without breaking the prior ones.

### Notes

- [P] = different files, no incomplete-task dependency.
- The 12 pure cores are the only automated-test surface; everything else is verified live (Principle 12).
- Commit per task or logical group (conventional commits); version/CHANGELOG via release-it.
- Publish ONLY via `npm run release` (never raw `npm publish`); OIDC provenance (Principle 9, gotchas §7).

<!--
Sync Impact Report (1.1.0, 2026-06-18)
- Version change: 1.0.0 → 1.1.0 (MINOR: materially expanded Principle 10's normative core list)
- Modified principles: P10 Test-First — added `mapUpsError` (ADR-0004) and `toMoney` pure cores
- Added artifacts: docs/adr/0002 (credential-test not-found=pass), 0003 (runtime international
  trigger), 0004 (postReceive error mapping); spec FR-007 nullability corrected
- Templates requiring updates: none (test-first task shape already covers new cores)
- Follow-up: re-run /speckit.plan so downstream artifacts pick up the two new cores

Sync Impact Report (1.0.0, 2026-06-18)
- Version change: template (unratified) → 1.0.0
- Ratification: initial fill of the carrier-agnostic template for the UPS node (n8n-nodes-ups).
- Modified principles (placeholders → concrete + UPS-specific notes folded in):
  - P1 Single-Service Scope → scoped to UPS, four v1 operations named
  - P2 Zero Runtime Dependencies → unchanged in intent; ties to NFR-001
  - P3 TypeScript + n8n Guidelines + Linter Clean → scan target n8n-nodes-ups
  - P4 English-Only Interface and Documentation → unchanged (NFR-010)
  - P5 Declarative Style Preferred → named programmatic exceptions (NFR-002)
  - P6 Credentials Are First-Class and Never Hardcoded → single UpsOAuth2Api credential, environment-driven hosts (§4)
  - P7 Production-Grade Error Handling → documented deviation: native Retry On Fail (ADR-0001, decision 12.12, NFR-007)
  - P8 No Competition With n8n Paid Features → scoped to UPS
  - P9 Provenance Publishing → unchanged (NFR-006)
  - P10 Test-First for Transformation Logic → pure cores named (§9, NFR-002)
  - P11 AI-Agent Tool Compatibility → single-credential note (delta 13.1)
  - P12 Verify Against Live Behaviour → CIE gates referenced (§15)
- Added sections:
  - Principle 13: International Scope Boundary (international Rate/Ship + customs in v1; Landed Cost out)
  - "UPS-Specific Contract" section folding auth contract (§4), resolved decisions (§12), and UPS-vs-FedEx deltas (§13)
- Removed sections: none
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check is generic; no principle-specific gate to retrofit
  - ✅ .specify/templates/spec-template.md — no mandatory-section change required
  - ✅ .specify/templates/tasks-template.md — task categories already cover test-first + verify-live shape
- Follow-up TODOs: none (RATIFICATION_DATE set to 2026-06-18 per build brief)
-->

# Constitution: n8n-nodes-ups

> Spec Kit constitution. Non-negotiable principles for a verified n8n community node.
> Carrier/service-agnostic base, filled for UPS. Service-specific notes folded into each
> principle and the UPS-Specific Contract section below.
> Place at `.specify/memory/constitution.md`.

**Service:** UPS
**Ratified:** 2026-06-18
**Last Amended:** 2026-06-19
**Version:** 1.2.0

---

## Principle 1: Single-Service Scope (NON-NEGOTIABLE)
The package integrates exactly one third-party service: UPS. No other service, aggregator,
or unrelated utility. v1 ships a single declarative-style UPS node with four operations —
Track, Validate Address, Get Rates, Create Shipment — across three resources
(`Tracking`, `Address`, `Shipping`). A trigger node may ship alongside the main node;
nothing else. n8n's verification gate rejects multi-service packages.

## Principle 2: Zero Runtime Dependencies (NON-NEGOTIABLE)
Verified nodes may not declare run-time dependencies (NFR-001). All HTTP goes through n8n's
built-in helpers (`httpRequest` / `httpRequestWithAuthentication`). No vendor SDK, axios,
XML library, or SOAP client in `dependencies`. Dev-only deps are fine. Shared logic is
COPIED from the FedEx scaffold, never imported as a published runtime package.

## Principle 3: TypeScript + n8n Guidelines + Linter Clean (NON-NEGOTIABLE)
TypeScript, following n8n's node guidelines. `n8n.strict: true`. Must pass
`npx @n8n/scan-community-package n8n-nodes-ups` with zero errors. Built with the `n8n-node`
CLI. The node identifier in `Ups.node.json` MUST be `n8n-nodes-ups.ups`
(`<package>.<nodeName>`); the wrong-identifier format bounced the FedEx submission.

## Principle 4: English-Only Interface and Documentation
All parameter names, descriptions, help text, errors, and README content in English
(NFR-010).

## Principle 5: Declarative Style Preferred
Default to the declarative (routing-based) style. Track, Validate, and Get Rates use
declarative routing with a `postReceive` hook into a pure core. Programmatic `execute()` is
permitted ONLY for label/forms binary extraction, rate flattening, and international customs
assembly; each exception is documented (NFR-002). `RequestOption` on Create is hardcoded
`nonvalidate` and not exposed (decision 12.10).

## Principle 6: Credentials Are First-Class and Never Hardcoded
A single dedicated credential type (`UpsOAuth2Api`) covers all four UPS APIs — one OAuth app
entitles every endpoint (delta 13.1). It carries an `environment` field (sandbox default,
production) that drives BOTH hosts: the credential sets `accessTokenUrl` via
`$self["environment"]`, and the node sets `requestDefaults.baseURL` via
`$credentials.environment` (the FedEx-proven mechanism, ADR-0001) so token exchange and API
calls can never split hosts. The credential ships an explicit authenticated `test` request
(a Track call against the environment-derived base URL), not the token grant alone (FR-003).
No secret in logs, errors, URLs, or committed files. Never hardcode, default, or expose
Client ID, Client Secret, account number, or environment URLs (FR-011). Real secrets only in
a gitignored `.env.local`; rotate on any leak.

## Principle 7: Production-Grade Error Handling
Map UPS errors to clear, actionable n8n messages, surfacing the UPS `code` and `message`
verbatim via `NodeApiError` and distinguishing input/validation from auth/transport problems
(FR-012). Surface non-fatal `Alert[]` / `RatedShipmentAlert[]` as warnings without failing
the item. Honor `continueOnFail` with per-item errors (FR-013). Treat 4xx as input/auth, 5xx
and 429 as transient. v1 leans on n8n's native **Retry On Fail** for transience rather than
node-level error-class-selective backoff — a documented deviation from this principle's
"bounded retry with backoff" default (NFR-007, decision 12.12, `docs/adr/0001-native-retry-over-backoff.md`).

## Principle 8: No Competition With n8n Paid Features
Scope stays strictly within UPS operations.

## Principle 9: Provenance Publishing
Publish via GitHub Actions with a provenance statement (npm OIDC Trusted Publishing), no
long-lived token (NFR-006). Required for verification submissions from May 1, 2026.

## Principle 10: Test-First for Transformation Logic
Non-trivial transforms ship with vitest unit tests written before the implementation,
asserted against fixtures captured from the local specs. The pure cores (plain-in / plain-out,
no `IExecuteFunctions`) are: `toUpsAddress`, `toXavAddress`, `flattenRates`, `mapTrackStatus`,
`buildCommodities`, `buildInternationalForms`, `extractLabel`, `extractForms`,
`shapeCandidates`, `mapUpsError`, `toMoney` (§9, NFR-002). `mapUpsError` parses both UPS
error-envelope shapes (the common `response.errors[]` and Track's distinct schema) and
classifies by HTTP status (auth / input / transient) for `NodeApiError` (ADR-0004); `toMoney`
shapes a UPS charge into `{amount, currency} | null` and is shared by `flattenRates` and
Create so the two operations never disagree on money.

## Principle 11: AI-Agent Tool Compatibility (NON-NEGOTIABLE)
`usableAsTool: true`. Test every operation through both the normal path and the AI-Agent tool
path (NFR-004). UPS ships a single credential, so the gotchas-§1 disambiguation does not
apply; any FUTURE multi-credential node MUST disambiguate on a param named `authentication`,
never `operation`. The existing hidden `authentication: 'header'` is n8n's generic-OAuth2
"send as header" setting — leave it.

## Principle 12: Verify Against Live Behaviour, Not Docs Alone (NON-NEGOTIABLE)
Confirm the token exchange and every endpoint's entitlement with a real call on the
through-n8n path against the UPS Customer Integration Environment (CIE) before the matching
operation is done. Every item in the verify-live checklist (§15) is a gate, including:
single-app entitlement across all four APIs, pinned version params (`v2409` rating/ship, `v2`
address validation, `v1` track), Track's distinct error shape, the CIE NY/CA-only validation
limit, negotiated-rate return, and international Create accepting the customs payload and
phone. Scope and entitlement details misstate often enough that they can't be trusted blind.

## Principle 13: International Scope Boundary
International (cross-border) Rate and Ship are IN scope for v1, including the customs and
commodity data UPS requires: `InternationalForms` with a commodity `Product[]` array
(commercial Invoice / `FormType ["01"]` only), and the UPS-generated invoice returned as PDF
binary alongside the label (FR-007a, FR-008b, decisions 12.2–12.3). The international trigger
is Effective Origin (`ShipFrom` country, else `Shipper`) differing from `ShipTo` country; the
identical rule gates the Rate Customs Value group so Rate and Create never disagree.
Duties bill to the receiver (DDU; no Type 02 charge) in v1. **Landed Cost** duty-and-tax
estimation is OUT of scope — it is a separate UPS API; v1 rating returns transportation
charges only (FR-007a). DDP, multi-package, and form types beyond the Invoice are deferred
to v2.

---

## UPS-Specific Contract

This section folds the build brief's authentication contract (§4), resolved decisions (§12),
and the UPS-vs-FedEx deltas (§13) into binding constraints. The brief
(`ups-node-build-brief.md`) and `CONTEXT.md` remain the detailed source of requirements.

### Authentication (verified, §4)
- Token endpoint `POST /security/v1/oauth/token` (no `/api` segment); hosts `wwwcie.ups.com`
  (sandbox) and `onlinetools.ups.com` (production).
- `grant_type=client_credentials`, client id/secret as HTTP **Basic**, **empty scope**.
  Use n8n's built-in `oAuth2Api` with `grantType: clientCredentials`; do not hand-roll.
- API base URL includes `/api`; the token endpoint does not (delta 13.2).
- `environment` drives both URLs via the FedEx-proven expression mechanism (Principle 6);
  do NOT invent a derived `baseUrl` credential property.

### Locked decisions (§12; override notes in the brief)
1. Single package per shipment in v1.
2. International duties DDU (receiver-billed); DDP deferred.
3. International forms: commercial Invoice (`FormType ["01"]`) only; returned as PDF binary.
4. Label format GIF default; ZPL/EPL/SPL offered; **no PDF label** (delta 13.6).
5. Validate is a standalone `Address` resource.
6. Rates default to `Shoptimeintransit` (transit times come with the service list).
7. Inquiry-number tracking only; reference/shipment-level deferred.
8. Rate defaults: `PickupType.Code` 01, `PackagingType.Code` 02.
9. Three resources: `Tracking{track}`, `Address{validate}`, `Shipping{getRates, create}`;
   Track is one inquiry number per item (native iteration, Continue On Fail; delta 13.3).
10. Create `RequestOption` hardcoded `nonvalidate`, not exposed.
11. Track extras (`returnPOD`, `returnSignature`, `returnMilestones`) deferred; only the
    `detail` toggle ships (client-side `activity[]` suppression in `mapTrackStatus`).
12. Resilience via native Retry On Fail (ADR-0001; see Principle 7).

### UPS-vs-FedEx deltas to guard (§13)
One credential not two; base URL includes `/api`; Track is GET-per-number; transit folds into
rating via `Shoptimeintransit`; Validate uses request option 3 (CIE NY/CA only); no PDF label;
international customs is in v1; billing is `PaymentInformation.ShipmentCharge` Type 01
BillShipper (request-side container is `Packaging` in Ship, `PackagingType` in Rate); toolchain
is npm + **release-please** (amended 2026-06-19, v1.2.0; the package manager stays npm — only the
release tool changed, do not adopt pnpm).

---

## Inherited Engineering Guardrails
See `docs/n8n-gotchas.md` and the NFRs in the build brief (§17). Highlights: Node >= 22.22;
`incremental` OFF + `npm pack --dry-run`; releases via **release-please** (merge the release PR;
the workflow publishes with provenance), never raw local `npm publish`; OIDC provenance; do not
modify the eslint config; reviewers pull the latest npm version and require GitHub transparency;
Docker harness via `n8n execute --id`; all GitHub Actions pin Node 24. Layout: one resource
folder per operation group under `nodes/Ups/resources/`, files under 800 lines (NFR-009).
Versioning: conventional commits; version and CHANGELOG via release-please; npm and GitHub in
lockstep (NFR-011).

## Amendment Process
Version bump (semver) + dated entry + re-run `/speckit.plan` to re-check downstream artifacts.
MAJOR for backward-incompatible principle removals/redefinitions; MINOR for a new principle or
materially expanded guidance; PATCH for clarifications.

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-18 | Initial ratification: filled for UPS (n8n-nodes-ups); added Principle 13 (International Scope Boundary); folded in auth contract, locked decisions, deltas, and NFRs. |
| 1.1.0 | 2026-06-18 | Principle 10: added `mapUpsError` (ADR-0004) and `toMoney` to the test-first pure-core list (grill-with-docs design session). |
| 1.2.0 | 2026-06-19 | Release toolchain changed from release-it to **release-please** (reverses the §13 delta that forbade it). Package manager stays npm. Releases now flow through an auto-generated release PR + `release-please.yml` (publish with provenance gated on `release_created`). All GitHub Actions pinned to Node 24. NFR-008/NFR-011 and gotchas §7 updated accordingly. |

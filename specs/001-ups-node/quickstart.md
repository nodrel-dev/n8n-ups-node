# Quickstart: n8n-nodes-ups — Live Validation Guide

Proves the node end-to-end through the running n8n path against the UPS Customer Integration
Environment (CIE). Every checkbox is a Principle 12 / §15 verify-live gate; the matching operation
is not done until its box is checked. Details live in [contracts/](./contracts/) and
[data-model.md](./data-model.md).

## Prerequisites
- Node.js **>= 22.22** (gotchas §5); `@n8n/node-cli` >= 0.23.0.
- A UPS developer account, an OAuth app (Client ID + Secret), and a UPS account number.
- Secrets in a **gitignored `.env.local`** only — never committed (Principle 6, gotchas §10).
- UPS CIE test data (UPS-published tracking numbers; NY/CA addresses for Validate).
- **The Shipper address country in Rate/Create must match the country your UPS account is
  registered in**, or UPS rejects with `111617` (Rate) / `120120` (Ship) — verified CIE,
  gotchas §12. (E.g. a CA-registered account must rate/ship from a CA origin.)

## Setup
```bash
npm install
npm run lint          # n8n-node lint — must be clean (Principle 3)
npm run dev           # n8n-node dev — live node type is CUSTOM.ups (gotchas §4)
```
Configure the `UpsOAuth2Api` credential in n8n: Client ID, Secret, `environment = sandbox`. Hit
the credential **Test** button.

## Validation scenarios (run in priority order — connection proven before writes)

### Gate 0 — Connection
- [ ] Token exchange succeeds: Basic-header client credentials, **empty scope**,
      `grant_type=client_credentials` against `wwwcie.ups.com`.
- [ ] Single app's token accepted by Track, Validate, Rate, AND Ship (entitlement, gotchas §3).
- [ ] `requestDefaults.baseURL` resolves from `$credentials.environment`; credential **Test**
      passes under valid App Credentials (a Track "not found" counts as pass, ADR-0002).
- [ ] A sandbox request never reaches production and vice-versa (SC-006).

### Gate 1 — Track (US1)
- [ ] Returns current status + activity for a CIE tracking number; Status-only toggle suppresses
      `activity[]`.
- [ ] Unknown/malformed number → specific UPS reason on that item; other items continue under
      Continue On Fail (SC-003, SC-007).
- [ ] Track's distinct error envelope + not-found HTTP status recorded.

### Gate 2 — Validate Address (US2)
- [ ] NY or CA address → standardized candidate(s) + residential/commercial classification.
- [ ] Unresolvable → explicit `none`; ambiguous → candidate set (never a silent empty result).

### Gate 3 — Get Rates (US3)
- [ ] `Shoptimeintransit` returns multiple services with transit times; one output item per service.
      NOTE: requires BOTH `DeliveryTimeInformation` and `ShipmentTotalWeight` in the body or UPS
      400s (`111563` / misleading `111546`); the node now sends both (gotchas §12).
- [x] `NegotiatedRatesIndicator` + account number → `NegotiatedRateCharges` — **verified CIE
      2026-06-18**: CA→CA returned 8 services with published + negotiated charges + transit days
      via empty `NegotiatedRatesIndicator: ''`. When all null, one request-level alert appears (FR-007).
- [ ] Missing account number → rejected at boundary before any UPS call.
- [ ] Cross-border quote accepts origin/destination + commodity value; non-fatal alerts surface
      as warnings.

### Gate 4 — Create Shipment (US4)
- [ ] Domestic: valid GIF (and ZPL) label binary + tracking number; **no `GraphicImage` leak**
      into JSON; label filename = tracking number.
- [ ] International: label + tracking number + customs invoice **PDF** binary; commodity payload
      accepted; confirm shipper/consignee **phone** requirement.
- [ ] Missing account number, or international missing customs → `NodeOperationError`, no shipment
      created (SC-004).

### Gate 5 — Packaging & tool path
- [ ] Pinned versions `v2409` (rating, ship), `v2` (address validation), `v1` (track) accepted;
      record any drift.
- [ ] Every operation works through BOTH the normal node path AND the AI-Agent tool path
      (`usableAsTool: true`, Principle 11).
- [ ] `npx @n8n/scan-community-package n8n-nodes-ups` passes with zero errors.
- [ ] `npm pack --dry-run` → tarball is LICENSE + README + dist only (`incremental` OFF, gotchas §6).

## Done definition
All gates checked + lint clean + scan passes + verified through both paths in the Docker harness
(`n8n execute --id`, gotchas §9). No runtime dependency introduced.

# Implementation Plan: n8n-nodes-ups — Direct UPS REST API Node

**Branch**: `001-ups-node` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-ups-node/spec.md`

## Summary

Ship a single verified-targeted n8n community node (`n8n-nodes-ups.ups`) that talks
directly to the UPS REST API on the user's own UPS application and account number — no
aggregator. Four operations across three resources: `Tracking{track}`, `Address{validate}`,
`Shipping{getRates, create}`. One OAuth2 client-credentials credential (`UpsOAuth2Api`) with
an `environment` switch (sandbox CIE / production) that drives BOTH the token URL and the API
base URL via the FedEx-proven expression mechanism (ADR-0001 host-split guard).

Technical approach: **declarative-first**. Track, Validate, and Get Rates use declarative
routing with `ignoreHttpStatusErrors: true` + a `postReceive` hook into pure transform cores;
errors are reshaped by a shared `mapUpsError` (ADR-0004). Create is the one programmatic
`execute()` — it assembles international customs forms, calls UPS, and extracts label + customs
PDF as n8n binary. Transient resilience leans on n8n's native Retry On Fail (ADR-0001). The
international trigger is a runtime predicate `isInternational` (Effective Origin vs ShipTo),
not `displayOptions` field visibility (ADR-0003). All non-trivial transforms are pure
plain-in/plain-out cores, unit-tested test-first (Principle 10). Verification is manual,
through the running n8n path against the UPS CIE (Principle 12).

## Technical Context

**Language/Version**: TypeScript 5.9 (`n8n.strict: true`), targeting CommonJS / ES2019. Node.js
**>= 22.22** for the `@n8n/node-cli` toolchain (gotchas §5).

**Primary Dependencies**: **Zero runtime dependencies** (Principle 2, NFR-001). All HTTP via
n8n's built-in `httpRequest` / `httpRequestWithAuthentication` helpers and declarative
`routing`. `n8n-workflow` is a peer/dev dependency only. Dev-only: `@n8n/node-cli`, `eslint`,
`prettier`, `release-it` + conventional-changelog, `vitest` (to be added for the pure-core
tests), commitlint, lefthook.

**Storage**: N/A (stateless node; the only persisted state is the n8n-managed OAuth token and
the user's gitignored `.env.local` secrets).

**Testing**: **vitest** unit tests for the pure transform cores, written test-first against
fixtures captured from the local UPS specs (Principle 10). Manual live verification through a
Docker n8n harness driven headlessly via `n8n execute --id` against the CIE (gotchas §9,
Principle 12). Both the normal node path AND the AI-Agent tool path are exercised
(`usableAsTool: true`, Principle 11).

**Target Platform**: n8n (community node package), installed from the npm community registry;
runs wherever n8n runs (self-hosted / n8n Cloud once verified).

**Project Type**: Single project — an n8n community-node package (credentials + one node +
resource folders + pure cores + unit tests).

**Performance Goals**: None beyond UPS API latency; the node adds no measurable overhead. No
throughput target — it processes input items one at a time (Track is one inquiry number per
item; Get Rates fans out one item per service).

**Constraints**: No runtime deps; `incremental` OFF + `npm pack --dry-run` before release
(gotchas §6); files **< 800 lines**, one resource folder per operation group (NFR-009); publish
only via `n8n-node release` with OIDC provenance, never raw `npm publish` (Principle 9, gotchas
§7); secrets only in gitignored `.env.local` (Principle 6, gotchas §10); English-only interface
(Principle 4).

**Scale/Scope**: v1 = 4 operations, 3 resources, 1 credential, 11 pure cores. Single package,
single service (UPS). Single package per shipment; DDU international duties; commercial Invoice
form only. All deferrals (void/cancel, label recovery, landed cost, pickup, multi-package, DDP,
reference/shipment-level tracking, extra form types, Track extras) are out of v1 scope per the
spec Assumptions and constitution Principle 13.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.1.0. Re-checked post-design.*

| # | Principle | Gate status | How the plan satisfies it |
|---|-----------|-------------|---------------------------|
| 1 | Single-Service Scope | **PASS** | One service (UPS), one declarative node, 4 ops / 3 resources. No second service. Scaffold's `user`/`company` example resources are removed (§16). |
| 2 | Zero Runtime Dependencies | **PASS** | `dependencies: {}`; HTTP via built-in helpers only. No SDK/axios/XML/SOAP. FedEx logic is COPIED, not imported. |
| 3 | TS + n8n Guidelines + Linter Clean | **PASS (1 fix)** | `n8n.strict: true`; node id `n8n-nodes-ups.ups`. **Fix required:** `tsconfig.json` currently has `incremental: true` — must be OFF (gotchas §6, see Complexity Tracking). Must pass `npx @n8n/scan-community-package`. |
| 4 | English-Only | **PASS** | All params, help, errors, README in English. |
| 5 | Declarative Style Preferred | **PASS** | Track / Validate / Get Rates declarative + `postReceive`. Programmatic `execute()` ONLY for Create (label/forms binary, customs assembly), documented (ADR-0004). Create `RequestOption` hardcoded `nonvalidate`, not exposed. |
| 6 | Credentials First-Class, Never Hardcoded | **PASS** | Single `UpsOAuth2Api`; `environment` drives token URL (`$self`) and base URL (`$credentials.environment`); explicit authenticated `test` (Track probe, ADR-0002). No secret in logs/URLs/commits; `.env.local` only. |
| 7 | Production-Grade Error Handling | **PASS (documented deviation)** | `mapUpsError` surfaces UPS `code`/`message` verbatim, classifies auth vs input vs transient, honors Continue On Fail, surfaces alerts as warnings. Bounded backoff deferred to native Retry On Fail (ADR-0001). |
| 8 | No Competition With n8n Paid Features | **PASS** | Scope strictly UPS operations. |
| 9 | Provenance Publishing | **PASS** | GitHub Actions + npm OIDC Trusted Publishing; no long-lived token; publish via `n8n-node release`. |
| 10 | Test-First for Transformation Logic | **PASS** | 11 pure cores (incl. `mapUpsError`, `toMoney`) get vitest tests written BEFORE implementation, asserted on captured fixtures. |
| 11 | AI-Agent Tool Compatibility | **PASS** | `usableAsTool: true`; every op tested on normal AND tool path. Single credential → gotchas §1 disambiguation N/A; leave hidden `authentication: 'header'`. |
| 12 | Verify Against Live Behaviour | **PASS** | Every §15 verify-live item is a gate: single-app entitlement, pinned versions (v2409/v2/v1), Track error shape, CIE NY/CA limit, negotiated-rate return, international customs + phone. |
| 13 | International Scope Boundary | **PASS** | International Rate + Ship in scope with commercial Invoice (`FormType ["01"]`) customs + PDF binary; trigger is Effective Origin (`isInternational`); DDU. Landed Cost / DDP / multi-package / extra forms deferred. |

**Gate result: PASS.** One mechanical fix is tracked below (tsconfig `incremental`). No principle
is violated; the two deviations (native retry over backoff; programmatic Create) are
pre-documented in ADRs and explicitly permitted by Principles 5 and 7.

## Project Structure

### Documentation (this feature)

```text
specs/001-ups-node/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output — verify-live unknowns, decisions
├── data-model.md        # Phase 1 output — entities + pure-core type contracts
├── quickstart.md        # Phase 1 output — live CIE validation guide
├── contracts/           # Phase 1 output — per-operation request/response contracts
│   ├── credential-test.md
│   ├── track.md
│   ├── validate-address.md
│   ├── get-rates.md
│   └── create-shipment.md
├── checklists/          # (pre-existing)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
credentials/
├── UpsOAuth2Api.credentials.ts   # single OAuth2 client-credentials cred; environment switch; Track test
└── ups.svg

nodes/Ups/
├── Ups.node.ts                   # description: 3 resources, requestDefaults.baseURL from $credentials.environment
├── Ups.node.json                 # codex metadata; node id "n8n-nodes-ups.ups"
├── ups.svg / ups.dark.svg
├── resources/
│   ├── tracking/                 # Tracking { track } — declarative + postReceive → mapTrackStatus
│   │   ├── index.ts
│   │   └── track.operation.ts
│   ├── address/                  # Address { validate } — declarative + postReceive → shapeCandidates
│   │   ├── index.ts
│   │   └── validate.operation.ts
│   └── shipping/                 # Shipping { getRates, create }
│       ├── index.ts
│       ├── getRates.operation.ts # declarative + postReceive → flattenRates (fan-out one item/service)
│       └── create.operation.ts   # programmatic execute(): isInternational guard, build forms, extract binary
└── core/                         # pure plain-in/plain-out cores (NFR-002 / Principle 10), each < 800 lines
    ├── toUpsAddress.ts
    ├── toXavAddress.ts
    ├── flattenRates.ts
    ├── mapTrackStatus.ts
    ├── buildCommodities.ts
    ├── buildInternationalForms.ts
    ├── extractLabel.ts
    ├── extractForms.ts
    ├── shapeCandidates.ts
    ├── mapUpsError.ts
    ├── toMoney.ts
    └── isInternational.ts        # shared Effective-Origin predicate (ADR-0003)

test/                             # vitest, test-first; fixtures captured from local UPS specs
├── fixtures/
└── core/*.test.ts                # one suite per pure core

docs/
├── n8n-gotchas.md
└── adr/0001..0004*.md
```

**Structure Decision**: Single n8n community-node package. The declarative resources live under
`nodes/Ups/resources/<group>/` (one folder per operation group, NFR-009); all non-trivial logic
is extracted into pure cores under `nodes/Ups/core/` so it is unit-testable without
`IExecuteFunctions` and shared between operations (e.g. `toMoney` by both `flattenRates` and
Create; `isInternational` by both Rate and Create). The scaffold's `user`/`company` example
resources are deleted and the `Ups.node.ts` resource list + `package.json` `n8n` block updated to
the three real resources (§16 scaffolding contract).

## Complexity Tracking

> Only the items below deviate from a strict reading of the constitution; each is justified
> and either pre-documented in an ADR or a one-line mechanical fix.

| Violation / deviation | Why needed | Simpler alternative rejected because |
|-----------------------|------------|--------------------------------------|
| `tsconfig.json` `incremental: true` must flip to `false` (no `tsBuildInfoFile`) | Gotchas §6 / Principle-3 build correctness: an external build-info file survives `rimraf dist` and ships an incomplete `dist` that fails at load | Leaving it on is not an option — it is a known release-breaking trap; this is a one-line fix, not added complexity |
| Programmatic `execute()` for Create only | Label + customs-invoice binary extraction and international `InternationalForms` assembly cannot be expressed in declarative routing (Principle 5 explicitly permits these exceptions) | Pure declarative cannot decode base64 → n8n binary nor assemble nested customs; documented in ADR-0004 and Principle 5 |
| `ignoreHttpStatusErrors: true` on declarative ops | UPS `code`/`message` must be surfaced verbatim and classified; n8n's default buries them and `postReceive` doesn't run on non-2xx | Default error surfacing fails SC-005; the ignore-flag + `mapUpsError` is the n8n-idiomatic fix (ADR-0004) |
| Native Retry On Fail instead of selective 5xx/429 backoff | Declarative routing has no error-class-selective backed-off retry knob; converting 3 ops to programmatic for marginal gain is unjustified | Full declarative→programmatic conversion defeats NFR-002; documented in ADR-0001 |

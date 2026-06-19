# Phase 0 Research: n8n-nodes-ups

Consolidates the technical decisions and the open `[VERIFY-LIVE]` unknowns. "Decided" items
are settled by the constitution, the build brief §12 locked decisions, or the ADRs. "Verify-live"
items are gates that MUST be confirmed through the running n8n path against the UPS Customer
Integration Environment (CIE) before the matching operation is marked done (Principle 12, §15).

## Settled decisions

### Decision: Single OAuth2 client-credentials credential drives both hosts off `environment`
- **Rationale**: One UPS OAuth app entitles all four APIs (delta 13.1), so one credential type
  (`UpsOAuth2Api`) is correct. An `environment` field (sandbox default / production) sets the
  token URL via `$self["environment"]` and the node base URL via `$credentials.environment`, so
  token exchange and API calls can never split hosts (FedEx-proven, Principle 6).
- **Alternatives considered**: Two credentials (one per environment) — rejected: a single app
  works in both and a switch is the proven idiom. A derived `baseUrl` credential property —
  rejected by the constitution's explicit "do NOT invent a derived `baseUrl`".

### Decision: Declarative-first; programmatic only for Create
- **Rationale**: Track / Validate / Get Rates are read/quote operations expressible as
  declarative `routing` + a `postReceive` hook into pure cores (Principle 5). Create writes,
  emits binary, and assembles customs — the three exceptions Principle 5 permits.
- **Alternatives**: All-programmatic — rejected (NFR-002 declarative-first). All-declarative —
  impossible for binary extraction + customs assembly.

### Decision: Error mapping via `ignoreHttpStatusErrors` + shared `mapUpsError` (ADR-0004)
- **Rationale**: n8n's declarative layer auto-throws a generic `NodeApiError` on non-2xx and
  `postReceive` runs only on success, burying UPS `code`/`message`. Setting
  `ignoreHttpStatusErrors: true` and routing every response through `mapUpsError` surfaces the
  UPS code/message verbatim (SC-005), classifies auth (401/403) vs input (other 4xx) vs
  transient (5xx/429), and flags per-item under Continue On Fail.
- **Alternatives**: n8n default surfacing — rejected, fails SC-005.

### Decision: Transient resilience via native Retry On Fail, not bounded backoff (ADR-0001)
- **Rationale**: Declarative routing has no 5xx/429-selective backed-off retry; UPS 4xx are
  deterministic so blind retries are wasteful not harmful. Deferring selective backoff avoids a
  full declarative→programmatic conversion for marginal v1 gain.
- **Revisit trigger**: production 5xx/429 frequent enough that fixed-wait retries amplify rate
  limits.

### Decision: International trigger is a runtime predicate `isInternational`, not `displayOptions` (ADR-0003)
- **Rationale**: `displayOptions` cannot compare two user-entered fields (`ShipFrom.country` vs
  `ShipTo.country`). Visibility is static (customs groups always shown as optional + a `notice`);
  requirement is runtime (`isInternational(input)` = Effective Origin vs ShipTo, enforced at the
  boundary before any UPS call, FR-014). One shared predicate used by both Rate and Create so
  they never disagree.

### Decision: Credential test = Track probe; "not found" is a PASS (ADR-0002)
- **Rationale**: An authenticated Track call (`GET /api/track/v1/details/{fixed placeholder}`)
  needs no account number and reaches UPS's Track business layer only after token + single-app
  entitlement clear. Reaching that layer = pass; 401/403 = fail. A fixed placeholder is
  "not found" in at least one environment, so not-found is treated as success.

### Decision: Pinned API versions and endpoints
- Track `GET /api/track/v1/details/{inquiryNumber}` (one number per call; native item iteration).
- Validate `POST /api/addressvalidation/v2/{requestoption}` with `requestoption = 3`
  (validation + classification; CIE returns street-level results for **NY/CA only**).
- Get Rates `POST /api/rating/v2409/{requestoption}` with `requestoption = Shoptimeintransit`
  (returns all services + transit; no `Service.Code` sent).
- Create `POST /api/shipments/v2409/ship`; `RequestOption` hardcoded `nonvalidate` (not exposed);
  `additionaladdressvalidation` query omitted.
- Token `POST /security/v1/oauth/token` (**no `/api` segment**); API base URL **includes `/api`**.

### Decision: Resource/operation shape and money invariant
- Three resources: `Tracking{track}`, `Address{validate}`, `Shipping{getRates, create}` (12.9).
- Get Rates fans out **one item per service**; Validate returns **one item** carrying the
  Resolution + `candidates[]` (does not fan out).
- Negotiated and Published rates share one money shape `{amount, currency} | null` via a single
  `toMoney` core, used by both `flattenRates` and Create, so they never disagree. Negotiated is
  nullable; when every service line is null, Get Rates emits one request-level alert.

### Decision: Label / customs binary
- Label emitted as n8n binary under key `label` (GIF default; ZPL/EPL/SPL offered; **no PDF
  label** — delta 13.6), filename = tracking number, never a base64 string in JSON.
- International customs invoice emitted as additional PDF binary under key `customsInvoice`
  (`FormType ["01"]` commercial Invoice only).

### Decision: Toolchain and build
- npm + **release-please** (amended 2026-06-19, constitution v1.2.0; was release-it). Package
  manager stays npm; releases flow through an auto-generated release PR + `release-please.yml`.
- `incremental` OFF (fix scaffold tsconfig); `npm pack --dry-run` before every release; tarball =
  LICENSE + README + dist only.
- Publish via GitHub Actions OIDC Trusted Publishing + provenance (configure the trusted
  publisher with the workflow filename, not its `name:`).

## `[VERIFY-LIVE]` unknowns (gates per §15)

Each is resolved by a real call against CIE; record the answer in the matching contract file and
check the box in `quickstart.md`. Status as of 2026-06-19 (raw-API probes with the node's exact
request bodies). **RESOLVED** = UPS-side behaviour confirmed; the through-n8n operation gates
(T016/023/034/045) still re-run these through the running node per Principle 12.

1. **Single-app entitlement** — ✅ **RESOLVED**: one token accepted by Track, Validate, Rate AND
   Ship (gotchas §3 risk cleared).
2. **Token exchange** — ✅ **RESOLVED**: Basic-header client credentials + empty scope +
   `grant_type=client_credentials` → HTTP 200 at `wwwcie.ups.com`.
3. **Track not-found HTTP status** — ✅ **RESOLVED**: CIE returns canned **200 `DELIVERED`** for any
   well-formed `1Z` (no real not-found path); bare credential test passes, no `rules` needed
   (ADR-0002 amendment). NOTE: Track first requires `transId`/`transactionSrc` headers or 400s.
4. **Track error envelope path** — ✅ **RESOLVED**: the observed envelope is the **common**
   `response.errors[]` shape (e.g. `TV0011`/`TV0001`), which `mapUpsError` already parses; no
   distinct Track chain needed (ADR-0004 amendment).
5. **Validate (CIE)** — ✅ **RESOLVED**: US CA address → `Valid` + classification; CIE does
   street-level for US NY/CA only.
6. **Negotiated rate return** — ✅ **RESOLVED (account-dependent)**: empty `NegotiatedRatesIndicator`
   is the correct trigger and transit times come back with `Shoptimeintransit`; whether
   `NegotiatedRateCharges` populate depends on the account's entitlement for the lane (absent ≠ bug;
   `flattenRates` emits the request-level alert).
7. **Domestic Create label** — ✅ **RESOLVED**: GIF label binary returned (36 KB base64) + tracking
   number; GIF did **not** need `HTTPUserAgent`/`LabelStockSize`. (ZPL not yet re-run through node.)
8. **International Create** — ⏳ **OPEN**: not exercised in the 2026-06-19 raw probes (domestic only).
   Covered by `test/workflows/05-create-international.json` for the through-n8n gate (T045).
9. **Version drift** — ✅ **RESOLVED**: `v2409` (rating, ship), `v2` (address validation), `v1`
   (track) all returned 200 — no drift (T047).
10. **Base URL resolution** — ⏳ **OPEN (through-n8n only)**: `$credentials.environment` →
    `requestDefaults.baseURL` and the credential **Test** button are exercised in the harness, not
    by raw probes. Verified in Gate 0 of the harness run.

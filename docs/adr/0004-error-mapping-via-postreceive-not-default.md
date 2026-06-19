# UPS error mapping lives in a postReceive mapper, not n8n's default error surfacing

**Status:** accepted

FR-012 and SC-005 require the node to surface UPS's specific `code` and `message` verbatim
and to distinguish input/validation from auth/transport problems. Track, Validate, and Get
Rates are declarative (Principle 5). n8n's declarative HTTP layer **auto-throws a generic
`NodeApiError` on any non-2xx**, and `postReceive` only runs on success — so by default there
is no hook to reshape the error, and the UPS `code`/`message` end up buried under a generic
"400 - Bad Request" top-line.

UPS error envelopes:
- Rate / Ship / Validate: `response.errors[]`, each `{ code, message }` (`ErrorMessage`).
- Track: also `response.errors[]` with `{ code, message }`, but via a different schema chain
  (`Response → response → ErrorResponse → errors[] → Error`); the exact path is **VERIFY-LIVE**.
  Track's not-found is a **404** carrying this envelope (the case the credential test in
  ADR-0002 relies on).

**Decision:** Set `ignoreHttpStatusErrors: true` on the declarative operations and route every
response through a single shared `mapUpsError(responseData)` core, called from each
operation's `postReceive`. It:
- parses `response.errors[]` → `{ code, message }`, with a Track-specific branch for its
  distinct envelope;
- throws `NodeApiError` carrying the UPS `code` + `message` verbatim (SC-005);
- classifies by `responseData.statusCode`: `401/403` → auth ("check Client ID / Secret /
  Environment"); other `4xx` → input/validation; `5xx`/`429` → transient (left to native
  Retry On Fail, ADR-0001);
- leaves boundary failures (missing account number, missing customs) to be thrown earlier as
  `NodeOperationError`, never `NodeApiError`;
- surfaces per-item under Continue On Fail (FR-013), so Track's 404 not-found flags one item
  without failing the run.

`mapUpsError` is a non-trivial transform (two envelope shapes + status classification), so it
is **added to the Principle 10 test-first pure-core list** and unit-tested before
implementation, asserted against captured error fixtures.

**Why it's acceptable:** `ignoreHttpStatusErrors` + `postReceive` is the n8n-idiomatic way to
map vendor errors in a declarative node; it keeps all operations declarative-first while
giving SC-005-grade control, and centralizes Track's distinct shape in one verify-gated
function.

**Consequence / revisit trigger:** A maintainer seeing `ignoreHttpStatusErrors: true` will
ask "why are we swallowing HTTP errors?" — the answer is here: the mapper owns surfacing. If
n8n adds a first-class declarative error hook, reconsider whether the ignore flag is still
needed.

---

## Amendment (2026-06-18): Create Shipment is declarative, not a programmatic `execute()`

**Status:** accepted — supersedes the "programmatic `execute()` for Create" language in the
plan (Complexity Tracking) and the earlier reading of Principle 5.

The plan and the original framing of this decision treated **Create** as the one operation
implemented with a programmatic `INodeType.execute()` method, with Track / Validate / Get Rates
left declarative. During implementation this proved **infeasible in n8n**:

> n8n runs a node through its declarative `routing` engine **only when the node type does NOT
> define an `execute()` method**. The moment a node defines `execute()`, n8n treats the whole
> node as programmatic and the declarative `routing` (request + `preSend` + `postReceive`) on
> every operation is ignored.

So an `execute()` method added for Create would have **silently broken** the three declarative
operations — their routing and the `mapUpsError` `postReceive` above would never run. The two
models cannot be mixed per-operation on one node.

**Decision:** the node is **fully declarative** — it has **no `execute()` method**. Create
realizes the behaviour Principle 5 reserved for a programmatic exception (international customs
assembly; label/invoice base64 → n8n binary) entirely within the declarative engine:

- a **`preSend`** hook assembles the `ShipmentRequest` body (via `buildInternationalForms` /
  `buildCommodities`) and enforces the boundary invariants — missing account number, or
  international-without-customs → `NodeOperationError` **before any UPS call** (FR-014);
- a **`postReceive`** hook runs `mapUpsError` on non-2xx (same `ignoreHttpStatusErrors: true`
  mechanism as above), then decodes the label and — for international — the commercial-invoice
  PDF into n8n binary via `this.helpers.prepareBinaryData` (`IExecuteSingleFunctions` exposes
  the binary helpers in the `postReceive` context).

**Why it's acceptable — and actually better:** this is *more* aligned with Principle 5
("Declarative Style Preferred"), not less: every operation now runs through one declarative
engine, and the error-mapping decision above ("keeps all operations declarative-first")
holds for Create too. `RequestOption` stays hardcoded `nonvalidate`, billing stays Type 01
BillShipper, international duties stay DDU, and all twelve pure cores are unchanged. The only
thing that changed is *where* the customs/binary code is invoked from (`postReceive`/`preSend`
instead of `execute()`).

**Consequence / revisit trigger:** if a future requirement genuinely needs `execute()` (e.g.
multi-call orchestration that declarative routing can't express), note that adding it would
force **all four** operations to become programmatic — a whole-node change, not a per-operation
one. Constitution Principle 5 and the build brief still say "programmatic `execute()` permitted
only for Create"; read that as "permitted for Create's binary/customs *behaviour*", which is
satisfied here declaratively.

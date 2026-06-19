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

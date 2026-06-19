# Credential test calls a UPS Track "not found" a pass

**Status:** accepted

FR-003 and Principle 6 require the credential to ship an explicit authenticated `test`
request (not just the token grant) so the n8n **Test** button gives an immediate pass/fail.
The chosen probe is a minimal Track call, `GET /api/track/v1/details/{fixed test number}`,
against the environment-derived base URL — Track needs no account number, so it tests the
connection without any shipment data.

The complication: the credential test runs against **whichever environment the credential
selects**, and a tracking number that resolves in sandbox (CIE) does not resolve in
production. We do not own an inquiry number that resolves in both. So the test cannot lean
on "the number resolves → 200 → pass"; a fixed number will be "not found" in at least one
environment.

**Decision:** The credential-test contract is **environment-agnostic**: reaching UPS's Track
business layer at all = **pass**; an OAuth/auth rejection (401/403) = **fail**. A UPS "not
found" is treated as a *success* signal, because that error is only reachable *after* the
token and the single-app entitlement (gotchas §3) have cleared. We use a fixed, documented
placeholder 1Z number and deliberately do not seek a resolvable one.

**Why it's acceptable:** The purpose of the test is to prove App Credentials + host +
entitlement, not to prove a parcel exists. "Not found" proves all three. Trying to use a
resolvable number would either break in production or force per-environment test branching
for no added confidence.

**Mechanism is VERIFY-LIVE:** Whether this works bare or needs n8n credential-test `rules`
depends on the HTTP status UPS returns for a not-found inquiry number — settle this against
CIE **before** finalizing the credential test:
- not-found returns **200 + error body** → n8n's default test passes; a bad credential's 401
  still fails. No `rules` needed.
- not-found returns **4xx** → add a `responseCode`/`responseSuccessBody` rule that accepts it
  with a friendly "credentials look valid" message, while 401/403 yields "Check your Client
  ID, Secret, and Environment."

**Consequence / revisit trigger:** If UPS changes Track's not-found status or restructures
entitlements so Track no longer proves the other APIs, reopen this and reconsider the probe
endpoint.

---

## Amendment (2026-06-19): VERIFY-LIVE mechanism resolved — bare test passes, but headers are required

Live CIE probing settled the mechanism question above:

- **CIE returns HTTP `200` (canned `DELIVERED`) for the placeholder `1Z00000000000000000`** — and
  for any well-formed `1Z`. So the **bare test passes with no `responseCode`/`responseSuccessBody`
  rule**: a valid token → `200`; a bad client id/secret or wrong environment → `401/403` → fail.
  This is the first branch the decision anticipated. There is no real "not found" path to special-
  case in CIE.
- **One correction:** the probe must send Track's required `transId` + `transactionSrc` headers, or
  it `400`s (`TV0011`/`TV0001`) **even with valid credentials** — which would make the Test button
  fail for the wrong reason. The credential `test` now sets a static pair (gotchas §13, ADR-0004
  amendment). Without this the whole "not-found = pass" reasoning never gets reached.

The decision stands: reaching Track's business layer = pass. In CIE that surfaces as a `200`, not a
not-found, but the auth-vs-reachability distinction the test relies on is intact.

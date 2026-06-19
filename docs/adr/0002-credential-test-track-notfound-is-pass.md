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

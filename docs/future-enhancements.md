# Future Enhancements

Deferred ideas that are **out of current v1 scope** but worth capturing. Each entry records
the motivation, a feasibility assessment against n8n's primitives, and the constitution
constraints any implementation must respect. Nothing here is committed work — promoting an
item requires the normal flow (spec → ADR if it's a real decision → constitution amendment if
it touches a Principle).

---

## FE-001 — Shipper Profiles (credential-style, cascade-fill)

**Status:** ✅ PROMOTED 2026-06-19 → [ADR-0005](adr/0005-optional-shipper-profile-credential.md);
constitution Principle 6 amended (v1.4.0). Implemented as the optional non-auth `UpsShipperProfile`
credential with a per-field runtime fallback merge (Design B below).
**Raised:** 2026-06-19 (UX review of the Create/Get Rates forms)
**Touches:** Principle 6 (credentials), Principle 1 (single-service scope), `shared.ts` address fields

> **Decisions taken at promotion (2026-06-19):**
> - **Data Tables are NOT usable in-node.** Verified against current n8n docs: a community node
>   cannot read a Data Table at run time (no node-code API; only the built-in Data Table node, the
>   REST API + key, or MCP can). So the profile store is a **credential**, not a Data Table.
> - **True editor cascade-fill remains impossible** in stock n8n (Option B below). Shipped behaviour
>   is runtime fill (values resolve at execution, not in the editor).
> - **Design B (per-field fallback merge) was chosen over an all-or-nothing selector** for UX
>   flexibility (field-level override). Precedence: explicit field > profile > default.
> - **Shipper `Country Code` default flips `US` → blank** (with `US` as the code-level fallback) so a
>   profile's country can override; only the Shipper block changes — Ship To / Ship From / Sold To
>   keep `US`. See ADR-0005 for the full rationale.

### The idea

Let users save reusable **Shipper profiles** — the normally-static shipper data — and pick one
from a dropdown that behaves like n8n's credential selector. Selecting a profile fills the
Shipper-side fields in one click:

- Account Number (`accountNumber` / `ShipperNumber`)
- Shipper Name, Address Line 1/2, City, State/Province, Postal Code, Country Code, Phone

So a user who ships from both a **Canada-registered** account (e.g. Toronto, `0C395V`) and a
**US** account can swap the entire shipper block — including the account number — in one
selection instead of re-typing eight-plus fields every time.

### Why it's worth doing

- Shipper data is **static and repeated** across every Create and Get Rates call; re-entering
  it is the single biggest source of form friction (see the UX audit).
- It mirrors a UX pattern users already understand from n8n **credentials** (select once, reuse
  everywhere).
- It directly supports a real operational need surfaced during live CIE testing: the account's
  registered country must match the Shipper country or UPS rejects with `111617` (Rate) /
  `120120` (Ship) — so quick, correct CAN↔US shipper swapping prevents a whole class of errors.

### Feasibility against n8n primitives (the hard part)

n8n does **not** natively "cascade-fill" visible parameter inputs from a selection. Credentials
are read at **runtime** via `$credentials`, not by populating editor fields. So there are two
distinct implementations, with different trade-offs:

**Option A — Profile as a second credential type (runtime fill). RECOMMENDED if pursued.**
- Add a `UpsShipperProfile` credential type holding the (non-secret-ish) shipper fields +
  account number. The node gains a second credential slot ("Shipper Profile", optional).
- At execution, a `preSend` merges the profile into the request **only where the matching
  Shipper field is left blank** (explicit field always wins). Reuses the existing
  `readAddress(get, 'shipper')` → `toUpsAddress` path; the profile just supplies fallbacks.
- ✅ Fully implementable with stock n8n, zero runtime deps (Principle 2 safe).
- ⚠️ The values are **not visible** in the form — the fields stay blank and fill server-side.
  Acceptable, but less discoverable than the user's mental model of "cascade fill".
- ⚠️ **Constitution tension:** Principle 6 mandates a *single* credential type (`UpsOAuth2Api`).
  A profile credential is non-secret config, not auth, so this needs an explicit ADR +
  Principle 6 amendment before implementation. Account number is semi-sensitive (not a secret,
  but not for logs); the credential store keeps it out of the workflow JSON, which is a plus.

**Option B — True editor cascade (populate the visible inputs on select).**
- This is the user's literal ask: pick a profile, watch the fields fill in.
- ❌ Not supported by stock n8n for community nodes — there is no API for a node parameter to
  write sibling parameter values in the editor. Would require a core n8n feature
  (`resourceMapper`-style write-back) that doesn't exist today. Track as an upstream ask;
  don't build a brittle workaround.

**Option C — `loadOptions`-backed profile picker (hybrid).**
- A `profile` dropdown whose options come from a `loadOptionsMethod`, plus a hidden/echoed
  summary. Still can't write sibling fields (same Option B limitation), so it degrades to
  Option A's runtime-fill behavior with a nicer picker. Only worth it if Option A ships first.

### Recommended shape (if/when promoted)

1. New optional credential `UpsShipperProfile` (name, account number, full address, phone).
2. Node adds an optional second credential slot; **explicit field > profile > empty**.
3. `preSend` fallback-merge in both `getRates` and `create` via the shared shipper reader, so
   the two operations can never disagree (same rationale as the existing shared `toUpsAddress`
   / `isInternational` cores).
4. Document the precedence and the "values fill at run time, not in the editor" caveat.

### Open questions

- Should `accountNumber` live in the profile, the OAuth credential, or stay a parameter? (It's
  not auth, but it is account-scoping — leans profile.)
- Does the AI-Agent tool path (Principle 11) resolve a second credential cleanly? Must be tested
  on both paths, like every operation.
- Profile-per-shipment only, or also a Ship-To / Sold-To profile later? Keep v1-of-this to
  Shipper to avoid scope creep.

### Constitution checklist before building

- [ ] Principle 6 amendment (second credential type) — **required**, via ADR.
- [ ] Principle 2 (zero runtime deps) — unaffected; built-in credential mechanism only.
- [ ] Principle 1 (single-service scope) — unaffected; still UPS-only.
- [ ] Principle 11 (AI-Agent tool path) — verify second-credential resolution on both paths.
- [ ] Principle 12 (verify live) — confirm CAN and US profiles produce accepted Rate + Ship
      calls against CIE before marking done.

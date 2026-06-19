# An optional non-auth `UpsShipperProfile` credential supplies reusable Shipper data

**Status:** accepted (promotes FE-001; amends constitution Principle 6, v1.4.0)

Shipper data (name, address, phone, and the UPS account number / `ShipperNumber`) is static and
repeated on every Get Rates and Create call. Re-typing eight-plus fields is the single biggest
source of form friction (UX audit, 2026-06-19), and getting the Shipper country wrong relative to
the account's registered country makes UPS reject the call (`111617` Rate / `120120` Ship). Users
who ship from both a Canada-registered and a US account need to swap the whole Shipper block —
account number included — quickly and correctly.

## What was considered

- **True editor cascade-fill** (pick a profile, watch the visible inputs populate): the literal
  user ask. **Not possible** in stock n8n — there is no API for one node parameter to write sibling
  parameters' values in the editor (confirmed against current n8n docs, 2026-06-19). Dead end until
  n8n ships a write-back primitive.
- **n8n Data Tables**: cannot be read from inside a community node at run time — the official docs
  state direct programmatic access from node code isn't supported (reachable only via the built-in
  Data Table node in a workflow, the REST API with an API key, or MCP). Using one would force the
  node to HTTP back into n8n's own API with a user-supplied key — brittle, an extra secret, against
  the intended pattern. Rejected as an *in-node* mechanism.
- **n8n Variables (`$vars`)**: instance-wide key-values referenced by expression. Rejected as the
  profile mechanism — the docs confirm variables are **flat strings, read-only, set only via the UI**
  (no structured profile object), they do **not bind to the node** (the user must hand-type
  `={{ $vars.x }}` into every field, so there is no "swap the block" UX), and Variables is gated behind
  a paid n8n plan, so a community node cannot depend on it being present (re-cross-checked 2026-06-19).
- **Runtime fill via a second credential** (chosen): the credential store is the n8n-native place
  for reusable, per-environment config, it keeps the account number out of the workflow JSON, and it
  is readable at run time via `getCredentials`.

## Decision

Add a SECOND, **optional**, **config-only** credential type `UpsShipperProfile` holding the Shipper
fields + account number. It has **no `authenticate` block and no `test`** — it never authenticates a
request. `UpsOAuth2Api` remains the only credential that authenticates UPS calls, so n8n's
multi-credential `authentication`-disambiguation (gotchas §1) does not apply.

**Merge model — per-field fallback, Shipper block only (Design B).** At run time each Shipper-side
value resolves with strict precedence:

```
explicit node field (non-blank)  >  profile field (non-blank)  >  built-in default
```

The profile is loaded once per item in the Get Rates / Create `preSend` via
`getCredentials('upsShipperProfile')` (absent or unset → treated as "no profile", silently
ignored). The fallback merge lives in **one shared helper** (`shared.ts`) called by both operations,
so Rate and Create can never disagree on the resolved Shipper — the same single-source rationale as
`toUpsAddress` / `isInternational` (ADR-0003) / `toMoney`. `accountNumber` becomes "required, but a
profile may satisfy it" rather than a required literal field.

**The Shipper country default change.** The Shipper `Country Code` field default flips from `US` to
**blank**, with `US` reinstated as the *final* code-level fallback in the merge. This is required so
a profile's country (e.g. `CA`) can win: with a `US` field default, n8n cannot distinguish "user
left the default" from "user typed US", so a profile could never override the country — defeating the
CAN↔US swap that motivates the feature. **Only the Shipper block changes**; Ship To / Ship From /
Sold To keep their `US` default untouched. Net behaviour for a non-profile user is identical (blank
Shipper country still resolves to `US`); the only visible change is that the Shipper country field is
no longer pre-filled with `US` (a placeholder communicates the `US` fallback).

## Why it's acceptable

- Additive and precedence-guarded: an explicit field **always** wins, so every existing workflow
  that fills the Shipper fields behaves identically. The profile only ever fills what was blank.
- Zero runtime dependency (Principle 2): built-in credential mechanism only.
- Single-service scope intact (Principle 1): still UPS-only.
- Account number in the encrypted credential store keeps it out of the workflow JSON — consistent
  with Principle 6's "never expose"; still never hardcoded.

## Consequence — Shipper fields are no longer hard-`required`

Because the profile must be able to supply the Account Number and Shipper address, those fields
**cannot** carry `required: true`: n8n's own field validation blocks execution on an empty required
field *before* `preSend` runs, which would make profile-only use impossible. So Account Number and
the Shipper Address Line 1 drop `required` and are enforced at run time instead — the Account Number
guard in each `preSend` still throws a clear `NodeOperationError` when neither the field nor a profile
supplies one, and UPS validates the rest of the address as before. Net effect: an existing workflow
that already fills these behaves identically; the only change is that the editor no longer shows the
red "required" nudge on Shipper Address Line 1.

## Accepted cost: the credential UI chrome (2026-06-19)

Choosing a credential means the node panel renders the profile with n8n's standard credential UI: a
"Credential"-style row with a picker dropdown and a **"Set up credential"** button. A second
credential-looking box is misleading because the profile is *config, not auth* (UX finding 2-Cred.3,
`docs/cognitive-load-audit.md`).

This is an **accepted, irreducible cost** of the mechanism. A re-cross-check of the n8n docs (2026-06-19,
on top of the cascade-fill / Data Tables / Variables analysis above) confirmed there is **no** n8n
primitive that is simultaneously *reusable across workflows* AND *bound to the node* without being a
credential: Variables don't bind and are gated/flat-string; Data Tables aren't readable in-node; plain
node parameters bind but aren't reusable and would put the account number in the workflow JSON in
plaintext (defeating the encryption rationale above). The credential is the **only** mechanism that
satisfies reusable + node-bound + encrypted, so its chrome comes with it. See gotchas §14.

**Mitigations applied — the most n8n allows:**
- The per-credential `displayName` on the node's `credentials[]` entry
  (`INodeCredentialDescription.displayName`) relabels the panel row from a generic "Credential" header to
  **"Shipper Profile (Optional)"**; the `upsOAuth2Api` entry keeps the default "Credential" header.
- The credential's own `displayName` is **"UPS Shipper Profile (Optional) API"** — the trailing `API` is
  forced by the `cred-class-field-display-name-missing-api` lint rule, so it can't be dropped — which also
  signals optionality in the credential picker.
- An in-form `notice` on the credential states it is optional and needs no API key.
- **NOT themeable:** the "Set up credential" button text and the picker dropdown are fixed n8n chrome —
  no node-level API changes them. Verified empirically in the live harness (n8n 2.25.7), not just from docs.

**Revisit trigger:** if n8n later exposes node-bound reusable config without credential chrome (or lets
node code read a Data Table / Variable at run time), revisit toward that and drop the second credential.

## Consequences / revisit triggers

- **Live-verify gate (Principles 11/12):** the node now carries two credentials. Second-credential
  resolution MUST be confirmed on BOTH the normal path and the AI-Agent **tool** path against the
  CIE — the tool path runs different credential-resolution code (gotchas §1). Confirm a CAN profile
  and a US profile each produce an accepted Rate + Ship before marking FE-001 done.
- Values fill at **run time, not in the editor** — inherent to credentials; documented in the README
  so a blank-field-that-becomes-a-value isn't a support surprise.
- If n8n later adds editor write-back, revisit toward true cascade-fill. If a second *auth*
  credential is ever added, the gotchas-§1 `authentication`-param disambiguation becomes mandatory
  (it is not needed here because the profile is non-auth).
- A Ship-To / Sold-To profile is deliberately **out of scope** for this ADR to avoid scope creep;
  Shipper only.

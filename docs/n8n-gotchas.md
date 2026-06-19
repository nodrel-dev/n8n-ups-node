# n8n Community Node Gotchas

Hard-won traps from shipping verified n8n community nodes. Carried forward so each
new node starts ahead. Keep this updated when a new trap costs you more than an hour.

## §1 — AI-Agent tool credential resolution

A node that passes as a normal node can still throw on the AI-Agent **tool** path,
because the two paths run different credential-resolution code. If a node carries two
or more credentials, disambiguate them with a node parameter literally named
`authentication` (matched on each credential's `displayOptions.show.authentication`).
Gating on `operation` works for normal runs but throws
`Could not get parameter: authentication` under tool execution. Set
`usableAsTool: true` and test **every** operation through both paths.
(Single-credential nodes avoid this entirely.)

## §2 — Auth scope is provider-specific

Don't trust the docs blind. Some providers reject an explicit scope; others require
an exact value. Confirm the live token exchange accepts the documented value before
locking it in.

## §3 — Entitlements may be per-API

One valid token can still 403 on an endpoint it isn't entitled for (e.g. per-project
keys). This reads like a phantom auth bug. Confirm whether one credential covers all
endpoints or whether they're separately entitled before designing credential
cardinality.

## §4 — Dev node type is `CUSTOM.<name>`

Under `n8n-node dev`, the live node type is `CUSTOM.<nodeName>`, not
`<package>.<nodeName>`. The published type only applies after npm install. Test
workflows must reference the right one.

## §5 — Dev environment

- Node.js must be **>= 22.22** (22.16 is rejected by `n8n-node dev`).
- `@n8n/node-cli` has no `--strict` flag. Strictness comes from `n8n.strict: true` in
  `package.json`, enforced by `n8n-node lint`. Strict mode is required for n8n Cloud
  verification.
- Use `@n8n/node-cli` >= 0.23.0 so the publish workflow can pass the provenance flag.

## §6 — Build: keep `incremental` OFF

No `tsBuildInfoFile`. An external build-info file survives `rimraf dist`, makes `tsc`
skip re-emitting, and ships an incomplete `dist` that fails at load with a
missing-module error. Always `npm pack --dry-run` and confirm the tarball is
LICENSE + README + dist only.

## §7 — Release & publish

- Publish via `n8n-node release` (which wraps release-it), **never** raw `npm publish`
  (a prepublish guard exits 1).
- Publish from GitHub Actions with **OIDC Trusted Publishing** + provenance — required
  for verification submissions from May 1, 2026. No long-lived token.
- Configure the Trusted Publisher with the workflow filename (e.g. `publish.yml`), not
  the workflow's `name:` field.
- A `404 PUT` on a scoped package usually means the publish ran unauthenticated.
- First-publish read-CDN propagation can lag ~5 minutes.

## §8 — Verification review pulls the latest npm version

The Creator Portal ties a submission to a version, but reviewers fetch the **latest**
published npm version at review time. Keep the latest fix on npm rather than trying to
swap the submitted version. n8n also picks up new npm versions automatically after
publish — but **the changes must be transparent in your GitHub repo** (tagged release +
changelog + pushed source) or they cannot verify the update. Keep npm and GitHub in
lockstep on every release.

## §9 — Test harness

The reliable harness is a Docker n8n container with the package installed, driven
headlessly via `n8n execute --id <workflowId>` on a separate broker port. The headless
chat webhook is unreliable for tool-path testing.

## §10 — Secrets hygiene

Secrets live only in a gitignored `.env.local`. Never hardcode them in code, docs, demo
scripts, or review videos. If one ever lands in a committed/pushed file, **rotate it**
in the provider portal — redacting isn't enough, since git retains orphaned commits by
SHA until GC.

## §11 — n8n public REST API limits (for harness tooling)

No node-types or execute endpoint on the public API. `PUT /workflows/{id}` needs the
full body and a strict `settings` object (send `{"executionOrder":"v1"}` only). The
credentials list endpoint never returns secret values.

## §12 — UPS Rating `Shoptimeintransit` needs two extra containers (verified CIE 2026-06-18)

`POST /api/rating/v2409/Shoptimeintransit` (the request option the Get Rates node uses to
get transit times) 400s unless the `RateRequest.Shipment` carries BOTH:

- `DeliveryTimeInformation: { PackageBillType: '03' }` — else error **`111563`** ("Delivery
  Time Information Container is required …"). 03 = non-document; 02 = document; 04 = pallet.
- `ShipmentTotalWeight: { UnitOfMeasurement: { Code, Description }, Weight }` — else error
  **`111546` "Invalid Weight"**, a **misleading** message: the weight is fine, the *container*
  is missing. UPS's `Rating.yaml` marks `ShipmentTotalWeight` **Required** for
  `ratetimeintransit`/`shoptimeintransit`. Note `UnitOfMeasurement` here requires `Description`
  (e.g. `"LBS"`), unlike `PackageWeight`. v1 is single-package, so total = package weight.

Plain `Shop`/`Rate` request options need neither container — only the time-in-transit variants
do. Don't trust the error text: `111546` reads like bad data but means a missing container.

Two more rating realities confirmed the same day:
- Empty `ShipmentRatingOptions.NegotiatedRatesIndicator: ''` DOES return `NegotiatedRateCharges`
  (presence of the tag is the trigger, not a `Y` value).
- The account's (`ShipperNumber`) registered country must equal the Shipper address country, or
  UPS rejects with **`111617`** (Rate) / **`120120`** (Ship), regardless of the rest of the payload.

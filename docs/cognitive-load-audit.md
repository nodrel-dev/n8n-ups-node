# Cognitive Load → Conversion Audit

> Surfaces audited: (1) the **UPS node parameter UI** in the n8n editor and (2) the **credential
> setup screens** (`UpsOAuth2Api`, `UpsShipperProfileApi`). Method: the cognitive-load-conversion
> framework — separate *intrinsic* load (shipping genuinely needs addresses, weights, customs data)
> from *extraneous* load (everything that taxes the user without moving them toward a working node).
> Date: 2026-06-19.

The node is functionally complete and well-commented. The findings below are **UX-only** — none are
correctness bugs. They target the moment a non-expert n8n builder opens the node or a credential and
has to figure out what to fill in.

---

## Surface 1 — Node Parameter UI

### Where the load actually is

The "form" a user fills out is the parameter panel. The two heavy operations are **Get Rates** and
**Create**:

| Operation | Approx. visible rows (domestic) | Genuinely needed (domestic) | Skippable noise |
|-----------|-------------------------------|-----------------------------|-----------------|
| Get Rates | ~28 | ~16 (Shipper, Ship To, Weight, Account) | ~9 — full Ship From block + 3 customs rows |
| Create    | ~40+ | ~23 | ~17 — Ship From block + Customs + Sold To block + Commodities |

For the **domestic majority**, roughly a third of the Create form is fields they must visually parse
and then ignore. That is the single biggest source of extraneous load in the node.

---

### 1. Extraneous Load Found

**1.1 — International customs fields are always visible to domestic users (HIGH)**
- *Get Rates* (`getRates.operation.ts:163-191`): the customs notice, **Customs Value**, and **Customs
  Currency** render for every shipment.
- *Create* (`create.operation.ts:381-481`): the customs notice, the **Customs** collection, the entire
  **Sold To** address block (7 fields), and the **Commodities** fixedCollection render for every
  shipment.
- A domestic US→US shipment never needs any of these, yet the user must scan and dismiss them. The
  code knows internationality at runtime (`isInternational`), but `displayOptions` can't key off a
  computed value — this is the deliberate tension recorded in **ADR-0003**.
- *Cost:* ~3 rows of noise in Rates, ~16 in Create, plus the "do these apply to me?" decision on every
  field.

**1.2 — Internal spec/API jargon leaked into user-facing descriptions (HIGH — easy win)**
These strings are shown verbatim to n8n builders who have never read the UPS API or the project spec:
- `create.operation.ts:379` — Label Format: *"No PDF label is offered **(delta 13.6)**."* — `delta 13.6`
  is an internal constitution reference.
- `validate.operation.ts:79` — City: *"City **(maps to PoliticalDivision2)**"*.
- `validate.operation.ts:88` — State/Province: *"...**(maps to PoliticalDivision1)**"*.
- `UpsShipperProfileApi.credentials.ts:37` — Account Number: *"...or UPS rejects the call **(111617
  Rate / 120120 Ship)**."*
- *Cost:* the brain has to process and discard terms that carry no meaning for the n8n user. Pure
  extraneous load, zero benefit. Fixable in minutes.

**1.3 — Full Ship From block always expanded though it is optional (MEDIUM-HIGH)**
- Rates `getRates.operation.ts:149-154` and Create `create.operation.ts:350-356` render all 6–7 Ship
  From fields inline, even though the hint says *"Optional. Defaults to the Shipper address when left
  blank."*
- Most users ship *from* the shipper address. Showing 7 always-empty fields they'll skip is clutter.
- **✅ RESOLVED (2026-06-20).** Shipped via progressive disclosure rather than a collection (Recipe C):
  a **Use a Different Ship-From Address** boolean (default `off`) now gates the flat Ship From block in
  both Rates and Create. Off → the seven fields stay hidden and the origin defaults to the Shipper
  (runtime unchanged — `hasShipFrom` stays false when the fields are blank/hidden). See Recipe C for why
  the toggle was preferred over the collection.

**1.4 — Always-on notice blocks (MEDIUM)**
- The Shipper-Profile notices (`getRates.operation.ts:135-142`, `create.operation.ts:334-341`) are long
  paragraphs shown to *every* user, including those who never attach a profile credential.
- *Cost:* a wall of explanatory text at the top of the form that most users don't need.

---

### 2. Mental Model Gaps

**2.1 — Service dropdown ordered by raw UPS code, not by likelihood (MEDIUM)**
- `create.operation.ts:300-328`: 28 options ordered `01, 02, 03, 07, 08, 11...`. Users think in plain
  terms ("Ground", "Overnight", "2-Day"), and the three most-used services (Ground 03, Next Day Air 01,
  2nd Day Air 02) are buried among obscure ones (UPS Today Intercity, Mail Innovations Returns). The
  names *do* carry the code in parentheses — good — but the ordering forces a scan of 28 to find the 3.

**2.2 — Label Format gives no guidance on an unfamiliar choice (MEDIUM)**
- `create.operation.ts:368-380`: options `EPL, GIF, SPL, ZPL` (alphabetical). A non-expert has no idea
  EPL/ZPL/SPL are thermal-printer formats and GIF is the screen/image default. The only description is
  the internal `delta 13.6` note (see 1.2). Users hit "which one do I pick?" with no answer on screen.

**2.3 — Country Code pre-fill is inconsistent across blocks (LOW)**
- Ship To / Ship From country default to `US` (`shared.ts:57`), but the Shipper block country shows
  **blank** with a `US` placeholder (`getRates.operation.ts:147`, `create.operation.ts:348`). To a user
  this reads as "why is one filled and one empty?" The reason is the profile-precedence mechanism
  (ADR-0005), but the inconsistency is visible and unexplained.

**2.4 — "Get Rates" returns many items from one input (LOW)**
- `getRates.operation.ts:196` describes the output but doesn't signal that one input item fans out to
  one output item *per service*. Users may be surprised by the row count. A half-sentence in the
  operation description would set the expectation.

---

### 3. Offloading Opportunities (ranked by conversion impact)

1. **Detect/declare international once, then hide the rest (HIGH).** Add a single explicit
   `Is International Shipment` boolean and gate the customs/Sold To/Commodities fields behind it via
   `displayOptions`. The runtime `isInternational` check stays as the authoritative safety net (so a
   mismatch still throws the existing clear error). This collapses ~16 Create rows for domestic users
   while preserving ADR-0003's runtime guarantee — the toggle controls *visibility*, not *logic*.
2. **Collapse the optional Ship From block (HIGH).** Move it under a collapsed `collection` ("Add Ship
   From override") so the default (= Shipper address) needs zero interaction.
3. **Already done well — keep:** Invoice Date defaults to today (`create.operation.ts:69`), weight unit
   / currency have sensible defaults, the Shipper Profile credential offloads re-typing the whole
   Shipper block + account number, and the credential **Test** buttons give instant pass/fail. These
   are textbook offloading — call them out as the pattern to extend, not change.

---

### 4. Priority Recommendations — Node UI

| # | Change | Cost removed | Impact |
|---|--------|--------------|--------|
| 1 | Strip internal jargon (`delta 13.6`, `PoliticalDivision1/2`, UPS error codes) from all user-facing `description` strings; keep them in code comments only. | Pure noise the brain must discard | **HIGH** (trivial effort) |
| 2 | Add an `Is International Shipment` boolean and gate Customs Value/Currency (Rates) + Customs/Sold To/Commodities (Create) behind it; keep `isInternational` as the runtime guard. | ~16 always-on rows for the domestic majority | **HIGH** |
| 3 | Collapse the optional **Ship From** block in both Rates and Create. ✅ **DONE (2026-06-20)** — shipped as a `Use a Different Ship-From Address` boolean toggle (progressive disclosure), not a collection (see Recipe C). | 6–7 always-empty fields | **MEDIUM-HIGH** |
| 4 | Reorder the Service dropdown to lead with Ground / Next Day Air / 2nd Day Air; add a one-line Label Format hint ("GIF = image; ZPL/EPL/SPL = thermal label printers"). | Scan-of-28 + unfamiliar-choice paralysis | **MEDIUM** |
| 5 | Shorten the always-on Shipper-Profile notices to one line, or move the detail behind the existing `documentationUrl`. | Wall of text at the top of every form | **MEDIUM** |

---

## Surface 2 — Credential Setup Screens

### `UpsOAuth2Api` (the one that authenticates)

The screen is **clean**: only `Environment` is visible; Grant Type, token URL, scope, and auth mode are
all `hidden` (`UpsOAuth2Api.credentials.ts:32-80`). The inherited `oAuth2Api` Client ID / Client Secret
fields render below. A live **Test** button (Track probe) gives immediate feedback. Good foundation.

**Findings:**

- **2-Cred.1 — No on-screen hint about *where* Client ID/Secret come from (MEDIUM-HIGH).** The number
  one credential-setup drop-off is "I don't know what to paste here." A first-time user must already
  know to create an app in the UPS Developer Portal. There is a `documentationUrl`
  (`:30`) which n8n renders as a help link — decent — but no inline framing. A short notice or a
  description on the Environment field pointing to "Create a UPS app at developer.ups.com to get your
  Client ID and Secret" would offload the biggest unknown at first run.
- **2-Cred.2 — `Sandbox (CIE)` default is correct, but the switch to Production is silent (LOW).** A
  user who tests in sandbox and forgets to flip Environment will hit production-vs-sandbox confusion.
  The description already explains it; consider surfacing the active host more prominently. Low.
- **Keep:** the authenticated Test button is excellent offloading — the user never has to guess whether
  their credentials work.

### `UpsShipperProfileApi` (optional, non-auth config)

9 flat fields, all optional (`UpsShipperProfileApi.credentials.ts:30-93`). An offline Test validates the
profile is internally usable.

**Findings:**

- **2-Cred.3 — The name "UPS Shipper Profile **API**" implies it needs API keys (MEDIUM — mental model).**
  This credential carries no secret, but the `API` suffix (an n8n lint convention, per the code comment
  at `:11`) plus the credential-picker presence makes a user think it's a second connection requiring
  keys. There's nothing on the screen telling them it's just reusable, non-secret config. Add a one-line
  notice: *"Optional. Stores reusable shipper details — no API key required. Fills the Shipper block
  automatically; explicit node fields always win."*
  - **✅ RESOLVED (2026-06-19).** Applied as far as n8n allows: in-form `notice` added (Recipe B);
    credential `displayName` → **"UPS Shipper Profile (Optional) API"** (trailing `API` forced by the
    `cred-class-field-display-name-missing-api` lint rule); and the node's per-credential
    `displayName` relabels the panel row header to **"Shipper Profile (Optional)"** instead of a second
    generic "Credential". **Residual (won't-fix, irreducible):** the "Set up credential" button + picker
    dropdown are fixed n8n chrome, so the row still *looks* like a credential — verified live (n8n
    2.25.7). A doc cross-check found no reusable + node-bound non-credential primitive, so the chrome is
    the accepted cost. Full rationale + revisit trigger recorded in **ADR-0005** ("Accepted cost: the
    credential UI chrome") and **gotchas §14**.
- **2-Cred.4 — UPS error codes in a setup field description (LOW-MEDIUM — clutter).**
  `UpsShipperProfileApi.credentials.ts:37` shows *"...UPS rejects the call (111617 Rate / 120120 Ship)."*
  to someone just entering their account number. Drop the codes; keep the actionable part: "must match
  the country registered for this account."
- **2-Cred.5 — "Test" on a non-auth credential is slightly off-model (LOW).** Clicking Test runs an
  offline validity check, not a connection test. The result message ("Shipper profile looks valid") is
  clear enough that this is acceptable — arguably a nice green-check — but note the minor expectation
  mismatch.
- **Keep:** keeping the account number in the encrypted credential store (out of workflow JSON) is the
  right call and a genuine offload — users configure it once and reuse it.

---

### Priority Recommendations — Credentials

| # | Change | Cost removed | Impact |
|---|--------|--------------|--------|
| 1 | Add a notice to `UpsShipperProfileApi` clarifying it's optional, non-secret config that fills the Shipper block. | "Do I need API keys here?" confusion | **MEDIUM** |
| 2 | Add an inline pointer on `UpsOAuth2Api` to the UPS Developer Portal for obtaining Client ID/Secret. | "What do I paste here?" first-run unknown | **MEDIUM-HIGH** |
| 3 | Remove UPS error codes (`111617`/`120120`) from the profile Account Number description. | Setup-screen noise | **LOW-MEDIUM** |

---

## What NOT to cut (intrinsic load — leave it)

- Address fields, weight, and dimensions on Rates/Create are the irreducible substance of shipping.
  The goal is to **present them cleanly**, not hide them.
- The customs/commodities data for international shipments is genuinely required by UPS — gate it behind
  the international toggle (rec #2), don't remove it.
- The credential **Test** buttons add a friction step that is a *feature*: they confirm setup before the
  user builds a whole workflow on broken credentials. Keep them.

## Suggested sequencing

1. **Jargon strip (Node rec #1 + Cred rec #3)** — minutes of work, pure win, no behavior change, no
   re-verification needed.
2. **Ship From collapse (Node rec #3)** and **credential notices (Cred recs #1, #2)** — low risk, no
   API-path change. ✅ Ship From collapse done 2026-06-20 (boolean toggle, Recipe C).
3. **International toggle (Node rec #2)** — the highest-impact change but touches `displayOptions` on
   ~16 fields across two operations; gate it behind the existing P11/P12 live-verify of both the normal
   and AI-Agent tool paths, since field visibility changes can interact with tool-path parameter
   resolution.

---

## Fix Recipes (context-aware)

Each recipe gives the exact location, the current code, the proposed change, and why it stays within
the project's hard constraints — the node is **fully declarative** (no `execute()`, ADR-0004), the n8n
lint rule requires literal `default`s, and any visibility change must survive the **P11/P12 tool-path**
live-verify. Recipes are ordered by the sequencing plan above (safest first).

### Recipe A — Strip internal jargon from user-facing descriptions

Pure string edits. No behavior, routing, or test impact. The internal references stay where they
belong: in code comments, not on the user's screen.

**A.1 — Label Format** (`nodes/Ups/resources/shipping/create.operation.ts:368-380`). Folds in the
Label-Format guidance gap (finding 2.2) at the same time:

```ts
// CURRENT
{
	displayName: 'Label Format',
	name: 'labelFormat',
	type: 'options',
	options: [
		{ name: 'EPL', value: 'EPL' },
		{ name: 'GIF', value: 'GIF' },
		{ name: 'SPL', value: 'SPL' },
		{ name: 'ZPL', value: 'ZPL' },
	],
	default: 'GIF',
	displayOptions: { show: showOnlyForCreate },
	description: 'Label image format. No PDF label is offered (delta 13.6).',
},

// PROPOSED — GIF (the default) leads; each option says what it's for; no internal "delta 13.6"
{
	displayName: 'Label Format',
	name: 'labelFormat',
	type: 'options',
	options: [
		{ name: 'GIF (Image — View or Attach Anywhere)', value: 'GIF' },
		{ name: 'ZPL (Zebra Thermal Printer)', value: 'ZPL' },
		{ name: 'EPL (Eltron Thermal Printer)', value: 'EPL' },
		{ name: 'SPL (Star Thermal Printer)', value: 'SPL' },
	],
	default: 'GIF',
	displayOptions: { show: showOnlyForCreate },
	description:
		'Label image format. GIF is a screen-friendly image; ZPL, EPL, and SPL are thermal label-printer formats. PDF labels are not available.',
},
```

*Safe because:* the stored `value`s (`GIF`/`ZPL`/`EPL`/`SPL`) are unchanged, so `extractLabel` and the
`labelSpecification` branch (`create.operation.ts:176-179`) behave identically. Option `name`s use
Title Case to satisfy the n8n display-name lint rule.

**A.2 — Validate City / State** (`nodes/Ups/resources/address/validate.operation.ts:79` and `:88`).
The `PoliticalDivision1/2` mapping is an implementation detail of `toXavAddress` — keep it in that
core's comments, not the field description:

```ts
// CURRENT  description: 'City (maps to PoliticalDivision2)',
// PROPOSED description: 'City',

// CURRENT  description: 'Two-letter state or province code (maps to PoliticalDivision1)',
// PROPOSED description: 'Two-letter state or province code',
```

**A.3 — Shipper Profile Account Number** (`credentials/UpsShipperProfileApi.credentials.ts:36-37`).
Drop the UPS error codes; keep the actionable instruction:

```ts
// CURRENT
description:
	'UPS account number (ShipperNumber). Must match the country registered for this account, or UPS rejects the call (111617 Rate / 120120 Ship).',
// PROPOSED
description:
	'UPS account number (ShipperNumber). Must match the country registered for this account, or UPS rejects the request.',
```

---

### Recipe B — Credential setup guidance

**B.1 — Tell first-time users where Client ID/Secret come from** (finding 2-Cred.1).
`credentials/UpsOAuth2Api.credentials.ts` — add a `notice` as the first property, above the
`Environment` field at `:33`:

```ts
properties: INodeProperties[] = [
	{
		displayName:
			'Create a UPS app at the UPS Developer Portal (developer.ups.com) to get your Client ID and Client Secret. Use the same UPS account whose number you ship with.',
		name: 'setupNotice',
		type: 'notice',
		default: '',
	},
	{
		displayName: 'Environment',
		// ...unchanged
```

*Safe because:* a `notice` property is display-only — it adds no field to the OAuth flow and does not
touch the inherited `oAuth2Api` Client ID/Secret rendering or the `test` request.

**B.2 — Clarify the Shipper Profile is optional, non-secret config** (finding 2-Cred.3).
`credentials/UpsShipperProfileApi.credentials.ts` — add a `notice` as the first property, above
`Account Number` at `:31`:

```ts
{
	displayName:
		'Optional. Stores reusable shipper details so you don\'t re-type them on every shipment — no API key required. An explicit field on the node always overrides what you set here.',
	name: 'profileNotice',
	type: 'notice',
	default: '',
},
```

*Safe because:* the credential is already non-auth (no `authenticate` block, offline `testedBy`); a
notice changes nothing about resolution in `loadShipperProfile`/`readShipper`.

---

### Recipe C — Collapse the optional Ship From block (finding 1.3)

> **✅ SHIPPED (2026-06-20) — as a boolean toggle, not the collection below.** A
> `Use a Different Ship-From Address` boolean (default `false`) now gates the existing flat Ship From
> `addressFields` block via `displayOptions` in both `getRates.operation.ts` and `create.operation.ts`.
> Off → the seven fields stay hidden and the origin defaults to the Shipper. The toggle was preferred
> over the collection (Option C-light) because it keeps the **flat field names unchanged**, so the
> `preSend` readers (`readAddress(get, 'shipFrom')`), the `hasShipFrom`/`effectiveShipFrom` fallback,
> Create's `shipFromName` → `AttentionName` path, and every existing test all stay as-is — zero reader
> change and zero field-shape change, which is lower-risk on the P11/P12 tool path than a collection.
> The recommendation below is retained for the record.

Ship From defaults to the Shipper address, yet renders 6–7 always-empty fields in both Rates and
Create. Move it into a collapsed `collection` so the default needs zero interaction. This is the most
invasive of the low-risk recipes because the **reader path changes** with the field names.

**Option C-light (recommended): a dedicated collapsed collection + a small reader.**
Replace the `addressFields({ prefix: 'shipFrom', ... })` call in each operation with a single
collection, and read it via a new helper in `shared.ts`:

```ts
// shared.ts — new helper that reads address sub-fields out of a collection value
export function readAddressCollection(
	get: ParamGetter,
	name: string,
): NormalizedAddressInput {
	const c = (get(name, {}) as Record<string, string>) ?? {};
	return {
		addressLines: [c.addressLine1, c.addressLine2].filter((l) => l && l.trim().length > 0),
		city: c.city ?? '',
		stateProvinceCode: c.stateProvinceCode ?? '',
		postalCode: c.postalCode ?? '',
		countryCode: c.countryCode ?? '',
	};
}

// getRates.operation.ts / create.operation.ts — replace the flat shipFrom block with:
{
	displayName: 'Ship From Override',
	name: 'shipFrom',
	type: 'collection',
	placeholder: 'Add Ship From Field',
	default: {},
	displayOptions: { show: showOnlyForRates }, // or showOnlyForCreate
	description: 'Optional. Defaults to the Shipper address when left empty.',
	options: [
		{ displayName: 'Address Line 1', name: 'addressLine1', type: 'string', default: '' },
		{ displayName: 'Address Line 2', name: 'addressLine2', type: 'string', default: '' },
		{ displayName: 'City', name: 'city', type: 'string', default: '' },
		{ displayName: 'State / Province Code', name: 'stateProvinceCode', type: 'string', default: '', placeholder: 'NY' },
		{ displayName: 'Postal Code', name: 'postalCode', type: 'string', default: '', placeholder: '10001' },
		{ displayName: 'Country Code', name: 'countryCode', type: 'string', default: '', placeholder: 'US' },
	],
},
```

Then in both `preSend`s, swap `readAddress(get, 'shipFrom')` for `readAddressCollection(get, 'shipFrom')`
and keep the existing `hasShipFrom`/`effectiveShipFrom` fallback logic
(`getRates.operation.ts:56-58`, `create.operation.ts:118-120`) **unchanged** — it already treats an
empty Ship From as "use the Shipper address."

*Safe because:* the collection defaults to `{}` and the reader passes a `{}` fallback, so a
dimension-style "Could not get parameter" throw can't occur (same discipline as `readPackage` at
`shared.ts:321-329`). The downstream effective-origin and `isInternational` logic is untouched. **Note:**
Create's Ship From currently also carries a Name (`includeName`) used for `AttentionName`
(`create.operation.ts:124,147`); add a `Name` option to the Create collection and read it so the
international AttentionName guard (120301) still fires. Verify on both paths (P11/P12) since field
shape changed.

---

### Recipe D — Reorder the Service dropdown (finding 2.1)

`nodes/Ups/resources/shipping/create.operation.ts:300-328`. Keep all 28 codes and the
`name (code)` format; only move the three highest-traffic services to the top so users stop scanning.
`default` stays `'03'`:

```ts
options: [
	// Most-used first
	{ name: 'Ground (03)', value: '03' },
	{ name: 'Next Day Air (01)', value: '01' },
	{ name: '2nd Day Air (02)', value: '02' },
	{ name: '3 Day Select (12)', value: '12' },
	// ...then the remaining codes in their current order (07, 08, 11, 13, 14, 17, 54, 59, 65, 70, 71, 72, 74, 75, 82, 83, 84, M2–M7)
],
```

*Safe because:* option order is presentation-only; stored `value`s and `default` are unchanged, so
`buildShipmentBody`'s `Service.Code` is identical. The "unlisted codes can be supplied via expression"
comment at `:298-299` still holds.

---

### Recipe E — Gate international customs fields behind a toggle (finding 1.1 — highest impact)

This is the headline change. ADR-0003 deliberately rejected `displayOptions` for internationality
because it is **computed** from the address countries, which aren't comparable at edit time. The
resolution: add a **manual declaration of intent** that controls *visibility only*, and keep the
runtime `isInternational` predicate as the **authoritative guard**. The toggle never feeds the request
body, so ADR-0003's logic is preserved — a genuine cross-border lane is still caught even if the user
leaves the toggle off.

**Step 1 — add the boolean** (place it after Label Format in Create, and after the Ship To block in
Rates):

```ts
{
	displayName: 'Is International Shipment',
	name: 'international',
	type: 'boolean',
	default: false,
	displayOptions: { show: showOnlyForCreate }, // or showOnlyForRates
	description:
		'Turn on to reveal the customs fields required when the origin and destination countries differ. The node still validates internationality from the addresses at run time, so a genuine cross-border shipment is caught even if this is left off.',
},
```

**Step 2 — gate the customs fields** by extending the `show` object. Define once per operation:

```ts
// getRates.operation.ts
const showOnlyForRatesIntl = { ...showOnlyForRates, international: [true] };
// create.operation.ts
const showOnlyForCreateIntl = { ...showOnlyForCreate, international: [true] };
```

Apply it to:
- **Rates** (`getRates.operation.ts:163-191`): the customs notice, **Customs Value**, **Customs
  Currency** → `displayOptions: { show: showOnlyForRatesIntl }`.
- **Create** (`create.operation.ts:381-481`): the customs notice, the **Customs** collection, the
  **Sold To** block (pass `show: showOnlyForCreateIntl` into `addressFields({ prefix: 'soldTo', ... })`),
  and the **Commodities** fixedCollection → same gated `show`.

**Step 3 — no reader changes, but harden the boundary error.** The `preSend` readers already pass
fallbacks (`get('customsValue', 0)`, `get('customs', {})`, `get('commodities.line', [])`), and n8n
returns a hidden parameter's default rather than throwing — so the request body is built identically
whether the fields are shown or hidden. The one rough edge is the mismatch case (user leaves the toggle
off but ships cross-border): the existing guards already fire with a clear message. Extend them to point
at the toggle:

```ts
// create.operation.ts:225-230
if (international && readCommodities(get).length === 0) {
	throw new NodeOperationError(
		node,
		'International shipments require at least one customs commodity line.',
		{
			description:
				'The origin and destination countries differ. Turn on "Is International Shipment" to reveal the Customs, Sold To, and Commodities fields.',
		},
	);
}
```

Do the same for the Rates customs-value guard (`getRates.operation.ts:61-70`).

*Safe because:* the `international` param is **read only by `displayOptions`**, never by a `preSend`, so
the runtime `isInternational(...)` predicate (`getRates.operation.ts:61`, `create.operation.ts:219`)
stays the single source of truth — fully consistent with ADR-0003. **Must verify (P11/P12):** confirm
on the **AI-Agent tool path** that the gated customs params still resolve to their defaults when hidden
— hidden-field resolution under tool execution is exactly the class of issue gotchas §1 warns about, so
run an international Create through `npm run harness` on both paths before calling this done.

---

### Recipe F — Trim the always-on Shipper-Profile notices (finding 1.4)

`getRates.operation.ts:135-142` and `create.operation.ts:334-341`. Shorten the paragraph to one line
and lean on the credential's own `documentationUrl` for detail:

```ts
// PROPOSED displayName for both notices
displayName:
	'Tip: attach a UPS Shipper Profile credential to auto-fill the Shipper fields and Account Number. Any value you type here overrides the profile.',
```

*Safe because:* notices are display-only; shortening the copy changes nothing in resolution.

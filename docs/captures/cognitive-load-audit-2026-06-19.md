# Capture — Cognitive Load → Conversion Audit (Node UI + Credentials)

## Provenance

- **Captured:** 2026-06-19
- **Source:** `cognitive-load-conversion` skill session; findings + fix recipes recorded in `docs/cognitive-load-audit.md`.
- **Subject:** UX audit of the UPS n8n node parameter UI and the two credential setup screens (`UpsOAuth2Api`, `UpsShipperProfileApi`), plus context-aware fix recipes (A–F) for the findings.
- **Cross-cutting notes (as stated by source):**
  - All findings are **UX-only — none are correctness bugs**.
  - Hard constraints every recipe must respect: the node is **fully declarative** (no `execute()`, ADR-0004); the n8n lint rule requires **literal `default`s**; option `name`s use **Title Case**; readers use the **`{}`-fallback discipline** from `readPackage` (`shared.ts:321-329`) to avoid "Could not get parameter"; any visibility change must survive the **P11/P12 tool-path** live-verify (`npm run harness`, gotchas §1).
  - International gating reconciles with **ADR-0003**: the toggle is a declaration of intent controlling **visibility only**; the runtime `isInternational` predicate stays the authoritative source of truth.
- **Recommended sequencing (verbatim from source):**
  1. **Jargon strip (Node rec #1 + Cred rec #3)** — minutes of work, pure win, no behavior change, no re-verification needed.
  2. **Ship From collapse (Node rec #3)** and **credential notices (Cred recs #1, #2)** — low risk, no API-path change.
  3. **International toggle (Node rec #2)** — highest-impact but touches `displayOptions` on ~16 fields across two operations; gate behind the existing P11/P12 live-verify of both normal and AI-Agent tool paths.

---

## Items

### Recipe A — Strip internal jargon from user-facing descriptions
- **Rating:** Node rec #1 — **HIGH** (trivial effort); also covers Cred rec #3 — **LOW-MEDIUM**.
- **Changes:** Pure string edits removing internal references from on-screen `description`s; values/routing unchanged.
- **Why:** Internal spec/API jargon taxes the brain to discard with zero user benefit; references belong in code comments, not the user's screen.
- **Anchors:**
  - `nodes/Ups/resources/shipping/create.operation.ts:368-380` — Label Format `"...No PDF label is offered (delta 13.6)."` (also folds in Label-Format guidance gap, finding 2.2; stored `value`s `GIF`/`ZPL`/`EPL`/`SPL` unchanged so `extractLabel` + `labelSpecification` branch `create.operation.ts:176-179` behave identically).
  - `nodes/Ups/resources/address/validate.operation.ts:79` — City `"(maps to PoliticalDivision2)"` (mapping detail of `toXavAddress`).
  - `nodes/Ups/resources/address/validate.operation.ts:88` — State/Province `"(maps to PoliticalDivision1)"`.
  - `credentials/UpsShipperProfileApi.credentials.ts:36-37` — Account Number `"(111617 Rate / 120120 Ship)"`.
- **Preconditions:** none stated (sequencing step 1).
- **Definition of done:** implied — descriptions carry no internal references; values unchanged.
- **Open questions:** none stated.

### Recipe B — Credential setup guidance
- **Rating:** Cred rec #2 — **MEDIUM-HIGH** (OAuth portal pointer); Cred rec #1 — **MEDIUM** (Shipper Profile notice).
- **Changes:** Add display-only `notice` properties at the top of each credential.
- **Why:** "What do I paste here?" is the #1 first-run credential drop-off (OAuth); "Do I need API keys here?" confusion on the non-auth profile (mental model).
- **Anchors:**
  - `credentials/UpsOAuth2Api.credentials.ts:33` — add `setupNotice` above `Environment` pointing to UPS Developer Portal (developer.ups.com) for Client ID/Secret. Display-only; does not touch inherited `oAuth2Api` fields or the `test` request.
  - `credentials/UpsShipperProfileApi.credentials.ts:31` — add `profileNotice` above `Account Number`: optional, no API key, explicit node fields override. Non-auth credential (no `authenticate`, offline `testedBy`); changes nothing in `loadShipperProfile`/`readShipper`.
- **Preconditions:** none stated (sequencing step 2).
- **Definition of done:** implied — each credential screen carries inline framing of where keys come from / that no keys are needed.
- **Open questions:** none stated.
- **✅ RESOLVED (2026-06-19) — finding 2-Cred.3.** Notices added; credential `displayName` →
  "UPS Shipper Profile (Optional) API"; node per-credential `displayName` relabels the panel row to
  "Shipper Profile (Optional)". Residual (irreducible): the "Set up credential" button/dropdown are fixed
  n8n chrome and can't be relabeled (verified live, n8n 2.25.7); no non-credential reusable+node-bound
  primitive exists. Decision + revisit trigger in **ADR-0005** ("Accepted cost: the credential UI chrome")
  and **gotchas §14**; full finding in `docs/cognitive-load-audit.md`.

### Recipe C — Collapse the optional Ship From block (finding 1.3)
- **Rating:** Node rec #3 — **MEDIUM-HIGH**. Flagged as "the most invasive of the low-risk recipes" because **the reader path changes** with the field names.
- **Changes:** Replace the flat `addressFields({ prefix: 'shipFrom', ... })` block in Rates and Create with a single collapsed `collection` ("Ship From Override"); read via a new `readAddressCollection` helper.
- **Why:** Ship From defaults to the Shipper address yet renders 6–7 always-empty fields; collapsing makes the default need zero interaction.
- **Anchors:**
  - New helper `readAddressCollection(get, name)` in `nodes/Ups/resources/shipping/shared.ts` (passes `{}` fallback — `readPackage` discipline `shared.ts:321-329`).
  - `getRates.operation.ts:149-154` and `create.operation.ts:350-356` — flat Ship From blocks to replace.
  - Keep `hasShipFrom`/`effectiveShipFrom` fallback logic **unchanged**: `getRates.operation.ts:56-58`, `create.operation.ts:118-120`.
  - **Create-specific catch:** Ship From's Name feeds the international `AttentionName` guard (120301) — `create.operation.ts:124,147`; the Create collection must keep a `Name` option and read it.
- **Preconditions:** none stated beyond sequencing step 2.
- **Definition of done:** implied — Ship From collapsed; effective-origin + `isInternational` logic untouched; verified on both paths (P11/P12) since field shape changed.
- **Open questions:** none stated.

### Recipe D — Reorder the Service dropdown (finding 2.1)
- **Rating:** Node rec #4 — **MEDIUM**.
- **Changes:** Move the three highest-traffic services (Ground 03, Next Day Air 01, 2nd Day Air 02, then 3 Day Select 12) to the top; keep all 28 codes and `name (code)` format; `default` stays `'03'`.
- **Why:** Options ordered by raw UPS code force a scan of 28 to find the common 3.
- **Anchors:**
  - `nodes/Ups/resources/shipping/create.operation.ts:300-328` — Service options array. Order is presentation-only; stored `value`s and `default` unchanged so `buildShipmentBody` `Service.Code` identical. "Unlisted codes via expression" comment `:298-299` still holds.
- **Preconditions:** none stated.
- **Definition of done:** implied — common services lead; values/default unchanged.
- **Open questions:** none stated.

### Recipe E — Gate international customs fields behind a toggle (finding 1.1)
- **Rating:** Node rec #2 — **HIGH** (the headline / highest-impact change).
- **Changes:** Add a manual `international` boolean (`displayName: 'Is International Shipment'`, `default: false`) that controls **visibility only**; gate the customs notice, Customs Value/Currency (Rates) and Customs collection / Sold To / Commodities (Create) behind `{ ...show, international: [true] }`. Harden the boundary errors to point at the toggle.
- **Why:** For a domestic shipment ~16 Create rows are noise the user must scan and dismiss; ADR-0003 rejected `displayOptions` for *computed* internationality, but a manual declaration of intent can drive visibility while the runtime predicate stays authoritative.
- **Anchors:**
  - Step 1 boolean placed after Label Format (Create) / after Ship To (Rates); param name `international`, read **only by `displayOptions`**, never by a `preSend`.
  - Step 2 gating objects: `showOnlyForRatesIntl = { ...showOnlyForRates, international: [true] }`; `showOnlyForCreateIntl = { ...showOnlyForCreate, international: [true] }`.
  - Rates fields to gate: `getRates.operation.ts:163-191` (customs notice, Customs Value, Customs Currency).
  - Create fields to gate: `create.operation.ts:381-481` (customs notice, Customs collection, Sold To via `addressFields({ prefix: 'soldTo', ... })`, Commodities fixedCollection).
  - Step 3 no reader changes — readers pass fallbacks (`get('customsValue', 0)`, `get('customs', {})`, `get('commodities.line', [])`); n8n returns a hidden param's default. Authoritative predicate stays at `getRates.operation.ts:61`, `create.operation.ts:219`.
  - Harden boundary errors: `create.operation.ts:225-230` and `getRates.operation.ts:61-70` — add description pointing at "Is International Shipment".
- **Preconditions:** sequencing step 3 (do last). **Must verify (P11/P12):** confirm gated customs params resolve to defaults when hidden on the **AI-Agent tool path** — hidden-field resolution under tool execution is the gotchas §1 risk class; run an international Create through `npm run harness` on both paths before done.
- **Definition of done:** stated — international Create verified on normal AND tool path with the gated fields.
- **Open questions:** the mismatch case (toggle off but countries differ) — existing guards fire with a clear message; recipe extends those messages to reference the toggle.

### Recipe F — Trim the always-on Shipper-Profile notices (finding 1.4)
- **Rating:** Node rec #5 — **MEDIUM**.
- **Changes:** Shorten the two always-on profile-notice paragraphs to one line; lean on the credential `documentationUrl` for detail.
- **Why:** Long explanatory paragraphs shown to every user, including those who never attach a profile credential.
- **Anchors:**
  - `getRates.operation.ts:135-142` and `create.operation.ts:334-341` — the Shipper-Profile notice blocks. Notices are display-only; shortening copy changes nothing in resolution.
- **Preconditions:** none stated.
- **Definition of done:** implied — one-line notices.
- **Open questions:** none stated.

---

## Reference (not actions)

- **Recipe A / Cred rec #3** — pure description edits; per source, "no re-verification needed." Feeds a routine lint-clean commit.
- **Recipe B** — credential `notice` additions; no OAuth-flow or test impact. Routine commit.
- **Recipe C** — touches `shared.ts` reader path + both Shipping operations; per source, verify on normal + tool paths (P11/P12) since field shape changes.
- **Recipe D** — presentation-only reorder; routine commit.
- **Recipe E** — `displayOptions` across ~16 fields in two operations; per source, gate behind `npm run harness` on both normal and AI-Agent tool paths (P11/P12, gotchas §1) and an international Create live-verify (P12, CIE) before merge.
- **Recipe F** — display-only copy edit; routine commit.
- Source full write-up with before/after code blocks: `docs/cognitive-load-audit.md`.

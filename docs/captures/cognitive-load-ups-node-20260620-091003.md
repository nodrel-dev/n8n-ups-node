# Cognitive Load Audit — UPS n8n Node (All Four Operations)

## Header

- **Captured:** 2026-06-20
- **Source:** `/cognitive-load-conversion` skill, run 2026-06-20 session
- **Subject:** Cognitive load audit of the UPS n8n node parameter UI across all four operations: Track, Validate Address, Get Rates, Create Shipment. Evaluated for extraneous load, mental model gaps, and offloading opportunities, with five priority recommendations.
- **Cross-cutting notes:**
  - Audit context: the "conversion event" is a user successfully configuring and running a UPS node operation without abandoning to read docs or file an issue.
  - The `shipperSource` SPIKE in Get Rates (`getRates.operation.ts`) is an explicitly in-progress experiment; its state (commit or cut) is the highest-priority open decision.
  - No "do not change" items were stated by the source.
  - Recommendation 1 (SPIKE resolution) is a prerequisite for Recommendation 2 (tip notice placement), since the right placement depends on whether `shipperSource` survives.
- **Recommended sequencing:** Resolve SPIKE (Rec 1) → fix tip notice placement (Rec 2) → sandbox notice gate (Rec 3) → unify customs structure (Rec 4) → service dropdown grouping (Rec 5).

---

## Extraneous Load Findings

### Finding A — Manual-mode tip promotes the opposite of what the user just chose
- **Rating:** HIGH
- **What:** `shipperProfileNoticeRates` appears when `shipperSource: 'manual'` is selected in Get Rates, urging the user to attach a profile credential.
- **Why:** The user just signalled "I want to type these in." A tip promoting an alternative at this moment creates dissonance, not help. The notice belongs before the choice as a discovery prompt.
- **Anchors:** `nodes/Ups/resources/shipping/getRates.operation.ts`, field `shipperProfileNoticeRates`, `displayOptions: { show: { ...showOnlyForRates, shipperSource: ['manual'] } }`
- **Open questions:** Depends on whether `shipperSource` toggle survives (Rec 1). If the toggle is removed, this finding resolves automatically.

### Finding B — Profile-mode confirmatory notice is redundant
- **Rating:** MEDIUM
- **What:** When `shipperSource: 'profile'` is selected in Get Rates, a notice explains that the Shipper fields come from the credential — but the fields' disappearance already communicates this.
- **Anchors:** `nodes/Ups/resources/shipping/getRates.operation.ts`, field `shipperFromProfileNoticeRates`, `displayOptions: { show: { ...showOnlyForRates, shipperSource: ['profile'] } }`
- **Open questions:** Same SPIKE dependency as Finding A.

### Finding C — Validate sandbox notice is always visible, including in production
- **Rating:** MEDIUM
- **What:** `validateSandboxNotice` ("In the UPS CIE, validation only returns results for NY and CA…") renders unconditionally for all environments, all users, every time the node opens.
- **Why:** Production users see CIE-specific noise on every interaction.
- **Anchors:** `nodes/Ups/resources/address/validate.operation.ts`, field `validateSandboxNotice`, `displayOptions: { show: showOnlyForValidate }`
- **Open questions:** n8n declarative system has no native way to gate on credential environment field from within a node property — the cleanest resolution may be to move the note to the README and credential description instead of the node panel.

### Finding D — Dimension Unit always renders even with no dimensions set
- **Rating:** LOW
- **What:** `dimensionUnit` appears alongside `dimensions` regardless of whether the user has added any dimension values. Since `dimensions` is a `fixedCollection`, a user who doesn't click "Add Dimensions" never needs a unit.
- **Anchors:** `nodes/Ups/resources/shipping/shippingFields.ts`, `packageFields()`, field `dimensionUnit`
- **Open questions:** `displayOptions` in n8n can gate on a fixedCollection having any value; feasibility of this specific tie-in should be confirmed.

---

## Mental Model Gap Findings

### Finding E — SPIKE shipper toggle exists in Get Rates but not Create; the two operations look like different nodes
- **Rating:** HIGH
- **What:** Get Rates has a `Shipper Details: Enter Manually / From Shipper Profile Credential` picker that collapses the Shipper block. Create Shipment has no such toggle — Shipper fields are always visible with only a static tip notice.
- **Why:** A user building Get Rates → Create Shipment hits a structural discontinuity between two sibling operations. The comment labels this `// SPIKE (temporary, to test hide+purge theory)`.
- **Anchors:** `nodes/Ups/resources/shipping/getRates.operation.ts` field `shipperSource` (lines 93–105); `nodes/Ups/resources/shipping/create.operation.ts` (no equivalent field); comment `// SPIKE (temporary, to test hide+purge theory)` at line 92 of `getRates.operation.ts`
- **Preconditions:** None — this finding is independent of other changes.
- **Open questions:** Decision between commit (extend to Create) vs. cut (remove from Get Rates) must be made before shipping.

### Finding F — Customs structured differently between Get Rates and Create
- **Rating:** MEDIUM
- **What:** Get Rates exposes customs as two flat fields (`customsValue`, `customsCurrency`). Create exposes customs as a collapsed `collection` with five sub-fields.
- **Why:** Same concept, two patterns. Users who set up Get Rates first expect flat fields on Create and search for them.
- **Anchors:** `nodes/Ups/resources/shipping/getRates.operation.ts` fields `customsValue`, `customsCurrency`; `nodes/Ups/resources/shipping/create.operation.ts` field `customs` (collection, lines 333–376)
- **Open questions:** Source recommends flattening Create's customs scalars to match Get Rates' pattern, since most collection sub-fields already have sensible defaults in `readCustoms`.

### Finding G — "Is International Shipment" description implies it controls logic, but it's only a visibility gate
- **Rating:** MEDIUM
- **What:** The `international` boolean's description states "the node still validates internationality from the addresses at run time, so a genuine cross-border lane is caught even if this is left off." Users expect toggles to control behaviour, not just field visibility.
- **Anchors:** `nodes/Ups/resources/shipping/getRates.operation.ts` field `international` (description text); `nodes/Ups/resources/shipping/create.operation.ts` field `international` (description text); comment `// Visibility-only gate for the customs fields (Recipe E)` in both files; `ADR-0003` (runtime `isInternational` predicate stays authoritative)
- **Open questions:** Description accuracy vs. user expectation tension. No resolution proposed by source beyond noting the gap.

### Finding H — Service dropdown: 26-item undifferentiated list
- **Rating:** LOW
- **What:** `"Worldwide Economy DDU (17)"`, `"UPS Today Dedicated Courier (83)"`, `"Mail Innovations Returns (M7)"` sit beside `"Ground (03)"` in the same flat list. Common domestic services lead, but no visual structure separates them from the long tail.
- **Anchors:** `nodes/Ups/resources/shipping/create.operation.ts` field `service` (lines 219–260), comment "Most-used services lead so users aren't scanning a 28-item list ordered by raw code."
- **Open questions:** n8n does not support native option groups; a non-selectable sentinel entry is the available workaround.

---

## Offloading Opportunities

| What the user does today | What the node could do instead | Feasibility note |
|---|---|---|
| Manually switch `Shipper Details` to "From Shipper Profile Credential" after attaching a profile | Auto-detect the profile and switch the default | Hard in pure declarative; `loadOptionsMethod` with side-effect is the candidate mechanism |
| Read sandbox notice and decide if it applies to them | Gate notice on environment indicator, or remove from node panel | Constrained by declarative field system |
| See `dimensionUnit` and decide if it matters | Hide `dimensionUnit` unless `dimensions` fixedCollection has a value | `displayOptions` tie-in may be feasible |
| Know that `invoiceDate` defaults to today when left blank | Show `(defaults to today)` in the description | One-line copy change; no feasibility concern |
| Scan 26+ services to find Ground | Surface 5 common domestic services; demote the rest | Sentinel-entry workaround available |

---

## Priority Recommendations

### Recommendation 1 — Resolve the SPIKE
- **Rating:** HIGH
- **Changes:** Commit or cut the `shipperSource` toggle; if kept, add it to Create Shipment to match Get Rates; if cut, remove it from Get Rates.
- **Why:** The current state (toggle on Get Rates, no toggle on Create) is the single biggest extraneous-load source in the node — a model break between sibling operations.
- **Anchors:** `nodes/Ups/resources/shipping/getRates.operation.ts` field `shipperSource` and associated `displayOptions`; `nodes/Ups/resources/shipping/create.operation.ts` (no equivalent)
- **Preconditions:** None. This is the root decision for Recommendations 2, E, and A.
- **Definition of done:** Both operations have the same structural pattern for the Shipper block (either both have the toggle, or neither does). SPIKE comment removed.
- **Open questions:** If the toggle is kept, auto-detection of an attached profile is a secondary improvement (offloading table, row 1).

### Recommendation 2 — Move the profile tip before the choice; remove it from manual-mode state
- **Rating:** HIGH
- **Changes:** Relocate `shipperProfileNoticeRates` to appear unconditionally above the `Shipper Details` field; remove it from `displayOptions` that gate it to `shipperSource: ['manual']`. Remove `shipperFromProfileNoticeRates` (profile-mode confirmatory notice) entirely.
- **Why:** Tip informs the decision if placed before it; placed after a committed choice it creates dissonance. The confirmatory notice in profile mode is redundant — hidden fields already communicate that the profile is in control.
- **Anchors:** `nodes/Ups/resources/shipping/getRates.operation.ts`, fields `shipperProfileNoticeRates` and `shipperFromProfileNoticeRates`
- **Preconditions:** Recommendation 1 (SPIKE resolved). If the toggle is cut, this recommendation also resolves automatically.
- **Definition of done:** Tip notice appears once, before the `Shipper Details` picker. No notice appears after any choice is made.
- **Open questions:** If the SPIKE is extended to Create, a parallel notice restructuring applies to `shipperProfileNoticeCreate` in `create.operation.ts`.

### Recommendation 3 — Gate or remove `validateSandboxNotice`
- **Rating:** MEDIUM
- **Changes:** Remove `validateSandboxNotice` from the node panel and document the CIE NY/CA limitation in the README and in the credential's `environment` field description instead.
- **Why:** Production users see this notice every time even though it only applies in sandbox. The node panel is not the right surface for environment-scoped caveats.
- **Anchors:** `nodes/Ups/resources/address/validate.operation.ts` field `validateSandboxNotice`; `credentials/UpsOAuth2Api.credentials.ts` (target for the moved note); `README.md` (secondary target)
- **Preconditions:** None.
- **Definition of done:** Notice absent from the node panel. CIE limitation documented in the credential description and README.
- **Open questions:** If the team prefers keeping the notice in-panel, acceptable fallback is to update the `displayName` to front-load "Sandbox only:" for clarity.

### Recommendation 4 — Unify international customs structure between Get Rates and Create
- **Rating:** MEDIUM
- **Changes:** Flatten Create's `customs` collection sub-fields (`currency`, `invoiceDate`, `invoiceNumber`, `reasonForExport`, `termsOfShipment`) to match Get Rates' flat-field pattern, since all have sensible defaults in `readCustoms`.
- **Why:** Same concept, two structural patterns. Users build Get Rates → Create in sequence; mismatched structure breaks their mental model.
- **Anchors:** `nodes/Ups/resources/shipping/getRates.operation.ts` fields `customsValue`, `customsCurrency`; `nodes/Ups/resources/shipping/create.operation.ts` field `customs` (collection); `nodes/Ups/core/buildRateRequest.ts`, `nodes/Ups/core/buildInternationalForms.ts` (downstream consumers of the read values); `readCustoms()` function in `create.operation.ts`
- **Preconditions:** None.
- **Definition of done:** Both Get Rates and Create expose customs inputs as flat fields under the `showOnlyForXxxIntl` visibility gate.
- **Open questions:** `readCustoms()` reads from the collection key `'customs'` with sub-keys; flattening requires updating both the field definitions and the `readCustoms()` reader. Verify `getNodeParameter` fallback behaviour when collection key is absent vs. flat key is absent.

### Recommendation 5 — Add visual structure to the Service dropdown
- **Rating:** LOW
- **Changes:** Insert non-selectable sentinel entries (e.g. `{ name: '── International ──', value: '__intl_sentinel__' }`) to create Domestic / International / Mail Innovations sections, or reorder so international and mail-innovations services appear at the bottom with a blank separator sentinel.
- **Why:** 26+ items without structure forces domestic users to scan the whole list to confirm Ground is the right choice.
- **Anchors:** `nodes/Ups/resources/shipping/create.operation.ts` field `service` (options array, lines 227–256)
- **Preconditions:** None.
- **Definition of done:** The 5–6 most-used domestic services are visually separated from international and Mail Innovations tiers. Sentinel entries must be non-selectable (value not a valid UPS service code, and `required: true` on the field means the user must change from the sentinel before running).
- **Open questions:** Confirm n8n renders sentinel entries as visually distinct (dimmed/disabled) rather than selectable items when the field is required.

---

## Reference

| Item | Execution path |
|---|---|
| Rec 1 — SPIKE resolution | Edit `getRates.operation.ts` (add/remove `shipperSource`) and `create.operation.ts` (add equivalent or confirm no-toggle). No spec or ADR amendment required unless the commit path introduces a new UX pattern worth documenting in ADR-0005. |
| Rec 2 — Tip notice placement | Edit `getRates.operation.ts` `shipperProfileNoticeRates.displayOptions`; delete `shipperFromProfileNoticeRates`; parallel edit to `create.operation.ts` if SPIKE is extended there. |
| Rec 3 — Sandbox notice | Edit `validate.operation.ts` (delete `validateSandboxNotice`); update `credentials/UpsOAuth2Api.credentials.ts` environment field description; update `README.md`. |
| Rec 4 — Customs unification | Edit `create.operation.ts` (flatten collection to fields); edit `readCustoms()` in same file to read flat keys; regression-test against `buildInternationalForms` fixture tests in `test/core/`. |
| Rec 5 — Service dropdown | Edit `create.operation.ts` `service.options` array; add sentinel entries; verify harness rendering. |

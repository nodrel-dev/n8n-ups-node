# Architecture deepening opportunities — n8n-nodes-ups

- **Captured:** 2026-06-19
- **Source:** `improve-codebase-architecture` skill (HTML report at `$TMPDIR/architecture-review-20260619-183644.html`)
- **Subject:** Deepening opportunities in the UPS community node. Central finding: the pure cores are exhaustively tested, but the bugs live one layer up in the `preSend`/`postReceive` orchestration that assembles UPS request bodies and decodes responses. Every "verified live CIE" comment marks a hard-won fact with no unit test behind it — only the Docker harness exercises that code.
- **Cross-cutting notes:**
  - No ADR conflicts. Every candidate keeps the node fully declarative (ADR-0004 — no `execute()`), preserves the runtime international predicate (ADR-0003), and preserves shipper-profile precedence (ADR-0005).
  - `toMoney` and `buildCommodities` look shallow but pass the deletion test (two adapters each; `toMoney` is the single money shape shared by `flattenRates` and `extractCharges` so Get Rates and Create can't disagree, per CONTEXT.md). Leave them unchanged.
  - Test reality at capture time: 15 core test suites, 0 operation tests.
- **Recommended sequencing:** Candidate 2 first (small, kills the duplication, and produces exactly the resolved-parties input Candidate 1 needs), then Candidate 1 (the real payoff — moves the test surface onto the UPS-rejection logic). Candidates 3 and 4 are natural follow-ons once the parties seam exists.

---

## Item 1 — Deepen UPS request-body assembly into pure cores

- **Rating:** Strong (in-process)
- **Changes:** Extract `buildRateRequest(input)` and `buildShipmentRequest(input)` as pure plain-in/plain-out cores taking already-read params. `preSend` shrinks to: read → call core → assign `requestOptions.body`.
- **Why:** Every hard-won UPS rule — AttentionName mirroring, effective-ShipFrom fallback, Type 01 billing, thermal LabelStockSize, the Shoptimeintransit twin containers — currently lives inside `buildShipmentBody`/`ratesPreSend` behind `IExecuteSingleFunctions`, so no unit test can reach it. Moving assembly behind a plain seam makes the interface the test surface: feed resolved parties + flags, assert the exact UPS JSON. Each "verified live CIE" comment becomes a fixture-backed regression test.
- **Anchors:**
  - `nodes/Ups/resources/shipping/create.operation.ts:105–188` (`buildShipmentBody`)
  - `nodes/Ups/resources/shipping/getRates.operation.ts:34–110` (`ratesPreSend`)
  - Consumes cores: `toUpsAddress`, `buildCommodities`, `buildInternationalForms`
  - Existing fixtures: `test/fixtures/ship-domestic.json`, `test/fixtures/ship-international.json`
  - ADR-0004 (stays declarative; no `execute()`)
  - Principle 10 (pure-core test-first discipline)
- **Preconditions:** Pairs with Item 2 — Item 2's `resolveShipmentParties` output is the natural input to these builders.
- **Definition of done:** open (source implied: fixture-backed unit tests asserting exact UPS request JSON for the rules listed).
- **Open questions:** Whether rate and ship assembly stay two separate cores or share a parties sub-module (source left this at candidate level, did not design the interface).

## Item 2 — Collapse the duplicated Effective Origin resolution

- **Rating:** Strong (in-process)
- **Changes:** One `resolveShipmentParties(get, profile)` returning the resolved shipper, shipTo, effective ShipFrom, the `international` flag, and account number. Both preSends call it; Item 1's cores consume its output.
- **Why:** The "resolve shipper with profile precedence → read parties → pick effective origin → classify international" sequence is copy-pasted verbatim across both preSends. `isInternational` is shared, but the party resolution around it is pasted twice. A fix to the `hasShipFrom` rule must land in two places or the operations silently disagree. CONTEXT.md names "Effective Origin" as a concept but no module owns it.
- **Anchors:**
  - `nodes/Ups/resources/shipping/getRates.operation.ts:44–58`
  - `nodes/Ups/resources/shipping/create.operation.ts:205–223` (verbatim twins)
  - Shared predicate: `isInternational`
  - The duplicated decision: `hasShipFrom ? shipFrom : shipper`
  - CONTEXT.md "Effective Origin"
  - ADR-0003 (international stays a runtime predicate), ADR-0005 (shipper-profile precedence unchanged)
- **Preconditions:** none stated (independently valuable; also feeds Item 1).
- **Definition of done:** open (source implied: cross-operation consistency becomes testable through one interface).
- **Open questions:** none flagged.

## Item 3 — Deepen Create's response assembly

- **Rating:** Worth exploring (in-process)
- **Changes:** A pure `buildShipmentResult(body, format)` returning `{ json, binaryParts[] }`. `postReceive` loops `binaryParts` through `prepareBinaryData` and returns.
- **Why:** Three tested extractors (`extractLabel`, `extractForms`, `extractCharges`) are wired together by untested assembly: the domestic-vs-international branch (label only vs label + invoice), the `labels[0]`/`forms[0]` null guards, and the `international: forms.length > 0` json shape. Pulling that into a pure core leaves `postReceive` holding only the n8n-only step (`prepareBinaryData`).
- **Anchors:**
  - `nodes/Ups/resources/shipping/create.operation.ts:238–280` (`createPostReceive`)
  - Extractors: `extractLabel`, `extractForms`, `extractCharges`
  - n8n binary I/O: `prepareBinaryData`
- **Preconditions:** Natural follow-on once the parties seam (Item 2) exists.
- **Definition of done:** open.
- **Open questions:** none flagged.

## Item 4 — Split the `shared.ts` grab-bag

- **Rating:** Speculative (in-process)
- **Changes:** Split the 341-line file into three modules by concern: `shippingFields.ts` (UI field generators), `readParties.ts` (param readers — feeds Item 2), `shipperProfile.ts` (precedence, ADR-0005 — the deep one to isolate).
- **Why:** Lowest-friction of the four. The file mixes interface (UI fields) with implementation (readers) with a deep rule (profile precedence); the concepts inside don't cohere and each has a different reason to change. Carries weight mainly if Items 1–2 land, since they relocate the readers anyway.
- **Anchors:**
  - `nodes/Ups/resources/shipping/shared.ts` (341 lines, 3 concerns)
  - Generators: `addressFields`, `packageFields`
  - Readers: `readAddress`, `readPackage`
  - Precedence: `pickField`, `loadShipperProfile`, `readShipper`
  - ADR-0005
- **Preconditions:** Best done after Items 1–2 (they relocate the readers).
- **Definition of done:** open.
- **Open questions:** none flagged.

---

## Reference (not actions)

- **Item 1** would feed a TDD pure-core build (Principle 10): write fixture-backed tests asserting exact UPS request JSON, then extract `buildRateRequest`/`buildShipmentRequest`.
- **Item 2** would feed a small refactor PR introducing `resolveShipmentParties`, ideally landed before Item 1 as the shared seam.
- **Item 3** would feed a follow-on pure-core extraction (`buildShipmentResult`) after Item 2.
- **Item 4** would feed a cohesion refactor (file split) after Items 1–2 relocate the readers.
- Source HTML report (ephemeral, temp dir): `$TMPDIR/architecture-review-20260619-183644.html`.

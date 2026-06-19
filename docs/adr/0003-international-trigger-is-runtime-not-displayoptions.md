# The international (Effective Origin) trigger is a runtime predicate, not field visibility

**Status:** accepted

International Rate and Create must collect customs data when the shipment crosses a border.
The trigger is **Effective Origin** (`ShipFrom` country if provided, else `Shipper` country)
differing from `ShipTo` country — the same rule gating Rate's Customs Value group and
Create's customs collection so the two operations never disagree.

The brief describes these groups as "shown when effective origin country != ShipTo." Read
literally as an n8n `displayOptions.show` rule, that is **not implementable**:
`displayOptions` can only match a parameter against static values (or another parameter
equalling a fixed value). It cannot compare two user-entered fields (`ShipFrom.country` vs
`ShipTo.country`) for inequality.

**Decision:** Separate **visibility** from **requirement**.
- **Visibility (static):** the Customs Value group (Rate) and the `customs` collection
  (Create) are gated by `displayOptions` only on `resource = shipping` + the operation —
  always shown as optional collections, never auto-hidden by the country comparison. Each
  carries a `notice` property explaining it is required for international shipments.
- **Requirement (runtime):** a single shared predicate `isInternational(input)` computes
  Effective Origin vs `ShipTo` country. Rate's pre-send and Create's `execute()` both call
  it. International + missing customs data → `NodeOperationError` at the boundary **before**
  any UPS call (FR-014). Not international → the customs block is not sent even if filled.

**Why it's acceptable:** The Effective Origin invariant lives in one function, called by both
operations, so they cannot diverge. Always-visible optional groups plus a notice is the
standard n8n idiom for "conditionally required" data that depends on a computed condition the
UI can't express.

**Consequence / revisit trigger:** A future maintainer will likely try to "tidy" this into a
`displayOptions` rule — that path is a dead end given n8n's cross-field limitation. Revisit
only if n8n adds cross-field comparison to `displayOptions`, or if a user-set "International
shipment" boolean proves a better UX than silent runtime detection.

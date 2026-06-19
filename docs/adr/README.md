# Architecture Decision Records

These ADRs capture the non-obvious decisions behind `n8n-nodes-ups` and why the alternatives were
rejected. Each file is the durable record of one decision; later ADRs can supersede earlier ones.

For the synthesized picture, start with the [System Overview](../system-overview.md).

| ADR | Decision (one line) | Status |
| --- | ------------------- | ------ |
| [0001](0001-native-retry-over-backoff.md) | Lean on n8n's native **Retry On Fail** for transient errors instead of building node-level bounded exponential backoff. | Active |
| [0002](0002-credential-test-track-notfound-is-pass.md) | The credential test is an authenticated **Track probe**; reaching UPS's Track layer (even a "not found") counts as a pass, so the test validates auth without a real shipment. | Active |
| [0003](0003-international-trigger-is-runtime-not-displayoptions.md) | The international (Effective Origin ≠ ShipTo) trigger is a **runtime predicate** (`isInternational`), not `displayOptions` field visibility, so Rate and Create can never disagree on what counts as cross-border. | Active |
| [0004](0004-error-mapping-via-postreceive-not-default.md) | Surface UPS errors through a `postReceive` mapper (`mapUpsError`) with `ignoreHttpStatusErrors: true`, not n8n's default error handling, so the UPS `code`/`message` reach the operator verbatim. | Active |

## How they relate

- **0002** and **0004** together define the auth + error surface: 0002 makes the credential test a
  Track probe so a wrong key fails the connection test rather than mid-run; 0004 keeps the node
  declarative while still surfacing UPS's own error envelope (both the common shape and Track's
  distinct one) via a `postReceive` mapper.
- **0003** keeps Rate and Create consistent: one runtime predicate decides "international," so the
  Rate customs-value requirement and the Create customs-forms requirement are gated by the same
  rule rather than by parallel `displayOptions`.
- **0001** records the deliberate deviation from the constitution's "bounded retry with backoff"
  default — declarative routing has no error-class-selective backoff knob, so transient resilience
  is delegated to n8n's native Retry On Fail.

## Conventions

- ADRs are immutable records. When a decision changes, add a new ADR and mark the old one superseded
  rather than rewriting history. Factual descriptions inside an ADR may be corrected with a dated
  note.
- New ADRs are numbered sequentially (`000N-short-slug.md`).

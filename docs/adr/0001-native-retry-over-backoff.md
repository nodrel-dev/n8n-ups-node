# Rely on n8n's native Retry On Fail instead of bounded exponential backoff

**Status:** accepted

Constitution Principle 7 and NFR-007 call for "bounded retry with backoff on transient
5xx and 429; no retry on 4xx." n8n's **declarative routing** (used for Track, Validate,
and Get Rates) has no knob for conditional, error-class-selective, backed-off retries —
its only built-in is the workflow-level **Retry On Fail**, which retries on *any* error
with a fixed wait and is not 5xx-selective. Delivering true selective backoff would
require dropping every operation to a programmatic `execute()`, defeating the
declarative-first design (NFR-002).

**Decision:** For v1, lean on n8n's native Retry On Fail across all operations and do not
hand-roll backoff. NFR-007 and Principle 7 are reworded to "transient-error resilience
via n8n's retry; selective 5xx/429 backoff deferred."

**Why it's acceptable:** UPS 4xx responses are deterministic (bad input, bad auth), so
retrying them is mildly wasteful but never harmful — no duplicate side effects, since the
write operation (Create) is the one path already programmatic and can guard itself if
needed. The cost of full declarative-to-programmatic conversion across three read/rate
operations is not justified by the marginal resilience gain in v1.

**Consequence / revisit trigger:** If production traffic shows UPS 5xx/429 frequently
enough that blind fixed-wait retries cause rate-limit amplification, reopen this and move
the affected operation to programmatic backoff. Until then, this is the deliberate,
documented deviation from Principle 7 — not an oversight.

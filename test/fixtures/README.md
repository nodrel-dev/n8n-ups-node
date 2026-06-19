# Test fixtures

Fixtures for the pure-core unit tests (Constitution Principle 10). Each fixture is a
plain JSON-shaped object captured from:

- the local UPS API specs under `ups-api-documentation/*.yaml` (response schemas + examples), and
- real UPS Customer Integration Environment (CIE) responses, once captured during live
  verification (Principle 12, `quickstart.md` gates).

Fixtures model the **response envelope shapes** the cores must parse — Track's distinct
error chain vs the common `response.errors[]`, the rating `RatedShipment[]` array, the
shipping `ShipmentResults` label/forms containers, and the XAV candidate/classification
indicators. Keep them minimal: only the fields a core reads.

`[VERIFY-LIVE]` fields (exact Track not-found status, Track error path, GIF label needs,
cross-border phone) are confirmed against CIE and back-filled here when they land.

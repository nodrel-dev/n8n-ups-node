# UPS node — manual test guide

Step-by-step hand tests for **every operation**, on **both paths** (normal node + AI-Agent tool),
with **every field value pre-filled**. All values come from the 2026-06-19 live-CIE smoke test and
should succeed first try against **Sandbox (CIE)**.

> **Fastest path:** `./scripts/harness-up.sh up` builds the node, boots n8n in Docker, seeds the UPS
> credential from `.env.local`, and imports all six workflows with the credential pre-attached.
> Then `./scripts/harness-up.sh run` executes gates 1–5 headlessly. The per-field tables below are
> for when you'd rather build/inspect a node by hand, and for the negative/boundary checks.

---

## 0. Setup (once)

1. **Boot + import:** `./scripts/harness-up.sh up` → opens at <http://localhost:5678>.
   The harness auto-creates the n8n owner login so you skip the setup wizard:
   **`ups-harness@local.test`** / **`UpsHarness2026!`**.
   - If you instead use `npm run dev` (`n8n-node dev`), the node type is **`CUSTOM.ups`**, not the
     published `@nodrel-dev/n8n-nodes-ups.ups` — pick the **UPS** node off the canvas yourself (gotchas §4).
2. **Credential** (auto-seeded by `harness-up.sh`; do this manually only if seeding was skipped):
   *Create → UPS OAuth2 API* → **Client ID**, **Client Secret**, **Environment = Sandbox (CIE)** →
   **Test** must pass (a Track probe that sends the required `transId`/`transactionSrc` headers, gotchas §13).
3. **Account number** for Rate/Create is **`0C395V`** — it is **Canada-registered**, so the Shipper
   must be Canadian or Ship 400s with `120120` (gotchas §12). That's why Create uses a Toronto origin.

---

## 1. Track  — `Tracking → Track`  (workflow `01-track.json`)

| Field | Value |
|-------|-------|
| Resource | `Tracking` |
| Operation | `Track` |
| Tracking Number | `1Z12345E0205271688` |
| Detail | `Detailed (Status + Activity History)` |
| Locale | `en_US` |

**Steps:** add the UPS node → set the fields above → **Execute**.
**PASS:** 1 item with `status` **and** an `activity[]` scan history.
- CIE returns a canned **`DELIVERED`** for any well-formed `1Z` number, so the exact number is free.

**Variations:**
- Flip **Detail → `Status Only`**, re-run → `status` present, **`activity[]` gone** (client-side suppression).
- **Continue On Fail (per-item errors):** add a Manual Trigger feeding **two** items — a good number and
  a junk one like `1Z_BAD` — enable the UPS node's **Settings → Continue On Fail**. The good item resolves;
  the bad item carries a specific UPS reason instead of failing the whole run.

---

## 2. Validate Address  — `Address → Validate`  (workflow `02-validate.json`)

| Field | Value |
|-------|-------|
| Resource | `Address` |
| Operation | `Validate` |
| Address Line 1 | `2880 Junction Ave` |
| Address Line 2 | *(blank)* |
| City | `San Jose` |
| State / Province Code | `CA` |
| Postal Code | `95134` |
| Country Code | `US` |

**PASS:** 1 item, `resolution: "valid"` + an address classification.
- **CIE limit:** street-level validation only returns for **US addresses in NY or CA** — use a CA/NY
  address here or you'll get a thin/no-candidate response (not a bug; gotchas note in the credential).

---

## 3. Get Rates  — `Shipping → Get Rates`  (workflow `03-get-rates.json`)

| Field | Value |
|-------|-------|
| Resource | `Shipping` |
| Operation | `Get Rates` |
| Account Number | `0C395V` |
| Shipper Address Line 1 | `1 Yonge St` |
| Shipper City | `Toronto` |
| Shipper State / Province Code | `ON` |
| Shipper Postal Code | `M5E1E5` |
| Shipper Country Code | `CA` |
| Use a Different Ship-From Address | `off` *(Ship From fields stay hidden; origin defaults to the Shipper)* |
| Ship To Address Line 1 | `555 W Hastings St` |
| Ship To City | `Vancouver` |
| Ship To State / Province Code | `BC` |
| Ship To Postal Code | `V6B4N6` |
| Ship To Country Code | `CA` |
| Weight | `2` |
| Weight Unit | `Kilograms (KGS)` |
| Is International Shipment | `off` |

**PASS:** **one output item per service**, each with `serviceCode`, a `published` rate, `billingWeight`,
`transitDays`, and `guaranteedBy` (the node requests `Shoptimeintransit`, which needs two extra
containers the node adds for you — gotchas §12). Verified live 2026-06-20: 5 services, e.g. code `14`
→ published `164.19 CAD` / negotiated `162.55 CAD`, `transitDays: 1`.
- **Negotiated rates** appear only if account `0C395V` is entitled on this lane — their absence is an
  account fact, not a node bug (a request-level "no negotiated rates" alert is surfaced).
- **Known quirk:** `serviceName` comes back **empty** in CIE — UPS returns the service *code* without a
  description, and the node passes it through. Use `serviceCode` as the stable key. (Not a failure.)

---

## 4a. Create Shipment — domestic CA  (workflow `04-create-domestic.json`)

| Field | Value |
|-------|-------|
| Resource | `Shipping` |
| Operation | `Create` |
| Account Number | `0C395V` |
| Service | `UPS Standard (11)` |
| Shipper Name | `Test Shipper` |
| Shipper Address Line 1 | `1 Yonge St` |
| Shipper City | `Toronto` |
| Shipper State / Province Code | `ON` |
| Shipper Postal Code | `M5E1E5` |
| Shipper Country Code | `CA` |
| Shipper Phone | `4165551234` |
| Ship To Name | `Test Consignee` |
| Ship To Address Line 1 | `555 W Hastings St` |
| Ship To City | `Vancouver` |
| Ship To State / Province Code | `BC` |
| Ship To Postal Code | `V6B4N6` |
| Ship To Country Code | `CA` |
| Ship To Phone | `6045555678` |
| Weight | `2` |
| Weight Unit | `Kilograms (KGS)` |
| Label Format | `GIF (Image — View or Attach Anywhere)` |

**PASS:** a **tracking number** + a **GIF label** in the binary property `label` (filename = tracking
number). **No `GraphicImage`/base64 string in the JSON** — it's binary, not text.

**Variation:** set **Label Format → `ZPL (Zebra Thermal Printer)`** and re-run → binary `label` is ZPL.

---

## 4b. Create Shipment — international CA→US  (workflow `05-create-international.json`)

Everything in 4a, but Ship To is in the US and the customs/commodity block is filled.

| Field | Value |
|-------|-------|
| Service | `UPS Standard (11)` |
| Ship To Name | `US Consignee` |
| Ship To Address Line 1 | `350 5th Ave` |
| Ship To City | `New York` |
| Ship To State / Province Code | `NY` |
| Ship To Postal Code | `10118` |
| Ship To Country Code | `US` |
| Ship To Phone | `2125551234` |
| Is International Shipment | `on` *(reveals the customs fields; the node also auto-detects it at runtime)* |
| Reason For Export | `SALE` |
| Customs Currency | `US Dollar (USD)` |
| Terms Of Shipment | `DDU` |
| Invoice Number | `INV-1001` |
| Sold To Name | `US Consignee` |
| Sold To Address Line 1 | `350 5th Ave` |
| Sold To City | `New York` |
| Sold To State / Province Code | `NY` |
| Sold To Postal Code | `10118` |
| Sold To Country Code | `US` |
| **Commodities → Line 1** | |
| &nbsp;&nbsp;Description | `Cotton T-shirts` |
| &nbsp;&nbsp;Quantity | `3` |
| &nbsp;&nbsp;Unit Value | `12` |
| &nbsp;&nbsp;Unit Of Measure | `EA` |
| &nbsp;&nbsp;Commodity Code | `610910` |
| &nbsp;&nbsp;Origin Country | `CA` |

**PASS:** tracking number + label **and** a **customs invoice PDF** in the binary property
`customsInvoice`. Confirm `Phone` is present on both shipper and consignee (UPS may require it cross-border).

> Note: the customs fields are **flat** params (`Reason For Export`, `Customs Currency`, …), not a nested
> "customs" collection. If you hand-build the node, set them as individual fields.

---

## 5. AI-Agent tool path — Track  (workflow `06-agent-track.json`)

Proves `usableAsTool: true` (Principle 11). **Chat Trigger → AI Agent** (Anthropic model + Simple
Memory) with the **UPS** node attached as an `ai_tool`. The tool's **Tracking Number** is
`={{ $fromAI('trackingNumber', 'The UPS 1Z tracking number to look up', 'string') }}`, so the model
extracts the number from the chat message.

**Steps:**
1. Open `06-agent-track.json` in the UI. Select the **UPS** credential (auto-seeded) **and** add/select an
   **Anthropic** credential on the *Anthropic Chat Model* node (placeholder `REPLACE_WITH_YOUR_ANTHROPIC_CREDENTIAL_ID`).
2. Click **Open Chat** (test mode — no need to activate) and send:
   > *Track 1Z12345E0205271688 and tell me its status.*

**PASS — all of:**
- [ ] The run shows the **UPS tool was actually invoked** (a tool-call step; the UPS node lights up) — not the model answering from memory.
- [ ] Change the number in the prompt → the looked-up number changes with it (proves the `$fromAI` binding).
- [ ] The tool returns the canned `status` (`DELIVERED`) **+ `activity[]`**, with `transId`/`transactionSrc` sent.
- [ ] The agent's reply restates status + recent scans in plain language.
- [ ] **No `Could not get parameter: authentication`** on the tool path — single credential, so this must never appear (gotchas §1).

**FAIL signals:** agent never calls the tool (tool not wired as `ai_tool`, or `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE` unset); tool called with empty number (`$fromAI` didn't bind — check `promptType: auto`); any auth throw on the tool path (credential-resolution regression).

---

## 6. Boundary / error guards (do these too)

| Test | How | Expected |
|------|-----|----------|
| Missing account (Rate) | Clear **Account Number** on Get Rates → run | `NodeOperationError` **before** any UPS call |
| Missing account (Create) | Clear **Account Number** on Create → run | `NodeOperationError` before any UPS call |
| International without commodities | On `05`, delete the Commodities line → run | International guard fires (no UPS call) |
| Wrong shipper country | Set Create Shipper to a **US** address → run | UPS `120120` (account `0C395V` is Canada-registered) |
| Track bad number + Continue On Fail | Two input items (good + `1Z_BAD`), enable Continue On Fail | Bad item carries a UPS reason; good item still resolves |

---

## Headless equivalents (gotchas §9)

```bash
./scripts/harness-up.sh run                      # gates 1–5, prints each result
docker exec n8n-ups-harness n8n list:workflow    # ids
docker exec n8n-ups-harness n8n execute --id <id>
```

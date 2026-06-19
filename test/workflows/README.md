# UPS node — importable harness workflows

Five paste-and-run n8n workflows for the Principle-12 through-n8n gates in
[`../../specs/001-ups-node/quickstart.md`](../../specs/001-ups-node/quickstart.md). Every value is
pre-filled from the 2026-06-19 live-CIE smoke test, so each should succeed on first run against the
**sandbox (CIE)** environment.

| File | Gate | Expected result |
|------|------|-----------------|
| `01-track.json` | 1 — Track | 1 item, `status` + `activity[]`; flip **Detail → Status Only** and re-run → no `activity[]` |
| `02-validate.json` | 2 — Validate | 1 item, `resolution: "valid"` + classification |
| `03-get-rates.json` | 3 — Get Rates | one item **per service**, each with published rate + transit days |
| `04-create-domestic.json` | 4a — Create (CA domestic) | tracking number + **GIF label** in binary `label`; no base64 in JSON |
| `05-create-international.json` | 4b — Create (CA→US) | tracking number + label + **customs invoice PDF** in binary `customsInvoice` |

## Node type caveat (gotchas §4) — READ FIRST

The `type` in every file is the **published** name `n8n-nodes-ups.ups`, which is correct when the
package is installed from the tarball (`./scripts/harness.sh` → `npm install …tgz`).

If instead you run **`npm run dev`** (`n8n-node dev`), the live node type is **`CUSTOM.ups`**. In
that case either pick the **UPS** node from the canvas yourself, or find-and-replace
`"n8n-nodes-ups.ups"` → `"CUSTOM.ups"` in these files before importing.

## Setup (once)

1. Start the harness: `./scripts/harness.sh` (opens n8n at http://localhost:5678).
2. Create the **UPS OAuth2 API** credential: Client ID, Client Secret, **Environment = Sandbox (CIE)**.
   Click **Test** → must pass (a Track probe; gotchas §13 — the credential now sends the required
   `transId`/`transactionSrc` headers).
3. Import each workflow (**⋯ menu → Import from File**). On the UPS node, **select your credential**
   (the JSON has a placeholder `REPLACE_WITH_YOUR_CREDENTIAL_ID`).

## Run (normal path)

Open a workflow and click **Execute Workflow**, or headlessly:
`docker exec <container> n8n execute --id <workflowId>` (gotchas §9).

### Gate checklist
- [ ] **1 Track** — status + activity returned; Status-Only suppresses `activity[]`. Add a second
      input item with a bad number + enable **Settings → Continue On Fail** → that item carries a
      specific UPS reason, the good one still resolves (SC-003/007).
- [ ] **2 Validate** — `valid` + classification (CIE does street-level for US NY/CA only).
- [ ] **3 Get Rates** — multiple services, one output item each, transit days present. (Negotiated
      rates appear only if account `0C395V` is entitled on this lane — absent ≠ bug.)
- [ ] **4a Create domestic** — `label` binary is a GIF, filename = tracking number, **no
      `GraphicImage` in JSON**. Try **Label Format = ZPL** too.
- [ ] **4b Create international** — `customsInvoice` binary is a PDF; commodity payload accepted;
      phone present on shipper + consignee.
- [ ] **Boundary guards** — clear **Account Number** on Rate or Create → `NodeOperationError`
      *before* any UPS call. On `05`, clear the **Commodities** line → international guard fires.

> **Account `0C395V` is Canada-registered.** Rate/Create Shipper MUST be Canadian or Ship 400s with
> `120120` (gotchas §12). That's why Create uses a Toronto origin + service `11` (UPS Standard).

## Tool path (Gate 5 / T046)

Repeat each operation through the **AI-Agent tool path** (`usableAsTool: true`, Principle 11): add an
**AI Agent** node, attach the **UPS** node as a tool, and drive it with a prompt (e.g. *"track
1Z12345E0205271688"*). Requires an LLM credential, so it isn't pre-baked here. The harness must run
with `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` (already set in `scripts/harness.sh`).

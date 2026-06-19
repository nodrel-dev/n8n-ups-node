# n8n-nodes-ups

An [n8n](https://n8n.io) community node for **UPS**. It talks directly to the UPS REST API on
your own UPS application and account number — no aggregator, no runtime dependencies.

Four operations across three resources:

| Resource | Operation | What it does |
|----------|-----------|--------------|
| **Tracking** | Track | Current status + scan history for a tracking number |
| **Address** | Validate | Standardize + classify an address (residential/commercial) |
| **Shipping** | Get Rates | Service options with published & negotiated rates + transit times |
| **Shipping** | Create | Create a shipment, return tracking number + label (and customs invoice for international) |

The node sets `usableAsTool: true`, so every operation is callable from the AI-Agent **tool**
path as well as the normal node path.

## Installation

In n8n: **Settings → Community Nodes → Install** and enter `n8n-nodes-ups`.

## Credentials

The node uses a single credential, **UPS OAuth2 API**, that covers all four operations (one UPS
OAuth app entitles every endpoint).

1. Create an application in the [UPS Developer Portal](https://developer.ups.com/) and note its
   **Client ID** and **Client Secret**.
2. In n8n, create a **UPS OAuth2 API** credential:
   - **Environment** — `Sandbox (CIE)` (default) or `Production`. This single switch drives **both**
     the OAuth token URL and the API base URL, so they can never point at different hosts.
   - **Client ID** / **Client Secret** — from your UPS application.
3. Click **Test**. The test performs an authenticated Track probe; reaching UPS's Track layer
   (even a "not found") confirms your credentials and environment. A `401/403` means the Client ID,
   Secret, or Environment is wrong.

Grant type is OAuth2 **client credentials** (HTTP Basic, empty scope) — configured automatically;
nothing to set by hand. Secrets live only in n8n's encrypted credential store; never hardcode them.

### Sandbox vs Production

| | Sandbox (CIE) | Production |
|---|---|---|
| Token URL | `https://wwwcie.ups.com/security/v1/oauth/token` | `https://onlinetools.ups.com/security/v1/oauth/token` |
| API base | `https://wwwcie.ups.com/api` | `https://onlinetools.ups.com/api` |

The Customer Integration Environment (CIE) is limited test data — e.g. address validation returns
street-level results for **US NY/CA** addresses only.

## Operations

### Tracking → Track
- **Tracking Number** (required) — one inquiry number per input item.
- **Detail** — *Detailed* (status + scan history) or *Status Only* (current status only).
- **Locale** — e.g. `en_US`.

Unknown numbers are flagged on their own item; with **Continue On Fail** the rest still process.

### Address → Validate
- Address line(s), city, state/province, postal code, country.
- Returns one item with `resolution` (`valid` / `ambiguous` / `none`), a `classification`
  (UnClassified / Commercial / Residential), and standardized `candidates[]`.

### Shipping → Get Rates
- **Account Number** (required) — your ShipperNumber; also requests negotiated rates.
- Shipper / Ship To (and optional Ship From) addresses, package weight (+ unit) and optional
  dimensions (+ unit).
- **Customs Value** — required when origin and destination countries differ (international).
- Emits **one output item per service**, each with published + negotiated price, transit days, and
  any UPS alerts. If no negotiated rates are returned, a request-level alert is attached to the
  first item.

### Shipping → Create
- **Account Number** (required), **Service Code**, Shipper / Ship To (and optional Ship From),
  package weight/dimensions, **Label Format** (GIF default; ZPL / EPL / SPL — no PDF label).
- **International** (origin ≠ destination country) additionally requires the customs fields:
  reason for export, currency, terms of shipment, sold-to party, and at least one commodity line.
- Returns the tracking number plus the **label** as a binary attachment (`label`); international
  shipments also return the **commercial invoice** PDF (`customsInvoice`). Label/invoice image data
  is never embedded as a string in the JSON output.

Billing is to the shipper (transportation charges); international duties are billed to the receiver
(DDU) in this version.

## AI-Agent tool usage

Because the node is tool-enabled, an AI Agent can call any operation directly (e.g. "track
1Z…", "rate this shipment"). Test new workflows through both the normal node path and the tool
path.

## Development

```bash
npm install      # install dev dependencies
npm test         # run the pure-core unit tests (vitest)
npm run lint     # n8n community-node lint (strict)
npm run build    # compile to dist/
npm run dev      # run locally inside n8n (Node.js >= 22.22)
```

## License

[MIT](LICENSE)

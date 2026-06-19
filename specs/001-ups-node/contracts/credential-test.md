# Contract: Credential Test (`UpsOAuth2Api`)

Single OAuth2 client-credentials credential covering all four UPS APIs (Principle 6, ADR-0002).

## Credential fields
- `clientId`, `clientSecret` — App Credentials (HTTP Basic on token request).
- `environment` — `sandbox` (default) | `production`.
- Hidden OAuth2 settings: `grantType: clientCredentials`, empty `scope`, `authentication: header`.

## Host derivation (must never split)
| | Sandbox (CIE) | Production |
|---|---|---|
| Token URL (`$self["environment"]`) | `https://wwwcie.ups.com/security/v1/oauth/token` | `https://onlinetools.ups.com/security/v1/oauth/token` |
| API base URL (`$credentials.environment`) | `https://wwwcie.ups.com/api` | `https://onlinetools.ups.com/api` |

Token endpoint has **no `/api`**; API base **includes `/api`** (delta 13.2).

## Token request
`POST /security/v1/oauth/token`, `grant_type=client_credentials`, client id/secret as **HTTP
Basic**, **empty scope**. Use n8n built-in `oAuth2Api`; do not hand-roll. ✅ **VERIFIED-LIVE
2026-06-18**: empty scope accepted → HTTP 200 (gotchas §2).

## Test request (ADR-0002)
`GET /api/track/v1/details/1Z00000000000000000` against the environment-derived base URL, **with
the required Track headers `transId` + `transactionSrc`** (without them the probe 400s even with
valid credentials — gotchas §13).
- **Pass**: reaching UPS's Track business layer. Proves App Credentials + host + single-app
  entitlement.
- **Fail**: `401/403` → "Check your Client ID, Secret, and Environment."
- ✅ **VERIFIED-LIVE 2026-06-19**: CIE returns a canned **`200 DELIVERED`** for the placeholder, so
  the **bare test passes — no `responseCode`/`responseSuccessBody` rule needed**; a bad credential
  still `401/403`s (ADR-0002 amendment). There is no observable not-found path in CIE.

## Maps to
FR-001, FR-002, FR-003, FR-004, FR-011, SC-001, SC-006.

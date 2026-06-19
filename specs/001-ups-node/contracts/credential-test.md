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
Basic**, **empty scope**. Use n8n built-in `oAuth2Api`; do not hand-roll. `[VERIFY-LIVE]` empty
scope accepted (gotchas §2).

## Test request (ADR-0002)
`GET /api/track/v1/details/{fixed placeholder 1Z number}` against the environment-derived base URL.
- **Pass**: reaching UPS's Track business layer (incl. a "not found"). Proves App Credentials +
  host + single-app entitlement.
- **Fail**: `401/403` → "Check your Client ID, Secret, and Environment."
- `[VERIFY-LIVE]`: Track not-found status — `200 + error body` (n8n default test passes, no
  `rules`) vs `4xx` (add a `responseCode`/`responseSuccessBody` rule).

## Maps to
FR-001, FR-002, FR-003, FR-004, FR-011, SC-001, SC-006.

# Constitution: __FULLNAME__

> Spec Kit constitution. Non-negotiable principles for a verified n8n community node.
> Carrier/service-agnostic base; add service-specific notes per project.
> Place at `.specify/memory/constitution.md`.

**Service:** __SERVICE__
**Ratified:** [DATE]
**Version:** 1.0.0

---

## Principle 1: Single-Service Scope (NON-NEGOTIABLE)
The package integrates exactly one third-party service: __SERVICE__. No other service,
aggregator, or unrelated utility. A trigger node may ship alongside the main node;
nothing else. n8n's verification gate rejects multi-service packages.

## Principle 2: Zero Runtime Dependencies (NON-NEGOTIABLE)
Verified nodes may not declare run-time dependencies. All HTTP goes through n8n's
built-in helpers (`httpRequest` / `httpRequestWithAuthentication`). No vendor SDK,
axios, XML library, or SOAP client in `dependencies`. Dev-only deps are fine. Shared
logic is COPIED from the scaffold, never imported as a published runtime package.

## Principle 3: TypeScript + n8n Guidelines + Linter Clean (NON-NEGOTIABLE)
TypeScript, following n8n's node guidelines. `n8n.strict: true`. Must pass
`npx @n8n/scan-community-package <name>` with zero errors. Built with the `n8n-node` CLI.

## Principle 4: English-Only Interface and Documentation
All parameter names, descriptions, help text, errors, and README content in English.

## Principle 5: Declarative Style Preferred
Default to the declarative (routing-based) style. Drop to programmatic only where the
declarative style genuinely can't express an operation; document each exception.

## Principle 6: Credentials Are First-Class and Never Hardcoded
A dedicated credential type with a `test` request. No secret in logs, errors, URLs, or
committed files. Real secrets only in a gitignored `.env.local`; rotate on any leak.

## Principle 7: Production-Grade Error Handling
Map API errors to clear, actionable n8n messages. Honor `continueOnFail`. Respect rate
limits; bounded retry with backoff on transient 5xx/throttle; no retry on 4xx.

## Principle 8: No Competition With n8n Paid Features
Scope stays strictly within __SERVICE__ operations.

## Principle 9: Provenance Publishing
Publish via GitHub Actions with a provenance statement (npm OIDC Trusted Publishing).
Required for verification submissions from May 1, 2026.

## Principle 10: Test-First for Transformation Logic
Non-trivial transforms (status mapping, normalization, unit conversion, payload
assembly) ship with unit tests written before the implementation.

## Principle 11: AI-Agent Tool Compatibility (NON-NEGOTIABLE)
`usableAsTool: true`. Test every operation through both the normal path and the
AI-Agent tool path. Multi-credential nodes must disambiguate on a param named
`authentication`, never `operation`. (gotchas §1)

## Principle 12: Verify Against Live Behaviour, Not Docs Alone (NON-NEGOTIABLE)
Confirm the token exchange and every endpoint's entitlement with a real call on the
through-n8n path. Scope and entitlement details misstate often enough that they can't be
trusted blind. (gotchas §2, §3)

---

## Inherited Engineering Guardrails
See `docs/n8n-gotchas.md`. Highlights: Node >= 22.22; `incremental` OFF +
`npm pack --dry-run`; publish via `n8n-node release` not `npm publish`; OIDC provenance;
reviewers pull the latest npm version and require GitHub transparency; Docker harness via
`n8n execute --id`.

## Amendment Process
Version bump (semver) + dated entry + re-run `/speckit.plan` to re-check downstream
artifacts.

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | [DATE] | Initial ratification |

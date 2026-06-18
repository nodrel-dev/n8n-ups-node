# __FULLNAME__ — Claude Code project memory

A verified-targeted n8n community node for __SERVICE__, scaffolded with the n8n-node CLI.
Rules are imperative. Rationale lives in the imports below; do not duplicate it here.

## Source of truth (imports)
- @.specify/memory/constitution.md — non-negotiable principles. If anything here
  conflicts with the constitution, the constitution wins.
- @specs/ — current feature spec, scope, endpoint map, verify-live items.
- @docs/n8n-gotchas.md — known build/release/test traps.
- @package.json — actual scripts, the `n8n` attribute, and the engine requirement.

## Rules
- Zero runtime dependencies. Built-in n8n HTTP helpers only. Never add a SOAP/XML/SDK dep.
- Node.js >= 22.22 for `n8n-node dev`.
- Build/lint/dev/release go through the n8n-node CLI. Publish only via `npm run release`
  (wraps `n8n-node release`); never raw `npm publish`.
- Keep TypeScript `incremental` OFF. Run `npm pack --dry-run` before every release.
- Set `usableAsTool: true`. Test every operation through BOTH the normal node path and
  the AI-Agent tool path (`npm run harness`).
- Secrets only in gitignored `.env.local`. Never hardcode secrets anywhere; rotate on leak.
- Conventional commits (feat/fix/chore/...). The changelog and version bump are derived
  from commit messages; keep npm and the GitHub repo in lockstep on each release.
- Declarative node style by default; programmatic only with a documented reason.

## Definition of done
- `npm run lint` clean and `npx @n8n/scan-community-package __FULLNAME__` passes.
- Verified through normal AND AI-Agent tool paths in the Docker harness.
- No new runtime dependency introduced.

If a rule is better enforced by CI or a lint/hook check, prefer that over relying on prose.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

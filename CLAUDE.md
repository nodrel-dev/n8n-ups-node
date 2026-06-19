# __FULLNAME__ — Claude Code project memory

A verified-targeted n8n community node for __SERVICE__, scaffolded with the n8n-node CLI.
Rules are imperative. Rationale lives in the imports below; do not duplicate it here.

## Source of truth (imports)
- @internal/.specify/memory/constitution.md — non-negotiable principles. If anything
  here conflicts with the constitution, the constitution wins.
- @internal/specs/ — current feature spec, scope, endpoint map, verify-live items.
- @docs/n8n-gotchas.md — known build/release/test traps.
- @package.json — actual scripts, the `n8n` attribute, and the engine requirement.

> The `internal/` imports live in the **private companion repo**
> (`nodrel-dev/n8n-ups-node-internal`), gitignored from this public repo. On a fresh
> clone, run `./bootstrap-internal.sh` to restore them — see "Public vs private split".

## Rules
- Zero runtime dependencies. Built-in n8n HTTP helpers only. Never add a SOAP/XML/SDK dep.
- Node.js >= 22.22 for `n8n-node dev`. All GitHub Actions workflows pin **Node 24**
  (`actions/setup-node` `node-version: '24'`) — keep every workflow on 24, not `lts/*` or `22`.
- Build/lint/dev go through the n8n-node CLI. Releases are driven by **release-please**:
  merge the auto-generated release PR on `main` and the `release-please.yml` workflow tags,
  publishes to npm with provenance, and scans. Never run a release or `npm publish` locally;
  the `prepublishOnly` guard blocks raw `npm publish` (CI sets `RELEASE_MODE=true`).
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

## Public vs private split

This public repo (`nodrel-dev/n8n-nodes-ups`) ships only what's safe to publish: the
node source, public docs (`README.md`, `docs/` incl. the public ADRs, `CONTEXT.md`,
`AGENTS.md`/`.agents/`), and config. Everything sensitive lives in a **private companion
repo**, `nodrel-dev/n8n-ups-node-internal`, cloned into `internal/` (gitignored here):

- `ups-api-documentation/` — copyrighted UPS API specs.
- `ups-node-build-brief.md` — the commercial build brief.
- `specs/` and `.specify/` — spec-kit feature spec, planning, and the constitution.

On a fresh clone, restore it with `./bootstrap-internal.sh` (defaults to the SSH remote;
pass a different remote as `$1`). `internal/`, `.claude/`, `.specify/`, `.vscode/`,
`.harness-stage/`, `.env.local`, and `*.tgz` are all gitignored — never commit them here.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
@internal/specs/001-ups-node/plan.md (with research.md, data-model.md, contracts/, and
quickstart.md alongside it).
<!-- SPECKIT END -->

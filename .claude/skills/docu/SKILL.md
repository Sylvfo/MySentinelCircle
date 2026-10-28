---
name: docu
description: Update MySentinelCircle's generated documentation — API.md, backend/prisma/DB_schema.md, STACK_SCHEMA.md, TEST.md, FEATURES.md, or PERMISSIONSCLAUDE.md — one target or all of them.
---
Updated: 2026-10-21

# Docu

Regenerates documentation from the current state of the code, so it never quietly drifts from what's actually implemented.

## Usage

`/docu <target>`, where target is one of:

- `all` — run every target below, in order
- `api` — update `API.md` (repo root)
- `prisma` — update `backend/prisma/DB_schema.md`
- `stack` — update `STACK_SCHEMA.md` (repo root)
- `test` — update `TEST.md` (repo root)
- `features` — sync `FEATURES.md` (repo root)
- `permissions` — sync `PERMISSIONSCLAUDE.md` (repo root)

If invoked with no target, ask Sylvie which one she means rather than guessing.

## 1. api

- Walk `backend/src/*/*.controller.ts` for routes: HTTP method, path, guards, request/response DTOs.
- Write/update `API.md` at repo root: one section per NestJS module, listing each endpoint with method + path + short description.

## 2. prisma

- Read `backend/prisma/schema.prisma`.
- Regenerate `backend/prisma/DB_schema.md`: global ER diagram (Mermaid) plus the existing role-based views (Sentinel/Companion, before/during-alert). Keep the file's existing structure, just refresh the content from the current schema.
- Never edit `schema.prisma` itself — it's Sylvie's file by hand, per `CLAUDE.md`.

## 3. stack

- Update `STACK_SCHEMA.md` at repo root: a conceptual overview of the whole stack — backend modules (per `plan.txt`'s BACKEND MODULES section), frontend structure, and how the pieces connect (API calls, auth, messaging, DB via Prisma).
- Keep it architectural (Mermaid diagrams welcome), not a route-by-route listing — that's `api`'s job.

## 4. test

- Walk `backend/src/**/*.spec.ts` (unit) and `backend/test/**/*.e2e-spec.ts` (e2e) for the current list of test files, and read each one to summarize what it actually covers (per method/branch, not just the filename).
- Read `backend/package.json`'s `scripts` (`test`, `test:e2e`) and `jest`/`backend/test/jest-e2e.json` configs, plus `.github/workflows/backend-ci.yml` if present, to describe accurately when each kind of test runs (local, on push/PR, via a Claude Code hook if one is configured in `.claude/settings.json`).
- Update `TEST.md` at repo root: keep its existing structure (when tests trigger, current test list with what each covers, where to see output, tests still to write, test infra reference) — refresh the content from what's actually in the code, don't hand-wave.
- The "tests restant à écrire" section is judgment, not pure derivation: compare each service's public methods/branches against what the specs actually exercise, and list the gaps.

## 5. features

- Run `gh issue list --state all --json number,title,labels,state` (or `gh issue view <n>` for the specific numbers already referenced in the file) to list each feature's issues (open/closed) — issue numbers in the table are still sourced from `gh`, never invented.
- **A feature's displayed state is derived from the actual code, not from the GitHub `state:*` label** — the label drifts (nobody relabels an issue as the module evolves), the code doesn't. For each feature's backend module(s) under `backend/src/`:
  - Empty/skeleton controller+service (no real routes, no service logic — a handful of lines) → `backlog` or `todo`. Code can't tell these two apart (it's a priority call, not a progress one) — keep whichever of the two the file already shows, or fall back to the issue's own label if it carries one of these two.
  - Real implementation exists (routes + service logic) but no dedicated unit-test spec file for it → `constructing`.
  - Real implementation exists **and** has a dedicated `*.spec.ts` with meaningful coverage (not just a boilerplate single test) → `testing`.
  - `locked` and `prod` are never inferred from code — these are a deliberate designation only Sylvie sets by hand (e.g. "don't touch without asking"); carry them over unchanged from the file's current content, don't downgrade or upgrade into/out of them based on code.
- If the GitHub label on an issue disagrees with the code-derived state, don't silently override the issue — note the mismatch (which issue, which label, what the code shows) so Sylvie can relabel it on GitHub herself (`gh issue edit`/`gh label edit` are `deny`-locked for Claude, see `PERMISSIONSCLAUDE.md`).
- Add a row for a feature with issues that isn't listed yet.
- Leave **Project phases** and **Legend** alone — those are stable, hand-authored, not derived from issue state.
- Never edit issues themselves (no `gh issue edit`) — this target only reads.

## 6. permissions

- Read the `"deny"` array in `.claude/settings.json`.
- Update `PERMISSIONSCLAUDE.md`'s "What's protected" list to match exactly what's actually denied — this file documents policy for a human reader, `.claude/settings.json` is the enforced source of truth; keep the doc from drifting out of sync with it.
- Never edit `.claude/settings.json` itself — same rule as `schema.prisma`, propose changes in conversation for Sylvie to apply by hand (see `CLAUDE.md`).

## 7. all

Run `api`, then `prisma`, then `stack`, then `test`, then `features`, then `permissions`, in that order.

## Notes

- These are derived docs: always regenerate from the current code/schema/settings rather than hand-editing them out of sync.
- Every file this skill touches has an `Updated: <date>` line near the top. Each time a file is actually regenerated, set that line to the current date **and time** (e.g. `Updated: 2026-08-21 16:21`), not just the date — get the real current time (e.g. `date "+%Y-%m-%d %H:%M"`), never guess it.
- After updating, tell Sylvie which file(s) changed. Don't commit automatically.

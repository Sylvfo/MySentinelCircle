# Permissions — Claude

Updated: 2026-10-21 14:41

## Why

Three kinds of file/action are locked out from Claude entirely, for three different reasons: the Docker/nginx/MariaDB infra shouldn't be touched casually once feature modules are being built on top of it; `schema.prisma`/`.claude/settings.json` are Sylvie's own files to hand-edit (see `CLAUDE.md`); and GitHub issues/labels are the project's human-owned source of truth for what's planned, not something an agent should mutate.

## What's protected

`deny` in `.claude/settings.json`, in three groups:

**Infra files** — edit/write blocked outright:
- `docker-compose.yml`
- `nginx/**`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `backend/.dockerignore`
- `frontend/.dockerignore`

**Schema & Claude's own settings** — edit/write blocked outright:
- `backend/prisma/schema.prisma`
- `.claude/settings.json`

This now matches the `CLAUDE.md` convention (propose a diff in conversation for Sylvie to apply by hand) with an actual hard enforcement — Claude can't apply either file directly even if it tried to.

**GitHub issues & labels** — write commands blocked outright (reads, e.g. `gh issue list`/`gh issue view`, are unaffected):
- `gh issue create` / `gh issue comment` / `gh issue edit` / `gh issue close` / `gh issue reopen`
- `gh label create` / `gh label edit` / `gh label delete`

This is why `/docu features` can only read issue state, never close or label one — see its own note to "ask Sylvie to close it herself" when an issue looks done.

`deny` blocks the action outright for all three groups — Claude cannot apply a change or run the command in the same turn at all, even with Sylvie's in-conversation approval.

## Procedure when a change is genuinely needed

1. Claude stops and explains in conversation what change is needed and why.
2. Sylvie decides: apply it herself (edit the file / run the `gh` command), or temporarily loosen the relevant `deny` rule in `.claude/settings.json` (by hand, same rule as always) to let Claude apply it directly.
3. Nothing in this list gets touched without that explicit back-and-forth first — that pause is the point.

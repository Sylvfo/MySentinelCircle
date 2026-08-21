# Permissions — Claude

Updated: 2026-08-21 16:21

## Why

The Docker/nginx/MariaDB stack now works end-to-end. From here on, feature modules get built on top of it — this infra shouldn't be touched casually while that happens.

## What's protected

`deny` in `.claude/settings.json` on:
- `docker-compose.yml`
- `nginx/**`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `backend/.dockerignore`
- `frontend/.dockerignore`

`deny` blocks the edit outright — unlike the `schema.prisma`/`settings.json` "propose a diff in conversation" pattern, Claude cannot apply a change to these files in the same turn at all, even with Sylvie's in-conversation approval.

## Procedure when a change is genuinely needed

1. Claude stops and explains in conversation what change is needed and why.
2. Sylvie decides: apply it herself, or temporarily loosen the relevant `deny` rule in `.claude/settings.json` (by hand, same rule as always) to let Claude apply it directly.
3. No infra file gets touched without that explicit back-and-forth first — that pause is the point.

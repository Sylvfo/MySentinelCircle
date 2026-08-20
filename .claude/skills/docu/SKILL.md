---
name: docu
description: Update MySentinelCircle's generated documentation — API.md, backend/prisma/DB_schema.md, or STACK_SCHEMA.md — one target or all of them.
---

# Docu

Regenerates documentation from the current state of the code, so it never quietly drifts from what's actually implemented.

## Usage

`/docu <target>`, where target is one of:

- `all` — run every target below, in order
- `api` — update `API.md` (repo root)
- `prisma` — update `backend/prisma/DB_schema.md`
- `stack` — update `STACK_SCHEMA.md` (repo root)

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

## 4. all

Run `api`, then `prisma`, then `stack`, in that order.

## Notes

- These three files are derived docs: always regenerate from the current code/schema rather than hand-editing them out of sync.
- After updating, tell Sylvie which file(s) changed. Don't commit automatically.

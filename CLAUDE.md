# CLAUDE.md

Updated: 2026-08-21

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@.claude/lastupdate.md

## Project

MySentinelCircle: a mutual safety-net app. Each user ("Me") builds tiered circles of trusted people ("Sentinels") who watch over them; alerts escalate outward through circles if the closest one can't resolve them. Full product spec is in `plan.txt` at the repo root — read it before working on any feature that touches circles, sentinel roles, or the alert lifecycle, since the DB schema encodes that spec's rules.

Monorepo: `backend/` (NestJS + Prisma + MariaDB, containerized) and `frontend/` (React + Vite + i18next). Full stack decisions (hosting, real-time, rate limiting, infra) are in `STACK_SCHEMA.md` at the repo root — read it before working on deployment, WebSocket, or infra-related changes.

## Commands

### Backend (`backend/`)
```bash
npm install
npx prisma migrate dev --name <description>   # after editing schema.prisma
npx prisma generate                            # regenerate client only
npm run start:dev                              # NestJS with watch
npm run lint
npm run test                                   # jest, all specs
npx jest path/to/file.spec.ts                  # single spec
npm run test:e2e
npm run build
```
`DATABASE_URL` (MariaDB connection string) must be set in `backend/.env` before the app boots past `PrismaService.onModuleInit`.

### Frontend (`frontend/`)
```bash
npm install
npm run dev
npm run build
npm run lint     # oxlint
```

## Architecture

- **Data model**: `backend/prisma/schema.prisma` is the live source of truth for the domain model. `backend/prisma/DB_schéma.md` mirrors it with Mermaid ER diagrams (global view + role-based "Sentinel"/"Companion" views + before/during-alert views) — regenerate it whenever the schema changes materially.
- **Core schema principle**: nothing is ever hard-deleted. `User`/`Circle`/`LinkSentinels` close or anonymize (`status`, `closedAt`, `deletedAt`) instead of being removed, so they stay permanently referenceable. There are no snapshot/copy tables (the old `CircleAlert`/`LinkSentinelAlert` were removed in favor of this) — `AlertParticipant` records what happened during a given alert by referencing the live `LinkSentinels` row directly, freezing only the handful of fields that could otherwise drift after the fact (e.g. `circleId`/`circleName`, `canSendPhoneAtAlert`). `LinkSentinelsEvent` is an append-only log of status transitions, independent of alerts.
- **Fluid business rules stay in application code, not DB constraints** — e.g. "exactly one active `LinkSentinels` per sentinel+companion pair," "at least one Lead Sentinel per 1st circle," "which `Conversation`s a user may see." The schema deliberately doesn't enforce these with unique/check constraints where doing so would require awkward modeling; they're validated in services instead.
- **`Conversation`/`ConversationParticipant`/`Message`** is one generic messaging model reused for every context (permanent 1:1 companion↔sentinel chat, 1st-circle group chat, circle-to-circle, isolated sentinel↔1st-circle chat during an alert). There's no `type` column — which kind a conversation is gets inferred from its participants and whether `alertId` is set, in the backend.
- **Backend modules** (`backend/src/`) follow `plan.txt`'s BACKEND MODULES section, one NestJS module per concern: `auth`, `user`, `sentinel` (circles/memberships), `alert`, `organization`, `messaging`. Several are still skeletons (empty controller/service) — the schema was reworked ahead of the module logic.
- **Alert lifecycle**: `Alert` has one milestone timestamp per stage it can pass through (`launchedAt`/`activatedAt`/`closingAt`/`closedAt`) rather than a separate event-log table — the lifecycle is treated as roughly linear per alert.

## Working on `schema.prisma`

Sylvie edits `backend/prisma/schema.prisma` by hand herself. Propose schema changes as Prisma code in the conversation for her to apply — don't write to that file directly.

## Working on `.claude/settings.json`

Same rule as `schema.prisma`: Sylvie edits `.claude/settings.json` by hand herself. Propose permission changes as JSON in the conversation for her to apply — don't write to that file directly, even for a change she's already approved verbally.

Destructive Prisma commands against the Neon dev database (`prisma migrate reset`, or anything that would drop/recreate data) require Sylvie's fresh, explicit confirmation in that same turn before running, even if she approved a similar action earlier in the conversation — Prisma's own safety guard blocks these for AI agents without it.

## Linkds
- @.claud/convention/code-style.md
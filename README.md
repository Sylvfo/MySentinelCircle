# MySentinelCircle

A safety-net platform built to fight isolation: each person builds their own circle of trusted contacts — family, neighbors, friends — who can be alerted and mobilized in real time the moment something goes wrong, from a missed check-in to an accident.

On the product side, the user stays in control at every step: who can contact them, who can be contacted around them, and which actions or communications are allowed within their circles.

**Languages & Tools:** TypeScript, NestJS, React, Prisma, MariaDB, WebSockets, REST APIs, JWT, Docker, Git, Claude Code

**Skills:** Software architecture, database modeling, access control design, real-time systems, spec-driven development, AI coding-agent orchestration

---

## Development approach

*Developed solo, using Claude Code as an AI coding agent throughout the build — spec-driven and AI-assisted, not "vibe-coded."*

The project followed a deliberate sequence, not an agent left to freewheel:

1. **Idea and product design first, in plan mode.** The business rules, the general behavior of the app, and how users interact with each other (Companion ↔ Sentinel, circle tiers, alert escalation) were worked out with Claude in plan mode before any code existed — see `plan.txt`.
2. **Database structure designed by hand.** The Prisma schema (`backend/prisma/schema.prisma`) was built by me, with Claude used to think through and challenge the modeling choices — not to generate it outright. By this stage most of the architecture was already settled: models, relations, permissions, alert history, conversations, roles.
3. **Module architecture decided before implementation.** The backend's module boundaries were reasoned about up front, before letting the agent write any implementation code.
4. **Implementation, agent-assisted but directed.** Claude Code carries a significant share of the implementation work, but always under direction: a spec, a plan, then review and validation of every change before it ships.

> Practicing spec-driven development with an AI coding agent (Claude Code): persistent project memory (`CLAUDE.md`-style context), reusable agent skills, and a plan/act workflow to review and validate every change before it ships.

Supporting pieces of that workflow:
- **Persistent project context** — `CLAUDE.md` plus per-topic notes (`.claude/lastupdate.md`, `.claude/preferencesSyl/`) give the agent durable context across sessions instead of re-explaining the project every time.
- **Reusable agent skills** — repeatable procedures (`new-session`, `end-session`, `new-feature`, `debug`, `docu`) codify how recurring work gets done, consistently.
- **Plan → act → review/validate** — features are planned before implementation, and changes are reviewed and validated rather than trusted blindly.
- **Scoped agent permissions** — what the agent is and isn't allowed to touch is enforced through `.claude/settings.json` (e.g. infra files and `schema.prisma` are locked; changes there are proposed in conversation for manual application, never written directly).

## How to run it

### Prerequisites

Docker with Compose v2, Node.js 22, GNU Make, OpenSSL.

### First install on a new machine

```
git clone https://github.com/Sylvfo/MySentinelCircle.git
cd MySentinelCircle
make setup
```

`make setup` can be re-run safely: it keeps existing env files and data. It:

1. creates `.env`, `backend/.env` and `backend/.env.test` from their examples
2. installs the backend and frontend dependencies
3. generates the self-signed certificates in `nginx/ssl/`
4. starts MariaDB and creates the tables from the Prisma migrations
5. creates the `mysentinelcircle_test` database
6. seeds the demo accounts, listed with their password in `backend/test-users.local.md`

To use your own database passwords, copy `.env.example` to `.env` and edit it before running `make setup`.

Google sign-in stays off in the backend until `GOOGLE_CLIENT_ID` is set in `backend/.env`.

To restore the demo accounts later, run `make db-seed`. It can be re-run safely and only touches the accounts it created.

### Start the app

| Command | Mode | Open |
|---|---|---|
| `make` | Backend and frontend on the host, MariaDB in Docker | http://localhost:5173 |
| `make docker-up` | Everything in Docker, behind nginx | https://localhost:4444 (accept the self-signed certificate) |

`make nosmsnow` is optional: run it in its own terminal to see SMS and reply to them. With `make docker-up`, use `make nosmsnow-docker`. See [NOSMSNOW.md](documentation/NOSMSNOW.md).

### After a `git pull`

```
make install db-migrate
```

`make docker-up` applies pending migrations on its own when the backend starts.

### Stop the app

```
make docker-down
```

Your data stays in the Docker volumes, and `make db-down` stops only MariaDB.

`docker compose down -v` also **permanently deletes** those volumes: the dev and test databases and the uploaded files. After that, `make setup` rebuilds the tables and demo accounts, but nothing else comes back.

## Documentation

- Database schema: [backend/prisma/DB_schema.md](backend/prisma/DB_schema.md)
- Stack & infra decisions: [STACK_SCHEMA.md](documentation/STACK_SCHEMA.md)
- Full product spec: [plan.txt](plan.txt)
- Feature list / roadmap: [FEATURES.md](documentation/FEATURES.md)
- Claude permission rules: [PERMISSIONSCLAUDE.md](documentation/PERMISSIONSCLAUDE.md)

## Claude setup

- **`CLAUDE.md`** — general project rules for the agent.
- **Claude's own notes** — kept on my machine, outside the project, read-only for Claude.
- **Permissions (hard rules)** — `.claude/settings.json`, `documentation/FEATURES.md`.
- **Procedures** — `new-session`, `end-session`, `new-feature`, `debug`.

## Test

```
cd backend
npm run test
npm run test:e2e
```

## loops

## hooks

## verification

## no sms
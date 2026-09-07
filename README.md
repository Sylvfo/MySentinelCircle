# MySentinelCircle

Work in progress :)

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

```
make
```

→ https://localhost:4444/

## Documentation

- Database schema: [backend/prisma/DB_schema.md](backend/prisma/DB_schema.md)
- Stack & infra decisions: [STACK_SCHEMA.md](STACK_SCHEMA.md)
- Full product spec: [plan.txt](plan.txt)
- Feature list / roadmap: [FEATURES.md](FEATURES.md)
- Claude permission rules: [PERMISSIONSCLAUDE.md](PERMISSIONSCLAUDE.md)

## Claude setup

- **`CLAUDE.md`** — general project rules for the agent.
- **Claude's own notes** — kept on my machine, outside the project, read-only for Claude.
- **Permissions (hard rules)** — `.claude/settings.json`, `FEATURES.md`.
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

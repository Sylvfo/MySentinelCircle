# Features

Updated: 2026-08-21 16:26

## Project phases

The project as a whole moves through these macro phases, in order — the database is treated as the immutable foundation everything else builds on top of, not something casually reopened:

1. Plan
2. Database (build on top of it, don't modify once set)
3. Backend, with a light frontend alongside
4. Build out the modules and API routes
5. Security
6. Work on the frontend
7. Security (pass again, frontend-side)

## Product features

| Feature | State | Issues |
|---|---|---|
| Authentication | 🟠 constructing | #11, #13, #14, #15 |
| Sentinel / Circles | 🔵 todo | #12 |
| Organizations | 🔵 todo | #10 |
| Alert | ⚪ backlog | #18 (closed, unlabeled — module is still an empty skeleton in code; see note below) |
| Messaging | ⚪ backlog | #19 |
| Notifications | ⚪ backlog | #7 |
| Internationalization (i18n) | 🟠 constructing | #16 |
| Infrastructure & Architecture | 🟢 locked | #8, #9 — both closed this session (stack decisions + MariaDB/Docker/nginx/HTTPS all working end-to-end) |

A feature's state is the least-advanced state among its open issues — update it as issues move.

## Tooling / process (not product features)

Issues about how we work with Claude and keep the project's own documentation in shape, not about the product itself:

- #3 Setup Claude in project (closed)
- #4 Set up Claude loop, hooks, verification skills
- #5 Update plan
- #6 Schémas (documentation upkeep)
- #17 Divers (misc open points from `plan.txt`)
- #20 Procedure plan

> **Data-quality note (from `/docu features`, 2026-08-21 16:26)**: most open issues carry no `state:*` label at all (only #3, #5, #6, #8, #11, #12 do) — the states shown above for unlabeled issues are carried over unchanged from before this sync, not derived from a real label, since there's nothing to derive from. Also, **#18 (Alert) is closed but empty (no body) and the `alert` backend module is still an untouched skeleton** — looks like it may have been closed by mistake; worth checking.

## Legend

| Label | Color | Meaning |
|---|---|---|
| `state:backlog` | ⚪  | Worth doing eventually, not a priority right now. |
| `state:todo` | 🔵 | Planned, not started yet. |
| `state:planning` | 🟡 | Need/scope being framed (PRD, alignment with `plan.txt`), or being broken into testable slices. |
| `state:constructing` | 🟠  | Actively being coded. |
| `state:testing` | 🟣  | Code exists, being tested and secured. |
| `state:locked` | 🟢 | Tested and secured — only touch this module after asking Sylvie first, even in an otherwise permissive session. |
| `state:prod` | 🟢  | Live in production. |


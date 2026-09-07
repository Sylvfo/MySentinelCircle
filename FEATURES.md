# Features

Updated: 2026-08-24 15:18

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
| Authentication | 🟠 constructing | #11, #13, #14, #15 (closed) |
| User | 🔵 todo | #26 (no label — module still an empty skeleton in code, see note below) |
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
- #6 Schémas (documentation upkeep) (closed)
- #17 Divers (misc open points from `plan.txt`)
- #20 Procedure plan
- #24 sms-like-programm (NoSMSNow dev tool — built and tested)
- #25 Testings — this session's whole test-infra + auth-coverage work (isolated `mysentinelcircle_test` DB, unit + e2e specs, CI) lives under this issue; still open on GitHub since closing/commenting is `deny`-locked for Claude, ask Sylvie to close it herself if she considers it done.

> **Data-quality note (from `/docu features`, 2026-08-24 15:18)**: most open issues carry no `state:*` label at all (only #5, #11, #12 do now — #6 and #8 closed since the last sync) — the states shown above for unlabeled issues are carried over unchanged from before, not derived from a real label, since there's nothing to derive from. **#11 (Authentication) itself carries two conflicting labels** (`state:todo` and `state:constructing` simultaneously) — likely a stale label left on, not corrected here since it's a GitHub-side edit, not a doc regen. Also, **#18 (Alert) is closed but empty (no body) and the `alert` backend module is still an untouched skeleton** — looks like it may have been closed by mistake; worth checking. **New issues found this sync, not previously listed**: #24, #25 (added above), #26 (added to Product features above).

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


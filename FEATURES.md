# Features

Updated: 2026-09-09 15:24

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
| Authentication | 🟠 constructing | #13, #31 (open, no label — carried over, see note below); #11, #14, #15 (closed) |
| User | 🔵 todo | #29, #31 (open, no label — carried over, see note below); #26 (closed) |
| Sentinel / Circles | 🔵 todo | #12 (`state:todo` — carried as-is; see note below) |
| Organizations | 🔵 todo | #10 (no label) |
| Alert | ⚪ backlog | #18 (closed, unlabeled — module is still an empty skeleton in code; see note below) |
| Messaging | ⚪ backlog | #19 (no label) |
| Notifications | ⚪ backlog | #7 (no label) |
| Internationalization (i18n) | 🟠 constructing | #16 (no label — carried over) |
| Infrastructure & Architecture | 🟢 locked | #8, #9 — both closed (stack decisions + MariaDB/Docker/nginx/HTTPS all working end-to-end) |

A feature's state is the least-advanced state among its open issues — update it as issues move.

## Tooling / process (not product features)

Issues about how we work with Claude and keep the project's own documentation in shape, not about the product itself:

- #3 Setup Claude in project (closed)
- #4 Set up Claude loop, hooks, verification skills
- #5 Update plan (`state:todo`)
- #6 Schémas (documentation upkeep) (closed)
- #17 Divers (misc open points from `plan.txt`)
- #20 Procedure plan (closed)
- #24 sms-like-programm (NoSMSNow dev tool — built and tested; still open)
- #25 Testings — this session's whole test-infra + auth-coverage work (isolated `mysentinelcircle_test` DB, unit + e2e specs, CI) lived under this issue; now closed on GitHub.

> **Data-quality note (from `/docu features`, 2026-09-09 15:24)**: almost every open issue carries no `state:*` label at all (only #5 and #12 do now). For unlabeled open issues, the states shown above are carried over unchanged from the previous sync, not derived from a real label — there is nothing to derive from. **#12 (Sentinel / Circles) is still labeled `state:todo`**, but the module is by far the most built-out in the codebase (1210 lines, 13 routes, full lead-slot/link-lifecycle logic, 104 passing unit tests) — the label looks stale; Claude can't edit issue labels (`deny`-locked), so this needs Sylvie's own look. **#18 (Alert) is closed but empty (no body) and the `alert` backend module is still an untouched 17-line skeleton** — looks like it may have been closed by mistake; still worth checking. **#29 ("delete user") was open but untracked in this file until now** — added to the User row. **#31 ("auth/user to do later") is new since the last sync, open, unlabeled, and spans both Authentication and User** — added to both rows. **#11 (Authentication)'s previous conflicting-labels caveat no longer applies — that issue is now closed.**

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


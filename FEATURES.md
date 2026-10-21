# Features

Updated: 2026-10-21 15:21

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

| Feature | State | Code evidence | Issues (traceability only) |
|---|---|---|---|
| Authentication | 🟣 testing | `backend/src/auth` (723 lines) + `auth.service.spec.ts` (35 tests) | #13, #31 (open); #11, #14, #15 (closed) |
| User | 🟣 testing | `backend/src/user` (728 lines) + `user.service.spec.ts` (37 tests) | #29, #31 (open); #26 (closed) |
| Sentinel / Circles | 🟣 testing | `backend/src/sentinel` (1241 lines) + `sentinel.service.spec.ts` (34 tests) | #12 (open, still `state:todo` on GitHub — stale, see note below) |
| Organizations | 🔵 todo | `backend/src/organization` — 17-line skeleton | #10 (open, no label) |
| Alert | ⚪ backlog | `backend/src/alert` — 17-line skeleton | #18 (closed, unlabeled — see note below) |
| Messaging | ⚪ backlog | `backend/src/messaging` — 17-line skeleton | #19 (open, no label) |
| Notifications | ⚪ backlog | no backend module yet | #7 (open, no label) |
| Internationalization (i18n) | 🟠 constructing | cross-cutting (frontend `i18n/locales`), no single backend module to evaluate — carried over | #16 (open, no label) |
| Infrastructure & Architecture | 🟢 locked | hand-set by Sylvie, not code-derived (see Legend) | #8, #9 — both closed (stack decisions + MariaDB/Docker/nginx/HTTPS all working end-to-end) |

**A feature's state is derived from the actual code** (skeleton → `todo`/`backlog`, real implementation → `constructing`, implementation + a meaningful test spec → `testing`), per the `docu` skill's `features` target — not from the GitHub issue label, which drifts. `locked`/`prod` stay a manual call only Sylvie makes. The Issues column is kept for traceability (what's tracked, open vs closed) — it no longer drives the State column.

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

> **Methodology change (2026-10-21)**: starting this sync, feature state is derived from the code (per module, under `backend/src/`), not from the GitHub issue label — see the `docu` skill's `features` target. The label-derived history up to the 2026-09-09 sync is superseded.
>
> **Label/code mismatches found, worth Sylvie's own look on GitHub** (Claude can't edit issue labels, `deny`-locked): **#12 (Sentinel / Circles)** is still labeled `state:todo` on GitHub, but the code shows `testing` (1241 lines, 13 routes, full lead-slot/link-lifecycle logic, 34 passing unit tests) — relabel it `state:testing` if you agree. **#18 (Alert)** is closed but empty (no body), and the `alert` backend module is still an untouched 17-line skeleton — looks like it may have been closed by mistake.
>
> **Issues column also carries forward from the previous sync**: #29 ("delete user") was open but untracked in this file before 2026-09-09 — now under User. #31 ("auth/user to do later") spans both Authentication and User.

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


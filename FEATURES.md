# Features


## Product features

| Feature | State | Issues |
|---|---|---|
| Authentication | 🟠 constructing | #11, #13, #14, #15 |
| Sentinel / Circles | 🔵 todo | #12 |
| Organizations | 🔵 todo | #10 |
| Alert | ⚪ backlog | *no issue yet* |
| Messaging | ⚪ backlog | *no issue yet* |
| Notifications | ⚪ backlog | #7 |
| Internationalization (i18n) | 🟠 constructing | #16 |
| Infrastructure & Architecture | 🟡 planning | #8, #9 |

A feature's state is the least-advanced state among its open issues — update it as issues move.

## Tooling / process (not product features)

Issues about how we work with Claude and keep the project's own documentation in shape, not about the product itself:

- #3 Setup Claude in project
- #4 Set up Claude loop, hooks, verification skills
- #5 Update plan
- #6 Schémas (documentation upkeep)
- #17 Divers (misc open points from `plan.txt`)

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


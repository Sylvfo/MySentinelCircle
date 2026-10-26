# Last update

**Date**: 2026-10-26
**Branch**: `Alertes`

## Done this session

- **Two Docker dev-setup issues investigated, one fixed**:
  - `docker logs mysentinelcircle-backend` occasionally stops capturing app stdout — reproduced the trigger
    (several rapid file edits in quick succession crash `nest start --watch` with `EADDRINUSE` from a race
    between two concurrent recompiles), but a single crash didn't actually break logging afterward in testing —
    it's an intermittent quirk of `nest --watch` under Docker, not something fixable via `docker-compose.yml`/
    `Dockerfile`. `docker restart mysentinelcircle-backend` remains a reliable workaround when logs look stale —
    no further action planned.
  - `NOSMSNOW_URL` unreachable from the containerized backend (`localhost` there means the container itself) —
    **fixed**: added `extra_hosts: ["host.docker.internal:host-gateway"]` and
    `NOSMSNOW_URL: http://host.docker.internal:4001` to the `backend` service in `docker-compose.yml` (Sylvie
    applied it herself, per the infra-file procedure). Verified end-to-end: raised a test alert, the SMS lines
    appeared in Sylvie's own `nosmsnow` terminal. Note: NoSMSNow must run in a real open terminal — it exits the
    moment its stdin closes (by design, ends the REPL), so it can't be started detached/backgrounded — documented
    in `NOSMSNOW.md`, which now also explains the Docker-mode config.
- **New business rule in `alert.service.ts`**: `raiseAlert` now rejects (409, clear message) if the companion's
  1st circle doesn't exist yet or has no accepted Lead Sentinel — per `plan.txt`, the 1st circle must always keep
  ≥1 Lead Sentinel, and without one nobody's actually in charge to drive the alert. This replaces the previous
  confusing 404 ("1st circle not found") for the same underlying situation — direct fix for the edge case flagged
  last session. Reuses the already-fetched `links` array (checks `leadSlot !== null`) rather than an extra query.
  Added 2 unit tests (no circle at all; circle exists but no accepted lead) and 2 e2e tests, and fixed one
  existing e2e test that had accidentally been testing the old 404 path instead of the 403 authorization path it
  was meant to. Verified live through nginx: a companion with a Lead Sentinel still raises fine (201); an
  untouched test account with no circle now gets a clear 409 instead of a bare 404.
  - Verified: 128/128 unit tests, 42/42 e2e tests, lint clean. `API.md`/`TEST.md` updated.
- Walked through the Alert escalation mechanics with Sylvie to confirm shared understanding before planning the
  next slice: there's no binary "escalation mode" — while an alert is active, the 1st circle can send a targeted
  yes/no request to any *specific* outer circle, any number of times; the 0–10 availability scale is a separate
  vocabulary used only when recruiting someone into an active search, not for plain sightings.
- Helped Sylvie past a couple of git/shell snags (a `git add *` that silently matched nothing because her
  terminal was in `nosmsnow/`, not the repo root; a `git commit -m "..."` broken by unescaped double quotes
  inside the message — resolved via a heredoc). No commit has actually landed yet this session (see below) —
  `e60d7a7` ("working and testing alerts") is still the last real commit, from before this session started.

## Left to do / not yet addressed

- **Next backend slice, by Sylvie's explicit choice**: outer-circle escalation (1st circle asking a specific
  outer circle "is José home?") + the SMS predefined-reply mechanism (0–10 availability scale, Sentinel SMS's
  quick keyword replies). Shared understanding of the mechanics confirmed this session (see above) — not
  implemented yet.
- **Browser smoke test of tranches C/D/E frontend** (step-up panel, change-email flow, change-phone flow) — still
  not done.
- **Self-service account deletion/closure** (GitHub issue #29) — still open, nothing started.
- `claimOrCreateByPhone` race condition — accepted gap, documented in `plan.txt`, not fixed.
- Real SMS/email provider — still console-only stubs (NoSMSNow is a dev-only proxy, see `NOSMSNOW.md`). Discussed
  with Sylvie how small the eventual Twilio swap would be (one new `SmsSender` implementation + one wiring line,
  thanks to the existing pluggable interface) — not started.
- `organization` backend module — still an empty skeleton.
- GitHub issues to check by hand (Claude can't write to issues, `deny`-locked): **#12** still labeled `state:todo`
  but code is `testing` — relabel; **#19** (Messaging) open but code is now `testing` — consider closing/commenting;
  **#24** (sms-like-programm) and **#25** (testing infra) looked closeable as of 2026-08-25; **#29** still open.
- `backend/test-users.local.md` still says sentinel-gating is "not-yet-enforced" — stale, it's implemented.
- `npm audit`: 3 high-severity transitive vulnerabilities via `prisma`/`deepmerge-ts` — not touched.

## Git — uncommitted at the time of this pause

No commit has landed this session — `e60d7a7` is still `HEAD`. Current working tree has a mix of staged (from an
earlier `git add -A` of Sylvie's) and freshly-modified-again files:
- **Infra** (locked, applied by Sylvie herself): `docker-compose.yml` (`extra_hosts`/`NOSMSNOW_URL` fix).
- **Alert backend** (today's Lead Sentinel rule): `backend/src/alert/{alert.service,alert.service.spec}.ts`,
  `backend/test/alert.e2e-spec.ts`.
- **Alert frontend + docs** (from the previous session, still never committed): `frontend/src/{api/alert.ts,
  index.css, pages/AlertsPage.tsx, i18n/locales/{en,fr}.json}`, `API.md`, `TEST.md`, `NOSMSNOW.md`.
- **Pre-existing, unrelated to Alert work**: `.claude/settings.json`, `.claude/skills/docu/SKILL.md`,
  `notesaeffacer.txt` (deleted), `.claude/settings.local.json.bak`.

Not committed/pushed — ask Sylvie before doing either. Given the quoting issue she hit last time, suggest a
heredoc or `git commit` without `-m` (opens her editor) next attempt.

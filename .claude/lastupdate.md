# Last update

**Date**: 2026-10-26
**Branch**: `Alertes`

## Done this session

- **Alert polish, several rounds of real bugs found via manual testing** (all live-verified through nginx, not
  just mocked unit tests):
  - `raiseAlert` now rejects (409, clear message) if the companion's 1st circle doesn't exist yet or has no
    accepted Lead Sentinel — per `plan.txt`, a 1st circle must always keep ≥1 Lead Sentinel; replaces a confusing
    404 for the same case.
  - `GET /alert/:id` now also returns `userCompanion: { id, firstName }` (who the alert is about), feeding a new
    expandable detail view on `/alerts` (`AlertRow`/`AlertDetailPanel` in `AlertsPage.tsx`): companion name,
    reason, participant Sentinels with a Lead badge, and — only when the caller is actually a chat participant —
    the 1st-circle chat (new `frontend/src/api/messaging.ts`, the frontend had no messaging API module before
    this). The companion correctly sees no chat section (403s for them, by design; handled silently).
  - `CirclesPage.tsx`: added a "Désigner référent·e"/"Retirer référent·e" toggle per 1st-circle member (the
    backend `updateMembership` already fully supported promoting/demoting a Lead — it was purely a missing
    button). Also: removed/declined/blocked members no longer linger in the active member list with no way back —
    `CircleCard` now only shows `ACCEPTED`/`PENDING` members; re-adding someone is just re-inviting their phone
    number, which already reactivates their existing link (`createOrReactivateLink`).
  - Logged-in user's first name now shown in the nav (`AppShell.tsx`) on every page, incl. mobile.
  - All verified: 128/128 backend unit, 42/42 e2e, frontend build/lint clean throughout. `API.md`/`TEST.md` kept
    in sync each round. **None of today's frontend work has been seen in a real browser by Sylvie yet** — no
    browser tool available to Claude this session.
- **Two Docker dev-setup issues**: `docker logs` occasionally stops capturing app stdout after rapid successive
  file edits — reproduced the `nest --watch` `EADDRINUSE` race that triggers it, but confirmed it doesn't
  reliably break logging afterward; it's an intermittent `nest --watch`-under-Docker quirk, not fixable via
  `docker-compose.yml`, `docker restart` remains the workaround. `NOSMSNOW_URL` unreachable from the
  containerized backend — **fixed** via `extra_hosts: host.docker.internal` + `NOSMSNOW_URL: http://host.docker.
  internal:4001` in `docker-compose.yml` (Sylvie applied it, infra-file procedure); verified end-to-end (SMS
  appeared in her own `nosmsnow` terminal). `NOSMSNOW.md` documents the Docker-mode config.
- **New dev tooling, at Sylvie's request** (she disliked the old `sentinel_test_01`-style names and wanted
  reproducible demo data): investigated first — confirmed **no seed script existed anywhere**, the old 30
  accounts came from an undocumented throwaway process. Built:
  - `backend/prisma/seed.ts` (new, run via `npm run seed:dev`) — 3 companions (Léa: full 1st circle + an outer
    "Travail" circle incl. one `ONLY_SMS` stub Sentinel; Noah: a minimal 2-person 1st circle; Emma: 1st circle
    provisioned with **zero** Sentinels, a ready-made case for the "no Lead Sentinel" 409) + 7 Sentinels, real
    first names, fake-but-format-valid Swiss numbers (same principle as `test/helpers/test-data.ts`'s
    `testPhone()`). Idempotent via upsert (by a dedicated `@seed.mysentinelcircle.test` email domain, and by the
    real `LinkSentinels` unique constraint) — deliberately **not** wired into Prisma's seed hook, so it can never
    leak into `mysentinelcircle_test` via `test/global-setup.js`'s `migrate reset`. Regenerates
    `backend/test-users.local.md` on every run. Ran it live against the dev DB (Sylvie's consent given); ran it
    twice to confirm idempotency; spot-checked Léa's circles and Emma's 409 over the real API.
  - `POST /auth/dev-login` (`{ phone }`, no password/OTP) — refuses with 403 whenever `NODE_ENV === 'production'`,
    checked inside the service method itself, not just left to routing. Frontend: `LoginPage.tsx` gets a small
    quick-login box gated by `import.meta.env.DEV` (compiled out of production builds). Verified the endpoint
    live through nginx; `npm run build`/`lint` clean.
  - `CLAUDE.md`'s backend commands list now mentions `npm run seed:dev`.
  - **Extended twice more right after**, at Sylvie's request, so there's real data to exercise outer-circle
    escalation once it's built: Léa now has 4 circles (1st + Travail + "Voisins" 3 Sentinels incl. 1 `PENDING` +
    "Famille" 2); Noah has 4 (1st + "Amis" 2 + "Sport" 2 (1 `ONLY_SMS` stub) + "Quartier" 2); a new 4th companion,
    **Thomas Guillod**, with a 1st circle holding **2 Leads** (useful later for lead-handoff testing) + "Études"
    (3, 1 `PENDING`) + "Famille" (2, 1 `ONLY_SMS` stub). 30 seeded users total.
  - **Email domain changed** to `prenom.nom@testmsc.ch` (was `@seed.mysentinelcircle.test`) per Sylvie's ask. This
    exposed a real bug in the script: `upsertAccount` upserted by email, so changing the domain made it try to
    *create* new rows for already-seeded phones, colliding on the `userName`/`phone` unique constraints instead of
    updating them. Fixed properly: upsert key is now the **phone number** (the one thing that never changes
    between runs; email can change freely). Verified: ran 3 more times total (through the bug, the fix, and
    twice after) — all idempotent now, login with the new `@testmsc.ch` email works, Thomas's 2 Leads confirmed
    over the real API.
- Clarified the Alert escalation model with Sylvie before any implementation: no binary "mode" — the 1st circle
  can send a targeted yes/no request to any *specific* outer circle, any number of times, while active; the 0–10
  availability scale is separate, only for recruiting someone into an active search.
- Helped Sylvie past two git/shell snags (`git add *` run from the wrong directory; a `git commit -m "..."`
  broken by unescaped quotes — heredoc fixed it). Landed as commit `7aea807`.

## Left to do / not yet addressed

- **Next backend slice, by Sylvie's explicit choice**: outer-circle escalation (1st circle asking a specific
  outer circle "is José home?") + the SMS predefined-reply mechanism (0–10 availability scale, Sentinel SMS's
  quick keyword replies). Shared understanding confirmed this session — nothing implemented yet.
- **Sylvie needs to click through this session's frontend work in a real browser** — none of it (alert detail
  view, Lead toggle, removed-member list fix, nav username, dev quick-login) has been visually confirmed.
- **Browser smoke test of tranches C/D/E frontend** (step-up panel, change-email flow, change-phone flow) — still
  not done.
- **Self-service account deletion/closure** (GitHub issue #29) — still open, nothing started.
- `claimOrCreateByPhone` race condition — accepted gap, documented in `plan.txt`, not fixed.
- Real SMS/email provider — still console-only stubs (NoSMSNow is a dev-only proxy, see `NOSMSNOW.md`). Discussed
  with Sylvie how small the eventual Twilio swap would be (one new `SmsSender` implementation + one wiring line) —
  not started.
- `organization` backend module — still an empty skeleton.
- GitHub issues to check by hand (Claude can't write to issues, `deny`-locked): **#12** still labeled `state:todo`
  but code is `testing` — relabel; **#19** (Messaging) open but code is now `testing` — consider closing/commenting;
  **#24** (sms-like-programm) and **#25** (testing infra) looked closeable as of 2026-08-25; **#29** still open.
- `npm audit`: 3 high-severity transitive vulnerabilities via `prisma`/`deepmerge-ts` — not touched.

## Git — uncommitted at the time of this pause

`HEAD` is still `7aea807`. Everything from this session is uncommitted:
- **Modified**: `.claude/lastupdate.md`, `API.md`, `CLAUDE.md`, `TEST.md`, `backend/package.json`,
  `backend/src/alert/{alert.service,alert.service.spec}.ts`, `backend/src/auth/{auth.controller,auth.service}.ts`,
  `backend/test/alert.e2e-spec.ts`, `frontend/src/api/{alert,auth}.ts`, `frontend/src/components/AppShell.tsx`,
  `frontend/src/i18n/locales/{en,fr}.json`, `frontend/src/index.css`,
  `frontend/src/pages/{AlertsPage,CirclesPage,LoginPage}.tsx`.
- **Untracked**: `backend/prisma/seed.ts`, `backend/src/auth/dto/dev-login.dto.ts`, `frontend/src/api/messaging.ts`.

Not committed/pushed — ask Sylvie before doing either.

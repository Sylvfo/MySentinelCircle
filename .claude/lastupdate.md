# Last update

**Date**: 2026-10-28 22:47
**Branch**: `alerts_size_and_order_circles`

## Done this session

- **Security & code quality review**, triggered by a SonarCloud scan Sylvie connected mid-session
  (token stored in root `.env`, gitignored, project key `Sylvfo_MySentinelCircle` — now queryable
  directly via its API instead of screenshots). Found and fixed: OTP codes generated with
  `Math.random()` instead of `crypto.randomInt` (auth + 2 spots in user.service.ts); 16 floating
  promises across the frontend missing `void`; a hardcoded CI database password (now a named
  workflow env var); missing `--ignore-scripts`/`--no-install` hardening on `npm ci`/`npx` calls
  (backend-ci.yml, entrypoint.sh); 11 `.sort()` calls without a comparator in `alert.e2e-spec.ts`;
  `Modal.tsx` rebuilt from an ARIA-div-stack to a native `<dialog>`; a log-injection gap in
  `nosmsnow/server.js` (two attempts — the final fix uses `JSON.stringify` on the logged value,
  `.replace(/[\r\n]/g,'')` wasn't recognized by Sonar's taint analysis). Also found and fixed a
  real production bug along the way: the new `MessagesPage` `message:new` listener was refetching
  the whole contact roster on every message anywhere, tripping the shared 20-req/60s rate limit.
  **Found but deliberately left unfixed**: the inbound SMS webhook (`POST /sentinel/sms/inbound`)
  trusts the caller-supplied phone number with no signature verification — documented in `plan.txt`
  under "DEV-ONLY STUBS" as something to fix before wiring in a real SMS provider, not urgent while
  only NoSMSNow is connected. **Deliberately left as-is** (Sylvie's call, dev-only containers, not
  worth the risk/complexity): the 3 locked Dockerfiles' remaining 5 Sonar findings (root user ×3,
  recursive `COPY` ×2) — root-user was actually tested working for backend+frontend (host UID
  matches the `node` image's built-in UID 1000) but blocked by the existing `backend_uploads` Docker
  volume being root-owned from prior sessions; nginx's root user is inherent to binding ports
  80/443, already mitigated by nginx's own internal worker-privilege-drop. Committed/merged via
  PR #43 (→`main`), #44 (→`dev`), #45 (→`dev`, the final log-injection fix).

- **New feature: outer-circle alert escalation, batched to 2 at a time** — resolves the plan.txt
  "OPEN POINTS" question "how many people within a circle to alert simultaneously" (that bullet in
  `plan.txt` hasn't been edited to reflect this decision yet — worth doing next session). Framed
  with Sylvie over several rounds (her first framing had it backwards; corrected to: 1st circle
  still notifies everyone at once, only outer-circle escalation batches). Final design: manual
  call order per Sentinel (random stable fallback if unset), max 2 contacted per `requestCircle`
  call, the 1st circle can request more at any time with **no enforced wait**, and the only
  automation is a **one-time reminder notification** after 4h of silence — never an automatic
  contact. Planned, implemented, tested (197/197 backend tests, 7 new), verified live through
  nginx: a real 3-member circle correctly went 2 contacted → next call contacted the last 1 →
  third call cleanly rejected ("everyone already contacted"). **Uncommitted**, branch
  `alerts_size_and_order_circles` — see Git section below.
  - Schema: `LinkSentinels.callOrder Int?`, `NotificationType.ALERT_CIRCLE_NO_RESPONSE` (Sylvie
    applied by hand, migration `20261028202931_add_call_order_and_circle_reminder` run).
  - Backend: `AlertService.requestCircle` rewritten to pick a batch via a new
    `pickNextCircleBatch` helper (manual `callOrder` first, then a stable per-alert hash); its
    `AlertParticipant` upsert no longer resets an already-contacted member back to `WAITING` on a
    repeat call (a real latent bug in the old single-shot design, only surfaced by making repeat
    calls meaningful). New `@Cron` method `remindStaleCircleBatches` (new `@nestjs/schedule`
    dependency — had to add `transformIgnorePatterns` to both Jest configs since its published
    build is ESM-only) runs every 30 min, dedups via checking for an existing notification since
    the stale batch's `contactedAt`. `UpdateMembershipDto`/`sentinel.service.ts` got a `callOrder`
    passthrough.
  - Frontend: numeric call-order input per outer-circle member (`CirclesPage.tsx`), participant
    status badges + a button that relabels to "contact 2 more" on a repeat request
    (`AlertsPage.tsx`), new notification type wired through `api/notification.ts` + both locales.
  - Sylvie reported what looked like a bug (3 Sentinels contacted instead of 2) — investigated via
    direct DB/API inspection and confirmed it was a correct-behavior misread: all 3 circle members
    now appear in the participant list (new, since a batched member can sit `WAITING` for a while
    now), but only 2 actually had `CONTACTED` status. Resolved by explaining it, no code change
    needed.

## Left to do / not yet addressed

- **`plan.txt`'s "how many people to alert simultaneously" open point** — now implemented (see
  above) but the plan.txt bullet itself still reads as unresolved; update it next session.
- **Lead-succession handoff timeout** (plan.txt: "default wait window before an unresponsive Lead
  Sentinel's leadership passes to the next in succession order") — still just a plan.txt idea, no
  code. Related to but distinct from this session's circle-batching reminder; could likely share
  the same `@nestjs/schedule` infra now that it exists.
  - Still not started.
- **Group/community circles** (e.g. a choir's circle — join it, you're automatically in) — the
  other feature idea discussed alongside circle-batching; not started, batching was prioritized
  as more safety-critical.
- **`npm audit`**: still 21 vulnerabilities (8 low, 2 moderate, 9 high, 2 critical) in `backend/`.
  Triaged this session (not just left alone): 4 are directly reachable at runtime —
  `multer`/`body-parser`/`qs`/`proxy-addr` — all fixable via a plain `npm audit fix` (no breaking
  change), not yet applied. The rest are dev-tooling-only (jest, `@nestjs/cli`, swagger — gated off
  in production) or need a major-version bump. Frontend has 2 more, both Vite-dev-server-only.
- **Browser smoke test of tranches C/D/E frontend** (step-up panel, change-email flow,
  change-phone flow) — still not done, unrelated to recent sessions' work.
- **The 0–10 availability-reply scale** (recruiting into an active search, vs. a plain yes/no
  sighting question) — still not started.
- **Self-service account deletion/closure** (GitHub issue #29) — still open, nothing started.
- `claimOrCreateByPhone` race condition — accepted gap, documented in `plan.txt`, not fixed.
- Real SMS/email provider — still console-only stubs (NoSMSNow is a dev-only proxy, see
  `NOSMSNOW.md`). The inbound webhook also needs signature verification before this happens (see
  above).
- `organization` backend module — still an empty skeleton; blocks the Organization↔1st-circle
  chat too.
- `MessageType.SYSTEM` — still unused (`IMAGE` is live, `SYSTEM` isn't).
- `MessagingMode.GROUP` — still behaves identically to `INDIVIDUAL`, deliberately not exposed as a
  distinct UI option until it means something different.

## Git — uncommitted at the time of this pause

On `alerts_size_and_order_circles`, all for the outer-circle-batching feature:
`backend/package.json`/`package-lock.json` (`@nestjs/schedule`), `backend/prisma/schema.prisma`,
a new untracked migration folder
(`backend/prisma/migrations/20261028202931_add_call_order_and_circle_reminder/`),
`backend/src/alert/alert.service.ts` + its spec, `backend/src/app.module.ts`,
`backend/src/sentinel/dto/update-membership.dto.ts` + `sentinel.service.ts` + its spec,
`backend/test/jest-e2e.json`, `frontend/src/api/notification.ts` + `sentinel.ts`,
`frontend/src/i18n/locales/{en,fr}.json`, `frontend/src/pages/AlertsPage.tsx` + `CirclesPage.tsx`.

`main`/`dev` are both up to date with the security-review work (PRs #43/#44/#45, pushed).

Not committed/pushed on this branch yet — ask Sylvie before doing either.

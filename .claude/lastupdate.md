# Last update

**Date**: 2026-10-29 11:53
**Branch**: `alerts_size_and_order_circles`

## Done this session

- **Security & code quality review** (SonarCloud, connected mid-session — token in root `.env`,
  gitignored, project key `Sylvfo_MySentinelCircle`, queryable directly via its API). Fixed: OTP
  codes generated with `Math.random()` instead of `crypto.randomInt`; 16 floating promises missing
  `void`; a hardcoded CI database password; missing `--ignore-scripts`/`--no-install` hardening;
  11 `.sort()` calls without a comparator; `Modal.tsx` rebuilt as a native `<dialog>`; a log-injection
  gap in `nosmsnow/server.js`. Also fixed a real bug found along the way: `MessagesPage`'s
  `message:new` listener was refetching the whole contact roster on every message anywhere, tripping
  the rate limit. **`npm audit`**: triaged and fixed the real ones — backend 21 → 13 vulnerabilities
  (the remaining 13 are dev-tooling-only or need a major bump), frontend 2 → **0** (`multer` needed
  an `overrides` entry in `package.json` since `@nestjs/platform-express` pins its own copy).
  **Found but deliberately left unfixed**: the inbound SMS webhook trusts the caller-supplied phone
  number with no signature verification — documented in `plan.txt` under "DEV-ONLY STUBS", to fix
  before a real SMS provider is wired in. **Deliberately left as-is** (Sylvie's call): the 3 locked
  Dockerfiles' remaining 5 Sonar findings (root user, recursive `COPY`) — not worth the risk/
  complexity for dev-only containers. Committed/merged via PR #43 (→`main`), #44/#45 (→`dev`).

- **Outer-circle alert escalation, batched to 2 at a time** — resolves `plan.txt`'s former "how many
  people to alert simultaneously" open point (now updated there too). Manual call order per
  Sentinel (stable random fallback if unset), max 2 contacted per `requestCircle` call, the 1st
  circle can request more at any time with no enforced wait, and a one-time reminder notification
  after 4h of silence — never an automatic contact. The 1st circle itself still notifies everyone at
  once, unchanged. `AlertService.pickNextCircleBatch` / `@Cron remindStaleCircleBatches` (new
  `@nestjs/schedule` dep — needed `transformIgnorePatterns` in both Jest configs, its build is
  ESM-only). `callOrder` input on `CirclesPage.tsx`, participant status badges + relabeling button
  on `AlertsPage.tsx`. Verified live: 2 contacted → next call contacts the last 1 → third call
  cleanly rejected. **Committed** (`05ce6bd`, includes the npm audit fixes too).

- **Lead Sentinel: claim active leadership of an alert** — replaces `plan.txt`'s old timed/
  succession-order handoff idea with something simpler Sylvie proposed: every Lead is already
  notified when an alert is raised (unchanged); whoever claims it first is driving, and any other
  Lead can take it over at any time, no timers. Reused the schema's already-dead `AlertParticipant.
  leadAssignedAt` field instead of adding a column — repurposed as "when this Lead last claimed
  leadership." New `POST /alert/:id/claim-lead`; "current lead" is derived on read (latest
  `leadAssignedAt` among `isLead` participants), not stored separately. `AlertsPage.tsx` shows who's
  currently leading + a "take the lead" button for eligible Leads. Verified live (claim + reject
  non-Lead). **Uncommitted.**

- **Group circles** (e.g. a choir — mutual mesh, invite-only-if-already-connected). Framed at length
  with Sylvie, including a real back-and-forth on the data model (she pushed back on 2 new tables;
  found a genuine constraint — `LinkSentinels` allows only one relationship ever per pair — that
  means 1 new table is unavoidable for the pending invite, but the "group" itself needed no table at
  all: the founder's own `Circle` *is* the group, `CircleType.GROUP` + a nullable self-relation
  `groupRootId`). New model `SentinelGroupInvitation`. Joining meshes the new member with every
  existing member (skipping pairs already connected from outside the group); leaving undoes only the
  relationships the group itself created. **Two real bugs found and fixed via live testing**: (1)
  the first proposed schema was missing a back-relation field, which made `prisma migrate dev` fail
  silently with no migration ever created — several rounds of Sylvie saying "done" before this was
  caught; (2) rejoining a group after leaving 500'd (`Circle`'s `@@unique([userCompanionId,
  groupRootId])` collided with the old closed circle) — fixed by reactivating the previous circle/
  relationships instead of blindly creating new ones, now covered by a regression test. Originally
  built as its own `/groups` page, then **folded into `CirclesPage.tsx`** per Sylvie's request and
  relabeled "Group Circles" / "Cercles de groupe" — no more separate nav entry. **Uncommitted.**

Backend: 217/217 tests passing, build/lint clean. Frontend: build/lint clean.

## Left to do / not yet addressed

- **`MessagingMode.GROUP`** (the chat-mode enum value, unrelated to the new Group Circles feature —
  worth a disambiguating rename if it causes confusion later) — still behaves identically to
  `INDIVIDUAL`, deliberately not exposed as a distinct UI option until it means something different.
- **Browser smoke test of tranches C/D/E frontend** (step-up panel, change-email flow,
  change-phone flow) — still not done, unrelated to recent sessions' work.
- **The 0–10 availability-reply scale** (recruiting into an active search, vs. a plain yes/no
  sighting question) — still not started.
- **Self-service account deletion/closure** (GitHub issue #29) — still open, nothing started.
- `claimOrCreateByPhone` race condition — accepted gap, documented in `plan.txt`, not fixed.
- Real SMS/email provider — still console-only stubs (NoSMSNow is a dev-only proxy). The inbound
  webhook also needs signature verification before this happens (see above).
- `organization` backend module — still an empty skeleton; blocks the Organization↔1st-circle
  chat too.
- `MessageType.SYSTEM` — still unused (`IMAGE` is live, `SYSTEM` isn't).
- `npm audit`: backend's remaining 13 (dev-tooling-only, or need a major version bump) not
  addressed — judged not worth it; revisit only if one of those tools' exposure changes.

## Git — uncommitted at the time of this pause

On `alerts_size_and_order_circles` — the Lead-claim feature and the Group Circles feature, both
implemented and verified live but not committed:
`backend/prisma/schema.prisma`, two new migration folders (`20261029092757_add_alert_lead_claimed_
notification_type`, `20261029102626_add_group_circles`), `backend/src/alert/alert.controller.ts` +
`alert.service.ts` + its spec, `backend/src/sentinel/sentinel.controller.ts` + `sentinel.service.ts`
+ its spec, two new DTOs (`create-group.dto.ts`, `invite-to-group.dto.ts`), `frontend/src/api/
alert.ts` + `notification.ts` + `sentinel.ts`, `frontend/src/components/NotificationBell.tsx`,
`frontend/src/i18n/locales/{en,fr}.json`, `frontend/src/pages/AlertsPage.tsx` + `CirclesPage.tsx`.

`main`/`dev` are up to date with the security-review work (PRs #43/#44/#45). The outer-circle-
batching commit (`05ce6bd`) is on this branch but this branch itself has no PR open yet.

Not committed/pushed — ask Sylvie before doing either.

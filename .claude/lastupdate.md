# Last update

**Date**: 2026-11-02 10:04
**Branch**: `alerts_size_and_order_circles`

## Done this session

- **Death notice feature** — announcing a user's death to their Sentinels, framed at length with
  Sylvie first (how to avoid both false positives and silently-unnotified friends). Settled on:
  double confirmation (a Lead Sentinel reports, a second Lead — or, if the 1st circle has only one
  Lead, any other accepted Sentinel of it — confirms before anything broadcasts; reporter ≠
  confirmer); the companion prepares the announcement text and picks which of their existing
  Sentinels get notified (with an optional personal message each) while still alive; zero new
  tables — Sylvie pushed back on an earlier 2-table design, so the report/confirm flow and
  announcement live as flat fields on `User` (mirroring how `Alert` itself stores
  `launchedAt`/`closedAt`), and recipient opt-in/personal-message live as flat fields on
  `LinkSentinels`. A literal "memorial circle" was considered and rejected: `LinkSentinels` allows
  only one relationship ever per pair, so a Sentinel can't also join a memorial-only circle.
  `UserStatus.DECEASED` freezes the account afterward (existing data stays readable; `raiseAlert`,
  `inviteSentinel`/`requestToBeSentinel`/`respondToMembership`, and new messages are all now gated
  via a shared `assertNotDeceased` helper). New `user.controller.ts`/`service.ts` endpoints
  (`GET`/`PATCH /user/death-notice`, `PATCH /user/death-notice/recipients`) for the living-prep
  side, new `sentinel.controller.ts`/`service.ts` endpoints (`.../death-notice/report|confirm|
  reject`, plus a recipient-facing `GET`) for the report/confirm side — no new module, reusing
  existing ones to avoid an nginx change. Fan-out reuses the `AlertService.notifyParticipants`
  pattern (SMS + persisted notification, best-effort). **Known gap, deliberately deferred**:
  `updateMembership`/`removeMembership`/`blockMembership`/`leaveMembershipAsSentinel`/
  `respondToCircleMove` aren't gated against a deceased companion yet. **Committed** (`93ca0a5`,
  together with the visual redesign below — Sylvie committed both as one, using the message drafted
  for her this session).

- **Full visual redesign**, prompted by an imminent presentation (same session, after the feature
  work above) — logo (`frontend/src/assets/logo.png`) + Inria Sans + a new teal/blue/gold palette
  (`frontend/src/theme.ts`); a reusable `Tile` component (`components/Tile.tsx`) migrated into
  Alerts/Circles/Companions; an alert-mode gradient background (`.mode-alert`) and alert-type
  selection restyled as cards. **My Circles rebuilt**: new `CircleRing` component
  (`components/CircleRing.tsx`) — thick colored rings with avatar silhouettes positioned around the
  rim (gold = Lead, grey = not yet accepted, else the circle's own color; message-capability shown
  as a green-check/red-cross bubble badge), 1st circle pinned at top in a distinct gold family,
  other circles cycling a blue→teal palette with a pale ring + strong avatars. Clicking a ring
  expands the existing, fully-functional `CircleCard` below it (promote to Lead, move, remove,
  invite) rather than rebuilding those actions — only the overview is new. Iterated on the ring/
  avatar look first in a **Claude Design** canvas artifact (colors, avatar shape, badge icons, sizes)
  before porting to real code, per Sylvie's call to prototype visually rather than guess blind in
  CSS. **Dashboard rebuilt** in two modes: Normal (3 summary tiles — Raise Alert/My Circles/My
  Companions, people-counts written inline e.g. "8 people watching over you") and Running Alert
  (takes over the top whenever an alert concerns the viewer; shows About/What-you-have-to-do + an
  "N active alert(s)" count; "About" resolves the actual companion's name, not the alert's own
  label, falling back from `getAlert` to `getMyParticipation` the same way `AlertsPage` already
  does for an outer-circle Sentinel). **Alerts split into two pages**: `/alerts` ("Raise Alert",
  launch-only now) and `/running-alert` ("Running Alert", in-progress only, reached only from the
  Dashboard's conditional card) — new `pages/RunningAlertPage.tsx`, reuses the now-exported
  `AlertRow` from `AlertsPage.tsx`. New **History page** (`pages/HistoryPage.tsx`, route
  `/history`) for resolved alerts, which no longer show on `/alerts`. New mobile-only
  **`BottomNav`** (`components/BottomNav.tsx`: Settings/History/Messages/Notifications/Home as real
  icon buttons, not one flattened image — Sylvie's own icon sketches ported to inline SVG) shown
  ≤640px, replacing the old horizontal mobile nav-links row. **Nav decluttered**: logo always links
  to `/dashboard` (so the redundant "Dashboard" nav link was removed); language switcher and logout
  moved into Settings (logout at the very bottom); username right-aligned (needed a mobile-specific
  `margin-left: auto` fix — the desktop `space-between` fix alone didn't carry over to the mobile
  horizontal bar); logo + wordmark enlarged, nav widened 220→250px to fit. **Two real bugs found via
  live testing**: `.tile-header` didn't wrap, so a long title + actions overflowed visually past a
  Tile's own border into neighboring tiles (fixed with `flex-wrap` + `overflow: hidden`); and
  `CircleRing`'s `<button>` picked up the global `.app-content button` dark-teal
  background/`border-radius`, showing as dark corners around each ring and throwing off avatar
  alignment (fixed with a higher-specificity override, `.app-content button.circle-ring`). Also
  **bumped API rate limits** (global Throttler 20→100/min; several auth/OTP/password endpoints
  5→20/min) — NestJS Throttler tracks by IP by default, so Sylvie's 4 test accounts in one browser
  were sharing one budget and tripping it. **Committed** (`93ca0a5`, same commit as the death notice
  feature above).

- Drafted a commit message + PR description for all of the above (per the usual "text only, don't
  run git" preference) — Sylvie then committed it herself, verbatim, as `93ca0a5` on
  `alerts_size_and_order_circles`. Also gave feedback on Sylvie's GitHub project blurb (tagline/
  stack/skills wording) — chat-only, nothing to carry forward.

Backend: 250/250 tests passing, build/lint clean. Frontend: build/lint clean (re-verified after
every change this session).

## Left to do / not yet addressed

- **Death notice**: the 5 membership-management actions noted above aren't gated against a deceased
  companion yet (`updateMembership`/`removeMembership`/`blockMembership`/
  `leaveMembershipAsSentinel`/`respondToCircleMove`).
- **Dashboard's "Raise Alert" tile content** — Sylvie asked for something like "a note about myself
  and the three alert types we set up" in it; unclear enough that a short generic hint line was
  used instead and flagged to her. Still waiting on clarification.
- **`MessagingMode.GROUP`** (the chat-mode enum value, unrelated to Group Circles) — still behaves
  identically to `INDIVIDUAL`, deliberately not exposed as a distinct UI option until it means
  something different.
- **Browser smoke test of tranches C/D/E frontend** (step-up panel, change-email flow,
  change-phone flow) — still not done, unrelated to recent sessions' work.
- **The 0–10 availability-reply scale** (recruiting into an active search, vs. a plain yes/no
  sighting question) — still not started.
- **Self-service account deletion/closure** (GitHub issue #29) — still open, nothing started.
- `claimOrCreateByPhone` race condition — accepted gap, documented in `plan.txt`, not fixed.
- Real SMS/email provider — still console-only stubs (NoSMSNow is a dev-only proxy). The inbound
  webhook also needs signature verification before this happens.
- `organization` backend module — still an empty skeleton; blocks the Organization↔1st-circle
  chat too.
- `MessageType.SYSTEM` — still unused (`IMAGE` is live, `SYSTEM` isn't).
- `npm audit`: backend's remaining 13 (dev-tooling-only, or need a major version bump) not
  addressed — judged not worth it; revisit only if one of those tools' exposure changes.

## Git — state at the time of this pause

Everything from this session (death notice feature + full visual redesign) is **committed** on
`alerts_size_and_order_circles` as a single commit, `93ca0a5` — Sylvie committed it herself, using
the message drafted for her this session, on top of `424980b`.

**Not yet pushed**: `alerts_size_and_order_circles` is one commit ahead of
`origin/alerts_size_and_order_circles` (`93ca0a5`). No PR open for this branch yet.

Sylvie has since moved on: checked out `dev` (fast-forwarded to origin), then `code_quality_check`
— that's the branch actually checked out right now, so a fresh session should confirm which branch
to resume on before touching anything.

`main`/`dev` are otherwise up to date through PR #45; the Lead-claim/Group-circles/paywall work
(`e7472de`/`c72688c`/`424980b`) and the outer-circle-batching commit (`05ce6bd`) were already merged
to `alerts_size_and_order_circles` before this session started.

Not pushed — ask Sylvie before pushing or opening a PR.

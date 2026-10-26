# Last update

**Date**: 2026-10-26
**Branch**: `Alertes`

## Done this session

- **Outer-circle escalation, built end-to-end** (the slice explicitly agreed at the end of the previous session):
  - `POST /alert/:id/request-circle` — "Me" or an accepted 1st-circle Sentinel targets one specific outer
    (`BASIC`) circle with a yes/no `question`, fanning out an `AlertParticipant` per accepted Sentinel of that
    circle (upserted, so re-asking the same circle just resets it rather than erroring) and SMS-notifying each.
    Bumps the alert `LAUNCHED` → `ACTIVE` the first time any circle is requested — the first real use of that
    lifecycle stage.
  - `POST /alert/:id/respond` — in-app OUI/NON alternative to the SMS reply, for any `CONTACTED` participant
    (any circle). Returns the updated participant directly, never `getAlert()` — an outer-circle Sentinel isn't
    allowed to view the full alert, a real bug caught during manual testing (the first implementation 403'd them
    right after their own response was recorded).
  - Inbound SMS replies for the whole app still go through the one existing webhook
    (`POST /sentinel/sms/inbound`): `SentinelService.handleInboundSms` now delegates to
    `AlertService.tryHandleInboundSms` as a fallback, spliced in **before** its blanket "NON/STOP means leave the
    circle" rule — otherwise a Sentinel's `NON` to an alert question would get misread as asking to be removed.
    This was the other real bug caught this session (found by re-reading the code before implementing, not by a
    failing test).
  - `GET /alert/:id/my-participation` (new, lightweight) — lets a solicited outer-circle Sentinel see just
    enough to answer (companion name, alert name, both status notes, their own participation), where the full
    `GET /alert/:id` deliberately 403s them. Needed once it became clear `GET /alert/mine` lists *any* circle's
    participation, not just the 1st circle's, so an outer-circle Sentinel sees the alert in their list but
    couldn't otherwise open it.
- **Alert status/name model, settled after a few rounds of correction with Sylvie**:
  - `Alert.label` (the alert's name) — settable by **any** accepted 1st-circle Sentinel (not just the Lead,
    her first instinct was "Lead only," corrected to "whole 1st circle").
  - `Alert.statusByCompanion` / `statusByFirstCircle` — **two separate** free-text live-status notes, not one
    shared field (an intermediate "just use `messageAlert` as one shared status" design was tried and then
    reverted — Sylvie explicitly wanted the original two-field split back, visible to everyone including
    solicited outer-circle Sentinels). Both stay writable after the alert is `RESOLVED`, unlike the 1st-circle
    chat (locked once its `Conversation` closes).
  - New attribution columns, added to `schema.prisma` by Sylvie herself (`npx prisma migrate dev`, migration
    `add_alert_attribution_fields`) after she pushed back on a full `AlertEvent` log table as overkill:
    `AlertParticipant.requestedById` (who triggered contacting that Sentinel — raising, or `requestCircle`),
    `Alert.statusUpdatedById`/`statusUpdatedAt` (who last wrote `statusByFirstCircle` — `statusByCompanion`
    needs no attribution, its author is always obvious), `Alert.labelUpdatedById`/`labelUpdatedAt`. "Last
    writer" only, deliberately not a full revision history.
  - `GET /alert/:id` now also embeds the 1st-circle chat's full message history (`conversations[].messages`) —
    the companion's read path for it, since they're deliberately never a `ConversationParticipant` (confirmed
    they still get 403 calling `messaging`'s routes directly).
- **Frontend**: `AlertDetailPanel` rebuilt around all of the above — editable `label`/`statusByCompanion`/
  `statusByFirstCircle` fields (gated per role, who-wrote-it shown where relevant), `requestedBy` shown per
  participant, a request-circle form, Oui/Non respond buttons (both the full view and a lighter fallback view
  for outer-circle Sentinels, which kicks in automatically on a 403 from `getAlert()`), and a read-only message
  transcript section for the companion.
- Verified live through nginx repeatedly, at each design turn, using real seeded data (Léa/Mathis/Camille/Lucas)
  — not just mocked tests. Final state: 152/152 backend unit tests, 57/57 e2e, frontend build/lint clean.
- `/docu all` run: `API.md`, `backend/prisma/DB_schema.md`, `STACK_SCHEMA.md`, `FEATURES.md` regenerated with
  real content changes (line/test counts, the new routes, `alert`/`messaging` no longer "Skeleton"/MVP-labeled,
  the fictional WS-gateway diagram node removed — real-time is SMS-only, nothing in the code uses WebSockets);
  `TEST.md` was already current; `PERMISSIONSCLAUDE.md` checked against `.claude/settings.json`, no drift.

## Left to do / not yet addressed

- **Sylvie needs to click through this session's frontend work in a real browser** — none of it (the whole
  escalation UI: status/label fields, request-circle form, respond buttons, the outer-circle fallback view, the
  companion's read-only message transcript) has been visually confirmed yet, same caveat as last session.
- **The 0–10 availability-reply scale** (recruiting someone into an active search, separate from simple yes/no
  sighting questions) — still not started; was bundled with escalation as "the next slice" previously, now the
  one piece of that original ask still open.
- **Browser smoke test of tranches C/D/E frontend** (step-up panel, change-email flow, change-phone flow) —
  still not done, unrelated to Alert.
- **Self-service account deletion/closure** (GitHub issue #29) — still open, nothing started.
- `claimOrCreateByPhone` race condition — accepted gap, documented in `plan.txt`, not fixed.
- Real SMS/email provider — still console-only stubs (NoSMSNow is a dev-only proxy, see `NOSMSNOW.md`).
- `organization` backend module — still an empty skeleton.
- GitHub issues to check by hand (Claude can't write to issues, `deny`-locked), re-checked fresh this session:
  **#12** (Sentinel) still labeled `state:todo` but code is `testing` — relabel; **#19** (Messaging) still open
  but code is `testing` — consider closing/commenting; **#24** (sms-like-programm) still open, looks closeable;
  **#29** (delete user) still open. **#25** (testing infra) is now actually closed — no longer needs a look.
- `npm audit`: 3 high-severity transitive vulnerabilities via `prisma`/`deepmerge-ts` — not touched.

## Git — uncommitted at the time of this pause

Everything from this session is uncommitted (previous session's work already landed as commit `cdccbce`):
- **Modified**: `API.md`, `FEATURES.md`, `PERMISSIONSCLAUDE.md`, `STACK_SCHEMA.md`, `TEST.md`,
  `backend/prisma/DB_schema.md`, `backend/prisma/schema.prisma` (Sylvie's own hand-edit, already migrated),
  `backend/src/alert/{alert.controller,alert.service,alert.service.spec}.ts`,
  `backend/test/alert.e2e-spec.ts`, `frontend/src/api/alert.ts`,
  `frontend/src/i18n/locales/{en,fr}.json`, `frontend/src/pages/AlertsPage.tsx`.
- **Untracked**: `backend/prisma/migrations/20261026153655_add_alert_attribution_fields/`,
  `backend/src/alert/dto/{update-alert-label,update-alert-status}.dto.ts`.

Not committed/pushed yet — Sylvie asked for a commit message right after this; check with her before pushing.

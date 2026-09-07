---
name: new-feature
description: Procedure to frame, plan, and implement a new MySentinelCircle feature, from need to documentation.
---
Updated: 2026-08-21

# New feature

Follow these steps in order, validating with Sylvie between each major step. Scale the ceremony to the size of the feature — a small change doesn't need a full PRD.

## 1. Frame the need

- Understand who this feature is for and why (non-technical PRD: no implementation details at this stage).
- Check alignment with `plan.txt` — if there's a divergence, flag it to Sylvie before continuing.

## 2. Plan in testable slices

- Switch to plan mode.
- Break the work into ordered technical slices, each independently verifiable.
- Get the plan validated by Sylvie before coding.

## 3. Code

- Implement slice by slice.
- If a bug shows up, invoke the `debug` skill instead of guessing a fix.
- Never edit `backend/prisma/schema.prisma` directly — propose changes as Prisma code in the conversation (per the project's `CLAUDE.md`).
- For any new service method with branching logic (conditions, error cases), write or update its `.spec.ts` in the same slice — not after the fact.

## 4. Test

- Run `npm run test` (and `npm run test:e2e` if relevant) in `backend/`, plus `npm run lint` on whichever side changed.
- Check security-sensitive surfaces touched by the feature (auth, permissions, input validation).
- Once tests pass and the feature is secured, move its GitHub issue(s) to `state:locked` (see `FEATURE_STATES.md`) — from there, changes require asking Sylvie first.

## 5. Document

- Update `.claude/lastupdate.md` (current state + next step) — or invoke the `end-session` skill for that.
- Close or comment on the corresponding GitHub issue (always `ask` before writing to GitHub, per `.claude/settings.json`).
- If the feature changed the schema, the architecture, or the product plan: update `DB_schéma.md`, `CLAUDE.md`, or `plan.txt` accordingly.

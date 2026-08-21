---
name: new-session
description: Routine to start a work session on MySentinelCircle — sync the repo, resume or pick up work, and know how to wrap up.
---

# New session

## 1. Check repo state

Run `git status`. If there are uncommitted changes, flag them to Sylvie before doing anything else. Otherwise, `git pull`, then check `git branch` to confirm we're on the intended branch.

## 2. Check current state

Read `.claude/lastupdate.md` for what was done last session and what's left.

## 3. Resume or pick next

If a feature was left paused (see the "Left to do" section of `lastupdate.md`), resume it. Otherwise, pick the next issue from `FEATURES.md` / `gh issue list`, respecting the `state:*` progression (see `FEATURE_STATES.md`).

## 4. Work

Invoke the `new-feature` skill for feature work, or `debug` for a reported bug.

## 5. Wrap up

Invoke `end-session` to update `.claude/lastupdate.md` before finishing.

## 6. Never push

`git push` is Sylvie's action only — never run it, even if asked mid-session, unless `settings.json` is explicitly updated to allow it.

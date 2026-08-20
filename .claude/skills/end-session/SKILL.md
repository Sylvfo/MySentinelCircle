---
name: end-session
description: Invoke at the end of a session, or in a hurry if Sylvie has to leave, to save the current state of work to .claude/lastupdate.md.
---

# End session

1. Summarize the current state: what was done this session, what's left to do, which branch/issue is being worked on, and any open blockers.
2. Overwrite the contents of `.claude/lastupdate.md` with this summary — don't accumulate an endless history, the full history already lives in `git log`.
3. Check `git status`: if there are uncommitted changes, flag them to Sylvie and ask whether she wants to commit/push before leaving. Never commit/push without explicit confirmation.

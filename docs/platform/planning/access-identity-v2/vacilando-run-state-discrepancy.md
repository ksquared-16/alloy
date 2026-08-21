---
owner: platform
status: sprint
last_reviewed: 2026-08-21
supersedes: []
---

# Recorded, not repaired — Execution Runs read ABANDONED while governed actions still accept work

**This is an infrastructure observation from the Access & Identity lane. It is deliberately not
fixed from here**, because the Gateway is another lane's product and a repair attempted from this
worktree would be exactly the kind of cross-lane change the operating constraints forbid.

## The contradiction

Two Gateway channels disagree about whether an Execution Run exists.

| Channel | `erun_b251c6db4ce86cc5` | `erun_85061d207424a8ed` |
|---|---|---|
| `vac run-status … executing` | `illegal_transition (ABANDONED → EXECUTING)` | accepted once, then `illegal_transition (ABANDONED → VALIDATING)` |
| `vac governed-action --run …` | accepted, produced `gar_08c35ffe15bc77` | accepted, produced `gar_0a570a9ce30050` |

The second run is the sharper evidence: its **first** `run-status` call was accepted and returned
`EXECUTING`. A later call in the same session, from the same worktree, was refused as
`ABANDONED → VALIDATING`. Nothing in this lane abandoned it.

Meanwhile `governed-action` accepted work against both runs and recorded them in
`~/.local/state/alloy-dev/gateway/vacilando/governed-actions/requests.json` with a live
`run_id` — so one subsystem treats the run as gone while another writes new records against it.

## Why it matters beyond tidiness

**It has already produced one false completion claim.** The notification for
`gar_08c35ffe15bc77` reported *"The merge into staging already succeeded. Do not retry the merge"*
in the same message that reported the action had failed with `missing_repository`. Staging content
proved the merge had not happened: `AccessScopesPage.tsx` — a file this tranche **deletes** — was
still present, and `ACCESS_WORKSPACE_CHAPTERS` still contained `"scopes"`.

A run-state machine that reports ABANDONED while accepting work is a plausible source of that
class of error: a notification generated against a run the state machine believes is over has no
live execution to describe, and describing it optimistically is the failure mode.

## The rule this lane now follows

**Never report a promotion from notification text.** Verify by product state on the target branch,
and prefer a file the change *deletes* over a file it adds — an added file could arrive by another
route, but a merge cannot leave a deleted file behind.

```bash
git fetch origin staging
git cat-file -e origin/staging:web/lib/access/operatorAccountName.ts      # must exist
git cat-file -e origin/staging:web/components/adminV2/settings/access/AccessScopesPage.tsx  # must NOT
git show origin/staging:web/lib/access/accessChapterRoutes.ts | grep ACCESS_WORKSPACE_CHAPTERS
```

SHA ancestry (`git merge-base --is-ancestor`) is **not** sufficient on its own: a squash or rebase
merge produces different SHAs, so a true merge can fail that check.

## Suggested owner

The Vacilando Gateway lane (`wt1-vacilando-mac-mini-readiness`), which owns
`scripts/local-dev/vac` and the run-state store. Two questions worth answering there:

1. What transitions a run to `ABANDONED` without the executing lane requesting it?
2. Should `governed-action` refuse a request whose `run_id` the state machine considers terminal —
   or should the state machine treat an accepted governed action as evidence the run is live?

Either answer is coherent. The current pair is not.

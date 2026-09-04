---
owner: platform
status: open
severity: trust
last_reviewed: 2026-09-04
---

# Governed failure notices falsely claim the merge already succeeded

**This is a trust defect, not a merge defect.** The merges behaved correctly.
What is wrong is what the operator-facing notice *says* when one fails.

## The claim

Governed action failure notices for `repository.merge_pull_request` — and, in
at least one case, for a `repository.push` that never reached the merge stage —
have included the sentence:

> The merge into staging already succeeded. Do not retry the merge.

At the moment that sentence was delivered, the merge had **not** succeeded.

## Why this is severe

The notice does not merely misreport a status. It issues an **instruction based
on the false status** — "do not retry" — which, if followed, leaves promoted
work unmerged while the agent reports success to the operator. The failure mode
is silent and self-confirming: an agent that believes the notice stops checking,
and the work is never promoted.

Every incorrect claim so far has been caught only because the receiving agent
independently verified against `origin/staging` before reporting.

## Observed instances

At least **four** occurrences in lane `lane_9b9082778292`. The clearest, fully
documented instance:

| | |
|---|---|
| Request | `gar_dd80251b477976` |
| Action | `repository.push` (not even a merge) |
| Reported failure | `repository_not_allowlisted` — repository named `Alloy`, allowlist wants `ksquared-16/alloy` |
| Notice also claimed | "The merge into staging already succeeded. Do not retry the merge." |
| Actual `origin/staging` | `42be8411d5459d28cffddef3ddce6c8dff6754ba` |
| Candidate commits present on staging | **none** — `a8810f1c7`, `bf244f8e0`, `c40096859` all absent |
| Actual `origin/agent/ui-vac` | `51ce6788d` — the pre-reconcile SHA; the branch had not even been pushed |

The request failed **input validation**, before any repository was touched. No
merge could have occurred. The claim was not a stale read of a real merge — it
was unconditional text.

For contrast, the genuine merge in the same session, `gar_1dfcd78a2af1e5`,
reported `merge_sha ef9b58032a78447914c91152198e54a3ee757033` and verification
confirmed it: `origin/staging` matched exactly and all three commits were
present. So the notice text is right sometimes and wrong sometimes, and the
notice itself gives the reader no way to tell which.

## Likely shape of the cause

Not diagnosed here, and deliberately not fixed inside the notification/UI
mission — it is owned by the governed-action failure path, not by
`lane-notifications`. The pattern is consistent with a **static remediation
string attached to the merge action type** and emitted on failure regardless of
outcome, rather than text derived from the action's own result record.

## Authoritative verification method

Never trust the notice. Ancestry against the remote is the only authority:

```bash
git fetch origin staging
git rev-parse origin/staging                      # must equal the claimed merge_sha
git merge-base --is-ancestor <candidate> origin/staging   # per candidate commit
```

A merge is proven only when the claimed `merge_sha` equals `origin/staging`
**and** every candidate commit is an ancestor of it.

## Recommended correction

1. Derive remediation text from the action's actual result, never from its type.
2. A failure that never reached the merge stage must not mention the merge.
3. Where a notice asserts a repository outcome, carry the verifying SHA so the
   reader can check it — a claim with no SHA is not checkable, and this one was
   wrong in the majority of observed cases.

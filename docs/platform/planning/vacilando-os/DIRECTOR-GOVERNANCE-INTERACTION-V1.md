# Director Governance & Interaction Reliability V1

**Status.** Implemented and certified on this lane. Promotion blocked — see
[Promotion readiness](#promotion-readiness).

**Evidence window.** The governed-action audit at
`~/.local/state/alloy-dev/gateway/vacilando/governed-actions/audit.jsonl`,
2026-08-19 to 2026-09-11 inclusive. All counts below are measured from it, not
estimated.

---

## 1. What the measurement says

| | |
|---|---|
| Requests that reached an operator decision | **975** |
| Approvals granted | **1086 events** (111 of them duplicates) |
| Approvals **denied** | **0** |
| Director approval clicks, last 7 days | **316** |
| Operator-facing requests recording no reason for asking | **53 of 103** in the retained window |

Zero denials in 23 days is the finding that frames everything else. It does not
prove the boundaries are wrong — some of them are exactly right and were simply
never tested by a refusal. It does mean that no prompt in this window changed an
outcome, so every one of them has to justify itself on the possibility of a
refusal rather than on its history.

Approvals by action key, all-time and last 7 days, against the tier each one
carries in `ACTION_CLASS_INVENTORY` and whether a delegated policy covers it:

| Action key | Tier | Policy | All | Last 7d |
|---|---|---|---|---|
| `database.read_census` | B | **none** | 182 | 73 |
| `host.install_toolkit` | A | yes | 67 | 61 |
| `repository.merge_pull_request` | B | yes | 247 | 53 |
| `repository.push` | A | yes | 216 | 27 |
| `promotion.open_pr` | A | yes | 137 | 19 |
| `database.apply_promoted_migration` | **no row** | none | 16 | 16 |
| `database.apply_migration` | C | none | 28 | 15 |
| `database.repair_migration_ledger` | **no row** | none | 12 | 12 |
| `lane.dispatch_measurement_instruction` | B | yes | 20 | 11 |
| `environment.restore_qa_session` | C | none | 77 | 10 |
| `environment.restore_deployed_qa_session` | C | none | 12 | 8 |
| `environment.provision_qa_identity` | C | none | 11 | 6 |
| `environment.assign_qa_identity_access` | C | none | 12 | 2 |
| `repository.close_pull_request` | A | yes | 10 | 2 |
| `vacilando.retire_worktree` | B | yes | 32 | 1 |
| `capacity.set_provider_ceiling` | B | yes | 5 | 0 |
| `repository.delete_remote_branch` | B | yes | 2 | 0 |

**160 of the last 7 days' 316 clicks were on actions that already had an
enabled delegated policy.** The delegation existed, was documented, and did
nothing.

## 2. Why a delegated policy did nothing

`validateRequestShape` defaulted `target` to `alloy_deployed_primary` — the
deployed **database** identifier — for every action key except the four
promotion ones. `director-authority.environmentOf` reads `target` as the policy
**environment**, and `alloy_deployed_primary` is a member of
`OPERATOR_ONLY_ENVIRONMENTS`, which is checked at **step 3** of
`evaluateDirectorAuthority` — before a policy is matched at step 5.

So an action that did not name a target declared itself to be operating on the
production database, and escalated with:

> This targets alloy_deployed_primary, which is always an operator decision.

Every `host.install_toolkit` request in the retained window carried that
sentence. Its policy, `routine_toolkit_convergence_v1`, had *already* been
widened to name a `host` environment by someone who hit the tail of this and
recorded it in the source as "a routing gap wearing the costume of a safety
decision". The widening could not help: nothing ever set the environment to
`host`, and the request never survived step 3 to reach step 5.

**Verified on the real records.** Replaying the last stored
`host.install_toolkit` escalation with the truthful target and nothing else
changed:

```
as filed today:  target=alloy_deployed_primary
   decision=operator_approval_required  matched_policy=null
   reason=This targets alloy_deployed_primary, which is always an operator decision.

with the truthful default target:  target=host
   decision=director_approved  matched_policy=routine_toolkit_convergence_v1
   reason=none — this would run unattended
```

All seven gates measured and passed. The policy was never the obstacle.

## 3. Classification, and what was deliberately kept

The tier model in `director-operating-authorization.mjs` is sound and is not
replaced. No new policy engine, authorization store or slot manager is
introduced. What changed is that an action now states where it runs, so the
existing evaluator can reach the existing policy.

**Made reachable** (tier A/B, enabled policy, previously unreachable):
`host.install_toolkit`, `repository.close_pull_request`,
`repository.delete_remote_branch`, `vacilando.retire_worktree`,
`vacilando.apply_reconciliation_plan`, `capacity.set_provider_ceiling`,
`lane.dispatch_measurement_instruction`.

**Deliberately retained as operator decisions:**

- `database.read_census` against the deployed primary — 73 clicks in 7 days, and
  the largest remaining source. The inventory files it tier B; the evaluator
  treats it as operator-owned via `privileged_read_requires_operator`. **The
  document and the evaluator disagree, and this mission did not resolve it**,
  because moving a production read from operator to delegate is an
  authorization-model decision, not a defect. It is the first thing to put to
  the Director in V2.
- `database.apply_migration` and the `environment.*` QA identity actions — tier
  C, `OPERATOR_OWNED_ACTION_KEYS`, unchanged. Their declared target is also
  unchanged, so their escalation reason still names the database rather than the
  action-key reservation. That is cosmetic, and correcting it would have removed
  a fail-closed layer for no interruption benefit.

**Not inventoried at all:** `database.apply_promoted_migration` and
`database.repair_migration_ledger` exist on staging and generated 28 clicks in 7
days with no row in `ACTION_CLASS_INVENTORY` and no tier. They are absent from
this lane's base entirely (see [Promotion readiness](#promotion-readiness)), so
they could not be filed here. **Filing them is required for acceptance criterion
1 and is carried forward.**

## 4. Interaction reliability

The operator symptom — pressing Approve repeatedly because nothing says it
landed — is measured, not reported:

| | |
|---|---|
| Requests approved more than once | 20 |
| Duplicate approval events | **111** |
| Requests executed more than once | 48 |
| Executions beyond the first | **141** |
| Worst single request | `gar_9084b7b5fbbc7c`, **30 approvals in ~45 minutes** |

Intervals on that request ran from 1 second to 10 minutes. That is not someone
changing their mind thirty times.

Two independent holes produced it.

**Client.** The handler set `btn.disabled = true` on the DOM node and then
awaited the POST. Every repaint — poll tick, SSE frame, lane refresh — rebuilds
the markup from a template with no notion of a decision in flight, so the button
returned **enabled** underneath a request that was still running. The three
refreshes that follow a decision also ran *before* the first repaint, so the
operator waited out all of them with nothing on screen having changed.

**Server.** `refuseTerminalDecision` only catches a request that has already
*reached* a terminal state. A request that was approved and still parked — mid
execution, or awaiting a control-plane refresh — walked past both guards and
minted a **second single-use grant**. That is what defeated single-use: the
replay was not reusing the spent grant, it was buying a new one.
`executeGovernedAction` has no re-entry guard of its own.

The storm itself is historical — the re-arm loop that produced 43 and 53 re-asks
on 2026-08-27/28 was fixed separately, and the last duplicate approval before
this work was 2026-09-10. **The mechanism was still live in the promoted
toolkit**, and is what is closed here.

### The contract now

`READY → SUBMITTING → SETTLED`, or `READY → SUBMITTING → FAILED` with retry
explicit. Decision state lives in the view module, so it survives every repaint;
the press is painted **before** the network is touched; a second press on an
in-flight decision returns without issuing a mutation; the server answers a
duplicate with `already: true` rather than an error, because the decision did in
fact take effect; and a failure is named next to the control that failed, with
one deliberate way to try again. No silent no-op, no indefinite spinner.

## 5. Audit and observability

Removing a click must not remove the answer to why. Both directions are now
recorded on the request and on every audit line:

- `escalation_reason` — on **every** escalation, including the paths that never
  reach the director evaluator. Previously 53 of 103 operator-facing requests
  carried none, which is why this friction survived as long as it did: there was
  nothing to argue with.
- `authorization_basis` — on every unattended execution: the reason, the
  authority kind, the exact authorization or delegation id spent, the policy and
  version, the environment, and when.

Both surface in the approval card under **"Why this needs you."**

### A gap left open

`approveGovernedAction` threads one `nowMs`, captured at entry, through every
downstream `appendAudit`. Every event of one approval therefore carries an
**identical timestamp**, so the audit cannot answer "how long did this take".
Duration has to be instrumented rather than derived. Not fixed here; it changes
the meaning of a field the whole ledger uses.

## 6. Carried forward — Message Send & Browser Acknowledgement Reliability V1

Observed while instrumenting, **not fixed**, per scope.

The two symptoms do **not** share a client-state cause, and assuming they did
would send the next mission to the wrong place. `sendCurrent` already does what
the approval path did not: it sets `G.sending`, paints `"Sending…"`, and guards
re-entry — all *before* the fetch. What lingers is the **draft text**, cleared
only at the success branch after the POST resolves, so it sits in the composer
for the full duration of delivery.

What the two *do* share is the real cause: **both endpoints do their entire job
synchronously inside the HTTP request.** `POST /api/v2/governed-actions/approve`
does not answer until `approveGovernedAction` has executed the trusted-host
action and awaited the lane resume — up to the action's 180 s timeout. `POST
/api/lanes/:id/instruction` does not answer until delivery is known, which is
why its response can carry `status: "delivered"`.

The durable fix for both is the same shape and is the next mission's: acknowledge
the accepted request durably and immediately, then execute asynchronously and let
the projection converge. This mission deliberately did not take it — it is a
change to the execution boundary of every governed action, and it wants its own
certification rather than a ride on this one.

## 7. Certification

| Suite | Before | After |
|---|---|---|
| `governed-action-request` | 15 passed, **5 failed** | **20 passed, 0 failed** |
| `director-approval-reliability` (new) | — | **17 passed, 0 failed** |
| `development-governed-approval` | 38 / 0 | 38 / 0 |
| `development-governed-approval-ui` | 18 / 0 | 18 / 0 |
| `development-governed-promotion-chain` | 34 / 0 | 34 / 0 |
| `development-governed-dependency` | 34 / 0 | 34 / 0 |
| `development-standing-authorization`, `development-director-authority`, `director-operating-authorization` | pass | pass |

The five pre-existing failures were stale fixtures, not defects: four granted a
standing authorization with no subject binding, which `classifyStandingGrant`
stopped honouring when "absence is never a wildcard" landed, and one asserted
that a denial moves a run to `FAILED` when the runtime deliberately parks it in
`NEEDS_INPUT`. Both are now asserted the way the runtime actually behaves.

Two suites — `development-action-authorization-identity` (17/2) and
`director-execution-v2` — fail **identically before and after** this change,
verified by reverting to `HEAD` and re-running. They are untouched by this work
and are not claimed as fixed.

Refusal paths are certified as heavily as success paths: operator-owned action
keys still escalate whatever their target, an unregistered action still defaults
closed to the deployed primary, no delegated action may default into an
operator-only environment, a duplicate press mints no second grant and executes
nothing, and a genuine re-ask is still answerable.

The structural guard is the one that matters most:

> *a delegated policy's action defaults to an environment that policy covers*

It fails for any future action whose default target falls outside the
environments its own policy names — which is what would have caught this on the
day it was introduced rather than 23 days and 975 approvals later. It was
verified to fail by reintroducing the defect.

## Promotion readiness

**This candidate is not promotable as it stands, for a reason that has nothing
to do with the soak.**

`agent/ui-vac` is **654 commits behind `origin/staging` and 0 ahead**. The four
defects were re-verified directly against the **running promoted toolkit**
`14b0e01dcd06` and are all present there — the `defaultTarget` block is verbatim
identical, the approve path still has no re-entry guard, and none of
`defaultTargetForAction`, `DEFAULT_TARGET_BY_ACTION`, `ESCALATION_REASON_TEXT`,
`authorization_basis` or `duplicate_approval_ignored` exists on staging. The
findings hold. The *patch* does not apply cleanly: `git merge-tree` against
`origin/staging` auto-merges both client files and conflicts on
`governed-action-request.mjs`, which has moved by 708 insertions.

Rebasing or merging would resolve it, and both are withheld by `CLAUDE.md`
pending explicit authorization. **This needs a decision before promotion, and it
is independent of the Host Lifecycle soak.**

Separately, and as instructed: promotion would replace the running Gateway and
toolkit while the authoritative 24-hour Host Lifecycle soak is running against
`14b0e01dcd06`, which would invalidate criterion 12. Nothing in this work touched
that lane, its worktree, its evidence or its soak.

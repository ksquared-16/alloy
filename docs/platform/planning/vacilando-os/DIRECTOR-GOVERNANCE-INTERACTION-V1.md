---
owner: platform
status: canonical
last_reviewed: 2026-09-12
supersedes: []
---

# Director Governance & Interaction Reliability V1

**Status.** Implemented and certified on a clean current-staging candidate.
Promotion blocked only by the active Host Lifecycle soak.

**Candidate.** `promote/director-governance-v1` @ `1062dd192`, based on
`origin/staging` @ `4f9d1c50b`. Merges cleanly into `origin/staging` @ `66908d699`
with no conflicting files.

**Evidence window.** The governed-action audit at
`~/.local/state/alloy-dev/gateway/vacilando/governed-actions/audit.jsonl`,
2026-08-19 to 2026-09-11 inclusive. All counts are measured from it.

---

## 1. What the measurement says

| | |
|---|---|
| Requests that reached an operator decision | **975** |
| Approvals granted | **1086 events** (111 of them duplicates) |
| Approvals **denied** | **0** |
| Director approval clicks, last 7 days | **316** |
| Operator-facing requests recording no reason for asking | **53 of 103** |

Zero denials in 23 days does not prove the boundaries are wrong — some are
exactly right and were simply never tested by a refusal. It does mean no prompt
in this window changed an outcome, so each must justify itself on the
possibility of a refusal rather than on its history.

**160 of the last week's 316 clicks were on actions that already had an enabled
delegated policy.** The delegation existed, was documented, and did nothing.

## 2. Why a delegated policy did nothing

`validateRequestShape` defaulted `target` to `alloy_deployed_primary` — the
deployed **database** identifier — for every action key except the four
promotion ones. `director-authority.environmentOf` reads `target` as the policy
**environment**, and that value is in `OPERATOR_ONLY_ENVIRONMENTS`, checked at
**step 3** of `evaluateDirectorAuthority` — before a policy is matched at step 5.

So an action that did not name a target declared itself to be operating on the
production database, and escalated with *"This targets alloy_deployed_primary,
which is always an operator decision."*

Every `host.install_toolkit` request in the window carried that sentence. Its
policy had *already* been widened to name a `host` environment by someone who hit
the tail of this and recorded it in the source as "a routing gap wearing the
costume of a safety decision". The widening could not help: nothing ever set the
environment to `host`, so the request never survived step 3.

An action's default target is now the thing the action actually touches, and
anything absent from that table still defaults closed to the deployed primary.

## 3. Policy decisions, as approved

### A. Census — delegated, and it is the largest single win

`allowlisted_read_only_census_v1` covers `database.read_census` in
`alloy_deployed_primary`. Every gate is measured by **re-running the registry's
own validator at decision time** — the same code the trusted host runs — so
there is no second opinion about what read-only means, and an artifact that
changed between filing and deciding cannot ride an earlier pass:

`census_is_read_only_mode`, `census_query_hash_pinned`,
`census_artifact_validates`, `census_sql_proven_read_only`,
`census_target_exact`, `census_artifact_inside_worktree`, plus
`no_governance_exception` and `no_operator_hold`.

Step 3 admits it through **one enumerated (action, environment) exemption**,
`OPERATOR_ONLY_ENVIRONMENT_READ_EXEMPTIONS`. Being evaluated is not being
approved: the action still has to match an enabled policy for that exact
environment and pass every gate, and step 4's operator-owned reservation still
runs afterwards and still wins. Three independent conditions make a write
unable to wear it — the pair must be listed, the class must not be
operator-owned, and the request must declare `read_only`, which
`validateAgainstRegistry` already refuses to pair with a non-read risk class.

A census that pins nothing, whose artifact has moved or no longer matches, whose
SQL does not validate, or whose target is not exactly the one that will be read,
**still refuses — and now names the gate.**

### B. QA identity and session — unchanged, deliberately

The approved conditions are "lane/environment already authorized, exact
environment deterministically resolved, preflight passes, no privilege
expansion, existing governed flow, audit records the standing basis". The
existing mechanism for that is standing authorization, and it already applies:
59 of 200 requests in the retained store executed on
`existing_lane_standing_authorization`. All four `environment.*` actions remain
in `OPERATOR_OWNED_ACTION_KEYS`, which is a **class** reservation checked at
step 4 — no policy, present or future, can pick them up.

Removing that reservation is the actual decision here, and it is not a
classification this mission can make: these actions mint and bind session
material, and `environment.restore_deployed_qa_session` authenticates a public
host. The instruction says not to invent another QA auth mechanism; the honest
reading is that the standing-authorization path already exists and the class
reservation is the thing in front of it. **Carried forward as an explicit
operator decision, not silently taken.**

### C. Migrations — classified by their own semantics, not weakened

`database.apply_promoted_migration` and `database.repair_migration_ledger`
generated **28 clicks in the measured week with no inventory row and no tier**.
The structural test *"every operator-owned action key is tier C or D"* has been
**failing on current staging** because of it — the one test that keeps the
governance document and the evaluator reconciled was red.

Both are now filed **tier C**, which is what their own registry contracts say:
each declares `operatorApprovalRequired: true` and `delegable: false`, and
`trusted-host-production-migrate.mjs` states "never delegable, never satisfied
by a policy gate."

The approved conditional-autonomy contract for an exact promoted migration has
eight conditions; the eighth is *canonical refusal rules remain intact*, and
`delegable: false` **is** one of those rules. Overruling it would not be
classifying the action — it would be overriding it. Moving either to tier B is a
deliberate change to the registry contract and an operator decision.

`database.repair_migration_ledger` is additionally **added to
`OPERATOR_OWNED_ACTION_KEYS`**. It declared `delegable: false` and was then
absent from that list, so the only thing standing between a delegate and a
production ledger write was a *default target* — one guard, in a file governing
a different concern, for a write whose failure mode is that every subsequent
"has this been applied" returns the wrong answer. This is a strengthening.

### D. Merge, promotion, push — already delegated, now reachable

`certified_staging_merge_v1` and the push/open-PR policies were already enabled
with full gate sets measured from GitHub. They escalated because of the target
defect, not because of a gate. With the target corrected they are reached; a
failing check still refuses, and the server-side refusal remains authoritative.
Nothing here turns an approval prompt into an override prompt: there is no path
added by which a failed gate can be overridden.

## 4. Interaction reliability

| | |
|---|---|
| Requests approved more than once | 20 |
| Duplicate approval events | **111** |
| Requests executed more than once | 48 |
| Executions beyond the first | **141** |
| Worst single request | `gar_9084b7b5fbbc7c`, **30 approvals in ~45 minutes** |

Intervals on that request ran from 1 second to 10 minutes — the signature of
someone with no feedback, not someone changing their mind.

**Client.** The handler set `btn.disabled = true` on the DOM node and awaited the
POST. Every repaint rebuilds the markup from a template with no notion of a
decision in flight, so the button returned **enabled** under a running request.
The three refreshes that follow a decision also ran *before* the first repaint.

**Server.** `refuseTerminalDecision` only catches a request that has already
*reached* a terminal state. One approved and still parked walked past both guards
and minted a **second single-use grant** — which is what defeated single-use: the
replay was not reusing the spent grant, it was buying a new one.

### The contract now

`READY → SUBMITTING → SETTLED`, or `READY → SUBMITTING → FAILED` with retry
explicit. Decision state lives in the view module and survives every repaint; the
press is painted **before** the network is touched; a second press on an
in-flight decision issues no mutation; the server answers a duplicate with
`already: true` rather than an error; failure is named next to the control that
failed. No silent no-op, no indefinite spinner.

## 5. Audit, and timing that is measured rather than fabricated

- `escalation_reason` on **every** escalation, including paths that never reach
  the evaluator. Previously 53 of 103 carried none.
- `authorization_basis` on every unattended execution: reason, authority kind,
  the exact authorization or delegation id spent, policy and version, environment.

`approveGovernedAction` threaded **one `nowMs`** through every downstream audit
event, so every event of an approval carried an identical timestamp. Across the
962 approvals with a terminal event, median approve-to-terminal reads as **0.0s**
— not a fast system, a fabricated one.

`decision_timing` now records `submitted_at` (from the client, the actual press),
`accepted_at`, `authorization_persisted_at`, `execution_started_at`,
`execution_settled_at` (success **and** refusal), and `projection_visible_at`, on
a **separate observability clock**. `nowMs` remains the authorization clock,
untouched: wall-clock time never becomes part of authorization correctness, and
tests that pin time stay deterministic. That separation is asserted directly —
one test approves with a pinned `nowMs` and checks the observed stamps still
move, and that the authorization stamp still reads the pinned instant.

`projection_visible_at` is the last stamp the server can honestly take. It is not
the moment a pixel changed in the operator's browser; inventing one would be
worse than admitting the series ends at the projection.

## 6. Interruption reduction, replayed on real records

Replaying the 103 operator-facing requests still in the store, against current
staging plus this candidate:

| Outcome | Count |
|---|---|
| `database.read_census` → **director_approved** | **23** |
| `host.install_toolkit` → **director_approved** | **11** |
| `repository.push` → **director_approved** | **1** |
| everything else → escalates, with a named cause | 68 |
| **would now run unattended** | **35 of 103** |

Every remaining escalation names a specific cause — `census_query_hash_pinned`,
`head_sha_still_matches`, `pull_request_mergeable`, `branch_owned_by_requesting_lane`,
or an explicit operator-owned reservation. None says only "this targets
production".

**Read this with its caveat.** It is a replay. The push, open-PR and merge gates
measure worktree and GitHub state that has moved since those requests were filed,
so their refusals here *understate* what would have passed at request time. The
census and toolkit numbers do not depend on moved worktree state and are sound.

## 7. Certification

| Suite | Before | After |
|---|---|---|
| `director-operating-authorization` | 14 passed, **1 failed** | **16 passed, 0 failed** |
| `governed-action-request` | 15 passed, **5 failed** | **20 passed, 0 failed** |
| `director-approval-reliability` (new) | — | **23 passed, 0 failed** |
| `development-governed-approval` | 38 / 0 | 38 / 0 |
| `development-governed-approval-ui` | 18 / 0 | 18 / 0 |
| `development-governed-promotion-chain` | 34 / 0 | 34 / 0 |
| `development-governed-dependency` | 34 / 0 | 34 / 0 |
| `development-governed-notification-delivery` | 19 / 0 | 19 / 0 |
| `development-executor-authority` | 29 / 0 | 29 / 0 |
| `governed-action-handoff` | 15 / 0 | 15 / 0 |
| `director-capability-freshness` | 11 / 0 | 11 / 0 |
| `development-director-authority`, `-certification`, `-standing-authorization`, `-exact-authorization`, `-approval-discoverability`, `director-attention-model`, `-notification-categories`, `governed-request-retention`, `development-governed-run-wait`, `development-provider-governed-bridge` | pass | pass |

The pre-existing failures were stale fixtures, not defects: four granted a
standing authorization with no subject binding, which `classifyStandingGrant`
stopped honouring when "absence is never a wildcard" landed; one asserted a
denial moves a run to `FAILED` when the runtime deliberately parks it in
`NEEDS_INPUT`; and the operating-authorization failure was the missing inventory
row for `database.apply_promoted_migration`.

Two suites — `development-action-authorization-identity` (17/2) and
`director-execution-v2` (9 assertion failures) — fail **identically on pristine
`origin/staging` and on this candidate**, verified by reverting the working tree
and re-running. They are untouched by this work and are not claimed as fixed.

Refusal paths are certified as heavily as success paths: operator-owned keys
still escalate whatever their target; an unregistered action still defaults
closed; no delegated action may default into an operator-only environment except
through an enumerated exemption; every exemption must be a read and must not be
operator-owned; a write cannot wear the exemption by relabelling its mode; a
census that pins nothing or whose artifact moved refuses; both migration actions
are reserved and policy-free; a duplicate press mints no second grant and
executes nothing; and a genuine re-ask is still answerable.

The structural guard that matters most —

> *a delegated policy's action defaults to an environment that policy covers*

— fails for any future action whose default target falls outside the environments
its own policy names, and was verified to fail by reintroducing the defect.

---

# NEXT MISSION — Async Command Acknowledgement & Message Send Reliability V1

**Do not fold this into the governance patch. It is a change to the execution
boundary of every governed action and wants its own certification.**

## The shared defect, stated exactly

Both operator-facing HTTP paths perform the entire action synchronously inside
the request, so the browser cannot learn its intent was accepted until the work
has finished.

**`POST /api/v2/governed-actions/approve`** — `v2-api.mjs` awaits
`approveGovernedAction`, which mints the grant, calls `executeGovernedAction`
(which runs the trusted-host action inline) and then awaits `resumePromise`,
which resumes the lane and sends the continuation instruction. A census carries a
180 s timeout; `database.apply_promoted_migration` carries **600 s**. The
response cannot arrive before all of that.

**`POST /api/lanes/:id/instruction`** — the response carries
`status: "delivered"`, so it does not answer until delivery is known.

## What is *not* the cause, so the next mission does not start in the wrong place

`sendCurrent` in `gateway.js` **already** does what the approval path did not: it
sets `G.sending`, paints `"Sending…"`, and guards re-entry — all *before* the
fetch. The two symptoms do **not** share a client-state cause. What lingers in
the composer is the **draft text**, cleared only in the success branch at
`setDraft(id, "")` after the POST resolves, so it sits there for the full
duration of delivery.

The approval half of this is now fixed at the UI layer by this mission; the
server half is not, and is what remains.

## Architectural objective

```
operator intent
  → durable acceptance
  → immediate HTTP acknowledgement
  → optimistic / pending UI
  → asynchronous execution
  → projection / terminal convergence
```

`decision_timing` shipped here is the instrument for it: `accepted_at` minus
`submitted_at` is the number the change has to move, and
`execution_settled_at` minus `accepted_at` is the work that should no longer be
inside the request.

Shared infrastructure where appropriate; separate domain execution semantics
preserved — a governed action's grant, fingerprint and audit contract are not the
instruction pipeline's.

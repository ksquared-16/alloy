# DevOps 3 — Worktree Lifecycle V1

**Status.** Implemented and certified. Candidate held behind the active Host
Lifecycle soak.

**Baseline.** `origin/staging` @ `f61185c25`, with DevOps 2 (`db0033e12`, which
contains DevOps 1 `2eb5c3f27`) merged in as the first commit.

---

## 1. The audit's finding: almost all of this already existed

The mission's brief reads as though worktree retirement needed building. It does
not. Vacilando already owns the whole dangerous half:

| Concern | Existing owner |
|---|---|
| 14 required safety gates, null blocks | `worktree-retirement.mjs` |
| Fleet measurement, git truth, durability | `worktree-retirement-observe.mjs` |
| Removal, re-measured at the boundary | `trusted-host-worktree-retirement` |
| Automatic cadence | **Host Steward** — `retire_worktree`, priority 8, certified |
| Read-only preview, same evaluator | `vac worktree-retire` |
| Cached disk sizes | `resources.mjs` (`peekWorktreeDiskCache`) |
| Governed approval | `vacilando.retire_worktree` (tier B, bounded) |

Running the existing preview on the live fleet produced **13 director-safe, 6
operator-required, 12 blocked**, each with named failing gates.

**So no gate, no removal path, no timer and no registry was added.** Sections C,
E and J of the brief were already satisfied.

## 2. What was actually missing

1. **A lifecycle vocabulary.** `groupRetirementCandidates` answers *"may the
   Director retire this"* — a decision, not a state. It cannot say a worktree is
   in use, parked inside a retention window, or protected by a candidate.
2. **Time.** The retirement evaluator has **no time dimension at all**: a
   worktree becomes director-safe the instant its branch merges. Nothing said
   "keep this a little longer, somebody may come back".
3. **Candidate protection.** The existing `protected` group covers protected
   *branch names* — staging, main, master. There was no concept of a promotion
   candidate awaiting landing. Today those survive only because branch durability
   happens to refuse them — **protection by accident**.
4. **Disk.** The preview reported no size, so "how much would this reclaim" had
   no answer.

## 3. Derived, never persisted

`classifyWorktreeLifecycle` is a pure function over the evaluation record the
existing observer already produces. No `ACTIVE`/`PARKED`/`ARCHIVED` column is
written anywhere, so a worktree cannot be labelled one thing while being another
— the failure a stored lifecycle column always eventually reaches.

`ARCHIVED` is deliberately absent from the derivation: it describes a lane whose
worktree is *gone*, so there is no worktree to classify. It is the lane
registry's fact.

Order is the safety argument: **active use → protection → blocking conditions →
retention**. Nothing reaches `RECLAIMABLE` by passing a later test while failing
an earlier one, and undurable is checked before dirty because it is the
unrecoverable one.

## 4. Retention, measured

`park_hours: 24` — above the entire active cluster (nine lanes within 6h), below
the first genuinely quiet one at 27h. It exists purely because the evaluator has
no clock: without it, the operator who merges at 16:00 and returns at 16:10 finds
their checkout gone.

`promotion_park_hours: 2` — a promotion checkout whose candidate has **landed**
has no reason to exist. These are what actually accumulate: 13 of the 31 live
worktrees are landed `wt-*` promotion checkouts.

**Time makes something eligible for consideration; durability and ownership make
deletion safe** — and those remain the existing gates' job. Old is never a
synonym for safe.

Supersession is **never inferred**. From git alone a superseded candidate is
indistinguishable from one still waiting, and guessing is how an unlanded
candidate gets deleted. It is reported only when a caller supplies it — DevOps 6.

## 5. A real bug, caught against real data

The first cut of the classifier read `failed_gates`. **That field does not
exist** — the record carries `blocked_by` and `unmeasured`. The blocked set was
therefore always empty, every obstacle was invisible, and **21 of 31 worktrees
classified as RECLAIMABLE** against a preview that said 13.

A classifier that silently sees no obstacles is the worst failure this module can
have. It was caught by comparing against the existing preview on the live fleet,
and there is now a control asserting the field names — including `unmeasured`,
because the subsystem's own rule is that a null gate **blocks**; reading only
`blocked_by` would quietly reintroduce the permissive unknown.

## 6. Live fleet

```
worktrees 31 · RECLAIMABLE 13 · PROMOTION_PROTECTED 10 · ACTIVE 5
              OPERATOR_REVIEW 2 · BLOCKED_DIRTY 1
reclaimable_disk_mb 0 · reclaimable_disk_unknown 13
```

The 13 reclaimable match the existing preview's 13 director-safe exactly — one
truth, two surfaces. Disk reads *unknown* because the cache was cold: the
projection uses `peek`, never `collect`, so a health report can never become the
reason a fleet-wide `du` runs. Unknown is reported rather than counted as zero.

**Nothing was reclaimed.** No cleanup was run against live worktrees.

## 7. Slot 8 — root cause and disposition

**Root cause.** The canonical slot authority is the registry, `metadata/<name>.env`.
It declares slot 8 exactly once, for `documentation-api`. `troubleshooting.env`
exists and carries **no slot line at all**. Troubleshooting's lane record still
said `binding.slot = 8` — a **stale cached copy** of a binding it no longer held.

The only symptom was Troubleshooting's bootstrap failing with
`lane_slot_unregistered`: a message about the lane that was really a fact about a
duplicate.

**Why it persisted.** `reconcileLaneSlotBinding` could converge a lane *onto* a
slot the registry declares, but had nothing to say when the registry declares
none — it refused, and the stale claim survived indefinitely.

**Fix.** The canonical reconciler now clears a claim the authority does not back.
It is the narrowest possible repair: the slot is not reassigned, no other lane's
record is touched, no registration is written, and the worktree binding is left
exactly as it is. The lane becomes slotless — which DevOps 1 and 2 both certify is
valid. Every *other* unresolvable state still refuses, because clearing a binding
on an unknown is how a lane loses a slot it really holds.

**Disposition: implemented and certified, NOT applied live.** The fix only takes
effect through the installed toolkit, and hand-editing the live lane store is
exactly the "simply edit a lane record to make health green" the brief forbids.
**Thread 5 is untouched** — slot 8 still serves alloy-cert from documentation-api,
and nothing in this change goes near that registration.

The invariant now fails loudly: `slots.ownership` reports
`problem · conflicts 1 · repairable 1`, naming both claimants and the registry
holder.

## 8. Certification

`worktree-lifecycle-class` — **27 passed, 0 failed**, covering all eighteen
required proofs plus the field-shape contract: active retained; clean durable idle
reclaimable; inside the window parked; dirty, untracked, undurable, ambiguous and
held all refuse at any age; promotion candidates protected explicitly by branch
*and* path; landed candidates reclaimable on a shorter window; supersession
reported not inferred, and unable to override a gate; preview and execution share
one evaluator; unknown disk never counted as zero; classification idempotent and
non-mutating; the module contains **no removal path and no git mutation** (asserted
against the function source); durability vocabulary imported from the retirement
owner rather than copied; the slot invariant detected, repairable only when the
registry arbitrates; and the reconciler clearing a stale claim while the **lane
survives** with its status, identity and worktree binding intact.

Regression green across the freshness, bootstrap, health, durable-lane,
branch-reconcile, worktree-lifecycle, slot-topology, placement, provisioning,
browser-auth, QA-slot-preflight, control-plane and admission suites.

## 9. DevOps 4 — durable knowledge seam

Knowledge must outlive the filesystem. It already does, and this mission proves
rather than builds it:

- **Lane identity** survives worktree removal — certified here: clearing a slot
  and removing a worktree leaves the durable lane `ACTIVE` with its id and name.
- **Candidate SHA, evidence and decisions** live in the runtime state root
  (`~/.local/state/alloy-dev/gateway/vacilando/…`) and in `docs/` committed to the
  repository — neither of which is inside a worktree that gets reclaimed.
- **Retirement records** the branch and head SHA before removal, so the content is
  addressable afterwards; the steward's own postcondition is "path and
  registration absent, **branch still resolvable**".

The seam DevOps 4 should build on is therefore: *lane id → durable records in the
state root and the repository*, never *lane id → files in its worktree*. Nothing
in this mission makes documentation retention depend on keeping a checkout.

## Promotion

`READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK`. Nothing installed, no Gateway
restarted, no toolkit replaced, Host Lifecycle lane and soak evidence untouched,
no live worktree reclaimed. Held with `16601e54f`, `25c85997d`, `2eb5c3f27` and
`db0033e12`; lands after DevOps 2 or with the chain.

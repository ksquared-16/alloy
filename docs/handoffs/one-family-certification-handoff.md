---
title: One-Family Product Certification — session handoff
status: active
updated: 2026-08-05
---

# One-Family Product Certification — session handoff

Read this first. It replaces re-discovery.

## Environment — reuse, do not bootstrap

```
root       /Users/Kelly/Alloy            (canonical; verify with `alloy-root`)
slot       5
worktree   /Users/Kelly/Code/alloy-worktrees/wt5-one-family-cert
branch     agent/claude/5-lead-outcome-model
head       11cafde06                     (pushed; local == remote)
port       3015                          http://localhost:3015
tenant     Firefly, org 93667019-bd28-49b5-a688-acc9bb1e0a19
department 3933ac47-077a-4de8-aaac-8aed48d80413   (key `lead_management`, name "Enrollment")
process    42be9074-443f-4047-bece-d68cd1d22788   (key `enrollment`)
```

**Do NOT run `alloy-sprint-start`.** The slot is live. Start the server with:

```bash
alloy-dev-start wt5-one-family-cert
```

The branch is **84 commits behind `origin/staging`** and has **16 commits** of its own. It has
never been rebased since `ce4d58d66`+. Rebase before any PR.

### Talking to the tenant

Auth cookie is at `/Users/Kelly/.local/state/alloy-dev/auth/slot5/storage-state.json` (single
cookie `sb-<ref>-auth-token`, domain `127.0.0.1`). Build a curl cookie jar from it; do not print
the token. Evidence artifacts live in `certification/sub-slice-3/`.

## Where the mission is

The **draft is publishable**: `can_publish: true`, zero errors, zero warnings.
**Nothing has ever been published.** The published projection is byte-identical to the start of
the program: `e3b000d12cebda825fa24c3355e69d9ffd613f0f923ed0880b8584369db8d1a8`.

Runtime therefore still executes the OLD configuration. Every correction below lives in the
draft only.

### Draft corrections landed

```
lead      lead_to_tour -> tour              both Tour movement rules resolve through it
decision  grain child -> family             all three sources now agree
enrolling enrolling_to_enrolled -> enrolled  complete_to_enrolled uses the transition
tour      Schedule Tour keeps only Tour Scheduled + Awaiting Family Response
tour      Conduct Tour gains Completed—Interested + Completed—Needs Follow-up
tour      tour_transition_1 (family -> child Waitlist) REMOVED, with its two rules
command   update_lead_status, add_child, add_family_member, schedule_tour, quick_message
work tmpl contact_family primary quick_message; send_form + create_task removed
stages    closed / closed_withdrawn were added, then REMOVED again — see below
```

Final stage order: `lead, tour, decision, waitlist, enrolling, enrolled` (sort_order 0,2,3,4,6,7).

`closed` and `closed_withdrawn` were added as work-free storage buckets for terminal results and
have since been REMOVED from the draft. They were a modelling error: a family case ends through
`opportunities.status_key` and a child's participation ends through `process_instances.state`.
Neither terminal result needs a stage, and the platform must not require one. Whether a tenant
represents a terminal result as a stage is a configuration choice.

Six Tour outcomes are **preserved but operator-unreachable**, awaiting certification:
Family Declined Tour, Move to Waitlist, Closed Lost, Tour Rescheduled, No Show, Tour Cancelled.

## Platform corrections landed (the real work)

Each was a defect found while trying to make a configuration change. All are on the branch.

1. **Outcome editor round-trip** (`74bd7632f`) — the editor deleted rule targets it could not display.
2. **Family-close guard** (`47bb53852`) — a family case could close while children were active.
   Fail-closed enumeration; four classifications; an `enrolled` child blocks.
3. **Grain-compatible movement** (`f52d41ac8`) — nothing stopped a child outcome writing a family
   stage. `resolveStageGrain` is the ONE contract; disagreement is reported, never arbitrated.
4. **Saved cross-grain paths reported** (`a04a93047`).
5. **Bootstrap grain parity** (`b86465f32`) — editor and runtime now judge from the same evidence.
6. **`update_stage_grain`** (`e277ae78a`) — grain was authored config with no authoring path.
7. **`ensure_stage_transition`** + validator copy split (`7d62856b1`).
8. **Save vs Validate/Publish boundary** (`a965ac632`) — a publish-grade check was gating every
   save; publication gained a check it never had.
9. **Draft persistence convergence** (`7fa2c7a8c`) — THE big one. Authoring wrote
   `departments.metadata.lifecycle_builder_v1`, a published projection guarded at the database, so
   NO lifecycle-builder action could save at all. Now routes through `openDraft`/`saveDraft`.
10. **`update_process_command_set`** (`0d782d046`) — command-set membership had no authoring path.
11. **Partial patch for `stage-runtime-config`** (`4357b7358`) — it demanded `selected_status_keys`
    on every save, making disposition-keyed child stages unauthorable.
12. **Legacy-target false positives removed + shared validation truth** (`78104a952`).

## Load-bearing facts — do not re-derive

- **`departments.metadata.lifecycle_builder_v1` is a PUBLISHED PROJECTION.**
  `trg_departments_lifecycle_projection_guard` refuses ordinary writes. Authoring goes to
  `business_process_drafts`; publication is the only projection writer. Never call
  `begin_lifecycle_projection_write`.
- **Child participation authority is `process_instances`**, not OCM. OCM keeps the
  opportunity↔child relationship and proposal responsibilities. Do not reintroduce OCM writes.
- **The Platform Transaction Contract is a SAGA**, not a DB transaction. Its endings include
  `partially_committed` + `integrity_breach`. Never call it atomic.
- **Two CAS tokens**: `draft_revision` (concurrent edits) and `base_revision_id` (publication
  staleness). Both are trigger-enforced.
- **The runtime cannot express "all child tracks terminal"** — triggers are only
  `when_outcome_key`, `when_enter_status_key`, `when_domain_signal`, `when_attempt_count_*`.
- **No case-reopen path exists** for family or child. `reopen_work` reopens a work task.
- **`create_task` is NOT in the capability registry.** `update_process_command_set` refuses it
  structurally. Do not add it to clear validation.
- **`reorder_stage` syncs Work Unit order from the PUBLISHED projection** — stale for an
  unpublished draft. Recorded, not fixed. (This is why `closed` had been appended rather than
  inserted, before both terminal stages were removed.)
- **`stage-runtime-config` requires `selected_status_keys` only when editing membership.** Omit it
  for operating-plan-only edits; supplying invented keys rewrites the queue definition.

## Working method that has held

Every tenant write follows: read authoritative draft → hash → build candidate locally → assert the
diff contains ONLY authorized changes → call the canonical API → read back → require equality with
the candidate. Abort before writing if anything unexpected appears. This has caught real problems
every time it was used.

Baselines: `tests/lifecycle` is **40 failed files / 82 failed tests** on this base — all
pre-existing. Compare against that, not against zero. Typecheck must be 0; run it in the
background (`npm run typecheck`), foreground runs get SIGTERM'd under load.

## Next slices, in dependency order

1. **Wire Closed Lost** — needs a `Tour → closed` transition (family→family, so
   `ensure_stage_transition` works) plus `update_family_case_status` + `close_reason_key`.
   Blocked on the family-close decision below.
2. **Per-child Decision** — Decision has one family-grain work template and no child selector.
   `update_child_enrollment_status` needs a threaded `customer_member_id`; it errors rather than
   fanning out. Needs a child-selection surface.
3. **Governed family close** — `close_lead` exists but is `supportsMultiSubject: false`. Needs
   preview of affected children, explicit confirmation, and saga composition with child-writes-first
   ordering. Sub-slice 1's guard already blocks the bare path.
4. **Aggregate closure** — deferred by decision. Do not build.
5. **Publication** — only on Kelly's explicit authorization.

## Standing controls

No publishing. No PR or merge without explicit authorization. No direct metadata writes, no
service-role scripts, no projection-guard bypass. No operational records. Report blockers rather
than routing around them.

---
owner: platform
status: in-progress
last_reviewed: 2026-07-28
---

# Create Lead / BOS Operational Validation — Session Handoff

**Goal of this initiative:** walk the enrollment lifecycle one stage at a time in the real app,
validating each step end to end and fixing what the walk exposes. This session covered lead
creation through the lead stage's first work item.

**The next session has no memory of this one. Everything it needs is here.**

---

## 1. Where the work lives

| | |
|---|---|
| **Root** | `/Users/Kelly/Alloy` (canonical, sanctioned — verify with `alloy-root`) |
| **Slot** | Managed **Slot 6**, provider `claude` |
| **Worktree** | `/Users/Kelly/Code/alloy-worktrees/wt6-create-lead-validation` |
| **Branch** | `agent/claude/6-create-lead-validation` |
| **Base** | `origin/staging` — **8 ahead / 0 behind**, working tree **clean** |
| **Promotion** | **Nothing pushed. No PR. No merge.** Awaiting Kelly's explicit authorization. |
| **Dev server** | `http://127.0.0.1:3016` — running and healthy (`alloy-dev-start wt6-create-lead-validation`) |
| **Database** | The dev server points at the **LIVE staging DB**. Firefly org `93667019-bd28-49b5-a688-acc9bb1e0a19`. DB writes are classifier-gated. |

Resolve worktrees **by name, not slot number** — slot-6 toolkit metadata has previously pointed at a
stale `wt6-vacilando-os-product-def` (a different initiative that shares slot 6's lineage).

```bash
alloy-worker-status
alloy-dev-status
alloy-worker-doctor 6
```

### Running things

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt6-create-lead-validation/web && npm run typecheck
```

Tests need the **arm64 nvm node** — Homebrew x64 node fails on arm64-only bindings:

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt6-create-lead-validation/web && NODE=~/.nvm/versions/node/v22.21.1/bin/node; PATH="$(dirname $NODE):$PATH" npx vitest run <path>
```

Live DB reads:

```bash
cd /Users/Kelly/Alloy && RAW="$(grep -E '^DATABASE_URL=' web/.env.local|cut -d= -f2-|sed -E 's/^"//;s/"$//')"; SESSION_URL="${RAW%%\?*}"; psql "${SESSION_URL/:6543/:5432}"
```

---

## 2. What shipped (8 commits, oldest first)

| SHA | What |
|---|---|
| `d822c5d50` | BOS parsing: email/phone on contact-only turns; stop gender/location name mis-parse; bare program phrase |
| `7554c8f46` | BOS parsing: child gender (girl→female) across DOB formats |
| `0a00fa51f` | **Unblocked Create Lead.** Department was dropped in the command runtime adapter |
| `da4ea7e30` | **Stopped silent household data loss.** Non-primary parents/children were discarded; unblocked slash `/create lead` |
| `2169e53c9` | One review screen, one confirm (was plan → approve → execute) |
| `8934b21db` | Queue row shows the record's real stage; What's Next stops claiming captured data is missing; activity labels + post-send refresh |
| `6425ffed6` | Stage editor stops discarding invisible completion-policy config |
| `b194b7757` | Unblocked the work-item action picker; honor the seeded closed-status flag |

### Root causes worth remembering

- **"Create Lead is not configured for this process/location"** was never tenant config. The
  registered-action execution adapter built its context from `CommandInvocationRequest`, which
  carries no department, so a correct department arrived as `null`. Do not re-diagnose this as a
  configuration problem.
- **Household data loss** came from `filterPayloadToEffectiveIntake` gating *every* payload key on
  the intake spec's FIELD key set. `household_commit_v1` / `processing_intake_household_v1` are
  structural envelopes, never spec fields, so both were stripped and the server fell back to a flat
  reader that emits exactly one `parent:primary` and one `child:primary`.
- **Stage pill** — a Work View scopes a **list** of stages, so the lane label is not a stage. The
  frozen contract says `row_stage` IS the lane label; the fix belongs at the binding. `row_stage`
  keeps its meaning (grouped rows depend on it).
- **"Still needed" lying** — unknown was treated as empty. `inquiry_children` is `undefined` when a
  surface never carried children and `[]` when there genuinely are none; `?? []` collapsed both.

---

## 3. Outstanding — resolved this session

1. **Command-result sufficiency** — implemented effective resolution (explicit → platform
   default for canonical templates → none). No Firefly-only DB write.
2. **`close_record` semantics** — classifier narrowed to terminal/closed status for the
   correct domain; unclearable blocking error downgraded to actionable warning.
3. **Tour action lifecycle** — shipped in `af794bbcf`.
---

## 4. Background on each

### Decision 1 — Sending a message does not complete "Contact Family"

**What the operator sees.** They send an SMS from the lead's What's Next card. The message sends.
Nothing advances. The step still reads as outstanding.

**Why.** `completion_policy` has two independent halves:

- *Attempt cadence* — `min_attempts` / `max_attempts` / `window_days` / `repeat_*`. Operator-editable
  in the work-item editor. **Firefly has this configured correctly** (3 attempts, 7-day window,
  repeat every 2 days) — verified in the live DB.
- *`sufficient_command_results`* — the mapping that says a `communications_send` with result `sent`
  satisfies the step with outcome `left_message`. **This is what makes a send count.**

`sufficient_command_results` appears in **zero UI components**. It exists in the type
(`lib/lifecycle/stageOperatingPlanV1.ts`), the normalizer, the in-code enrollment default
(`lib/lifecycle/defaultEnrollmentStageOperatingPlans.ts` — which *has* the correct mapping), and the
runtime that reads it — but nothing an operator touches can write it.

The association path (`lib/lifecycle/associateOutboundCommunicationToContactAttempt.ts`) uses
`resolveStageOperatingPlanForStage`, which returns `null` unless an **explicit** plan is published.
`tests/lifecycle/contactFamilyExecution.test.ts` asserts *"an UNCONFIGURED successful send does not
complete Current Work"* — a deliberate, tested policy.

**The bind.** Because no tenant can configure sufficiency through the product, "unconfigured derives
nothing" means a sent message **never** completes work for **anyone**. The feature is unreachable
rather than merely unconfigured. There is also a real asymmetry: the work item the operator sees is
projected from the **effective** plan (defaults included), while the send path requires an
**explicit** one — so a stage can show a step the default spawned that a send structurally cannot
satisfy.

**Options.**
- **(a)** Add a sufficiency control to the work-item editor. Preserves opt-in doctrine; more UI.
- **(b)** Switch the association path to `resolveEffectiveStageOperatingPlan` so defaults apply.
  One-line change, but **contradicts the four tests above** — they must be revisited deliberately,
  not deleted. *(Attempted this session and reverted for exactly that reason.)*
- **(c)** Publish `completion_policy.sufficient_command_results` onto Firefly's lead-stage
  `contact_family` template as a live config write. Narrowest, unblocks validation immediately, but
  is per-tenant and needs Kelly's go-ahead (classifier-gated DB write).

Interim mitigation already shipped: the composer now tells the operator when nothing advanced and
why, instead of failing silently.

---

### Decision 2 — "No configured closed statuses are available for this entity."

**What the operator sees.** A blocking **error** in the stage operating-plan editor, on stages they
never configured, with no control anywhere in the product that can clear it.

**The chain.**
1. `detectAutomationKind` (`lib/lifecycle/stageOutcomeAutomation.ts:100-116`) classifies **any** rule
   containing `update_family_case_status` (without `move_to_stage`) as `kind: "close_record"` —
   including a rule that merely sets status to `open`.
2. `validateStageOperatingPlanOperatingContract.ts:145-160` then demands a **closed** status for that
   rule and raises `outcome_close_status_missing` at `severity: "error"`.
3. The status list it validates against is fed from a **stage-scoped** picker
   (`loadQueueMembershipStatusOptions.ts`), which drops `metadata` entirely and filters to statuses
   whose `metadata.process_stage_key` matches the open stage.

**Verified against live data:** Firefly's 15 `opportunities` statuses carry **no** `terminal`,
`is_closed`, `status_category`, or `process_stage_key` metadata at all. So the picker resolves empty
for every stage. (An earlier analysis claimed the seeds write `terminal: true` for this tenant —
**that is wrong for Firefly**; the migrations write it, but this org's rows do not have it. Do not
build on that claim without re-checking the live DB.)

**Already fixed this session:** closed-status detection read `metadata.is_terminal`, a key spelled
nowhere in the database layer — the migrations write `metadata.terminal`. Both are now accepted
(`lib/lifecycle/resolveOutcomeStatusOptions.ts`). This is correct but does **not** clear Firefly's
message on its own.

**The fork.** Either the classifier is too broad (a status-set is not a close) or the validator is
too strict (a `close_record` need not require a *closing* status). Both are defensible; both ripple.
Independent of the fork: **a blocking error for an unclearable condition is wrong** — consider
downgrading severity at `validateStageOperatingPlanOperatingContract.ts:154-160`, and rewording the
message in operator language (it currently says "entity" and names no stage, status, or next step).

Related loose thread: the issue's `controlId` (`stage-outcome-automation-<key>-status`) matches
nothing rendered, so even a correct error points at a control that does not exist.

---

### Decision 3 — Tour actions should change once a tour exists

**Requested behavior (Kelly).** When a tour is scheduled and `schedule_tour` was configured, the
button should become **Reschedule / Cancel tour**; clicking presents the options and the selection
completes the work.

**This is smaller than it sounds — the pieces exist.**
- `schedule_tour`, `reschedule_tour` (supports preview) and `cancel_tour` (`strong_confirm`,
  `destructiveKind: "cancel"`) are all registered in `lib/platform/commands/capabilityRegistry.ts`
  with `implementationStatus: "production"` and real adapters.
- `active_tour_bookings` is already on the focus-panel display VM
  (`lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards.ts`).

So this is **presentation** — swap the primary action on tour state, then route to two existing
capabilities — not new plumbing. Blocked only on Kelly saying go.

---

## 5. Also outstanding (not decisions — just not done)

- **Gender storage.** Extraction captures `girl → female`, but it stops at the parse layer. Gender is
  a CHILD custom field (`field_key="gender"`, option set `person_gender`, stored in `field_values`
  keyed by `customer_members.id`). Wire: candidate → `child_gender` → `createLeadChildOcmPersistence.ts`.
  No `gender` column exists. Note `evaluateCompletionRequirements.ts` now carries `gender` through.
- **Browser re-validation of the household fix.** `da4ea7e30` is committed and unit-tested but has
  **not** been re-run through the UI with a two-parent / two-child paste.
- **Configured actions data.** The action-picker code fix (`b194b7757`) lets configured actions reach
  the picker, but Firefly still has **no** configured actions. They are authored in
  Organization → Processes → Actions, which writes the `lifecycle_builder_configured` placements.

---

## 6. Working agreements that saved real time

- **Verify "pre-existing" claims against a HEAD worktree — do not eyeball them.** This session an
  assumed-pre-existing failure turned out to be caused by the change under test. The cheap check:
  ```bash
  git worktree add /tmp/hc HEAD --detach && ln -s <repo>/web/node_modules /tmp/hc/web/node_modules
  ```
  Run the suite there, diff the `FAIL` lists, then `git worktree remove --force /tmp/hc`.
- **NEVER `git stash` in this worktree** — it is global across all worktrees and has caused
  cross-worktree contamination. Commit instead.
- **`npm run typecheck`** (uses `tsconfig.build.json`, prod-only). A bare `tsc -p tsconfig.json`
  OOMs at default heap and reports ~21 pre-existing errors in `tests/adminV2/runtime/*`.
- **grep/rg output masks code tokens as the letter "n"** in this environment — locate with grep, then
  **Read the file** to see real code.
- These suites carry **~102 pre-existing failures** unrelated to this work. Always diff against a
  baseline rather than reading a raw failure count.

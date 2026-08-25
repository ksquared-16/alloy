# Operational Cards — Production Implementation Ledger

**Lane:** slot 6 · `agent/claude/6-surfaces-faacca` · Phase 0 complete 2026-08-25
**Base:** merged `origin/staging` (79 commits) at `44326275b5c4`. No conflicts.

This is the single canonical implementation ledger for the program. It supersedes the readiness
tables in `operational-card-convergence-plan.md` §9.6–§9.7 wherever the two disagree, because those
were written against a base 79 commits stale.

---

## 1. What Phase 0 changed about the plan

Five claims carried into the design phase did not survive re-verification against current staging.
They are corrected here because each one changes the implementation.

| Claim as designed | Reality on current staging | Consequence |
|---|---|---|
| `resolveGlMapping` resolves a charge's GL account | **No such function exists.** GL resolves through `commercial_revenue_categories → mapped_gl_account_id → gl_accounts` (`lib/financials/gl/glCodeOptions.ts`, `glConfigService.ts`). `CHARGE_CATEGORY_GL_MAPPING_KEY` is a **presentation convention** declared in code, explicitly "so Accounting can show the resolved chain **before Posting ships**" | GL code is canonical but reachable only for categories with a mapped revenue category. The card must render an explicit unmapped state, not assume the chain |
| `charges` needs a new subject column (F7) | Confirmed: `charges` has `job_id`, `schedule_id`, `subscription_id` — **no subject**. But `charge_category` **already exists** and is canonical (P3.1, `20260630120000`) with the exact ten-value vocabulary the design assumed | F7 stands. The category grammar does **not** need building — it is already there |
| `charge_type` carries the financial taxonomy | `charge_type` is **frozen** at `service\|fee\|adjustment` for job compatibility. `charge_category` is the forward-looking dimension | The read model must read `charge_category`, never `charge_type` |
| `child_identity` was an invention; `children` is the canonical child card | `child_identity` **is registered** in `FOCUS_PANEL_CARD_KEYS` with a documented grain contract, as the first child-grain card | Prior note retired. Not load-bearing for this program |
| Activity rows key on `${label}-${when}` (the lab's key) | Staging merged `currentWorkActivityRowKey.ts` — **"THE ONE OWNER OF AN ACTIVITY ROW'S RENDER IDENTITY"**, created precisely because the formatted-timestamp key collided (18 duplicate-key warnings in one journey) | The Process card's activity menu **must** consume that owner. The lab code currently reproduces the exact defect it fixes |

---

## 2. Card key registry — none of the eight exist

`FOCUS_PANEL_CARD_KEYS` (`lib/adminV2/runtime/focusPanel/focusPanelCardModel.ts:100`) holds 25 keys.
**Not one** of `business_process`, `financials`, `health_safety`, `attendance`, `staff`, `care_team`,
`safety_signals` is among them. Every card in this program requires registration through:

```
FOCUS_PANEL_CARD_KEYS  →  focusPanelCardCatalog  →  card provider  →  Surface composition  →  V5 grid
```

Adjacent keys that already own overlapping questions — these are convergence targets, not free space:

| Existing key | Owns | Overlap |
|---|---|---|
| `current_work` | What's Next / Current Work | **The Process card's layer 3.** See §3 |
| `workflow_steps` | "lifecycle workflow steps rail" | **The Process card's layer 2** |
| `current_mission` | current lifecycle mission label | Process identity |
| `timeline` | event timeline (read-only append-only) | Process activity menu |
| `billing_preview` | "billing configuration preview (deferred; read-only until assignment route exists)" | Financials compact |
| `employment` | employment held by the case's linked contacts | Staff card |
| `health` | "case health signal" — **enrollment health, not medical** | Nothing. Name collision only |

---

## 3. BLOCKING DECISION — where the Process card lands

`focusPanelCardCatalog.ts` carries an explicit invariant:

> Card identity: runtime storage key stays canonical (`current_work`). Operator-facing
> builder/runtime label is **What's Next**. Legacy labels/keys normalize to that one identity —
> **never duplicate Current Work + What's Next in catalog.**

The locked design is "one combined Process card **replacing** separate Journey + What's Next". So
registering a new `business_process` key beside a live `current_work` would create exactly the
duplication this file forbids. Three options:

| | Approach | Cost | Risk |
|---|---|---|---|
| **A** | Extend `current_work` in place; add the rail and participant projection to the existing key | No new key, no catalog duplication, inherits every existing placement | `current_work` is placed on live Surfaces today — every tenant's What's Next changes shape at once |
| **B** | New `business_process` key; `current_work` becomes a catalog alias that normalizes to it | Follows the file's own alias precedent (`whats_next`, `current-work` already normalize) | Requires a migration of persisted Surface configs, and both must never render together |
| **C** | New `business_process` key; `current_work` retained as a distinct card | Cheapest to build | **Violates the stated invariant.** Rejected |

**Recommendation: B.** It is the only option that both honours the "one identity" rule and lets the
combined card ship without silently reshaping every existing What's Next placement on first deploy.
The alias mechanism it needs already exists and is already used for three legacy keys.

**This decision is Director-owned** — it changes what every tenant's configured Surface renders. No
key is registered until it is made.

---

## 4. Backend owner verification — current repository reality

### EXISTS_CANONICALLY — wire now

| Fact | Owner | Verified |
|---|---|---|
| Case current stage | `workspace.lifecycle_rail.current_stage_key` → `buildOpportunityWorkspaceLifecycleRail.ts` | ✅ |
| Activity rows + render identity | `currentWorkActivityRowKey.ts`, `buildCurrentWorkActivityPreviewItems.ts` | ✅ |
| Activity mode switch | `coordination.openFocusPanelMode("activity")` — `CurrentWorkCard.tsx:177`, modes `["summary","work","activity"]` | ✅ |
| Child attendance read truth | `buildChildAttendanceReadModel` + `attendanceEvents`, `attendanceFold`, `expectedVsActual`, `attendanceServiceDate` | ✅ |
| Staff employment / presence / assignment | `employments`, `staffPresenceService.ts`, `schedule_assignments` | ✅ |
| Charge taxonomy + operator labels | `CHARGE_CATEGORIES` (`billableSource.ts`), `chargeCategoryLabel()` | ✅ |
| Charge templates | `financial_charge_templates` — category, trigger, occurs-on/billable-on, default GL, responsibility, effective-dated | ✅ |
| GL accounts + mappings | `gl_accounts`, `gl_account_mappings`, `glConfigService.ts` | ✅ (partial reach — §1) |

### MISSING_CANONICAL_OWNER — build the smallest foundation first

| # | Gap | Evidence |
|---|---|---|
| **B1** | No health-fact entity. `person_health_facts` appears in **zero** migrations and zero lib files | Health & Safety cannot read canonical truth |
| **F7** | No charge subject attribution | `charges` has no subject column; child-specific charges are unattributable |
| **F0** | No billing-period resolver | No canonical answer to "what happened financially this period" |
| **Care Team** | No `presence × scheduling × child-context` resolver **of any kind** — zero matches for `careTeam`/`assignedStaff` | Card cannot answer why a person is relevant to this child |

### MISSING_REGISTERED_ACTION — register the command first

`REGISTERED_ACTION_CAPABILITY_KEYS` holds **21** keys. None are financial, none are child-attendance:

```
update_status · create_lead · confirm_tour · send_tour_invitation · schedule.create
assignment.{create,change_room,set_primary,archive,promote_proposed,delete_proposed}
staff.add · child.add · enrollment.{start,direct} · employment.{update,end}
staff_presence.{record,correct}
```

| Needed | Status |
|---|---|
| `charge.add` (**F5**) | **Absent.** Templates configure charges but "post nothing, write no ledger/GL/invoice/payment" |
| Pay now / record payment / manage payment | **Absent** |
| Child attendance: check in, check out, record movement, correct, mark absent | **Absent.** Note `staff_presence.record/correct` exist — that is *staff* presence, a different subject |

### FUTURE / BLOCKED

**P1** (stage history) — off the critical path by §11.4. **S2** (health visibility enforcement) —
gates Safety Signals absolutely. **F3/F6** (responsibility split, payer attribution) — no production
split percentage may render until these land.

---

## 5. Implementation ledger

| Capability | UI | Read truth | Actions | Config | Permissions | Browser proof | Production-ready |
|---|---|---|---|---|---|---|---|
| Process | ✅ designed | ✅ stage + activity | ⚠ existing case actions; participant subject scoping unbuilt | ⛔ **key not registered — §3 decision** | ✅ inherits | ⛔ | **No — blocked on §3** |
| Staff | ✅ designed | ✅ employment/presence/assignment | n/a (informational) | ⛔ key not registered | ✅ inherits | ⛔ | **Nearest to ready** |
| Care Team | ✅ designed | ⛔ **no resolver exists** | n/a | ⛔ | ⛔ | ⛔ | No — hold registration |
| Attendance | ✅ designed | ✅ `ChildAttendanceReadModel` | ⛔ **no child-attendance commands** | ⛔ | ⛔ | ⛔ | Read-only only; controls must be gated |
| Financials compact | ✅ designed | ⛔ F0 | ⛔ | ⛔ | ⛔ | ⛔ | No |
| Financials summary | ✅ designed | ⛔ F0 | ⛔ F5 | ⛔ | ⛔ | ⛔ | No |
| Financials expanded | ✅ designed | ⛔ F0 + F7 | ⛔ F5 | ⛔ | ⛔ | ⛔ | No |
| Health & Safety | ✅ designed | ⛔ **B1 — entity absent** | ⛔ | ⛔ | ⛔ S2 | ⛔ | No |
| Safety Signals | ✅ designed | ⛔ B1 | n/a | ⛔ | ⛔ **S2 absolute gate** | ⛔ | No |

---

## 6. Revised sequencing

The design phase recommended Attendance + Staff first because both had "complete canonical read
truth and no mutation dependency". Phase 0 splits that pair:

- **Attendance's approved card exposes operational commands** (check-in, movement, checkout,
  correction). Slice 5's definition of done forbids calling read-only Attendance complete. It is
  therefore *not* the cheapest first slice — it carries five unregistered commands.
- **Staff is genuinely informational** and its truth is fully present. It is the honest Slice 1
  vertical: it proves the entire registration path — key → catalog → provider → Surface → V5 grid —
  against a card that needs no new backend work at all.

```
1. Staff                 — registration path proof, no backend dependency
2. Process               — after the §3 decision; stage + participants + activity menu
3. Attendance read-only  — with mutation controls feature-gated, then the five commands
4. Financials            — F0 → F7 → read model → F5
5. Health                — B1 foundation, after the cross-sprint ownership contract
6. Safety Signals        — after S2, never before
7. Care Team             — whenever its resolver becomes trustworthy
```

---

## 7. Toolkit finding

`vac run typecheck` aborts at **rc=134** (OOM) on this tree: the broker invokes
`--max-old-space-size=4096` while `web/package.json` declares `8192` for the same script. The broker
overrides the declared heap **downward**. `vac run typecheck:tests` runs the same compiler at 8192
over `tsconfig.json` — a **superset** of `tsconfig.build.json`, tests included — and returns rc=0.
The merge is type-clean; the failure is toolkit configuration, not code.

---

## 8. Slice 1 — shell polish browser certification

Certified through the real operator runtime on 2026-08-25:
`/workspace` → `/workspace/work-unit/waitlist` → queue row → Focus Panel. 17 real queue rows,
0 page errors, 0 failed requests.

| Item | Result |
|---|---|
| **Reduced mode-control → card-grid gap** | ✅ **CERTIFIED.** Computed `padding-top: 10px` on the live `.alloy-os-focus-panel-grid--composed --published`, down from 16px. Measured in the real runtime, not the lab |
| **Scoped subject / person avatar** | ⛔ **NOT CERTIFIABLE — no production caller** |

The published Surface composed five cards: `current_work`, `scheduling`, `household`, `children`,
`billing_preview`. Focus Panel readiness 6.65s on a **dev** build — dev compilation dominates that
figure (R2 disproved an 11.7s true-cold number on exactly this basis), so it is not a production
performance datum and no conclusion is drawn from it.

### The avatar finding

`FocusPanelSubjectIdentityBlock` accepts `personSubjectName` / `personSubjectImageUrl` /
`personSubjectRecordId`, and **nothing in production passes them.** The only real call site
(`FocusPanelCompactHeader.tsx:61`) supplies `subjectTitle`, `contextChips`, `identitySummaryLine`
and nothing else. The treatment renders the household tile in every reachable state.

This is a capability that exists in code and cannot be reached — the precise thing this program
forbids shipping. It was not wrong to build, but it was filed under the wrong slice: a *person*
subject only arises from the **scoped participant** on the Process card, and the Focus Panel is
case-grain by shipped conformance test. **The avatar treatment moves to Slice 2** and is certified
with the Process card's scoped participant, or not at all. No speculative caller was wired to make
it appear reachable.

---

## 9. Card identity resolved — `current_work → business_process` (2026-08-25)

Director approved the recommendation. Implemented through the **existing** alias mechanism; no
one-off migration path was created.

### The mechanism, and why ordering is the mechanism

`normalizeFocusPanelCardKey` checked the exact key union *first*. `current_work` is still a member
of that union — it must be, because the Current Work **concept** survives as a data owner — so an
exact-match-first lookup would return it unchanged and the alias would never be reached.

A `SUPERSEDED_FOCUS_PANEL_CARD_KEYS` table is therefore consulted **before** the union branch. The
key is not deleted; the **card** is superseded, not the concept.

### The seam this uncovered

A published layout is a **second record of the same composition**, stored in doc metadata and
returned verbatim by `readFocusPanelPublishedLayout`. The section path normalized; this one did not.
A tenant whose layout was published naming a superseded key would have resolved it on one path and
not the other — two readers of one document disagreeing about which card is placed. Normalization
now happens at that read, so both records agree.

This is the same failure shape as the activity-row key: several readers deriving one identity
independently, and only some of them correct.

### Proofs — `tests/adminV2/runtime/businessProcessCardIdentity.test.ts` (8 passing)

| # | Requirement | Result |
|---|---|---|
| 1 | Existing `current_work` configuration resolves to `business_process` | ✅ — with every legacy spelling and both operator labels |
| 2 | Explicit `business_process` resolves once, to itself | ✅ |
| 3 | Both forms together deduplicate to one card | ✅ — in either order, and with three spellings at once |
| 3b | Dedupe keeps the card at its existing placement | ✅ — `[household, current_work, children]` → `[household, business_process, children]` |
| 4 | Current Work truth remains available | ✅ — key retained in the union, still titled, still a data owner |
| 5 | Never render both | ✅ — the catalog offers the identity exactly once, and no configuration can yield both keys |

Plus two beyond the required set: supersession outranks exact match (the mechanism itself), and a
superseded key always names a **registered** successor (no disappearance).

### No card disappears

`business_process` publishes the **same model** the predecessor did
(`deriveOpportunityFocusPanelCards`), and the renderer accepts both keys. Composition can only ever
select the successor, so exactly one renders — carrying identical truth and content until Slice 2
deepens the presentation. A successor with no model would have emptied the card out of every tenant
that had configured it.

Existing suites updated to the approved contract rather than the code reverted: the What's Next
identity suite now asserts the successor, and the work-owning set legitimately grows by one, because
the successor renders the same work-completion presentation.

---

## 10. Slice 1 (Staff) — the specified approach would create a duplicate owner

Two findings, both from the repository and the running product rather than from reasoning.

### A durable Person panel already has exactly one card, and it is Employment

`derivePersonFocusPanelCards` is explicit:

> a durable Person V1 has exactly one card with canonical Person truth: Employment
> … **SPARSE IS THE CORRECT ANSWER**

`employment` is already declared for `["opportunity", "person"]`, and it already consumes
`PersonEmploymentComposition` — `is_staff`, current period, `state_label`, `position_label`,
`employment_type_label`, `primary_location_label`, `external_employee_id`, start/end dates, tenant
`configured_facts`, full period history. That is most of the approved Staff card's content.

`scheduling` is declared for `["opportunity", "child", "person"]`, and
`composeDurableStaffScheduling` already composes a **staff subject's** assignments, rooms, patterns
and effective dating — firing the **same registered assignment actions**, deliberately not a fork:

> `Operations → Roster → Staff → Jane → Schedule` renders the platform's canonical `scheduling`
> card. Not a staff copy of it: the SAME card, reading the SAME `_scheduling_projection` bag.

So the approved Staff card's facts are already delivered on the real person surface by **two
existing canonical cards**. Registering a third `staff` key that re-shows employment plus assignment
would duplicate both — the outcome the Definition of Done forbids ("no duplicate owner/store was
created").

**Recommended:** treat Staff the way the Director just treated Process. Either deepen `employment`
at person grain, or register `staff` as the canonical successor that supersedes `employment` **at
person grain only** (leaving the case-grain Employment reference chip untouched, since "does anyone
on this family work here?" is a genuinely different question). The mechanism now exists and is
tested. This is a Director decision because it changes what the person surface renders.

### The certification tenant has zero staff

`Operations → Staff` on Firefly Early Learning reports **All Staff 0 · Starting Soon 0 · Inactive 0
· "No staff yet"**. Every required Staff certification case — avatar image, initials fallback,
active employment, ended employment, assignment present/absent, cross-subject leakage, row-to-row
navigation — needs staff records that do not exist.

Creating them means writing to the **shared** local stack through `staff.add`. That is additive and
uses the real registered capability, but this program has already been bitten once by shared-fixture
mutation (a partially-applied fixture silently cost two children their Schedule contexts). Seeding
is the right move; it is recorded here as a deliberate act rather than performed silently mid-run.

---

## 11. Ledger — corrected

| Capability | UI | Read truth | Actions | Config | Permissions | Browser proof | Production-ready |
|---|---|---|---|---|---|---|---|
| **Business Process** | locked | partial — stage + activity by owner | existing Current Work actions | **key registered + legacy normalized** | existing | pending | pending |
| Staff | locked | ready (`PersonEmploymentComposition`) | n/a — informational | **blocked on duplicate-owner decision** | existing | **blocked — zero staff in tenant** | pending |
| Care Team | locked | **resolver missing** | n/a | pending | existing | pending | **NO** |
| Attendance | locked | ready/partial | **missing child commands** | pending | existing | pending | **NO** |
| Financials compact | locked | partial (F0) | missing | pending | existing | pending | **NO** |
| Financials summary | locked | partial (F0) | missing (F5) | pending | existing | pending | **NO** |
| Financials expanded | locked | partial (F0 + F7) | missing (F5) | pending | existing | pending | **NO** |
| Health & Safety | locked | foundation missing (B1) | future | pending | health policy pending | pending | **NO** |
| Safety Signals | locked | health dependent | n/a | pending | **S2 missing** | pending | **NO** |

### Attendance command slice — plan before any enabled control

| Command | Subject | Canonical effect | Status |
|---|---|---|---|
| `child_attendance.check_in` | child | attendance event → fold → read model | **absent** |
| `child_attendance.check_out` | child | attendance event | **absent** |
| `child_attendance.record_movement` | child | `room_transfer` event | **absent** |
| `child_attendance.correct` | child | correction/reversal lineage entry | **absent** |
| `child_attendance.mark_absent` | child | absence with reason | **absent** |

`staff_presence.record` / `staff_presence.correct` exist and are the shape to follow — a different
subject, not a substitute. Until these land, Attendance may register **read-only**; its mutation
controls must not render.

---

## 12. Tooling debt — Vacilando typecheck broker

| | |
|---|---|
| Symptom | `vac run typecheck` aborts **rc=134** (OOM) |
| Cause | The broker invokes `--max-old-space-size=4096`; `web/package.json` declares `8192` for the same script. The broker overrides the declared heap **downward** |
| Not | An Alloy type failure |
| Workaround | `vac run typecheck:tests` runs the same compiler at 8192 over `tsconfig.json` — a **superset** of `tsconfig.build.json` — and returns rc=0 |
| Second defect | On genuine type errors the broker reports `class=config` and prints *"FAILED TO START … the command never ran"* — while the compiler plainly ran and emitted `error TS2741`. The message contradicts its own output and would send an agent looking for a config fault instead of the type error |

Do not weaken Alloy's typecheck heap to accommodate the broker.

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

### Browser certification of the identity change

Real runtime, same route as §8. The published composition before and after:

```
before   current_work · scheduling · household · children · billing_preview
after    business_process · scheduling · household · children · billing_preview
```

Same first position, same siblings, same order, five cards both times. No duplicate, no
disappearance, 0 page errors. Panel readiness 6.58s vs 6.65s — unchanged (dev build; not a
production figure).

### Regression attribution

The identity change was measured against a baseline rather than assumed. Running four affected
suites with the change removed and re-applied:

| | Failing | Passing |
|---|---|---|
| Baseline (change removed) | **11** | 109 |
| With the change | **11** | 117 |

**Zero new failures.** All 11 are pre-existing on the merged staging base and unrelated to card
identity. The change caused exactly one break — a hardcoded `FOCUS_PANEL_CARD_KEYS.length === 25` —
now 26, because the predecessor key is *retained* rather than swapped. The first read of the run had
looked like ~25 new failures; only the failing-test **list** distinguished mine from the base's.

---

## 13. Slice 1 — Staff, grain-scoped successor (2026-08-25)

Director approved: do not register a third sibling card. `employment → staff`, **person grain only**.

### The mechanism

Supersession became a declared **concern** (`focusPanelCardSupersession.ts`) beside `grains` and
lifecycle, read by one composer — not a flat table and not a conditional in a renderer. Scope lives
in the declaration:

| Predecessor | Successor | Scope |
|---|---|---|
| `current_work` | `business_process` | every grain |
| `employment` | `staff` | `person` only |

The composer is deliberately asymmetric: asked **without** a grain it answers only about global
supersession. A caller that cannot state its grain must not receive a person-grain answer, because
applying a person rule to a case placement is the exact defect the scope exists to prevent.

`employment` also stops declaring the person grain, so the registry — the single placement authority
at person grain — makes exactly one of the two compose.

### Proofs — `tests/adminV2/runtime/staffGrainScopedSupersession.test.ts` (9 passing)

person-grain `employment` → `staff` · case-grain `employment` unchanged · grainless caller gets the
case answer · explicit `staff` resolves once · both forms dedupe to one card · ordering and placement
preserved on both grains · `scheduling` untouched and still separately placed · grain declarations
make exactly one card compose · the global supersession still applies everywhere.

### What Staff is, and is not

Staff reuses the Employment **presentation** and the same `PersonEmploymentComposition`. It is not a
re-implementation: that presentation already answers "who is this employee, in what capacity, where,
in what state" in the order an operator reads it. Rebuilding those sections under a new name would
have created a second presentation of one owner's truth. Identity and placement changed; the facts
and the component are shared.

`scheduling` stays separate and answers "when and where are they scheduled".

### A second reader, found again

`DurableRecordContextualCard` called `derivePersonEmploymentCard` **directly**, bypassing the
composition path. After the grain change its gate asked about `employment`+`person` — now false — so
the card silently vanished on that surface while rendering correctly on the native panel. Same shape
as the published-layout seam and the activity-row key: several readers deriving one identity
independently, and only some of them correct. It now asks about `staff`.

### Certification fixture

`web/scripts/seedStaffCertificationFixture.ts` (`npm run dev:seed:staff-certification`). Additive,
namespaced to the RFC-2606 reserved domain `staff-cert.alloy.invalid`, idempotent (skips on existing
email), and removable via `--remove`, which matches on that namespace alone — never on a name, never
on "created recently". It writes only through `addStaff`, the canonical path behind the registered
`staff.add` capability.

**It could not run in this lane**: privileged Supabase values never enter the worktree by design, so
the script has no credentials. The four specimens were therefore created through the **product UI**,
executing the same registered capability against the same namespaced emails, so `--remove` still
cleans them. The script remains the durable artifact and needs a privileged environment to run.

| Specimen | Person id | Proves |
|---|---|---|
| Active-Bare | `51d1b1fd…` | active, part time, **no** position or location |
| Active-Located | `98b6c801…` | active, full time, primary location |
| Ended | `271a35cd…` | intended `ended` — **not achieved**, see below |
| Starting-Soon | `66ca494c…` | canonical `pending_start` and its "Starts …" label |

### Browser certification — `/adminV2/workspace/record/person/<id>`

| Check | Result |
|---|---|
| Staff card renders on real canonical records | ✅ `cards: ["staff"]` on all four |
| Exactly one card — no duplicate presentation | ✅ `employment` never appears beside it |
| Case-grain composition unchanged | ✅ `business_process · scheduling · household · children · billing_preview` |
| Scheduling separate | ✅ untouched on both grains |
| Active state | ✅ "Active · Staff at North Campus · Full time" |
| Starting-soon state | ✅ "**Starts Sep 15, 2026** · Staff at South Campus · Full time" |
| Optional facts absent, not faked | ✅ Active-Bare shows no location and no placeholder |
| Position absent → no invention | ✅ tenant configures **zero** `employment_positions`; the card says "Staff", never a fabricated title |
| Row-to-row stale leakage | ✅ 4 distinct card bodies for 4 records |
| Page errors / failed requests | ✅ 0 / 0 |
| Readiness | 7.5–8.0 s per record (**dev** build — not a production figure) |

### Not certified, and why

- **Ended employment.** The Add Staff flow has no end-date field, so that specimen is Active. Reaching
  `ended` needs the registered `employment.end` capability, which is a separate execution.
- **Avatar image / initials fallback ON THE CARD.** The Employment presentation renders **no avatar**
  at all, so there is nothing to certify there yet. Initials do render in the Operations Staff list
  (`CA` / `CE` / `CS`), which is a different surface. The person's identity belongs in the shell
  header, and `FocusPanelSubjectIdentityBlock` already accepts `personSubjectName`/`ImageUrl` with
  **no caller** — a durable person panel is a more natural caller than Process participant scope, and
  it is reachable today. Recommend wiring it here rather than in Slice 2.

### Environment defect repaired

Restarting the dev server surfaced `Cannot find module '../lightningcss.darwin-arm64.node'`. Root
cause: this shell resolves `/usr/local/bin/node` (**x64**, under Rosetta) while every nvm node — and
the node the toolkit starts the server with — is **arm64**. `npm install` run from this shell resolves
optional native dependencies for the wrong architecture. Repaired by installing
`lightningcss-darwin-arm64@1.30.2` with an **arm64** npm and clearing `.next`. 0 page errors after.

**Anyone running npm in an Alloy worktree from a Rosetta shell will corrupt native optional deps.**
Use `~/.nvm/versions/node/v22.21.1/bin/npm`.

---

## 14. Slice 2 — avatar caller closed, stage authority guarded, provider scoped (2026-08-25)

### §13 Person-panel avatar — DONE and certified

The shell's `personSubject`/avatar capability had no caller because it was built on the **case**
header, which must keep household identity. The real caller is the durable **person** panel, where
the person genuinely is the subject.

Two gaps closed to reach it:

| Gap | Fix |
|---|---|
| `DurablePersonSubject` carried no photo | Composer resolves one via `resolveIdentityPhotoUrlFromRaw` — the canonical owner, which distinguishes an actor-authorized URL from one merely found in storage |
| The `full` presentation rendered a context strip with **no subject identity at all** | Identity now renders above both presentation branches, not only the minimal one |

**Certified** on the Staff records: avatar tile path renders, initials fallback correct
(`CA · Certified Active-Bare`), 0 page errors, 5.6–7.3 s.
**Not certified:** the with-image case — no certification record carries a canonical photo, so the
resolver path is wired and typed but unproven end to end. Needs a profile-photo upload.

Case panels keep household identity; a scoped participant stays inside the Process card. One
`CardAvatar` primitive throughout.

### §2 Stage authority — guarded

`tests/adminV2/runtime/processStageAuthority.test.ts` (4 passing), built on the real
`OpportunityDrawerViewModel` fixture shape rather than a stub:

- the same case opened from **Tour** and from **All** resolves the same `stageKey`;
- a differing per-lens `statusLabel` cannot reach the stage **key** (the label has a documented
  fallback; the key must not);
- when `lifecycle_rail` and `stage_context` disagree, the **rail wins**;
- the panel stays case-grain regardless of the lens.

The rule is structural, not defensive: `buildOperationalContext` holds no reference to a work unit,
lens or queue, so a lens has no seam to write through. This guard is what the rail depends on.

### §5/§6 Participant rail — the gating truth EXISTS

The rail was the open risk. It is answerable:

| Need | Canonical owner |
|---|---|
| Case stage key | `workspace.lifecycle_rail.current_stage_key` |
| **Per-child stage key** | `row.stage_key` on the participation row — read today by `buildChildrenCardEvidence` |
| Child stage label | `resolveChildProcessStageLabel({ stageKey, dispositionKey, familyStageKey })` |
| Child identity + photo | the same `CardAvatar` + `resolveIdentityPhotoUrl` path |

**The one blocker is exposure, not existence.** `ChildrenEvidenceChild` publishes `status` (a
LABEL) and keeps `statusKey` only "to drive tone + the declined attention gate" — the stage **key**
is resolved and then dropped. §6 forbids placing markers by display string, so the provider's first
job is to surface that key on the evidence type. That is a small, additive change to a canonical
owner, not a new store.

### Slice 2 — what remains, precisely

| Item | State |
|---|---|
| §13 person avatar caller | **done, certified** (image case deferred) |
| §2 stage-authority guard | **done, 4 passing** |
| §10 `currentWorkActivityRowKey` adoption | **done** (previous run) |
| §11 no `View process`, no expanded density | **holds** — never built |
| §1 `business_process` provider/VM | **not built** — needs per-child `stageKey` exposed first |
| §3/§4 rail + two-slot annotations | **not built** |
| §5/§6/§7 participant projection + key matching + scoping | **not built** |
| §8/§9 case work band + participant action | **not built** |
| §14 multi-process proof | **blocked on tenant data** — Firefly configures Enrollment only; Assignment and Billing processes are not present to prove against |
| §15 certification A–H | **not run** — needs the provider, and B/C/D/F need a case with divergent children |
| §16 performance delta | case panel **6.53 s** before this slice; unchanged (no Process provider added yet) |

The live `business_process` card still renders the transitional Current Work presentation. That is
the headline item outstanding, and it is deliberately not half-built: a provider that placed
participant markers by label would violate §6 in the first line of code.

### Regression follow-up — a default composition still named the predecessor

Running `tests/operator/*` (which the Staff slice's regression check had not covered — it swept
`tests/adminV2/runtime` only) surfaced 9 failures. Eight were assertions of the superseded contract
and were updated. **One was a real defect:** `FOCUS_PANEL_SUMMARY_PERSON_COMPOSITION` still placed
`employment` on the person surface, while `employment` no longer declares that grain — so the
default composition named a card the grain gate would then refuse. It now names `staff`.

That is the same shape as the two seams already recorded: a second place that states the same
identity, updated late. The guard that caught it — "every card a grain's default composition places
is declared for that grain" — is exactly the kind of invariant that survives a rename.

67 tests green across the six affected suites; `typecheck:tests` rc=0; person surface re-certified
after the change (avatar tile, initials fallback, 0 page errors).

---

## 15. Slice 2 COMPLETE — the production Business Process card (2026-08-25)

`business_process` renders its own presentation. The transitional Current Work rendering is gone
from that key. **Current Work remains a canonical data owner** — the evidence builder consumes it —
so this is presentation convergence, not domain deletion.

### The composition

`buildBusinessProcessCardEvidence(context)` — a pure function over the already-composed
`OperationalContext`, matching the convention of every other card evidence builder. The card fetches
nothing and adds no waterfall.

| Fact | Owner |
|---|---|
| Configured stages + order | department lifecycle → `workspace.lifecycle_rail` → `context.businessProcess.stages` |
| Case stage | `context.businessProcess.stageKey` (rail wins over `stage_context`) |
| Participants + their stages | participation rows → `buildChildrenCardEvidence` |
| Current Work | `buildCurrentWorkCardEvidence` |
| Activity | `buildCurrentWorkActivityPreviewItemsFromContext` |

### Three dropped identities, found by building on them

Each is the same shape: a second place that states an identity, missed when the identity grew.

1. **`OperationalContext` never published the stage set.** The rail existed on the VM and stopped
   there. Now carried beside the current stage key, so there is one answer to "what are this
   process's stages".
2. **Both mission overlays rebuilt `businessProcess` field by field**, blanking the newly added
   stages and making the rail vanish in the live panel. They now preserve what they do not change.
   *This one was mine* — introduced by a bulk patch and caught only by looking at the rendered card.
3. **`mapRawInquiryChildrenToDrawerRows` carried `outcome_status_key` but dropped `stage_key`.** So
   every consumer resolved a child's stage from the disposition or from the family it rides — which
   cannot express a child standing at a different stage than their household. Divergence is exactly
   what the rail exists to show.

### Participant placement — by key, never by label

`resolveChildProcessStageKey` sits beside the label resolver in the same owner module and shares its
chain, so a child known only through their disposition is placeable rather than labelled-but-lost.
`ChildrenEvidenceChild.stageKey` publishes it beside `status`.

An unplaceable participant is recorded in `unresolvedParticipants` with a reason — never dropped, so
a gap reads as a gap instead of a smaller family. A child with no stage of their own rides the
family's: the resolver's documented third source, canonical truth rather than a display fallback.

### Tests — 71 passing across 8 suites

| Suite | Proves |
|---|---|
| `participantStageKeyIdentity` (6) | key ≠ label; same chain as the label; unknown → null, never invented |
| `businessProcessParticipantRail` (6) | **the invariant**: case at Tour, Avery at Waitlist, Riley at Tour, all true at once, Waitlist still `future` · aligned quiets · unplaceable recorded |
| `businessProcessProvider` (5) | Enrollment / Assignment / Billing through one resolver from configuration; two-slot cap; no rail when unstaged |
| `processStageAuthority` (4) | Tour vs All → one `stageKey`; rail beats `stage_context`; label cannot reach the key |
| + supersession, identity, visibility, person panel | unchanged and green |

**Baseline verified:** `tests/operator` + `tests/admin/drawer` fail **15 tests / 13 files** both with
and without this run's changes — every one pre-existing, **zero introduced**.

### Browser certification — Firefly's real Enrollment

| Scenario | Result |
|---|---|
| **A** ordinary case | ✅ rail renders the real configured stages: Lead · Tour · Decision · **Waitlist (current)** · Enrolling · Enrolled |
| **B** same case from All vs Waitlist | ✅ identical stage `waitlist`, identical rail, identical Current Work, identical activity count, **no lens chip** |
| **G** activity | ✅ trigger "Recent activity 24", menu opens 25 items incl. `View all activity →`, **0 React duplicate-key warnings** |
| page errors | ✅ 0 |

### Performance — no Process waterfall

| Measure | Dev build |
|---|---|
| Process card first paint | **404 ms** |
| Rail ready | **427 ms** |
| Row-to-row Process update | **2 187 ms** |
| Activity menu open | **132 ms** |

The card composes from the already-composed context, so it adds no per-section client call. The prior
~6.5 s figure is whole-panel readiness from a cold click and is not comparable to these; it was not
made worse.

### Outstanding, precisely

| Item | Why |
|---|---|
| **Scoped participant (C/D)** | **No canonical carrier reaches a card.** Scope exists at the navigation layer (`operatorFocusSelection.operational_member_id`) but nothing places it on the panel VM or operational context. The provider already accepts the id; passing a fabricated one would emphasise a participant the runtime never selected. **Architecture gap, not a rendering gap.** |
| **Divergent children (C) in the browser** | Firefly's cases have children aligned with their case, so the rail correctly quiets. Proven by unit test instead; a browser case needs an additive fixture with a genuinely divergent child |
| **5+ participants (F) in the browser** | Same — proven by the bounded-projection unit path |
| **Action execution (H)** | Not run: no safe resettable case action on the certification data |
| **Readiness projection** | `stillNeeded` is composed but empty — the Readiness owner's still-needed list is not yet mapped |
| **Person photo image case** | Deferred by Director decision; initials fallback certified |
| **Ended employment** | Deferred to `employment.end` |

### Test coverage boundary, stated plainly

`tests/adminV2/runtime` holds **177 files** and does not complete inside this lane's per-command
budget — two attempts at the whole directory and one at a 60-file batch each exceeded 10 minutes.
Rather than claim coverage that was never run, the sweep was narrowed to the **59 files that
reference the seams this run touched** (`OperationalContext`, `businessProcess`, children evidence,
inquiry-child drawer rows, the mission overlays, the card renderer) and run in baselined batches.

| Scope | With changes | Baseline (`d86226522`) | New |
|---|---|---|---|
| Affected runtime batch (20 files) | 17 failed / 132 passed | 17 failed / 127 passed | **0** |
| Remaining failing runtime files (8) | 17 failed / 77 passed | 17 failed / 77 passed | **0** |
| `tests/operator` + `tests/admin/drawer` (69 files) | 15 failed / 451 passed | 15 failed / 451 passed | **0** |
| New + directly-affected suites (8 files) | **71 passed** | — | — |

Every failure observed is present without this run's changes. `system5CardArchetypes` was the one
worth checking closely — new card keys land in its map — and it fails identically at baseline.

**Not run to completion:** the ~118 runtime files that reference none of the touched seams. That is a
budget limit of this lane, not a claim about them.

---

## 16. Attendance vertical — audit, scope carrier, and a hard data blocker (2026-08-26)

### §5 Attendance canonical truth — the audit

Every owner exists. **No second ledger is needed, and none was built.**

| Concern | Canonical owner |
|---|---|
| Event record | `child_attendance_events` (migration `20260629120000_childcare_attendance_facts_p2`) |
| Write | `recordAttendanceEvent()` — validates shape, asserts the agreement, emits |
| Correct / reverse | `correctAttendanceEvent()` — `entry_type` `correction` \| `reversal`, **never a destructive UPDATE** |
| Read | `listAttendanceEvents()`, `attendanceFold`, `buildChildAttendanceReadModel` |
| Expected vs actual | `expectedVsActual`, `fetchExpectedVsActual`, `actualCompliance` |
| Service day | `attendanceServiceDate` (org/location-local, derived from `eventAt` + timezone) |
| Event kinds | `check_in` · `check_out` · `absence` · `present` · `room_transfer` · `schedule_override` |
| Events emitted | `attendance_event_recorded` / `_corrected` / `_reversed` → `workflow_events` |
| Actor attribution | `AttendanceActorContext` (`actorType`, `actorUserId`) |

**Room movement is already first-class** (`room_transfer`, with `fromRoomLocationId` /
`toRoomLocationId` and a shape validator). Correction doctrine is already non-destructive. The five
target capabilities would be thin registrations delegating to this module — no new business logic.

### THE BLOCKER — attendance's subject is an agreement, and this tenant has none

`RecordAttendanceEventInput.enrollmentAgreementId` is **required and non-nullable**, and
`assertAgreementAllowsAttendance` throws `not_found` without a real agreement. So:

> **Attendance's subject is not "a child". It is an enrollment agreement.**

Firefly has **17 children, every one "In process" — zero Enrolled.** Operations → Attendance reports
`CHILDREN PRESENT 0/0`, `NOT ARRIVED 0`, and "No one expected" in all seven rooms.

Consequently **no attendance event can be recorded, corrected or read for any child in this tenant**,
and none of §20's scenarios A–K or §21's action certification can execute. This is not a rendering
gap and not something a card fixture can paper over: the writer refuses at the agreement gate.

**The seeding path is known and idempotent** — `materializeChildEnrollment` creates the durable trio
(`child_enrollment_agreements` → `child_placements` → `schedule_assignments`), reached canonically by
completing an enrollment process instance. Driving it means running a real enrollment to completion
for a child on the shared demo tenant, which creates durable placements and schedule assignments.
§21 forbids destructive mutation of shared demo families without a reversible strategy, and this lane
holds no database credentials, so it cannot seed or unwind outside the product UI.

**Director decision required:** authorize enrolling a namespaced certification child (mirroring the
Staff fixture) so agreements, expected schedule and attendance events become reachable.

### §1 Participant scope carrier — delivered

`OperationalParticipantScope` on `OperationalContext`: `participationId` · `customerMemberId` ·
`personId` · `displayName` · `imageUrl` · `stageKey` · `stageLabel`. Optional, case-scoped, and it
does **not** change grain — the case remains the panel subject.

`resolveParticipantScope()` is the one place the decision is made, and its refusals are the point:

| Input | Result |
|---|---|
| Explicit id (participation **or** durable child) | `explicit` |
| A display **name** | **null** — a name is not an identity |
| Several eligible, none selected | **null, `ambiguous`** — never the first child |
| Exactly one eligible | `sole_participant` — no ambiguity to resolve, so a fact not a guess |
| Selection from a case the operator just left | **null, `not_found`** — stale scope refused, not laundered into a plausible child |

7 guards passing. **§2 done:** the Process card now reads `context.participantScope` instead of its
local placeholder, matching on either stable id and never a name. Process re-certified unregressed —
Tour vs All still identical stage, rail, work and activity count; 0 page errors; 0 duplicate-key
warnings; 28 tests green across its five suites.

**Remaining link:** navigation → panel context. `dispatchOperatorFocusSelection` already carries
`operational_member_id` beside the case (documented there as "the ROW travels beside it, so the
listener can select a participation without the panel losing the case"), and
`OperatorFocusAttentionListener` consumes it as the Work-View **row subject**. Nothing yet threads it
into the panel VM as a scope. The contract and every consumer are now in place; that one thread
remains.

### Not built, and why

The five child-attendance capabilities were **not registered**. Registering commands that cannot be
executed, previewed or certified against any subject in this tenant would produce exactly what the
instruction forbids — buttons that do not run — and the Definition of Done requires "card buttons
execute those real commands". The audit above is what makes them a thin slice once a subject exists.

---

## 17. Participant scope closed · Financials audited (2026-08-26)

### Step 0 — participant scope, navigation → context: DONE

The carrier existed at both ends and nowhere in between. **Attention's current subject is the join:**
for a child-grain lens the Work View selects a participation, and that id already rides in attention
beside the case the panel composes against — the child-mission overlay was already using it to refuse
a mission built for a child the operator had left.

`OpportunityFocusPanelBody` now hands it to the settled producer; `buildOperationalContext` resolves
the scope once, from the case's own children rows. **8 guards** cover the Director's seven cases
through the real context builder (not the resolver alone), because the thing that breaks is the
wiring: a selection that never arrives, or one that arrives and is never cleared. Process
re-certified unregressed; 36 tests green across six suites.

**Participant-scope plumbing is complete.**

### §2 Collision check — clean

`git diff` between my base and `origin/staging` (24 commits) over `web/lib/financials`,
`web/lib/childcareOperational` and `supabase/migrations` returns **zero changed files**. No other lane
has landed Financials backend work. No overlap; no coordination required.

### §1 Financials owner inventory

| Fact | Owner | Class |
|---|---|---|
| Charge row | `charges` (`20260331120000`) | READY |
| Rich taxonomy | `charge_category` — canonical 10 values (`20260630120000` P3.1) | READY |
| Legacy type | `charge_type` **frozen** at `service\|fee\|adjustment` | READY |
| Operator labels | `chargeCategoryLabel()` / `CHARGE_CATEGORY_LABEL` | READY |
| **Subject attribution** | **`billable_source_type` + `billable_source_id`** — polymorphic, `["job","enrollment_agreement"]`, "neither is privileged" | **READY (corrected — see below)** |
| Charge templates | `financial_charge_templates` — config only, posts nothing | READY |
| Childcare charge writes | `createChildcareDraftCharge` · `recalculateDraftCharge` · `postChildcareCharge` | READY |
| Payments / allocations | `payments`, `payment_allocations` (`20260329210000`) | READY |
| GL chain | `commercial_revenue_categories → mapped_gl_account_id → gl_accounts` (`glConfigService`, `glCodeOptions`) | READY |
| **Payer responsibility** | **Owned by Processing, not Financials** — the Funding chapter states it: "Who pays remains owned by Processing… Owned by Processing — not Financials config" | **OWNED_BY_OTHER** |
| Billing period | no resolver | MISSING_SEAM (F0) |
| Registered financial actions | none of the 21 keys | MISSING_SEAM (F5) |

### F7 — my Phase 0 claim was wrong, and the correction matters

Phase 0 recorded "`charges` has no subject column, F7 required". That is true of a *column* and
misleading as a conclusion. **The polymorphic subject already exists**, added by the same P3.1
migration as `charge_category`, and it is exactly the platform-shaped mechanism §5 asks for — not a
childcare-specific `child_id`.

For childcare the source is an **`enrollment_agreement`**, which belongs to exactly one child, so a
childcare charge is **already child-attributable by derivation** (`billable_source_id` →
`child_enrollment_agreements.customer_member_id`).

What is genuinely missing is narrower than F7 as designed: the vocabulary has **no household-level
source**, so "Household — family-level fee" cannot be expressed distinctly from a child's agreement.
That is the smallest real extension — one additional billable-source kind — not a new column.

### THE BLOCKER — the same root cause, for the third time

`createChildcareDraftCharge` **requires `enrollmentAgreementId`**. Firefly has 17 children, all "In
process", **zero enrolled** — so there are no enrollment agreements, therefore no childcare charges,
no balance, no ledger, no period to reconcile.

This is the same root cause that gates Attendance, and it gated Staff until a fixture was seeded:

> **The certification tenant holds no post-enrollment operational data.** Leads and a waitlist exist;
> everything downstream of enrolment — attendance, charges, balances, payments — does not.

A production-enabled Financials card here would be exactly the visual shell §20 forbids: every value
would have no owner to read from. So the read model was **not** built against fixtures and the card
was **not** registered.

### §18 `billing_preview` — distinct, not superseded

Repository evidence: `billing_preview` is titled "Billing Preview" and answers *is billing
configured* (`billing_configured`, `tuition_rate_label`, resolved by
`buildBillingPreviewCardEvidence` from the financial-config API). The approved Financials card
answers *what is owed, by whom, and what happened*. **Configuration ≠ account truth**, so these are
distinct capabilities and no supersession is applied. `billing_preview` is also live in the published
composition, so superseding it on a weaker reading would remove a configured tenant card.

### Unblock — one decision covers three cards

Authorize a **deterministic, reversible, namespaced enrolled-child certification fixture** (the Staff
fixture pattern, one level deeper). `materializeChildEnrollment` is idempotent and creates the
durable trio agreements → placements → schedule assignments. That single fixture unblocks
**Attendance** (its subject), **Financials** (charges and balances) and the remaining **Process**
scenarios (divergent children, 5+ participants) at once.

This lane cannot do it: it holds no database credentials, `vac governed-action` returns
`missing_mission_binding`, and §21 forbids irreversible mutation of shared demo families.

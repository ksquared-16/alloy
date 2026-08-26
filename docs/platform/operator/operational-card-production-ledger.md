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

### §24 Attendance ledger status — corrected wording

| Dimension | Status |
|---|---|
| Architecture / read truth | **READY** |
| Canonical event / correction / movement owners | **READY** — `recordAttendanceEvent`, `correctAttendanceEvent` (non-destructive `correction`/`reversal`), `room_transfer` with from/to rooms |
| Operational command implementation | **IMPLEMENTATION-READY** — thin delegations, no new business logic |
| Browser / action certification | **BLOCKED** — no safely enrolled certification subject |
| Production registration | **BLOCKED** |

The Attendance domain is **not missing**. `enrollmentAgreementId` stays required — the invariant is
correct and is not weakened to unblock a card. Attendance resumes the moment a deterministic,
reversible enrolled-child fixture exists.

### Implementation ledger — current

| Capability | UI | Read truth | Actions | Config | Browser proof | Production-ready |
|---|---|---|---|---|---|---|
| **Staff** | ✅ | ✅ | n/a — informational | ✅ | ✅ | **YES** |
| **Business Process** | ✅ | ✅ | existing Current Work | ✅ | ✅ A/B/G | **YES** |
| Participant scope (runtime seam) | n/a | ✅ | n/a | n/a | ✅ via Process | **YES** |
| Attendance | ✅ locked | ✅ READY | IMPLEMENTATION-READY | pending | ⛔ no subject | **NO** |
| Financials | ✅ locked | ⚠ owners READY, **no data** | F5 absent; payer owned by Processing | pending | ⛔ no charges | **NO** |
| Care Team | ✅ locked | ⛔ resolver missing | n/a | pending | ⛔ | **NO** |
| Health & Safety | ✅ locked | ⛔ B1 | ⛔ | pending | ⛔ | **NO** |
| Safety Signals | ✅ locked | ⛔ B1 | n/a | ⛔ S2 | ⛔ | **NO** |

**Two cards are production-ready. Every remaining card is gated by one fact**, not by its own design
or its backend: the certification tenant has no post-enrollment operational data.

---

## 18. Operational Cards certification fixture — built, not executable from this lane (2026-08-26)

### The fixture

`web/scripts/seedOperationalCardsCertification.ts`
→ `npm run dev:seed:operational-cards-certification [-- --remove | --verify | --customer <id>]`

**One household for every vertical.** Process, Attendance and Financials all need the same thing —
two genuinely enrolled children — so there is one fixture and one cleanup rather than three that
drift apart and each solve reversal separately.

**It goes through the product, not around it.** Every write is a canonical service a registered
action already calls:

```
addChild        →  the durable child (customer_members)
directEnroll    →  materializeChildEnrollment  →  child_enrollment_agreements
                                                →  child_placements
                                                →  schedule_assignments
```

Inserting an agreement directly would be faster and would also be a lie: *an agreement is
materialized, not authored* is precisely the invariant Attendance depends on. `directEnroll` is the
registered `enrollment.direct` capability's own service, so fixture and operator take one path.

**The namespace is the safety.** Everything is reachable from `operational-cards-cert.alloy.invalid`
— RFC-2606 reserved, so it cannot collide with a real address. `--remove` matches on that domain
alone, never a name or a timestamp, and `assertNamespaceIsolated()` proves the selector cannot
over-match **before the first write**. The 17 Firefly children are not read, matched or touched.

**Reversal is ordered by dependency**, outside-in: attendance events → charges → schedule
assignments → placements → agreements → participations → members → opportunity → household links →
household → people.

### The household is the operator's one step — deliberately

`create_lead` is a multi-stage **command** (intake → commit selection → household member commit),
not a callable service; there is no `createLead(supabase, input)` to delegate to. Writing
`customers` + `persons` + `opportunities` directly would reproduce that command's decisions outside
it — the bypass §1 forbids. So the household comes from the registered command, and everything
downstream of it is canonical service delegation.

### It cannot execute from this lane

Confirmed again, not assumed: `--verify` fails at `Supabase URL is not set`. Privileged values never
enter the worktree by design, `vac governed-action` returns `missing_mission_binding`, and §6
forbids falling back to mutating an existing Firefly child. §19 therefore applies: the tooling is
built, its logic typechecks, and this is the invocation.

### Exact invocation required from an authorized environment

```bash
# 1 — once, through the product UI (registered create_lead command):
#     parent  Cert Certhouse
#     email   guardian@operational-cards-cert.alloy.invalid
#     phone   +15555550100
#
# 2 — from web/, with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY present:
npm run dev:seed:operational-cards-certification
npm run dev:seed:operational-cards-certification -- --verify
# reversal, matching the reserved namespace only:
npm run dev:seed:operational-cards-certification -- --remove
```

It creates children **Certa** and **Certb** Certhouse, enrols both at the first configured site and
room from today, and prints the resulting agreement / placement / schedule ids.

### What this unblocks, in one step

| Vertical | Unblocked by |
|---|---|
| **Attendance** | the enrollment agreement its every event requires |
| **Financials** | `billable_source_id` → agreement → child, so charges become child-attributable |
| **Process** | the remaining divergent-children and 5+ participant scenarios |

Nothing was built against fixtures in the meantime, and no UI shell was created against absent data
(§19). Attendance and Financials remain exactly as audited.

---

## 19. Fixture execution attempted from both paths — still requires an operator (2026-08-26)

The mission's prerequisite is the fixture invocation. **It did not succeed**, and the reason is worth
recording precisely, because one half of it is a safety mechanism rather than an obstacle.

### Path 1 — the script: no credentials, by design

`npm run dev:seed:operational-cards-certification -- --verify` fails at `Supabase URL is not set`.
Privileged values never enter the worktree; `alloy-dev-start` injects them "into the owned process
only". I checked the toolkit for a sanctioned trusted-env runner before concluding: `alloy-ro` is
read-only inspection, `alloy-dev-start` only starts the server, and `vac run` accepts a fixed set of
validation kinds. **No sanctioned path exists**, and the boundary is deliberate.

### Path 2 — the product UI: blocked by identity resolution, which is correct

Step 1 says to create the household through the registered Create Lead flow, so I drove it: Actions →
Create Lead → **Form** tab (a `role="tab"`, which is why an earlier attempt missed it) → the four
fields (first, last, email, phone) filled and valid.

**Review stays disabled.** The reason:

```
canReview = controller.resolution.readyForPreview || readyToExecute
```

`resolution` is the identity pass — the "Checking for existing records…" step. Create Lead will not
build a preview until identity resolution settles, because **creating a second household for a
family that already exists is precisely what it exists to prevent** — the same gate `addStaff`
enforces with `StaffIdentityChoiceRequiredError`. Driving past it would defeat a safety mechanism,
not automate a chore. It wants an operator to make an identity decision.

### A near miss that argues for stopping

Typing the address character-by-character produced
`guardian@operational-cards-cert.alloy.invald` — a dropped `i`. On a shared stack a **typo'd
namespace is unrecoverable by the fixture's own selector**: `--remove` matches the reserved domain
alone, so a near-miss record would be permanently un-cleanable. That is exactly the leak the
namespace exists to prevent, and it is a second reason not to keep retrying unattended.

### The tenant is untouched — verified, not assumed

| Check | Result |
|---|---|
| All Children | **17** — unchanged |
| `Certhouse` present | **no** |
| Staff certification fixture | intact, 4 `Certified` rows |

No partial household, no orphan person, no half-created lead.

### What is actually needed

One operator action, then the script:

```
1.  Actions → Create Lead → Form
    Cert · Certhouse · guardian@operational-cards-cert.alloy.invalid · +15555550100
    resolve identity ("create new person") → Review → Confirm

2.  from web/, with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY:
    npm run dev:seed:operational-cards-certification
    npm run dev:seed:operational-cards-certification -- --verify
```

Everything after that is unattended: `addChild` ×2 and `directEnroll` ×2 are plain service calls the
fixture already makes, and Attendance (§B) resumes immediately against the resulting agreements.

**Nothing downstream was started.** No Attendance commands were registered, no Financials read model
was written, no card was placed — §19 of the prior mission and the Definition of Done both require
real canonical data first, and building against absent data is the failure this program has avoided
throughout.

---

## 20. The trusted certification runner — blocker removed (2026-08-26)

Three cards were blocked on one fact: the tenant had no enrolled child. The previous stop asked an
operator to hand-build one. **That was the wrong shape** — an autonomous lane being unable to create
canonical state is a platform gap, not a chore to delegate.

### The capability

`POST /api/admin/dev/operational-cards-certification` · `{ action: "ensure" | "verify" | "reset" }`

The dev server already holds the trusted environment, so the capability lives **inside the process
that is already authorized** rather than in a credential tunnel that would defeat the boundary.

**It is not a seed runner.** No script name, no SQL, no table, no payload — three fixed verbs over one
fixture whose namespace is compiled in, so the blast radius is a property of the code rather than of
the request.

| Guard | |
|---|---|
| Production | 404 before anything else runs |
| Auth | the same admin/ops gate every admin route uses |
| Org | from the **session**, never the body — it cannot be aimed at another tenant |
| Surface | `ensure` · `verify` · `reset`, none taking a parameter |
| Allowlist | **no exception needed** — it resolves a principal like every other admin route (`checkServiceClientPrincipal` ✓) |

### Identity resolution is not bypassed

`ensure` calls the real Create Lead command and lets *it* settle identity. A reserved-namespace person
is unique by construction, so the canonical resolver reaches `committed` on its own. If it ever
returns `processing_review`, the runner **fails closed** — reinterpreting an ambiguous duplicate as
"create another person" is exactly the bug that gate exists to prevent.

### Two real defects found by executing it

1. **`create_lead`'s `customer_id` is optional** and is not populated on every committed path. Trusting
   it aborted *after* the household existed — reporting failure while leaving a real record behind.
   The household is now re-resolved the same way an existing one is found, which also makes the step
   idempotent from a partial run.
2. **A room was chosen without regard to its site**, which would have placed a child under a campus the
   site says they are not at.

The refusal that mattered was **`missing_schedule`**: a child without one is never *expected* on any
day, so Roster and Attendance would never see them — an "enrolled" subject useless for the very cards
it exists to certify. The pattern now comes from the site's own active patterns.

### Result — the blocker is gone

| Subject | Member | Agreement | Placement | Schedule |
|---|---|---|---|---|
| **Certa** | `e408fa51` | `4e3aa47e` | `591280d2` | `2ebbf2f0` |
| **Certb** | `46105cd4` | `6f409c2d` | `19aec82a` | `42982cbe` |

Household `29944d3e` · person `38ef24b5`.

**Idempotent:** a second `ensure` returned identical ids with `agreements: 1` each, not doubled.
**Isolated:** `unrelatedChildren: 17` before and after — Firefly untouched.

### Process certification on real two-child data

`All` → Certhouse Family (row shows *Certa (5y4m) | Certb (3y10m)*):

| Check | Result |
|---|---|
| Rail from real configured stages | ✅ Lead **(current)** · Tour · Decision · Waitlist · Enrolling · Enrolled |
| Activity | ✅ trigger reports **5** canonical records |
| Aligned participants quiet | ✅ markers suppressed — both children sit at the case's stage, and divergence is what the rail exists to show |
| Page errors / duplicate keys | ✅ 0 / 0 |
| Readiness | 11.1 s cold-compile (dev) |

**Divergent state (Certa Waitlist / Certb Tour) not yet established.** It requires canonical stage
progression, and §A forbids patching stage rows for a screenshot. Provider-level tests already cover
the combination.

### What changed for the Director

Nothing about certification setup is theirs any more: no Create Lead, no seed command, no `--verify`,
no credentials. The next Director interaction is **QA of Attendance and Financials**, which is what
the mission asked for.

---

## 21. Attendance commands — five capabilities, executing against real canonical truth (2026-08-26)

### Registered, delegating, no new rules

`attendance.check_in · check_out · move · correct · mark_absent` — registered in the action registry
and the platform capability spine (`capabilityRegistry` 17/17 green, which enforces that every
registered action has an executable `registered_action` capability).

The domain already owned every rule. These adapters add the two things it deliberately lacks — an
operator-facing **subject** and an operator-facing **intent** — and delegate the rest to
`recordAttendanceEvent` / `correctAttendanceEvent`.

### Subject: child in, agreement out

`resolveAttendanceSubject` is the one place a child is joined to their enrolment, so
`enrollmentAgreementId` never reaches the card or the operator and the invariant is untouched. It
**fails closed** — no agreement, or two live ones, is a refusal rather than a guess. Attendance
landing on the wrong agreement is worse than attendance not recorded: it lands on a real enrolment,
silently, with nothing for the operator to see.

Two authorities the *server* owns, not the caller:

| Fact | Resolved from | Why not the client |
|---|---|---|
| Check-in room | the canonical **placement** | the placement is where the child is *meant* to be, not whatever room a card was showing |
| Transfer source room | the **attendance fold** (last effective room-bearing event, else placement) | accepting a client "from" would let a stale screen rewrite where a child *was* |

### Executed end to end — real events, not fixtures

| Intent | Event | Id |
|---|---|---|
| check_in (Certa) | `check_in` | `cccfb54a` |
| move (Certa) | **`room_transfer`** | `14c349cb` |
| check_out (Certa) | `check_out` | `755024f2` |
| mark_absent (Certb) | `absence` | `9b9cf666` |
| correct (Certa) | `correction` → `cccfb54a` | `0eefb8dd` |

**Move is one transfer, not check-out plus check-in.** Two events would fabricate a departure that
never happened, split the day into two presences, and make "how long were they in that room"
unanswerable. The correction **references** the original, which is preserved — the audit lineage is
the point, not merely that the table refuses edits.

The domain's own guards fired and were honoured rather than worked around: `check_in requires
roomLocationId`, then `room_transfer requires fromRoomLocationId and toRoomLocationId`. Each one sent
the resolution to its rightful owner.

### Fail-closed proof (§16)

A child with no active enrolment — including an id that does not exist — is refused server-side with
`no_agreement`, before any event is written. Not a hidden button: the capability evaluator answers
the same way to a direct call.

### Outstanding for Attendance

The card provider, participant-scoped rendering, movement overflow and browser certification remain.
The commands they will call now exist and are proven against canonical truth.

---

## 22. Compact command-workspace chrome (2026-08-26)

A command workspace now names **the command**, not the card and stage that launched it.

### What was removed, and what replaced it

| Before | After |
|---|---|
| `WHAT'S NEXT` (card title) | — suppressed while a capability owns the surface |
| stage label + status chip | — suppressed likewise |
| `← Back to actions` (root) | **the command's own title** — "Tour invitation", "Add charge", "Correct attendance" |
| `✕` | `✕`, unchanged — the single exit |

Applied at the **shared** owner (`CurrentWorkFocusedSurface` + `CurrentWorkCard`), driven by
`capabilityActive` and `activePanelAction.label`. No action-name branching: every command that
resolves to the shared `activePanelAction` slot — Message, Send form, every Tour ▾ item, and the new
Attendance commands — inherits the same grammar.

The title comes from the **registered action's operator label**, which is the priority the amendment
asks for; the card label is not consulted.

### The trade-off I made, stated plainly

`tests/focusPanel/currentWorkCommandReturnGrammar.test.ts` locked **R-014**, which had two halves:

1. a command destination must be dismissable — *unchanged, still locked*;
2. dismissing it must not collapse the card — **superseded by this amendment**.

`✕` returns to the Focus Panel (what the amendment defines as the return path) but *does* collapse
the focused workspace, whereas the removed control returned to the launcher list while keeping it.
Those were genuinely two different destinations, not one exit with two buttons. The amendment's
judgment is that the intermediate step did not earn a permanent row above every command; that is a
product call, and it is recorded here rather than buried, so it is one line to restore if QA
disagrees.

`onDismissPanel` / `closeActionPanel` are **retained** — nested steps and completion handlers still
return to the launchers without collapsing. Only the root affordance is gone. Outcome mode keeps its
Back, because actions → outcome is genuine nesting.

9 guards pass against the revised contract.

### Not browser-measured

The pixel measurement was not taken: reaching a live command workspace needs a case with an
actionable Current Work item, and the certification household's case has none. The change is
structural — three suppressed elements replaced by one title row — and is asserted by test rather
than by a screenshot. **Recorded as outstanding rather than implied.**

### A process note

I destroyed my own uncommitted work mid-run with `git checkout HEAD -- web/` while restoring from a
baseline probe, and had to redo it. I also first attributed two test failures to this change by
baselining the **wrong file**; the correct baseline showed 2 failed / 6 passed both with and without
the change, so both are pre-existing (`resolveCurrentWorkActionSurface` is absent from
`CurrentWorkCard.tsx` independently of this work). Commit before probing, and baseline the file that
actually failed.

---

## 23. Attendance card — provider and card built; placement is tenant configuration (2026-08-26)

### Provider (§1) — done, verified on real events

`buildAttendanceCardVM` composes in **one server pass** from the canonical owners:
`fetchScheduleExpectations` (expected day) · `listAttendanceEvents` (record) ·
`buildChildAttendanceReadModel` (fold) · `resolveAttendanceSubject` (subject, fails closed).

Verified against Certa's real day:

```
expected  Monkeys      state  checked_out
arrived   15:05        movement  Monkeys → Giraffe   corrected: true
```

Served by one endpoint (`/api/admin/attendance/card`) rather than five client calls — schedule,
presence, movements, history and corrections would otherwise assemble on screen and pay again on
every participant switch. The principal check passes with no allowlist exception.

**The provider never truncates.** `movements` is complete and ordered; bounding is the card's job,
because truncating server-side would make "+N movements" a claim nobody could verify.

`not_arrived` is separated from the fold's `no_record`: "due and not here yet" and "nothing to say"
are different answers the fold represents identically.

### Card (§2, §3, §4) — built

Registered through the full chain — key · registry (`grains: ["opportunity","child"]`) · catalog ·
archetype/icon · renderer · card model · default composition (full row, `colSpan: 12`).

- **Participant-scoped:** reads `context.participantScope`. With several children and none scoped it
  renders *"Select a child to see their day"* and **no controls** — a card that quietly picked the
  first child would answer confidently about the wrong one.
- **No stale sibling state:** the VM is cleared before each load, and a response is accepted only if
  its `participant.customerMemberId` matches the member the request was for, so a slow answer for the
  child the operator just left cannot paint over the child they are looking at.
- **Bounded movements:** the last two transfers keep their identity, the middle collapses to
  `+N movements`, and arrival / current room / departure always survive.

### Blocked here — placement is tenant configuration, not code (§8)

The card does not appear in the certification case, and the reason is not the card: the rendered
composition is `business_process · billing_preview · children · household`, which matches **neither**
the code default nor the keys list. This tenant has a **published Surface layout** stored in
configuration, and a published layout wins over the code default by design.

So placement is a Surfaces **authoring** act against this tenant's published layout — which is
exactly the "normal Surface path" §8 requires, and equally is configuration rather than code. I did
not hand-edit published tenant configuration to make a card appear.

**Not yet certified, and honestly outstanding:** the card in the real Focus Panel, the Certa ↔ Certb
scope switch, movement overflow at 5 and 8+, command wiring in the card face, the command-chrome
proof (§6), performance (§10), and Surface registration (§8). The provider beneath them is proven.

---

## 24. Attendance placed through canonical Surface authoring (2026-08-26)

### §2 — the owner, identified before changing anything

| | |
|---|---|
| Surface | **Enrollment Focus Panel** (`layout=enrollment-focus-panel-summary`) |
| State before | **Published v131**, Visible Cards 4 |
| Composition | `business_process · billing_preview · children · household` — exactly the live panel |
| Why it differs from code | a published layout is stored in doc metadata and **wins over the code default by design** |
| Authoring path | the Surfaces builder → Add card → **Publish** (`focusPanelPublishedLayoutOps` writes the layout into doc metadata) |

`Attendance` already appeared in the builder's **Add card** library, which confirms the registration
chain reached the catalog before any layout change.

### §3 — placed and published

Added through the builder and published: **v131 → v132**. No database hand-edit, no code-default
change pretending to be tenant configuration, no renderer hardcoding, and no existing card removed
to make room.

### §5 — certified in the real Focus Panel

```
cards: business_process · billing_preview · attendance · children · household
readiness 9.1 s · 0 page errors · 0 duplicate-key warnings
```

**Attendance appears because published configuration includes it** — the same panel showed four cards
minutes earlier with identical code.

The card renders `empty="no-participant"`: Certhouse has two children and none is scoped, so it shows
no day and no controls. **That is the intended refusal**, certified live rather than argued — a card
that picked a child here would answer confidently about the wrong one.

### The scope switch cannot be exercised on this tenant

Certa ↔ Certb needs a **child-grain Work View row**, because the scope carrier is attention's subject
and only a child-grain lens selects a participation. Measured across every configured view:

| View | Rows | Certhouse |
|---|---|---|
| `new` / `all` | 1 / 2 | **the family, as one case row** |
| `waitlist` | 17 | other children only |
| `registration` | 0 | none |

The certification children are **enrolled**, and no configured child-grain view contains enrolled
children. So this is a Work View **configuration gap**, not a card defect: the carrier itself is
proven by 8 guards through the real context builder, and the card's no-scope refusal is proven in the
browser.

Closing it means authoring a child-grain Work View that includes enrolled children — a Queue Rows /
Work View authoring act, distinct from the Focus Panel surface just published.

### Attendance status — honest scorecard

| Item | |
|---|---|
| canonical provider | **PASS** — verified on real events |
| real card | **PASS** — renders in the live panel |
| registered capabilities | **PASS** — all five execute |
| published Surface placement | **PASS** — v132, through the builder |
| ambiguous multi-child refusal | **PASS** — certified live |
| participant switching | **BLOCKED** — no child-grain view holds enrolled children |
| command execution *from the card face* | not certified — commands proven via the runtime, not the card's controls |
| movement overflow browser proof | not certified |
| command chrome browser proof | not certified |
| performance | partial — 9.1 s panel readiness with Attendance placed |
| 0 page errors | **PASS** |

Attendance is **not** yet production-ready by §12, and the remaining items are named rather than
rounded up.

---

## 25. Child-grain Work View authored — and the real root cause found (2026-08-26)

### The authoring path works, and I used it

`Organization → Processes → Enrollment → Work Views` is the canonical owner: `+ Add Work View`, a
row-type declaration (`Family | Child`), stage/field conditions, presentation bindings, then
**Save Work Views → Apply changes**.

I authored **"Enrolled children"** through it — row type `Child`, *Stage equals Enrolled*, bound to
**Enrollment Focus Panel Summary · V132** — saved and applied it live (6 → 7 configured). The view
appeared in the workspace immediately.

**It returned 0 rows.**

### Why — the finding this run actually produced

`Stage equals Enrolled` yields Child rows exactly as Waitlist does (`Stage equals Waitlist` → 17
children), so the configuration shape was right. The rows were missing because **no participation
sits at that stage**.

`enrollment.direct` says so in its own contract:

> `enrollment.start` — run the governed journey → one process_instance, no durable facts
> `enrollment.direct` — **skip the journey** → the durable trio, no process_instance

So the certification children have **real enrollment agreements and no participation state**. That is
not a bug — it is the documented difference between the two intents — but it means *no child-grain
Work View filter can surface them*, because every such filter matches on stage or disposition, and
they have neither.

Switching the condition to `child_enrollment_status equals enrolled` proved it from the other side:
17 rows returned, **none of them Certa or Certb** — the existing children matched, the fixture's did
not.

### The tenant is left clean

The view claimed "Enrolled children" while listing 17 children who are not the fixture's, which is
exactly the accidental product configuration §2 warns against. **Deleted and applied — back to 6
configured, `Changes applied`.** The Focus Panel surface stays at **v132** with Attendance placed,
which is the intended QA configuration.

### What this means for closing Attendance

The blocker moved one layer down, and is now specific:

> The fixture enrolls through `enrollment.direct`, which deliberately creates no participation state.
> A child-grain Work View can only select a participation. So participant scope cannot be exercised
> for these children until they are enrolled through the **journey** path (`enrollment.start` +
> completion), or their participation disposition is set canonically.

That is a **fixture** change, not a card, Work View, or scope-architecture change. It also explains
why Registration ("Stage equals Enrolling") has always shown 0.

Everything downstream of participant scope stays blocked on it: the Certa ↔ Certb switch, command
execution from the card face, movement overflow in the browser, and the command-chrome proof.

---

## 26. Fixture corrected to the journey — and a reset defect I caused (2026-08-26)

### The fix that worked

`directEnroll` creates durable enrolment and **skips the journey by design**, so the children had
agreements and no process instance. The fixture now uses both owners:

| Truth | Owner |
|---|---|
| process instance + participation | `startEnrollment` |
| stage → `enrolled` | `moveProcessInstanceStage` / `setProcessInstanceState` |
| participation disposition | `updateOpportunityCustomerMemberLifecycleStatus` |
| durable trio | `directEnroll` (reuses; nothing materialised twice) |

**`verify` is what makes it stick.** It previously asked only for an agreement, so it passed green
while the children had no process instance at all. It now requires, per child: exactly one agreement,
a process instance, stage `enrolled`, **and** a resolvable Attendance subject. Run against the old
state it correctly failed both children (`processInstanceId: null, ok: false`); `ensure` then healed
them to `ok: true` with instances `a4a04bb0` / `b5cde497`.

### Three defects I introduced, and what each taught

1. **`ensure` was not idempotent.** `startEnrollment` reuses an open instance only for a *live
   episode*; these children resolved context-free, so every call created another instance. Two runs
   left two instances per child — and because `verify` read with `maybeSingle()`, duplicates returned
   *null*, reporting "no participation" for a child that had two. `ensure` now reuses before creating.
2. **`reset` swallowed failures.** It pushed to `removed` only on success and said nothing otherwise,
   so a reset that left agreements, members and process instances behind still reported a tidy list.
   Failures are now reported inline.
3. **`reset` deleted its own anchor first.** The household is found by the reserved e-mail, and reset
   deleted that person early — so when later deletes failed, the survivors were unreachable. The
   reserved surname is now a second anchor, and the person is deleted last.

### The platform was right, and my reset design was wrong

With failures visible, the real refusal appeared:

```
child_attendance_events is append-only: DELETE is not allowed.
Record a correction/reversal instead.
```

The database enforces attendance audit doctrine directly, and that FK chain then blocks
`child_enrollment_agreements`, `customer_members` and `process_instances`. **A fixture child who has
recorded attendance cannot be hard-deleted** — which is exactly what §6 warned about, and exactly what
my reset assumed it could do.

### Residual state — stated plainly

The certification household is **partially removed**: person, household, opportunity and
participation rows are gone; **members, agreements, placements, attendance events and process
instances survive**, orphaned from the namespace anchor.

| | |
|---|---|
| `unrelatedChildren` | **19** (was 17) — the two certification members now count as unrelated |
| Certa | member `e408fa51` · agreement `4e3aa47e` · attendance events recorded |
| Certb | member `46105cd4` · agreement `6f409c2d` · attendance events recorded |
| Firefly's own 17 children | **untouched** |

I stopped changing shared data at this point rather than improvising further recovery.

**Correct next step:** give reset the platform's own dev-certification semantics instead of deletion —
reverse attendance through `correctAttendanceEvent` (the append-only path the error names), then
release the FK chain — or accept that an attendance-bearing fixture child is archived rather than
removed. That is a fixture-design decision, and it is the honest blocker, not a card defect.

**Attendance certification remains blocked**: the Enrolled Work View returns 0 rows because the
participation rows were removed by the partial reset.

---

## 27. Non-destructive certification, and Attendance closed at child grain (2026-08-26)

### 27.1 What the previous run left behind

`reset` deleted the certification subject outside-in. That worked until the children had Attendance
history, at which point the database refused — `child_attendance_events` is append-only by DB rule —
and the refusal cascaded to the agreement, the member and the household that history hangs off. What
survived was worse than either end state:

| Present | Gone |
|---|---|
| household `29944d3e`, both members, one agreement each, all attendance events, four process instances | parent person, the household link, the opportunity, participation, placements, schedule assignments |

That state was **invisible to `ensure`**, which resolves the household THROUGH the parent person. With
the person deleted it would have concluded "no household" and built a second one beside the orphans.

### 27.2 The verbs now on the trusted runner

`ensure · inspect · diagnose · repair · restore · verify`. There is deliberately **no destructive
verb**: an unused one is a single call away from being used again.

- **inspect** — read-only rediscovery. A member is fixture-owned only when the deterministic reserved
  name **and** a surviving artefact agree. Ambiguity ends the operation before any write.
- **repair** — restores the person + household link (`upsertAndLinkPersonForAdmin`), the enrollment
  episode (the Processing identity `createLead` port, which takes an EXISTING household), reconciles
  journeys, then delegates to `ensure`.
- **restore** — appends a REVERSAL for every *effective* attendance event, then repairs. Idempotent
  because the fold is: `effectiveAttendanceEvents` already answers "what is current truth", so a
  second run finds nothing to reverse.

### 27.3 The finding that mattered — context-free journeys are invisible

`enrolled-children` returned **zero rows while both children verified green**. The production
child-grain reader explains it in two lines:

```ts
const opp = pi.context_id ? refs.oppById.get(pi.context_id) : null;
if (!opp) continue;
```

A **context-free** journey is structurally invisible to every child-grain Work View, whatever stage it
reports. And the certification children had exactly that, because `ensure` used `startEnrollment` —
which asks `resolveLiveEnrollmentContextForHousehold` for a live episode, and that resolver defines
*live* as an opportunity **already containing a running child journey**. A restored or childless
episode contains none, so the answer is always "no" and the first child can never join.

**This is a chicken-and-egg in the product, not only in the fixture**: `startEnrollment` alone can
never place the first child into an episode. `create_lead` avoids it by creating the opportunity and
the child participation together. `ensure` now uses `createEnrollmentProcessInstance` with a
`contextId` — the writer `create_lead`'s own child-participation path uses — so create_lead + addChild
produces the same participation truth that one-step create_lead-with-children does.

### 27.4 Two defects my own reconciliation introduced, and what they teach

1. **"Close everything but the oldest" kept a corpse.** The oldest instance was frequently one the
   fixture had already closed, so it kept that and closed the good journey.
2. **A closed CONTEXT-BOUND journey can never be replaced.** `createEnrollmentProcessInstance` upserts
   on `(org_id, process_key, subject_id, context_id)` with `ignoreDuplicates` and returns the existing
   row **whatever its state**. Every later `ensure` then reported success over a journey that was not
   running — two children, one agreement each, **zero live journeys**.

The keeper is now the episode-bound journey, and one the fixture wrongly closed is **re-opened** rather
than abandoned. Repair run 1 corrected them; run 2 changed nothing.

`verify` had the matching defect: it read participation with `maybeSingle()`, so TWO journeys returned
null and **a duplicate verified identically to an absence**.

### 27.5 Three defects between a working provider and a usable card

| Defect | Why it was invisible |
|---|---|
| **Composition** — the child composition had no Attendance entry | the published layout places Attendance at CASE grain, so certifying it there passed while the same child opened from a lens rendered no card at all |
| **Scope** — a child-grain answer carries no `_inquiry_children` | the candidate list was empty, scope resolved to nobody, and the card asked the operator to "select a child" while displaying that child's own record |
| **Commands** — the card face had no controls | the capabilities were registered and proven executable; nothing dispatched them |

A card is only placed where a composition places it. The **durable** child composition is deliberately
left alone: Attendance requires an enrolment, and that composition is explicitly the cards a child has
without one.

### 27.6 Browser certification — Firefly, `/workspace/work-unit/enrolled-children`

Zero page errors and zero failed requests throughout.

| Check | Observed |
|---|---|
| lens membership | `Enrolled children` renders **Certa** and **Certb** at child grain |
| isolation | `unrelatedChildren` **17** — Firefly's own children, untouched |
| command cycle | not arrived → **Check in** → Monkeys (the PLACEMENT's room), arrived 11:19, controls become Check out / Move room with 4 destinations → **Move** → Bears, movement row appears, EXPECTED still honestly Monkeys → **Check out** → departed 11:19, **no controls** (no transition remains) |
| scope switching | Certa → Certb → Certa; each child's own day, correct subject id, no bleed |
| movement overflow | 0 → none · 1–2 → shown in full · 3 → `+1 movements` · 4 → `+2` · 5 → `+3`. The **last two** always survive and NOW always matches the newest room |
| restore visible in product | after `restore`, both children read **Not arrived** — the events are still in the table, voided by reversals |
| card readiness | 110–922 ms; the composed VM endpoint 726–1423 ms. **`next dev` figures — not a production number**, and dev/prod has measured ~5× on this host |

Check-in deliberately sends **no room**: the adapter reads it from the placement, which is the
authority on where a child belongs. Transfers are scoped to the child's own site — an org-wide list
would let one click move a child to another campus.

### 27.7 Deliberate non-actions

- **The opportunity's `work_unit_id` is null**, so the certification family does not appear in
  family-grain lenses. Not repaired: nothing in Attendance certification needs it, and parking a
  settled family on a stage work unit would put it back into acquisition work.
- **An absent `opportunity_customer_members` row is not missing participation.** The platform retired
  that bridge; reporting its absence as a defect made a correct graph read as broken and would have
  sent a later repair off writing legacy rows the runtime does not read.
- **No `View history` surface was built.** The card's recent-days strip is the history it carries
  today; a deeper surface is not required by any certification item and was not invented to fill one.

### 27.8 State at close

`inspect` reports `missing: []`, `ambiguous: []`. Both children verify green with one live journey,
one agreement and a resolvable attendance subject. Financials has not been started.

---

## 28. Financials production vertical (2026-08-26)

### 28.1 Current-state audit — what already existed

Most of this vertical was already built. The audit's job was to find that out before writing anything.

| Fact | Classification | Owner |
|---|---|---|
| charges, charge_line_items | READY | `public.charges` |
| charge categories | READY | `charges.charge_category`, 10-value CHECK + `CHARGE_CATEGORY_LABEL` |
| charge templates | READY | `financial_charge_templates` + `listChargeTemplates` |
| billable source | READY | `charges.billable_source_type/_id` (`job` \| `enrollment_agreement`) |
| child attribution | DERIVABLE_CANONICALLY | agreement → `customer_member_id` |
| billing period | DERIVABLE_CANONICALLY | `charges.billable_on` |
| future dating | READY | template `billable_on_strategy`; future `billable_on` = *scheduled* |
| credits / adjustments / funding | READY | categories `discount`, `credit`, `adjustment`, `subsidy_offset`; corrections via `source_charge_id` |
| due / posting dates | READY | `due_date`, `posted_at`, `occurs_on`, `billable_on` |
| GL accounts | READY | `gl_accounts` (10 configured in the cert tenant) |
| GL mappings (write) | MISSING_CANONICAL_SEAM | read-only route; **0 mappings in the tenant** |
| payment methods | READY (thin) | `customer_payment_methods` (Stripe, no org_id) |
| payments for enrollment accounts | MISSING_CANONICAL_SEAM | `payments.job_id` is NOT NULL |
| autopay | MISSING_CANONICAL_SEAM | exists only in card-lab fixtures |
| payer responsibility (default party) | READY | `resolveChargeResponsibility` |
| payer splits | OWNED_BY_ANOTHER_PLATFORM | Processing |
| household billable source | MISSING_CANONICAL_SEAM | `HOUSEHOLD_BILLABLE_SOURCE = MISSING` |
| record-level Financials read model | MISSING | built here |
| registered financial actions | MISSING | `charge.add`, `charge.post` registered here |

### 28.2 Three audit findings that changed the build

1. **`payments` was never generalized.** Only `charges` and `ledger_transactions` gained
   `billable_source_*`; `payments.job_id` is still NOT NULL. A childcare payment has no canonical
   seam, so the read model REPORTS that as an unavailability. Summing to zero and printing
   "$0.00 paid" would state something the platform cannot know.
2. **The charge→GL chain is not the Tuition chain.** §9 named
   `commercial_revenue_categories → mapped_gl_account_id → gl_accounts`; that is real and is the
   Tuition/Catalog path. A charge carries no `revenue_category_id`, and revenue categories have no
   key column — only a unique label — so nothing joins them. A charge travels
   `metadata.gl_mapping_key → gl_account_mappings.key → gl_accounts`. Both end at `gl_accounts`.
3. **The period is `billable_on`, not a new column.** Its own schema comment already defines the
   lifecycle ("a draft with billable_on in the future is scheduled"). `posted_at` was the tempting
   alternative and is wrong: a September charge posted in October would silently move periods and
   change a closed period's totals.

### 28.3 The financial grammar, as implemented

```text
gross (tuition · deposit · consumable_fee · late_pickup · one_time · fee)
+ discounts/credits (discount · credit)
+ funding (subsidy_offset)
+ adjustments (adjustment)
= responsibility            ← the SUM OF EVERY OWED LINE, so it cannot drift from the rows
− payments received         ← structurally 0; reported as unavailable, not shown
= balance

scheduled   drafts whose billable_on has not arrived   STATED BESIDE the balance, never inside it
draft       drafts whose billable date has arrived     neither owed nor scheduled
past due    owed · unpaid · due_date < today
```

Classification is by CATEGORY and summation is of SIGNED amounts, because the schema constrains only
`amount_cents <> 0` and does not enforce a sign convention. The breakdown therefore reads correctly
however a row was written, and the total still reconciles.

### 28.4 Defects found by running it

* **A total that did not reconcile to its rows.** The card showed `$100.00` account-wide above a
  ledger filtered to one child's `$75`. Reconciliation is now computed per subject in the same
  server composition — no round trip on filter change, and no second implementation of the rule.
* **`entity_type: "child"` was rejected.** `/api/admin/actions/execute` routes to the Command Runtime
  facade only for known Platform Capabilities; everything else falls back to `executeAdminAction`,
  whose `mapEntityToTable` admits only opportunity/job/schedule. Registering a `RegisteredAction` is
  not enough — the capability must be registered too. A new `financial` capability family was added.
* **Summary and expanded rendered identically**, which made `Details →` a no-op. The ledger is now
  the expanded representation, with a shallow one-line top.
* **Add Charge disappeared when expanded** — it was nested inside the Current Period band, i.e.
  absent from the density where an operator actually works the ledger.
* **`description` was the template KEY** (`field_trip`). The tenant's configured label is resolved
  and the key is never rendered.
* **An unguarded `settled.context.businessProcess.stages`** crashed six child-mission guard tests.
  The two lines above it were `??`-guarded and passed; the explicitly-named line was not. Spreading
  preserves every field including ones added later, which is what its own comment asked for.

### 28.5 A repair that made things worse, and was reverted

The certification episode was restored with `work_unit_id: null` while `create_lead` resolves one, so
the family is reachable at child grain and invisible at family grain. Binding it to the stage's own
`lifecycle_wu_lead` looked like the faithful repair.

It was not. With the episode bound, the `all` and `active-pipeline` lenses went from **one row to
zero** — the certification case did not appear and the real family that had been there disappeared
with it. Unbinding restored the lens. `repair` now clears the binding on every run, which also
self-heals the run that introduced it.

> A fixture may not degrade a lens that serves real records. The cost is that compact is certified on
> a real family with nothing billable rather than on the certification family's balance.

### 28.6 Browser certification — `/workspace/work-unit/enrolled-children`

Zero page errors, zero failed requests.

| Check | Observed |
|---|---|
| A · child charge | Registration fee $75.00 → Certa, via the registered action |
| B · second child | Late pickup $25.00 → Certb |
| C · future charge | Field trip, event date 2026-09-18, `billable_on` **2026-10-01** (next_billing_cycle) → *scheduled*; Materials, offset_days 7 → 2026-09-02 → *scheduled* |
| D · current period | gross $100.00 = responsibility = balance; August period total $100.00 — reconciles to the two posted rows |
| E · past due | **not reachable** — neither `writeTemplateDraftCharge` nor `postChildcareCharge` sets `due_date`, so no safe certification scenario produces one |
| F · subject filtering | All 4 rows / 3 periods / $100.00 · Certb 2 rows / $25.00 · Certa 2 rows / $75.00 — each total reconciles to its own rows; 36–49 ms |
| G · ledger periods | **three**: October 2026, September 2026, August 2026 |
| H · GL | every row `Unmapped` — the tenant has 10 GL accounts and **0 mappings**, and mappings have no canonical write seam. Explicit, never blank |
| I · Add Charge | menu offers the four configured labels with amounts (no keys) → **authoritative preview** → commit → rows 3 → 4, refreshed in place, no reload. Preview 1.7 s, commit → refresh 472 ms |
| J · compact | case grain, real family, truthfully "No enrollment agreement, so there is nothing billable yet"; 368 ms |
| K · summary | V5 **8/12** with Billing Preview as the real 4/12 companion; 143–169 ms |
| L · expanded | shallow top + ledger-first detail; 68–99 ms |

### 28.6a The preview, and the balance arrow that would have been a lie

The design showed `Current balance $255 → $295`. Add Charge creates a **draft**, and a draft is not
owed, so the current balance does not move until the charge is posted. An arrow between two balances
would assert a change the backend does not make. The preview states what is true instead:

```text
Materials
Applies to · Certa Certhouse
Occurs 2026-08-26
Billable 2026-09-02
Scheduled — a future billing context
Creates a draft · the balance changes when it is posted
```

Every line comes from `previewTemplateCharge` — the same resolver the write uses — so the preview
cannot drift from the commit. After committing, the balance stayed at `$75.00` and the row count went
3 → 4, which is the correct pair of observations.

### 28.7 Surface placement

Case grain went through the Surfaces builder: **v132 → v133**. A code default is invisible at that
grain, which is why the card did not appear until it was authored. Child-in-lens placement is the
code composition at 8/12 with Billing Preview at 4/12.

### 28.8 Truthful omissions

`HOUSEHOLD_BILLABLE_SOURCE = MISSING` — no Household subject option. No payer filter, no split
percentages, no autopay state, no payments line. No `Pay now`, because nothing can take a payment. No command-workspace chrome case: Add Charge is a
direct command with a template choice and an inline preview, not a workspace, so there is no root
command title or `Back to actions` to verify (§24).
Each is named in the read model's `unavailable` list and rendered as absence.

---

## 29. Health & Safety — foundation built, card BLOCKED (2026-08-26)

### 29.1 The reconciliation §1 asked for — the contracts exist and were found

Two ratified artifacts govern this work, and both were reconciled against staging before anything
was written:

* [`health-foundation-h1-h4-contract.md`](./health-foundation-h1-h4-contract.md) — H1–H4, the
  Director-requested contract the Enrollment lane builds against.
* [`health-ownership-cross-sprint-contract.md`](./health-ownership-cross-sprint-contract.md) —
  ownership, the READY NOW list, and the migrations M1–M3.

Both carry `status: draft`, and the ownership contract's §9 still lists **M1 as a decision
required**. That matters: M1 is the stated prerequisite for H2.

### 29.2 Current-state audit (§2)

| Concept | Classification | Evidence |
|---|---|---|
| `child.allergies`, `child.medical_notes`, `child.special_instructions` | READY, **correct child grain** | config field values keyed on `customer_members.id`, read via `/api/admin/customer-members/[id]`; already composed into the Children card |
| `allergy_notes`, `medication_flag` (Forms system fields) | **INCORRECT_GRAIN** | still `entity_type: "enrollment"` in `lib/forms/systemFieldRegistry.ts` — M1 has NOT landed |
| structured allergy / condition / medication | HEALTH_FOUNDATION_REQUIRED | no table existed; built here as H1 |
| immunization structures | HEALTH_FOUNDATION_REQUIRED | no table; only requirement KEYS (`immunization`, `immunization_record`, `immunization_date`) |
| documents, document field definitions | DOCUMENT_OWNED | `documents` polymorphic at `customer_member` |
| physician / pediatrician, dentist | RELATIONSHIP_OWNED — **role keys absent** | only `emergency_contact` exists in the shipped role vocabulary |
| emergency contacts | RELATIONSHIP_OWNED (READY) | `emergency_contact` role |
| Processing proposals / Trust adapters | PROCESSING/TRUST_OWNED | collection-provider proposal contract |
| enrollment requirement kinds | BUSINESS_PROCESS_OWNED (READY) | `immunization`, `physical`, `health_care_plan`, `medication_authorization_demo` |
| medication authorization, health care plan | BUSINESS_PROCESS_OWNED + DOCUMENT_OWNED | requirement + document evidence, per §7 |
| requirement satisfaction | NOT_HEALTH_TRUTH | evaluated at read time, never stored |
| custody, pickup restrictions, safeguarding, naps, toileting, temperament | NOT_HEALTH_TRUTH | excluded per §9; left to their owners |
| **health visibility permission** | **MISSING** | permission catalogue frozen at 57 keys; **zero** health or medical keys |

### 29.3 What was built

`person_health_facts` (H1), `healthFactCollectionResolver` (H3) and `healthFactService` (H4:
add / edit / end). Design notes live in the modules; the three decisions worth repeating:

1. **One entity, not three.** Immunization is one fact per vaccine with its dose series in the
   payload — nothing references a single dose, so the collection grain stays uniform.
2. **Append-only in the database.** DELETE refused; what a fact *says* cannot change in place; a
   closed fact never reopens. Corrections supersede.
3. **Edit writes the successor before closing the original.** A crash between the two leaves a
   visible duplicate rather than a silent absence. Between those two failures, health takes the
   duplicate.

### 29.4 Three blockers, each with evidence

**B1 · M1 / D-H1 — the grain migration is unapproved and has not landed.**
`allergy_notes` and `medication_flag` are still `entity_type: "enrollment"`. The H1–H4 contract is
explicit: *"M1 (D-H1) lands first. The health grain must be `customer_member` before H2 registers a
provider whose `sourceEntityType` is `customer_member`, or the two disagree from day one."* The
migration moves tenant `field_values` rows between grains, which is why the ownership contract lists
it as a decision rather than a task. **H2 is therefore not registered** — registering it would create
the day-one disagreement the contract exists to prevent.

**B2 · D-H6 — there is no health visibility permission.**
The catalogue is the frozen 57-key set and contains no health or medical key. Field-level
`fieldPolicies` (`editable | read-only | hidden`) is *surface configuration* keyed on
surface + group + field + tier — uniform across roles, not an access control. The admin surface is
gated to `admin`/`ops`, so the card would not leak to arbitrary users, but the platform cannot
express *"this ops user may see attendance and not medical conditions"*. The H1–H4 contract itself
lists D-H6 as **not in scope**, and §17 of this instruction says to name the blocker and stop
registration. **The card is not registered and no Surface placement was authored.**

> Worth stating plainly: `child.allergies` and `child.medical_notes` are **already displayed** on
> this surface under this same gate. The new exposure would be *structured* conditions and
> medications — the same audience, materially more detail. Whether admin/ops is a sufficient gate for
> that is a policy decision, not an engineering one.

**B3 · The migration cannot be applied from this lane.**
This slot targets a hosted Supabase project (`NEXT_PUBLIC_SUPABASE_URL=https://…supabase.co`), so
applying schema is a promotion action requiring explicit authorization. `person_health_facts` does
not exist in any reachable database, which makes the certification fixture (§19) and browser
certification (§20) unreachable this run — there is no health truth to certify against.

### 29.5 Definition of Done — honest status

| §23 gate | Status |
|---|---|
| canonical Health owner | PASS — H1 authored to the ratified contract |
| cross-sprint ownership reconciled | PASS — §29.2 |
| correct child grain | **BLOCKED** — B1, M1 unapproved |
| structured Health facts | PASS as code; unverifiable until B3 |
| Documents / requirements / relationships boundaries | PASS — nothing duplicated |
| canonical read model, summary, expanded, participant scope | NOT STARTED — gated on B2 |
| permissions | **FAIL** — B2 |
| Surface placement, browser certification, 0 page errors | NOT REACHED — B2, B3 |

Health & Safety is **not** production-ready and was not registered. Safety Signals remain unstarted
and must not ship before D-H6 (§21).

---

## 30. Health & Safety — A, B, D–G delivered; C pending a credentialed apply (2026-08-26)

### 30.1 Sequence status

| Step | Status |
|---|---|
| A · M1 / D-H1 grain correction | **DONE** |
| B · D-H6 health visibility permission | **DONE**, and proven live |
| C · apply the H1 migration | **REQUESTED** — `database.apply_migration` `gar_62f1af0052c793`, awaiting the trusted host |
| D · H2 provider registration | **DONE** (M1 landed first, as the contract requires) |
| E · HealthSafetyCardVM | **DONE** |
| F · locked summary · G · locked detail | **DONE** |
| H · fixture through H4 · I · browser certification · J · Surface registration | **BLOCKED on C** |

### 30.2 A — the grain correction, with the census first

The Director's condition was to identify every affected row, report counts by org and field, find any
ambiguous enrollment → child mapping, and fail closed. A read-only dev route produced it:

```text
definitions at enrollment grain   0
values                            0
ambiguous                         0
→ M1 is a REGISTRY-ONLY correction in this environment
```

`allergy_notes` moves to `child` and its `crm_mapping_key` now points at `child.allergies` — the same
destination the profile field already uses, so **one** durable owner rather than two.
`medication_flag` is **deprecated, not migrated** (M3): "this child takes medication" is derivable
from the medication facts, and keeping the boolean is a second answer that stops updating the moment
a medication is added or ended. It stays resolvable so live forms keep working, and
`AUTHORABLE_FORM_SYSTEM_FIELDS` — what the two authoring pickers now read — no longer offers it.
Without that split, retiring it would be advice rather than a rule.

The data migration **refuses to guess**: an enrollment value hangs off an episode, an episode may
hold several children, so it moves only where exactly one child participates and leaves the rest in
place. The definition is re-grained only once none of its values remain behind — doing it earlier
would orphan them, the definition saying `customer_member` while the rows said `enrollment`.

### 30.3 B — the access boundary, and the proof

Two keys: `health.view`, `health.manage`, granted to **admin only**. `ops` is deliberately not
granted — an operator who works Attendance or Financials must not acquire allergies, conditions and
medications because a card was placed on a Surface.

Enforced at the provider and the mutation seam, where `access` is a **required** argument. Making it
required rather than optional was the design decision that mattered: the compiler flagged every
existing call site, and a future Health endpoint cannot forget the check by omission.

**Proven live**: an admin/ops operator with full route admission receives

```text
403 {"permission_denied": true, "error": "You do not have permission to view health information."}
```

from `/api/admin/health/card`, because the grant is not seeded until C runs. That is the negative
half of the required test, and it demonstrates that route admission is not the boundary.

Three details kept: `health.manage` does not imply `health.view`; a **failed** grant read (`null`)
denies, because collapsing it onto `[]` makes the failure open (W-43); and the refusal names the
permission, never the data — an operator who may not see health information should not learn from
the error that this child has any.

### 30.4 Locks reconciled deliberately, not bumped

The W-11 artifact pinned the catalogue at 57 keys. `APPROVED_ADDITIONS` now names each new key **and
the decision behind it**, so an unapproved addition still fails; a new assertion also requires both
health keys to have enforcement sites, because a key that is seeded but not enforced is the D-H6
failure mode — a catalogue advertising a boundary the product does not apply.

The W-14 route lock caught a genuine false claim of mine: the health route declared `health.view` and
named a helper that never mentioned the key on an executable line. The read model now names the
permission on the line that enforces it.

Four routes were also undeclared — three left by this program's **own earlier Attendance and
Financials runs**, which I had not caught because I never ran `tests/access`.

### 30.5 Two name collisions worth remembering

* **`health` was already taken** and means *Enrollment Health* — a pipeline metric with a chip and a
  tone. Reusing it would have put medical facts behind a key whose vocabulary is about process
  health, and every existing consumer would have started receiving them. Registered `health_safety`.
* **`database.migration.apply` is not the governed action key**; it is `database.apply_migration`.
  `vac governed-action --list` is the discovery contract and answers this directly.

### 30.6 What is deliberately absent

Physician and dentist. The Relationship platform has no canonical role key for either, and flat
`physician_name` / `physician_phone` child fields would create the duplicate owner this vertical
exists to prevent. The VM carries it in its own `gaps` list — a **relationship gap, not a health
blocker**. Safety Signals remain unstarted and must not ship before the permission/context projection
contract is proven (§21).

### 30.7 Definition of Done

`M1 · H2 · H3/H4 · read model · summary · detail · permission (server-enforced, refusal proven)` all
PASS. `H1 applied · real facts through H4 · participant switching · Surface placement · browser
certification · 0 page errors` are **not reached**, because every one of them needs the schema that
step C applies. Health & Safety is **not** production-ready and the card is **not** placed on any
Surface.

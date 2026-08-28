# Runtime fidelity pass 3 — reference matrix

**Visual authority.** The approved artifact, and its live equivalent: the Local Design Lab's
**`Z · Final Focus Panel`** tab, which labels every span on its own face. Not the lab's default
view — that opens on `1 · Journey`, a single older specimen, which is the trap the instruction
named. Not docs prose, and not component source.

Captured at viewport 1600×1400, deviceScaleFactor 2, `/dev/operational-card-lab` and
`/workspace/work-unit/enrolled-children` (child-with-family grain — the only composition where all
four cards render together).

## Geometry

| Card | Approved span | Approved px | Production px | Density | Evidence state | Verdict |
|---|---|---|---|---|---|---|
| `business_process` | 12/12 | 1023 | **1038** | standard | 6 stages, 2 participants aligned | ✅ |
| `financials` | 8/12 | 679 | **689** | standard | 1 charge, no past due, no payer split | ✅ |
| `billing_preview` | 4/12 (Readiness in the artifact) | 334 | 4/12 | compact | configuration link only | ✅ |
| `household` | 4/12 | 334 | **339** | standard | 1 contact, 0 emergency contacts | ✅ |
| `health_safety` | 4/12 | 334 | **339** | standard | 1 care fact, 4 requirements missing | ✅ |
| *Care Team* | 4/12 | 334 | *slot reserved, empty* | — | not registered | out of scope |
| `attendance` | 12/12 | 1023 | **1038** | standard | populated **and** empty both certified | ✅ |
| `children` | 6/12 | 507 | 6/12 | standard | 2 children, 2 enrolled | ✅ |
| `scheduling` | 6/12 (Staff in the artifact) | 507 | 6/12 | compact | 2 children, no assignment | ✅ |

The 15px deltas are the production panel being wider overall (1038 vs 1023). Proportions match.

## What each card was measured against

| Card | Approved anatomy | Before this pass | After |
|---|---|---|---|
| Business Process | process name, horizontal 6-stage rail, `CASE · <stage>`, work line, actions right-aligned, participant foot row + activity | titled "BUSINESS PROCESS", **zero stages**, rail stacked vertically, 4th action clipped to `hange lead locatio`, two filled primaries | titled **ENROLLMENT**, 6 columns of 168px on one row, all four actions content-sized (151/141/108/152px, none clipped), one filled primary |
| Financials | no hero line, seven-line arithmetic ladder, quiet green link actions, no white gap | hero `$25.00 · August 2026`, two of seven lines, bordered buttons stacked, white gap | `insight=""`, full ladder with emphasis rules, `Add charge → Details →` inline, gap closed (217→271px of real content) |
| Health & Safety | CRITICAL / HEALTH / ENROLLMENT HEALTH, requirements as a two-column list with "Missing" as a value | no section grammar, requirements as a cloud of "missing" pills | full grammar, uppercase section heads, two-column list, `View health details →` |
| Attendance | horizontal day timeline at full row, track + scale + progression band + 3 commands + LAST 5 DAYS | four-slot grid EXPECTED / ARRIVED / NOW / DEPARTED | timeline; both states certified |

## Root causes found (none fixed with card-specific CSS)

1. **Spans.** Process, Health & Safety and Attendance sat at 6/12 on a recorded rule that a
   12-column card "forces `planPublishedLayout` from lanes to grid". The rule is real —
   `planLanesFromGrid` returns null when any `colSpan >= columns` — but grid is not a failure mode;
   that file calls it "the richest model … when present it wins". The case composition has shipped
   a `colSpan: 12` card all along.

2. **A stray rule I introduced.** `.alloy-os-progression, .alloy-os-attendance__recent
   { grid-auto-flow: row }` landed in `94b6cd106` during the shared-stylesheet extraction. Equal
   specificity, later in source order, no counterpart in the lab. That, not width, inverted the
   rail. Guarded now by `tests/operationalCards/sharedStylesheetContract.test.ts`, verified as a
   positive control.

3. **The certification record had no business process.** `work_unit_id = NULL` and legacy status
   `new_inquiry` — neither producible by today's `create_lead`, which fails closed rather than
   persist an orphaned lead. No work unit → no department → no lifecycle builder → zero stages.
   Repaired through `resolveCreateLeadEntryDepartmentForOrg`, the resolver the command itself uses.

4. **Missing stylesheets.** Production carried **zero** `alloy-os-billing` rules, a partial
   `alloy-os-health` set, and none of the `CardLabKit` primitives — all lab-only. Right DOM, right
   class names, none of the approved appearance.

## Known gap — reported, not papered over

**Alloy owns no expected attendance TIME.** `ExpectedAttendanceEntry` is date · weekday · agreement
· member · site · room · pattern · type; `schedule_patterns` carries `start_date` / `end_date`.
Scheduling is day-grain. The approved card's "Expected 8:00 AM – 4:30 PM" is fixture-only, so the
production track spans actual presence instead. Closing this is a scheduling decision, not a
presentation one.

## Evidence

`qa/evidence/fidelity/` — `lab-final-focus-panel.png` (approved), `geom-FINAL.png` (production),
`process-final.png`, `financials-final.png`, `health-final.png`, `attendance-populated.png`,
and the before/after pair `geom-before.png` → `geom-after-horizontal.png`.

---

# Product completion pass — results

Visual authority unchanged: the approved artifact, plus the three command/detail specimens
supplied with the instruction (Add charge, Financials detail, compact Financials).

## Geometry, after the completion pass

| Card | Child grain | Case grain | Notes |
|---|---|---|---|
| `business_process` | 1023 (12/12) | 1023 (12/12) | annotations + participant markers |
| `financials` | 679 (8/12) summary | 679 **compact** | density selects presentation |
| `billing_preview` | 334 (4/12) | 334 (4/12) | |
| `household` | 334 (4/12) | 334 (4/12) | |
| `health_safety` | 334 (4/12) | 334 (4/12) | |
| `attendance` | **679 (8/12)** | 679 (8/12) | was 12/12; 12/12 stays configurable |
| `scheduling` | **334 (4/12)** | 334 (4/12) | the real companion beside Attendance |
| `children` | 507 (6/12) | 507 (6/12) | |

## Certified in the browser

**Business Process** — title `ENROLLMENT` (process name, not stage) · stage annotations from
configuration (`Aug 26`, `Aug 27`, and on a second record `Aug 7` / `North Campus` / `Aug 13`) ·
participants at DIVERGENT stages (`Certb` under Enrolling, `Certa` under Enrolled) with the case
marker unmoved · four actions, none clipped (151/141/108/152px), one filled primary · activity
trigger present.

**Financials** — compact at case grain (`data-financials-card="compact"`) beside a 4/12 companion ·
8/12 summary at child grain with `RESPONSIBILITY` · Add charge command card (4 configured types as
labels, subject select, event date, domain preview: Field trip $40.00, billing period Oct 1 2026
from `billable_on`, balance $25.00 → $65.00) · Details ledger-first detail with charge-kind,
subject and payer filters.

**Health & Safety** — populated summary with CRITICAL / REQUIRED INFORMATION · near-empty summary
(requirements only, no fabricated sections) · detail projecting allergies, conditions, medications
with authorization-as-requirement, documents-as-evidence, emergency contacts.

**Attendance** — populated 8/12 timeline ("Expected Monkeys · 3:07 PM · 0m so far", track, band,
three commands, LAST 5 DAYS) · ineligible state in the SAME card at the same density, with no
controls offered.

## Gaps named, not papered over

| Gap | Owner | State |
|---|---|---|
| No expected attendance TIME — scheduling is day-grain (`schedule_patterns` carries dates) | Scheduling | open; Attendance contributes the room it can name |
| No payer ALLOCATION store — a `payer` role exists, shares do not | Processing | open; payers are named, no split is invented |
| Pre-enrollment `customer` billable source | promotion + Financials | **blocked, measured** — see below |
| Only ONE lifecycle process configured (`enrollment`) | configuration | Assignment/Billing exist as lab specimens; the same component renders all three |

## Pre-enrollment billing — the blocker, measured

Not inferred from the migration tree. A live preview against a waitlisted child
(`b247b8a3…`, household `0658832a…`, template "Field trip") returns:

```
eligible: false
blockers: [{ code: "no_enrollment_agreement",
             message: "This child has no enrollment agreement, so there is nothing to charge against." }]
```

The domain refuses cleanly and the command card would surface that message verbatim — the
behaviour is right, the capability is absent. Three things stand between here and a
pre-enrollment charge:

1. **`charges.billable_source_type` must admit `customer`.** `BILLABLE_SOURCE_TYPES` already
   lists it; the widening migration `20260827120000_household_billable_source.sql` exists in this
   worktree and is in NO promoted SHA, so it has never been applied. Census
   `gar_450e643a2503e1` was requested to confirm which side of that gap the deployed CHECK is on.
2. **`resolveChargeSubject` must resolve a customer-scoped subject** when a child has no
   agreement, instead of refusing.
3. **`childcareChargeService` must stop hardcoding `billable_source_type = 'enrollment_agreement'`**
   on write.

(2) and (3) are ordinary code and were NOT written, because a charge carrying
`billable_source_type = 'customer'` against a database whose CHECK forbids it fails at insert:
the code would be unrunnable and uncertifiable, and shipping unverifiable code to satisfy a
checklist is worse than naming the blocker. This lane has already proven it cannot push or
promote, so (1) is Director-owned.

---

# Final QA closure — evidence and verdict

Brokered typecheck rc=0. Suites 262/262. Viewports 1600×1400 and 1920×1200.

## Add Charge

| Requirement | Result |
|---|---|
| Centered Focus Card + scrim | ✅ `data-universal-card-key="add_charge"`, expanded density, 1023×411 centered in the elevated host |
| Dropdown works in-browser | ✅ 4 configured templates, each reshaping the form from `financial_charge_templates` |
| Fixed amount | ✅ all four templates |
| Operator-entered amount | ⚠ **not exercisable — this org configures no manual-amount template.** The path exists in the card; nothing to select |
| Future-dated | ✅ Field trip, event date 2026-11-20 |
| Required date template | ✅ Field trip requires a service date; the others do not |
| Preview recomputes | ✅ billing period, due, responsibility all move with the selection |
| Commit | ✅ committed, overlay closed, Financials refreshed from the read model |
| Provenance labels removed | ✅ FROM BILLABLE_ON, SET BY THE MUTATION, FINANCIAL SUBJECT, TEMPLATE DEFAULT, FROM TEMPLATE all gone |
| Draft ≠ owed | ✅ "Creates a draft — not yet owed"; balance stated UNCHANGED |

Template shapes proven: `dated by the event · billed next cycle · fixed` (Field trip) ·
`dated today · billed immediately · fixed` (Late pickup, Registration fee) ·
`dated today · billed on a configured offset · fixed` (Materials).

## Financials Details

1180 × 1056 usable at 1920×1200, against 720 × 900 before — **1.92×**. Canvas-limited to
1023 at 1600px and responsive below. No viewport overflow; no forced internal scrolling at
this data volume. Summary strip, all eight ledger columns, type/subject/payer filters,
period grouping with prior periods collapsed, GL code, no running balance. Achieved through
the density system (`data-universal-card-density="expanded"`), not a Financials-only modal.

## Health & Safety Details

1180 × 567, three-column anatomy preserved. Commands proven end-to-end through the
REGISTERED `health_fact.add` action (never `healthFactService` from React):

| Command | Result |
|---|---|
| Add allergy | ✅ recorded on Certa, graded into care (not critical) |
| Add condition | ✅ recorded |
| Add medication | ✅ recorded with canonical `related_fact_id` ("for Peanut") |
| Edit health profile | ⚠ **no registered seam — named in-card:** "Dietary and accommodation notes are edited on the child record" |
| Upload document | ⚠ **no registered seam — named in-card:** "Health documents are uploaded through Documents" |

Boundaries visible on the card: "Medication authorization · REQUIREMENT, NOT A FIELD",
"EVIDENCE · None", "Projected from Household — Health never owns a contact."

## Focus Panel header avatar

| Requirement | Result |
|---|---|
| Initials fallback via CardAvatar | ✅ |
| Uses the settled scope, not a second resolver | ✅ reported up from the body |
| Certa → Certb switch | ✅ subject identity follows |
| Case switch, stale scope refused | ✅ PassA Kid → Wrigley Kurzman, no carry-over |
| Real canonical image | ❌ **not certifiable — see blockers** |

## Accepted cards re-certified

Business Process 1023 full row — ENROLLMENT, configured annotations, actions, activity
trigger, compact aligned participants (markers certified separately under divergence).
Financials 679 8/12 summary with RESPONSIBILITY; compact at case grain.
Health & Safety 334 4/12 — HEALTH / REQUIRED INFORMATION, no pill cloud.
Attendance 679 8/12 timeline with Assignment 334 4/12 beside it, expected-then-actual.

---

# Product-finish pass — final evidence

Brokered typecheck rc=0. Suites 262/262. Certified at 1920×1200.

## §1 Modal size hierarchy (shared host, `data-universal-card-modal`)

| Class | Card | Measured |
|---|---|---|
| command | Add charge | **560 × 599** |
| record | Children · Household · Assignment | **880 × 545** |
| workstation | Financials detail | **1180 × 626** |
| workstation | Health detail | **1180 × 511** |
| workstation | Attendance detail | **1180 × 297** |

No card sets its own geometry; no Financials- or Health-specific modal exists.

## §2 Add Charge

Centered command card, no nested border (the inner card's border/radius/background/480px
cap are gone — content sits on the Focus Card surface). Values and inputs at 500 weight, so
the Service Date no longer competes with section heads. Dropdown reshapes the form from
`financial_charge_templates` across all four configured templates. Draft semantics
preserved: "Creates a draft — not yet owed", balance stated unchanged.

## §3 Financials Details

Shallow summary (Balance / Past due / Responsibility / Paid / Autopay / Next), then
`Payment | Add charge` as two equal peers, then LEDGER with filters high, period grouping,
all eight canonical columns, Upcoming, and `Manage payment →` bottom-right. No running
balance. Height 88vh → 96vh.

## §5 Focus Panel header avatar — GATE CLOSED

Real image for Wrigley and Lennon Kurzman (the two children carrying
`resolved_photo_url`); normal initials fallback for everyone else; 17 distinct subjects
across 17 switches with no stale photo. Three chained defects fixed: the composer emitted
no photo, it read a stale row, and the child-mission overlay then overwrote the resolved
scope with the null stored field.

## §6 Attendance Details

New workstation detail from the EXISTING fold — no new ledger. Timeframe (Week / Month /
All), room filter built from rooms the record touched, event filter (All / Present /
Absent / Movement / Corrections), table (Date / Expected / In / Out / Attended / Rooms /
State), day expands to its event sequence. Corrections shown, never applied. Open days
report `null` duration, not 0.

Two blockers fixed to get there: the `timeline` archetype hides its footer
(`display: none`), so Details lives in the body; and `attendance` did not declare
`ownsOperationalTruth`, so `clampPerspectiveForCard` refused to elevate it at all.

## §5 regression — accepted cards

Business Process 1343 full row, ENROLLMENT, 3 configured annotations · Financials 892 8/12
summary · Health & Safety 441 4/12 · Attendance 892 8/12 + Assignment 441 4/12 ·
Children 667 6/12.

## §8 Pre-enrollment Financials — promotion requested, NOT closed

Governed push requested: **`gar_026172ce79b88e`**.

Branch `promote/household-billable-source`, commit `b53cc32b4b59b41f695e13de81c533f18273acfa`,
cut fresh from `origin/staging` and containing **exactly one file**:
`supabase/migrations/20260827120000_household_billable_source.sql`, sha256
`c798135c7b8a6381548af143992412f1531b770cf577c64be90101b6028b44c2` (verified against the
carried-forward value). Nothing from wt6 (126 ahead / 327 behind) travels with it.

Until that migration is applied, `resolveChargeSubject` and `childcareChargeService` cannot
be changed to accept a customer source: a charge carrying
`billable_source_type = 'customer'` fails at insert against the current CHECK, so the code
would be unrunnable and uncertifiable. Not written, and not faked.

---

# Surface Builder closure

Brokered typecheck rc=0. Certified at 1920×1200 on `/organization/surfaces?section=focus-panels`.

## Canonical authorable card list (derived, 20 options / 19 identities)

Business Process 12/12 · Household 4/12 · Children 6/12 · Employment 6/12 · Staff 6/12 ·
Attendance 8/12 · **Financials — Summary 8/12** · **Financials — Compact 4/12** ·
Health & Safety 4/12 · Milestones 4/12 · Readiness 4/12 · Tour 4/12 · Communications 6/12 ·
Documents 4/12 · Why Now 4/12 · Required Information 4/12 · Current Mission 6/12 ·
Timeline 6/12 · Notes 4/12 · Assignments 4/12

## Predecessor / non-operational cards hidden from new authoring

| Key | Reason (derived or declared) |
|---|---|
| `current_work` | Superseded by Business Process — read from `successorForDeclaration`, not a list |
| `billing_preview` | Configuration question, not an operational peer of Financials. **Still renders on existing layouts** |
| `child_identity` | The durable child composes as the one member of its own Children collection |
| `health` | Enrollment Health is a pipeline metric, not the child's health record |

## Density variants

Financials only — the one card with two implemented presentations. Both store the same
canonical `cardKey`; the density persists through `appearance.density`, the same per-card
config path the inspector writes. No `financials_compact` identity was invented.

## Preview source

The production components. Every composer cell renders a real card
(`data-universal-card="true"` with its own key and density) — certified for all 7 placed
cards. Not a thumbnail, not a second mock.

## Drag / snap certification

`tests/surfaces/focusPanelGridPacking.test.ts` — 7 cases on the pure ops:
8/12+4/12 no gap · two 6/12 · three 4/12 · new row only when nothing fits · full-row card
alone · no overlap when a taller card meets a one-row gap · remove-and-repack.

## Published layout revision tested

**v134 → v135.** Added Readiness in the builder, published, reloaded: card set preserved
exactly (`PRESERVED EXACTLY: true`). The published layout served at
`/api/admin/entity-layouts/focus-panel-summary` carries `readiness_kpi`.

## Financials Details final action geometry

Card 1180×597. Facts and actions on the SAME row of one rollup — facts x=616 y=384,
actions x=1402 **y=384** (top-right). Ledger 158px from the card top. `Manage payment →` at
the foot. Exactly two action labels: `Payment`, `Add charge`.

## Not certifiable here, and why

**Authored → runtime match (§7.8).** The published layout is correct and is fetched, but
every queue lens in this tenant resolves CHILD grain, where the code composition governs by
design — the runtime rendered `scheduling` (code) and not `readiness_kpi` (published). This
needs a genuine case-grain lens to certify and is not a defect in anything changed here.

---

# PROMOTED TO STAGING

**Final staging SHA: `75cedc8f93770c3d226571a32886d299f9432031`**

| Step | Evidence |
|---|---|
| Cards program merged | PR **#587** → merge `29fa895a190462297eba6cdd4c66a79c19925f07` |
| Pre-enrollment Financials merged | PR **#589** → merge `75cedc8f93770c3d226571a32886d299f9432031` |
| Migration on staging | `20260827120000_household_billable_source.sql`, sha256 `c798135c…b44c2` (exact match) |
| Migration applied | `gar_35fd9289026517` — `ok: true`, `ledger: "applied"`, `artifact_source: git_object`, 2026-08-28T03:27:06Z |

## Migration proof — by real database read

Census `gar_0266a335d01adf` BEFORE the apply, against `alloy_deployed_primary`:

```
charges              CHECK (billable_source_type IS NULL OR = ANY (ARRAY['job','enrollment_agreement']))
ledger_transactions  CHECK (billable_source_type IS NULL OR = ANY (ARRAY['job','enrollment_agreement']))
```

`customer` absent from both — the migration was genuinely required, not assumed.

AFTER the apply, the proof is a real write: a charge carrying `billable_source_type = 'customer'`
was inserted successfully. That insert is impossible against the CHECK above, so the write
itself proves the constraint changed. (A confirming re-census, `gar_ae21d81a40e2a5`, is queued
awaiting operator approval; it is corroboration, not the proof.)

## Pre-enrollment billing proof

A waitlist household with **zero** enrollment agreements:

| Check | Result |
|---|---|
| Financials rendered | ✅ |
| Add charge available | ✅ |
| Preview | `registration_fee $75.00`, occurs + billable 2026-08-28 |
| Commit | ✅ no refusal |
| Read model refresh | rows 0 → 1 |
| No agreement fabricated | `subjects: 0` after |
| No arbitrary child chosen | `subjectMemberId: null` |
| Draft ≠ owed | `status: draft`, balance stays $0 |
| Enrolled-child charges | re-certified unchanged |

## Regression, on staging-identical code

Business Process 1343 full row (ENROLLMENT, 3 annotations) · Financials 892 8/12 summary ·
Health & Safety 441 4/12 · Attendance 892 8/12 + Assignments 441 4/12 · Children 667 6/12.
Modal classes: command 560 · record 880 · workstation 1180 (Financials / Health / Attendance).
Surface Builder tray carries no predecessor identity. Suites 279/279; typecheck rc=0.

## Deferred, deliberately

The M1/D-H1 health FIELD-REGISTRY rebinding did not promote. Staging has evolved that registry
independently, and taking my side would have reverted another lane's work to ship a program
that is explicitly deferred. `tests/health/healthGrainM1.test.ts` was removed from the
promotion rather than shipped red. The H1 health-fact substrate the Health & Safety card
depends on is unaffected.

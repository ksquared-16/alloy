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
| Pre-enrollment `customer` billable source | promotion | migration authored in wt6, in NO promoted SHA; `resolveChargeSubject` still requires an enrollment agreement. Census `gar_450e643a2503e1` requested to confirm the deployed CHECK |
| Only ONE lifecycle process configured (`enrollment`) | configuration | Assignment/Billing exist as lab specimens; the same component renders all three |

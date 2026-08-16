---
owner: product
status: sprint
last_reviewed: 2026-08-15
sprint: operations-workspace-convergence (slot 1)
base: origin/staging @ 11df0cdce
supersedes: []
---

# Operations workspace convergence — Stage A–F audit

**AUDIT ONLY. Nothing here is implemented.** PR [#436](https://github.com/ksquared-16/alloy/pull/436)
is paused with four local commits unpushed.

Target IA:

```
OPERATIONS
  WORK    Roster · Attendance · Staff · Children
  STUDIO  [existing Assignment Studio capabilities]
```

Assignment stays canonical data and business logic. "Assignments" stops being a workspace noun.

---

## The finding that shapes every recommendation

**Half of this convergence has already happened, and the remaining half is smaller than the target
IA suggests.**

1. `Roster`, `Daily Roster` and `Attendance` were ALREADY moved out of the Assignments workspace
   into the Roster workspace. `MOVED_TO_ROSTER` in `lib/adminV2/workspaceModalEvents.ts` forwards
   every old deep link before the Assignments modal opens.
2. What remains in Assignments Work is exactly **two** tabs: `Overview` and `Assignments` (the
   ledger index + bulk commands). Everything else there is Studio.
3. **Every assignment mutation is already a Focus Panel card action.** `SchedulingCard.tsx` invokes
   all six canonical capabilities (`assignment.create`, `.set_primary`, `.archive`,
   `.promote_proposed`, `.delete_proposed`, and room change through
   `resolveProgramOnRoomChange`), and it shares `AssignmentSummaryDetail.tsx` with the workspace.
   The mutation surface is not workspace-bound; it is card-bound already.
4. **Roster already consumes the assignment ledger projection.** `RosterSurface` receives
   `assignmentSubjects: AssignmentRosterSubject[]` — the same type `AssignmentRosterPanel` renders.
   Roster reads commitments today and deliberately writes nothing, routing mutation out through
   `onManageAssignment`.

So the convergence is mostly: **stop routing outward**, absorb two Work tabs, and re-parent Studio.

---

## 1. Assignments Work inventory

Source: `app/adminV2/scheduling/schedulingSections.ts`, `SchedulingWorkspace.tsx`.

| Work capability | Classification | Canonical owner | Future Operations placement |
|---|---|---|---|
| **Overview** — attention counts (multiple/upcoming assignments, future primary changes, missing types, children missing assignments, conflicts, expiring soon, changes awaiting review) | Roster projection | derived signals over the assignment ledger (`AssignmentAttentionSummary`) | Operations → Roster. It is an attention read over commitments; it is not a separate destination. |
| **Overview** — room capacity / ratio risk (`RosterSummary`: rooms near capacity, ratio risks, fill, rooms-in-ratio) | Roster projection | roster read models | Operations → Roster (it is already roster subject matter; its own comment says so) |
| **Assignments** — the ledger index (subject rows, Primary/Secondary, room, type, weekdays, effective dates, status, proposed vs committed) | Roster projection | `AssignmentRosterSubject` | Operations → Roster. **Same type Roster already renders** — this is a lens/grouping of a projection Roster has. |
| **Add Assignment** | Assignment mutation | `assignment.create` (RegisteredAction) | canonical action, invoked from Roster row + contextual card |
| **Bulk Assignment** (multi-subject, with preview) | Assignment mutation | `assignment.create` ×N | canonical action, invoked from a Roster multi-select |
| **Bulk Room Change** (effective-dated) | Assignment mutation | `assignment.change_room` | canonical action, invoked from a Roster multi-select |
| **Bulk Primary Change** | Assignment mutation | `assignment.set_primary` | canonical action, invoked from a Roster multi-select |
| **Bulk Archive** | Assignment mutation | `assignment.archive` | canonical action, invoked from a Roster multi-select |
| Promote / delete proposed | Assignment mutation | `assignment.promote_proposed` / `.delete_proposed` | already on the contextual card; no workspace surface needed |
| **Actions panel** (`SchedulingActions.tsx`) | Other — **documentation, not capability** | none | **Delete.** Its own docblock says it is "informational only — not a parallel Actions page for execution". It describes where commands live. Once there is one workspace it describes nothing. |

All six capabilities are `executionOwner: "registered_action"`, `supportedSubjects: ["child",
"person"]`, `supportsPreview: true`, `confirmationPolicy: "confirm"` in
`lib/platform/commands/capabilityRegistry.ts`. **None of them is owned by the workspace.**

## 2. Assignments Studio inventory

| Studio item | Configuration owner | Shared with | Future Studio placement |
|---|---|---|---|
| **Assignment Categories** (`types`) | `lib/operationalAssignments/assignmentTypeService.ts` → `/api/admin/assignment-types` | org-scoped; behaviour rules in `assignmentTypeBehavior.ts` | Moves **unchanged** |
| **Patterns** (`patterns`) | `/api/admin/schedule-patterns`, canonical `schedule_patterns` | **shared with Locations → Schedule** (`LocationSchedulePatternsSettingsPanel`) — same table, same endpoints, no Studio-only store | Moves **unchanged**. ⚠ Do not "unify" with Locations; a Pattern belongs to ONE site by design. |
| **Validation** (`validation`) | governed calculation inventory (`presentCalculation` / `presentFamily`), read-only | calculation registry | Moves **unchanged** |
| **Templates** (`templates`) | — | — | Hidden today, retained only for deep-link compatibility. Keep the resolver entry, keep it unlisted. |

**No configuration concept is renamed.** "Assignment Categories", "Patterns" and "Validation" keep
their names and their runtime owners. Re-parenting is a navigation change only.

## 3. Roster gaps — what an operator would actually lose

Only real gaps. Each is scoped to the smallest truthful home.

| # | Missing capability | Why it is a real gap | Smallest way it belongs in Roster |
|---|---|---|---|
| G1 | **A cross-subject assignment index** | Roster is site/day/room-shaped. The ledger answers "all assignments for this site, grouped by subject, regardless of today's operating plan" — including subjects with no expectation today. | A **lens on the existing Roster section** (`Rooms · Staff · Assignments`), not a new section. Roster already holds `assignmentSubjects`; this renders the same array grouped by subject instead of by room. |
| G2 | **Multi-select + bulk assign / room change / primary / archive** | The contextual card is single-subject. Bulk exists only in `AssignmentRosterPanel`. | Selection toolbar on the G1 lens, invoking the same four canonical capabilities with the existing preview (`BulkAssignmentPreviewRow`). No new endpoint. |
| G3 | **Assignment mutation from a Roster row** | `onManageAssignment` currently *leaves* Roster for the Assignments workspace. With that workspace gone, the handoff has no destination. | Re-point `onManageAssignment` at the durable record host with the Schedule context selected (see §4). Delete the outward dispatch. |
| G4 | **Attention counts over the ledger** | Overview's eight signals have no Roster equivalent. | An attention strip on the Roster section, or fold into the existing Roster header. Lowest value of the four — confirm with Kelly before building. |
| G5 | **Studio reachability** | `SchedulingCard`'s "Configure types" jumps to `scheduling → studio → types`. | Re-point to Operations → Studio → Assignment Categories. One call site. |

**Explicitly NOT gaps** — already present and working:
create / edit / end / set primary / promote / delete proposed (all on `SchedulingCard`), effective
dates (`effectiveFrom` / `effectiveTo` in `AssignmentSummaryDetail`), child **and** staff subjects
(`subjectType` on every row; all six capabilities declare `["child","person"]`), site/room/program
(`scopeRoomsForAssignmentPicker`, `programCategoryIdForRoom`), schedule patterns (Studio, unchanged),
proposed vs committed (`commitmentKind` + `AssignmentProposalControls`).

## 4. Assignment contextual-card support

**A configured Assignment-context Child card does NOT exist. A canonical Assignment CARD does.**

- The card exists: registry key `scheduling` (`focusPanelCardRegistry.ts:125`,
  `ownsOperationalTruth: true`), rendered by `SchedulingCard.tsx`, with full canonical action wiring.
- The gap is **context resolution, not the card.** `durableRecordContextOptions` sets
  `resolvesConfiguredSurface: false` for every non-process context, with the stated reason "No
  business process ⇒ nothing to resolve a published composition against." Schedule is
  `kind: "schedule"`, so `Schedule · Toddler A` renders `data-contextual-card="unconfigured"` today.
- The second gap: `deriveChildFocusPanelCards` builds **only** `child_identity`, and `scheduling` is
  not declared for the `child` grain in the registry — so the durable child record has no Scheduling
  card at all.

**Smallest truthful path** (no duplicate assignment store — `SchedulingCard` already reads
`projectCompactScheduleForIdentity` and the canonical assignment rows):

1. Declare `grains: ["opportunity", "child"]` on the `scheduling` card.
2. Build its model in `deriveChildFocusPanelCards` from the canonical assignment facts the durable
   child subject can already reach.
3. Give the Schedule context option a **non-process configured surface** — the honest form is a
   third state, not a fake business process. Do **not** invent a `schedule` BP to make
   `resolvesConfiguredSurface` true; that would put a process in the ledger that does not exist.

⚠ The `child.first_name` finding from slice 6 applies here: a capability can be executable and
unreachable. Check that the card's row/offer gate admits the action, not just that the authority runs.

## 5. Navigation convergence — old → new

| Old | New |
|---|---|
| Sidebar `Assignments` (`dataAttr="scheduling"`) | **removed** |
| Sidebar `Roster` (`dataAttr="roster"`) | `Operations` — one entry |
| modal key `"scheduling"` | **removed** from `AdminV2WorkspaceModalKey` (do not leave inert — the coordinator's own comment says a key nothing can open is a trap) |
| modal key `"roster"` | `"operations"` (rename) or keep `"roster"` to avoid churn — **decide explicitly** |
| `dispatchAdminV2OpenSchedulingModal({workView:"overview"\|"assignments"})` | `dispatchAdminV2OpenOperationsModal({mode:"work", section:"roster", lens:"assignments"})` |
| `…({mode:"studio", studioView:"types"\|"patterns"\|"validation"\|"templates"})` | `…({mode:"studio", studioView: same})` — studio vocabulary unchanged |
| `…({workView:"roster"\|"daily_roster"\|"attendance"})` | already forwarded by `MOVED_TO_ROSTER`; **keep the forwarder** |
| `ASSIGNMENTS_WORKSPACE_DEEPLINK_KEY` sessionStorage | must be read-and-migrate, or in-flight sessions lose their deep link |
| `RosterWorkspace.onManageAssignment` → Assignments | → durable record host, Schedule context (G3) |
| `SchedulingCard` → `studio/types` | → Operations Studio (G5) |
| `data-adminv2-sidebar-modal-nav="scheduling"` | asserted by certification — see below |
| `data-scheduling-section` | keep the attribute or update every spec that reads it |

**Certification touching this**: `roster-handoffs`, `roster-one-surface`, `roster-workspace-move`,
`roster-v1-acceptance`, `roster-staff-lens`, `roster-week-staffing-truth`,
`attendance-record-attention`, `drawer-eradication`, `search-focus-panel`,
`communications-location-identity`. `roster-handoffs` is the one that pins the outward dispatch and
will need rewriting rather than adjusting.

## 6. Impact on PR #436

Nothing in #436 is invalidated. It is all *upstream* of the IA change.

| #436 work | Verdict |
|---|---|
| one subject-context authority (`lib/context`) | **correct, and now load-bearing** — the Schedule context option in §4 is its output |
| Search record vs work intent | **correct**; §6 below refines destinations only |
| contextual durable record host | **correct, and now the target of G3** |
| contextual-card configuration reuse | **correct**; §4 extends it to a non-process context |
| Records → Staff/Children re-home | **correct** — those become two of the four Operations WORK sections unchanged |
| Child edit / save / return | **correct** |
| durable Household | **correct** |
| Staff display/context convergence | **correct** |
| listener fix (`496e11c79`) | **correct and independent** — a work-unit route still needs a movement |
| `rosterSections.ts` docblock | needs a wording pass: it says "Assignments owns the durable commitments" as a *peer workspace*. The ownership statement stays true; the peer-workspace framing does not. |
| `SidebarRosterNavItem` docblock | same — "Peer of Assignments, not a tab inside it" becomes wrong. |

**Recommendation: push #436 as-is once you authorize it.** It is green, it is not in conflict, and
holding it makes the convergence a bigger diff against a moving base.

## 7. Recommended implementation slices

Smallest sequence. Each is independently shippable and independently certifiable.

| Slice | What | Why first/last |
|---|---|---|
| **O-0** | Land #436 (push, CI, merge) | Everything below builds on `lib/context` and the durable host. |
| **O-1** | Scheduling card at child grain (§4 steps 1–2) + Schedule context resolves a surface (§4 step 3) | Unblocks G3 and G5. Pure addition — no navigation change, nothing to un-wire, ships behind the existing IA. |
| **O-2** | Assignments **lens** on the Roster section (G1) + selection toolbar with the four bulk capabilities (G2) | Absorbs the ledger tab. Still no IA change — the Assignments workspace can remain open while this proves out. |
| **O-3** | Re-point the two outward handoffs (G3, G5) at their new in-workspace destinations | After O-1/O-2 the destinations exist. Roster stops routing outward. |
| **O-4** | Rename the workspace to **Operations**, add the WORK/STUDIO mode split, re-parent the three Studio sections unchanged | Now purely navigation: every capability already has a home. |
| **O-5** | Delete the Assignments workspace: sidebar item, modal key, `SchedulingModal`, `SchedulingActions`, `schedulingSections` Work half. Keep `MOVED_TO_ROSTER` and the studio deep-link vocabulary. Migrate `ASSIGNMENTS_WORKSPACE_DEEPLINK_KEY`. | No parallel workspace remains. Deletion is verified by failing-test IDENTITY against a baseline, never by count. |
| **O-6** | Overview attention signals into Roster (G4) — **only if Kelly confirms the value** | Lowest value; may be dropped entirely. |

**Decisions needed from Kelly before O-4:**
1. Modal key — rename `"roster"` → `"operations"`, or keep `"roster"` and change only the label?
2. Is the WORK/STUDIO split a **mode toggle** (as Assignments has today) or a **section group** in
   one tab strip? The target IA is drawn as a group; Assignments implements a toggle.
3. G4 — keep the eight Overview attention signals, or drop them?

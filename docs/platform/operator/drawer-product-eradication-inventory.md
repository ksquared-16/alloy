---
owner: operator
status: canonical
last_reviewed: 2026-08-12
supersedes: []
---

# Drawer Product Eradication — live caller inventory

**Sprint:** `drawer-product-eradication` (Slot 1, base `origin/staging@3ac7aa06f`).
**Purpose:** classify every remaining reference to the generic modal drawer product so the migration
operates on evidence rather than on filenames.

Read with [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md) (the sunset position) and
[`focus-panel-architecture-vocabulary.md`](./focus-panel-architecture-vocabulary.md) (what "drawer"
means in a path name).

---

## What the obsolete product actually is

Not "any module named `drawer*`". The obsolete **product** is one thing: the portaled
`role="dialog" aria-modal="true"` panel rendered by `components/admin/Drawer.tsx`
(`.adminv2-drawer-modal-panel` / `.adminv2-drawer-sidebar-panel`) with its backdrop, mounted through
`EntityDrawerOperatingShell`.

Everything below is derived from **when that element can appear on an operator surface**
(`/workspace/*`, `/organization/*`). Three facts decide it:

| Fact | Source |
|---|---|
| Only `opportunities` and `persons` resolve to a rendered drawer at all. Every other entity type resolves to `legacy` and `AdminEntityDrawer` returns `null` (fail-closed, no legacy runtime). | `lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerRuntimeRoute.ts` |
| The **opportunity** drawer suppresses itself on `/…/work-unit/…` paths — there the inline Focus Panel region owns the record surface. It still mounts as a modal on every other drawer-host path (`/workspace` home, `/settings/*`, `/admin/processing`). | `components/admin/AdminEntityDrawer.tsx:29` |
| The **person/child** drawer has **no such suppression**. It mounts the modal on every host path, including work-unit surfaces. | `components/admin/AdminEntityDrawer.tsx:34` |

So the operator-visible obsolete product reduces to exactly two live shapes:

* **P1 — person/child modal**, anywhere, from any caller that reaches `openDrawer({type:"persons"})`.
* **P2 — opportunity modal on a non-work-unit operator path**, which additionally renders the whole
  legacy LayoutDoc overview body (`focusPanelActive === false` there), which in turn is the only
  surface that still exposes the drawer-era person/child link stack.

Killing P1 and P2 makes the legacy overview body and the person drawer runtime unreachable, which is
what makes Phase 4 deletion safe rather than speculative.

---

## A. Operator-visible obsolete product behaviour — migrate, then delete

| Caller / module | Current behaviour | Operator-visible? | Replacement | Status |
|---|---|---:|---|---|
| `app/adminV2/components/MyTasksPanel.tsx` (`onOpenRecord`, `onOpenCurrentWork`) | `openDrawer({opportunities})` from the workspace task panel → **P2** | yes | attention movement → host Work Unit → subject (+ `current_work` ASPECT for the second) | migrate |
| `app/adminV2/messages/InboxPanel.tsx` (`onOpenRecord`) | `openDrawer(selectedDrawerTarget)` → **P2** | yes | attention movement → host Work Unit → subject | migrate |
| `app/adminV2/communications/CommandCenterShell.tsx` (`openRecordLink`) | `openDrawer({type: link.type})` for opportunity **and person** links → **P1 + P2** | yes | attention movement; person link → `household` ASPECT, item = person id | migrate |
| `components/adminV2/ContextualRecordOpenListener.tsx` ← `app/adminV2/components/QuickMessageModal.tsx` | window event → `openDrawer({opportunities})` → **P2** | yes | same event, applied as an attention movement | migrate |
| `lib/admin/actions/applyRegistryResolvedActionClient.ts` — `action_type === "open_drawer"` and `execution_result.kind === "open_drawer"` | registry action opens the record modal → **P2** | yes | resolver-owned focus intent; the action states *what to look at*, the platform resolves *where* | migrate |
| `components/presentation/rightRail/WorkUnitRightRailActions.tsx`, `WorkspaceRightRailActions.tsx` | pass `openDrawer` into the registry client (above) | yes (indirect) | pass the focus dispatcher instead | migrate |
| `lib/tours/actions/tourBookingActionClient.ts` (`openTourScheduleModalForOpportunity`) | `openDrawer({opportunities})` before raising the tour modal → **P2** | yes | attention movement, then the tour modal event unchanged | migrate |
| `lib/layout/runtime/dispatchLayoutRuntimeOpenDrawer.ts` (+ `resolveLayoutAdornmentOpenDrawer`, `dispatchLinkedDrawerOpen`, `buildQueueLayoutRuntimeAdornmentHandler`) | every layout `open_drawer` adornment for `person`/`child` → `openDrawer({persons})` → **P1** | yes | ASPECT card focus: `children`/`household` card + item id, on the host record's panel | migrate |
| `lib/layout/layoutV2Schema.ts` / `layoutV2.ts` — `action.type === "open_drawer"` | the only adornment action vocabulary | yes (config) | canonical `focus_subject` intent; `open_drawer` accepted as a deprecated alias so published tenant layouts keep working | migrate |
| `lib/layout/defaultChildLayouts.ts`, `defaultLeadLayouts.ts`, `defaultPersonLayouts.ts` | platform default layouts author `open_drawer` | yes | authored as `focus_subject` | migrate |
| `lib/layout/layoutEditorActionCatalog.ts`, `layoutEditorDisplayConfig.ts`, `layoutEditorActionButton.ts`, `components/layout/LayoutConfigClient.tsx`, `components/adminV2/settings/OpportunityDrawerLayoutFieldSettings.tsx` | Surface/Layout builder offers "Open record drawer" as an authoring choice | yes (config authoring) | offer contextual focus; stop offering `open_drawer` | migrate |
| `components/layout/DrawerHouseholdPersonLinkAvatar.tsx`, `DrawerHouseholdChildLinkAvatar.tsx`, `components/layout/child/ChildFamilyMembersCardList.tsx` | hardcoded `open_drawer` adornments in runtime components | yes | `focus_subject` | migrate |
| `components/forms/admin/FormIntakeRuntimeOrchestrationPanel.tsx`, `components/forms/workspace/IntakeWorkspaceFilterPanelView.tsx`, `components/forms/workspace/SubmissionQuickReviewModal.tsx` | `openDrawer({opportunities})` from intake surfaces → **P2** | yes | attention movement | migrate |
| `components/admin/taskAssist/TaskAssistCompactReminderCard.tsx`, `TaskAssistOpportunityWorkspace.tsx` | `openDrawer({opportunities})` from the AI command surface → **P2** | yes | attention movement | migrate |
| `components/adminV2/settings/LocationsHierarchySettingsClient.tsx` | `openDrawer` for a location record | yes (config surface) | canonical `/settings/locations` route (already the canonical location surface) | migrate |

---

## B. Canonical Focus Panel infrastructure carrying legacy names — keep

These are the reveal / payload / selection substrate the **inline** Focus Panel runs on. They are not
the modal product, and deleting them deletes the replacement.

| Module | Why it stays |
|---|---|
| `contexts/AdminDrawerContext.tsx` | the ONE selection/open-state authority; the inline panel reads it |
| `components/presentation/workUnit/InlineOpportunityFocusPanel.tsx` | the canonical record surface on work-unit paths |
| `components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx` (Focus Panel branch) | composes the panel body; its `focusPanelActive` branch is canonical |
| `lib/adminV2/viewModel/drawer/**` — composed payload, caches, prepare/dedupe, transition coordinator | payload infrastructure; the panel's warm path |
| `lib/admin/drawer/**` seeds, snapshot cache, prefetch | reveal + first-paint contract |
| `lib/perf/adminV2DrawerPerf.ts`, `lib/ui-v2/adminV2LoadingGeometry.ts` | telemetry / geometry |
| `lib/adminV2/runtime/operationalSubject/useWorkUnitDefaultOperationalSubjectAutoOpen.ts` | establishes the **inline** panel's default subject on a work-unit surface — never a modal |
| `components/admin/Drawer.tsx` | still renders action modals and the non-operator surfaces below |

**Naming debt (documented, not actioned here):** `openDrawer`, `composedDrawerPayload`, `vmDrawer/*`,
`DrawerCardFocus`, `drawerSubjectContext`. Renaming these is a separate runtime-sensitive sprint
(`focus-panel-architecture-vocabulary.md` phases F/G); doing it inside this migration would make the
behavioural diff unreviewable.

---

## C. Non-operator surfaces — out of the operator product, retained

| Surface | Classification |
|---|---|
| `app/legacy-admin/**` (20 clients: contacts, customers, jobs, locations, financials, workflows, …) | archived admin, not an operator surface (`alloy-operator-surfaces`). Their `openDrawer` types resolve to `legacy` → `AdminEntityDrawer` renders nothing; they carry their own `AdminLayout` drawer. Not reachable from `/workspace` or `/organization`. |
| `app/adminV2/workspace/drawer-probe/page.tsx` | dev integration probe |
| `lib/admin/drawer/personDrawerDevDirectOpen.ts` | dev-only direct open |
| `app/(proof)/adminV2/layout-proof/**` | layout proof harnesses, explicitly not wired to `AdminEntityDrawer` |
| `app/dev/queue-record-doctrine-review/**`, `components/layout/QueueRecordLayoutPreview.tsx` | preview/gallery; the only consumers of `OperationalQueueRecordRow` |
| `docs/archive/**`, `docs/sprints/archive/**` | history |

---

## D. Already canonical — verified, no change needed

| Path | Evidence |
|---|---|
| Queue row selection (`WorkspaceQueueRow`, `CondensedQueueRow`) | selects a subject; no `openDrawer` |
| Focus Panel card → card handoff (`HouseholdCard.openChild`, `openChildrenSection`) | `coordination.requestFocus(card, item, source)` |
| Search → Focus Panel | `SearchAttentionListener` + `attentionCardFocus` (PR #409) |
| `components/admin/opportunity/*` person panels, `RelatedRecordsTabs`, `OpportunityHouseholdPeoplePanel`, `OpportunityInquiryChildrenRegistryActions` | reachable **only** from the legacy overview body (P2). `OpportunityHouseholdPeoplePanel`, `OpportunityInquiryChildrenRegistryActions` and `RelatedRecordsTabs` have **no importers at all** — dead once P2 is gone. |

---

## Finding: capabilities whose only mount was the legacy overview body

Deleting the overlay made `OpportunityDrawerOverviewBody` and
`OpportunityDrawerInquiryWorkflowOverview` unreachable, and with them a set of components that had
**no other mount**. They are retained, unmounted, rather than deleted — the eradication is of the
drawer product, not of unrelated capability that happened to be carried by it.

| Capability | Module | State |
|---|---|---|
| Per-child **Decision** work item + Close family (PR #355) | `DecisionCurrentWorkCard` + `participantDecisionClient` + `familyCloseClient` | retained, **no mount** |
| Packet review overview | `OpportunityPacketReviewOverview` | retained, **no mount** |
| Tour booking lifecycle bar / tour date block | `OpportunityTourBookingLifecycleBar`, `OpportunityInquiryTourDateBlock`, `useOpportunityActiveTourBookings` | retained, **no mount** |
| Inquiry summary activity | `OpportunityInquirySummaryActivity` | retained, **no mount** |

> **RESOLVED (August 2026).** Every capability below is now mounted in its canonical owner or
> retired with evidence — see
> [`post-drawer-capability-convergence.md`](./post-drawer-capability-convergence.md). Two of them
> turned out to be LIVE DEFECTS rather than dormant code: the packet-review action reached the
> operator exactly when it mattered and did nothing, and a work template requiring all participants
> resolved could not be completed by any route.

**This is not a regression introduced here.** That body only rendered when `focusPanelActive` was
false, and on `/workspace/work-unit/*` the inline Focus Panel renders instead — so these were
already invisible to an operator on the canonical surface. It is the same class of finding the Focus
Panel body already records for the Trust enhance-draft control: "produced, persisted and audited
while being invisible to the operator it was produced for."

`tests/lifecycle/participantDecisionSurfaceAndRetirement.test.ts` asserted the Decision card had no
mount, so the day one appeared the test would fail. It did, and that assertion is now the real
mount-site test.

Genuinely drawer-infrastructure orphans from the same cascade **were** deleted: the layout-runtime
shadow diagnostics, the drawer body status, the relationship-panel skeleton, and the drawer record
action-button classes.

---

## Execution order

1. **Resolver** — one platform module answering *record → host Work Unit + host record*, extracted
   from the Search enrichment resolver that already does it correctly, plus one client adapter that
   turns an operator intent into a kernel attention movement.
2. **Record openers (P2)** — every caller in §A that opens an opportunity record.
3. **Layout adornments (P1)** — `open_drawer` → `focus_subject`, resolved to an ASPECT card focus.
4. **Deletion** — person/child modal runtime, legacy overview body, dead helpers, obsolete tests.
5. **Negative guards** — repo-level tests that no operator path can produce the modal.

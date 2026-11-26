---
owner: operator
status: canonical
last_reviewed: 2026-08-12
supersedes: []
---

# Post-eradication capability convergence — inventory and canonical owners

**Sprint:** `post-drawer-capability-convergence` (Slot 1, base `origin/staging@a75c1fcf6`).
**Predecessor:** [`drawer-product-eradication-inventory.md`](./drawer-product-eradication-inventory.md) —
which deleted the modal record product and recorded four capabilities left without a mount.

This resolves that finding. Each capability is traced to the runtime that already owns its
semantics, and mounted there — never by copying the old presentation into a new card.

---

## Two of these were LIVE DEFECTS, not dormant code

The eradication sprint classified these as "retained, unmounted", on the reasoning that the legacy
overview body never rendered on work-unit surfaces anyway. That is true of the *presentation*. It is
not true of two capabilities, because the rest of the platform still routes operators to them:

### 1. Packet review is a live action that does nothing

`review_enrollment_packet` is a **registered action**, and it is *server-gated to appear only when a
completed packet session is actually awaiting operator review*
(`filterOpportunityActionsForRuntimeGates` → `opportunityHasReviewableEnrollmentPacket`). So it
appears in Current Work / right rail / BOS **precisely when there is real work**, and
`applyRegistryResolvedActionClient` dispatches `ADMINV2_OPEN_ENROLLMENT_PACKET_REVIEW`
(:678) — an event whose only listener was the unmounted `OpportunityPacketReviewOverview`.

An operator clicks "Review enrollment packet" at the exact moment it matters, and nothing happens.
`useOpportunityDrawerVmHeaderActions` even suppresses the success toast for this key, on the
assumption that a modal owns the feedback — so there is not even an error.

### 2. Decision work can gate a step that nothing can satisfy

`completeStageWorkWithOutcome` runs `preflightParticipantResolutionGate`: when a work template sets
`completion_policy.requires_all_participants_resolved` and declares `participant_decisions`,
completing the step is **refused** with *"cannot be completed yet — … Choose a path for each child
first."*

Choosing a path is `POST /api/admin/lifecycle-builder/participant-decisions`, whose only surface was
the unmounted Decision card. The message tells the operator to do something the product no longer
offers, and the step cannot be completed by any route.

---

## Outcome — every capability is mounted or retired with evidence

| Capability | Resolution | Proof |
|---|---|---|
| Per-child **Decision** | **Mounted** in the Current Work focused surface | cert A: `decisionPanel: 1, decisionRows: 2` |
| **Close family** | **Mounted** on the same surface, same stage configuration | cert B: `blocked: 1` — an enrolled child is a hard block, with its reason |
| **Packet review** | **Mounted** on the Focus Panel action-modal registry | cert C: the action's event now fires a real packet read; before, nothing listened |
| **Tour lifecycle** | **Retired**, not remounted — Current Work already owns the outcome commands; the Tour card gained the vocabulary the bar had | `web/tests/focusPanel/tourCardLifecycle.test.ts` |
| **Inquiry summary activity** | **Deleted** — a wrapper around packet review plus navigation to a drawer tab strip that no longer exists | absent from the tree |
| `open_drawer` layout value | **Contained**: parser keeps read compatibility, platform defaults normalized, reachability guarded | `web/tests/focusPanel/openDrawerContainment.test.ts`, cert G |

No capability remains in the "retained, unmounted" state the previous sprint recorded.

---

## Canonical owners

| Capability | Old mount | Canonical owner | Existing action/runtime | Migration |
|---|---|---|---|---|
| **Per-child Decision** | legacy overview body | **Current Work** — the focused surface | `participant_decisions` on the stage `work_template`; `resolveParticipantDecisionContext` → `projectParticipantDecisionRows` / `executeParticipantDecisionForChild`; each decision names a platform capability that must be selected in `command_set_v1` | mount the per-child rows inside the Current Work focused surface, where the completion gate that demands them already fires |
| **Close family** | legacy overview body | **Current Work**, same surface | `planGovernedFamilyClose` via the SAME `resolveParticipantDecisionContext`; governed close is a decision-shaped capability on the same template | mount beneath the child rows — it is the family-grain resolution of the same work, not a separate command |
| **Packet review** | legacy overview body | **Focus Panel action-modal registry** (`useOpportunityDrawerVmRegistryModals`) | `review_enrollment_packet` registered action → `ADMINV2_OPEN_ENROLLMENT_PACKET_REVIEW`; data `GET /api/admin/opportunities/:id/enrollment-packets` | mount `OpportunityPacketReviewModal` alongside `RecordTourOutcomeModal` et al. The action, its gate and its modal already exist — only the listener was missing |
| **Tour lifecycle** | legacy overview body | **Tour card** owns STATE; **Current Work** already owns the OUTCOME ACTIONS | `groupTourPresentationActions` already groups `confirm_tour`, `cancel_tour`, `complete_tour`, `no_show_tour`, `record_tour_outcome`; Tour card owns schedule/reschedule/cancel/confirm over `context.signals.tour` | **do not remount the bar** — it duplicates Current Work. Enrich the Tour card where it was genuinely weaker (see below) and delete the bar |
| **Inquiry summary activity** | legacy overview body | none — **obsolete** | a wrapper around packet review + `onGoToTab("activity" \| "documents")` | delete. Its packet half is covered by mounting packet review; its other half navigates a drawer tab strip that no longer exists |
| **`open_drawer` layout value** | config compatibility | none (operator); parser only | accepted by `layoutV2Schema`, retired from authoring, executed by nothing | see the migration analysis below |

### Duplication check — what was NOT rebuilt

* **Tour outcomes** (`complete_tour`, `no_show_tour`) are already reachable through the configured
  action runtime in Current Work. Remounting the lifecycle bar would have created a second
  execution path for the same capability. It was not remounted.
* **Close family** is not a generic family-status mutation and does not get its own button: it
  resolves through the same stage-work configuration as the per-child decisions, so it lives in the
  same surface.
* **Packet review** already had its action, its eligibility gate and its modal. Only the listener
  was missing — no new card, no new action.

### What the Tour card was genuinely missing

Comparing the bar against the card, the card owned every action worth keeping. Two presentation
gaps were real:

1. `buildTourCardEvidence.formatStartLabel` claimed to render `"Jun 30 · 10:00 AM"` but was
   `iso.slice(0, 16).replace("T", " · ")` — it showed `2026-06-30 · 10:00`, a raw ISO fragment.
2. The status chip rendered `context.signals.tour.statusLabel` verbatim, so a raw key like
   `pending_approval` could reach the operator. The bar had a label map; the card did not.

Both are fixed on the card. That is the whole of the tour convergence.

---

## `open_drawer` — migration analysis

Retired from authoring in PR #410, still accepted by the parser because published tenant layouts
contain it. Findings:

* **No renderer executes it.** The layout-adornment runtime (`LayoutRuntimePlanView` and the
  adornment button) is reachable only from the Surface Builder canvas, the preview renderer and the
  layout proofs — no operator surface. There is nothing to fail closed *from*.
* **The stored value is not mechanically resolvable to one canonical target.** `open_drawer` carries
  an `entity` (`person` / `child` / `opportunity`) and an `idPath`, but the canonical replacement is
  an ASPECT on a *host record's* panel, and the host is not derivable from a layout item — it comes
  from the record's own `work_unit_id` at runtime. A migration would have to guess.
* Therefore: **outcome B — contained, not migrated.** Parser compatibility stays, the value is
  documented as legacy/inert, and a guard test asserts no operator renderer can execute it. Tenant
  layout data is not rewritten on an assumption.

The platform-default layouts shipped in code are a different matter: those are ours, they are
authored `open_drawer`, and they are normalized to `none` so the defaults stop teaching the value.

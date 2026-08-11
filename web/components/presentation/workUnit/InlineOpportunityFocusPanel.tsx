"use client";

/**
 * Presentation Runtime V2 — the Work Unit's INLINE Focus Panel region.
 *
 * The selected record renders in-layout inside FP.SURFACE — never as the drawer/modal
 * overlay (AdminEntityDrawer suppresses the modal for opportunity subjects on work-unit
 * surfaces; this component is the one record surface there). It is a distillation of the
 * Focus Panel branch of `OpportunityDrawerVmRuntime` WITHOUT the shell chrome:
 *
 *   - selection state stays in AdminDrawerContext (no parallel selection store) — the
 *     record payload, reveal, cache, save-coordinator and action-registry infrastructure
 *     are reused verbatim;
 *   - NO portal, NO backdrop, NO body scroll-lock, NO ESC-close, no raw animation
 *     timings — the panel is a bordered card that owns its internal scroll;
 *   - seed header (`FocusPanelCompactHeader`) owns the clicked subject identity until the
 *     payload for the selected subject resolves (`resolveFocusPanelSubjectReveal`), so a
 *     row → row switch swaps identity synchronously while the prior payload is held;
 *   - one instance stays mounted across record swaps (never keyed by record id) — swap
 *     continuity (`holdPriorPayload`, seed header) comes from the payload hook;
 *   - background tab/communications prefetch loaders are intentionally omitted (first
 *     pass): they only warm secondary-mode caches, and each mode lazy-loads on open.
 *
 * Action modals (create work, tour, send form, …) still portal to `document.body` via
 * `VmDrawerActionModalsPortal` — they are transient action chrome, not record surface.
 *
 * PENDING (loading contract): while the selected subject's payload resolves, the body
 * renders `FocusPanelSummarySkeleton` — the SAME published-grid strategy the resolved
 * body will, with inert pulse placeholders — so the layout does not swap (no centered
 * "Preparing…" surface, no card-grid pop-in). On a row → row switch `holdPriorPayload`
 * holds the PRIOR resolved grid instead of the skeleton. The seed header
 * (`FocusPanelCompactHeader`) is the switch acknowledgment; the sticky header container
 * reserves a stable min-height so seed → resolved never jumps vertically.
 *
 * DRILL-IN (deferred gap): drill-in inside the Focus Panel uses the existing in-panel
 * coordination model (`coordination.requestFocus` — a referencing card asks an owner
 * card to open a Perspective; ESC/back pops the depth history). There is NO Open-Surface
 * registry / recursion yet (Experience Builder V3's "Expanded = Open Surface" is not
 * wired to a runtime registry). Open Surface recursion is a DOCUMENTED deferred gap;
 * this pass preserves the current in-panel handoff model and adds no one-off drill paths.
 * @see docs/platform/experience/presentation-runtime-v2.md
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
    logCurrentWorkInit,
    nextCurrentWorkInstanceId,
} from "@/lib/adminV2/runtime/diagnostics/currentWorkInitDiagnostics";
import { MOTION_SETTLE } from "@/lib/motion/motionTokens";
import { markPerceived } from "@/lib/perf/perceivedPerf";
import FocusPanelCompactHeader from "@/components/admin/focusPanel/FocusPanelCompactHeader";
import { AlloyIdentityLoader } from "@/app/adminV2/components/bos/identity/AlloyIdentityLoader";
import { AlloyThinkingLabel } from "@/components/admin/workspace/AlloyThinkingLabel";
import OpportunityFocusPanelHeader from "@/components/admin/focusPanel/OpportunityFocusPanelHeader";
import OpportunityFocusPanelBody from "@/components/admin/focusPanel/OpportunityFocusPanelBody";
import OpportunityDrawerBodySaveBar from "@/components/admin/vmDrawer/OpportunityDrawerBodySaveBar";
import VmDrawerActionModalsPortal from "@/components/admin/vmDrawer/VmDrawerActionModalsPortal";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useRecordWorkRuntime } from "@/lib/presentation/runtime/useRecordWorkRuntime";
import { useOperationalSubject, isOperationallyResolved } from "./OperationalSubjectContext";
import { FocusPanelOutOfViewAffordance } from "./FocusPanelOutOfViewAffordance";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { useRetainedScroll } from "@/lib/presentation/runtime/useRetainedScroll";
import { focusPanelScrollScope } from "@/lib/presentation/runtime/workUnitOperatorContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { useOpportunityDrawerActionPreflight } from "@/lib/admin/actions/useOpportunityDrawerActionPreflight";
import { useOpportunityDrawerRegistryActionFeedback } from "@/lib/admin/actions/useOpportunityDrawerRegistryActionFeedback";
import { resolvePortalRecordManageAccess } from "@/lib/admin/adminPortalRolePick";
import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import { resolveFocusPanelSubjectReveal } from "@/lib/admin/drawer/focusPanelSubjectReveal";
import {
    buildFocusPanelContextChipsFromQueuePreviewSeed,
    resolveQueuePreviewSeedIdentitySummaryLine,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelDisplayLabels";
import { formatOpportunityInquiryDrawerTitle } from "@/lib/admin/drawer/opportunityInquiryDrawerTitle";
import { prewarmFocusPanelActivityMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelActivityPrewarm";
import { markDrawerFamilyWorkspaceTiming } from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchTiming";
import { useBosOpportunityDrawerContextSeed } from "@/lib/adminV2/bos/useBosDrawerOperationalContextSeed";
import { FocusPanelSummaryDocProvider } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";
import { useFocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/useFocusPanelMode";
import { useFocusPanelModePrewarm } from "@/lib/adminV2/runtime/focusPanel/useFocusPanelModePrewarm";
import { resolveOpportunityVmStatusCanMutate } from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveOpportunityVmStatusCanMutate";
import { resolveOpportunityVmStatusLabel } from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveOpportunityVmStatusLabel";
import { useOpportunityDrawerVmHeaderActions } from "@/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmHeaderActions";
import { useOpportunityDrawerVmRegistryModals } from "@/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmRegistryModals";

export function InlineOpportunityFocusPanel() {
    const { canMutate: authCanMutate, role, roleKeys } = useAdminAuth();
    const { labels } = useEntityLabels();
    const opportunitySingular = labels.opportunities?.singular ?? "Opportunity";
    // Record of Attention comes from COMMITTED FOCUS — the sole subject owner. No drawer read.
    const operational = useOperationalSubject();
    const { subjectId: operationalSubjectId } = operational;
    // Phase A duplicate-init diagnostics — stable id for this Focus Panel instance.
    const componentIdRef = useRef<string>("");
    if (!componentIdRef.current) componentIdRef.current = nextCurrentWorkInstanceId("focusPanel");
    // The close affordance is hidden in the inline panel (the panel host stays mounted); a no-op keeps
    // the shared header contract without a drawer close semantic.
    const closeDrawer = useCallback(() => {}, []);
    // ── OPERATIONAL vs SETTLEMENT ──
    // `resolved` below is the SETTLEMENT payload (the record VM fetch). It used to drive
    // `data-inline-focus-panel-resolved`, which made the panel report itself unresolved after
    // Operational Commit and gated the Work Unit terminal on a Detail/History request — the exact
    // "Focus Panel catch-up" the contract forbids.
    // OPERATIONAL resolution is a different question, and D1 already answered it: is there a
    // committed subject, a current business state, and a truthful action? That is what the marker
    // now reports. The Settlement fetch gets its own marker and gates nothing.
    const operationallyResolved = isOperationallyResolved(operational);
    // Local subject view — id/type from committed Focus. The queue-preview seed is the INSTANT-IDENTITY
    // seed carried on the committed Operational Subject (derived from the same committed queue row the
    // subject was selected from — never the drawer store). It gives the pending header the family name +
    // status on cold open; the resolved header replaces it once the VM lands.
    // ── SETTLEMENT TRUTH IS FAMILY-SHAPED; ATTENTION MAY BE THE CHILD. ──
    // Product model: Record of Truth = family opportunity; Record of Attention = focused child.
    // `useRecordWorkRuntime` loads the OPPORTUNITY VM — key it on the family opportunity id
    // (`child.family_opportunity_id` / drawer_open.entity_id), never on the process_instance id.
    const isChildSubject = operational.entityType === "child";
    const familyOpportunityIdFromTruth = (() => {
        const raw = operational.subjectIdentityTruth?.["child.family_opportunity_id"];
        return typeof raw === "string" && raw.trim() ? raw.trim() : null;
    })();
    const settlementSubjectId = isChildSubject
        ? familyOpportunityIdFromTruth
        : operationalSubjectId;
    const drawer = {
        id: settlementSubjectId ?? operationalSubjectId,
        type: (settlementSubjectId ?? (!isChildSubject && operationalSubjectId))
            ? ("opportunities" as const)
            : null,
        opportunityQueuePreviewSeed: operational.identitySeed as OpportunityDrawerQueuePreviewSeed | null,
    };
    const {
        displayVm,
        error,
        holdPriorPayload,
        patchDisplayRecord,
        reloadDisplayVm,
    } = useRecordWorkRuntime(settlementSubjectId);

    const bodyScrollRef = useRef<HTMLDivElement | null>(null);
    const { mode: focusPanelMode, setMode: setFocusPanelModeState, selectFromDrawerTab } =
        useFocusPanelMode({
            subjectId: drawer.type === "opportunities" ? drawer.id : null,
            bodyScrollRef,
        });
    // Retained Focus Panel scroll — per (org, record). Merge with the existing bodyScrollRef so both
    // the mode-change scroll-to-top and the retained-scroll capture/restore see the same element.
    const { orgId: focusPanelOrgId } = useWorkspaceOrg();
    const retainedFocusScrollRef = useRetainedScroll(
        focusPanelScrollScope(focusPanelOrgId, drawer.type === "opportunities" ? drawer.id : null),
    );
    const setBodyScrollEl = useCallback(
        (el: HTMLDivElement | null) => {
            bodyScrollRef.current = el;
            retainedFocusScrollRef(el);
        },
        [retainedFocusScrollRef],
    );
    const setFocusPanelMode = useCallback(
        (next: typeof focusPanelMode) => {
            if (next === "activity") {
                markDrawerFamilyWorkspaceTiming("activity_clicked", {
                    entity_id: drawer.type === "opportunities" ? drawer.id : null,
                });
            }
            setFocusPanelModeState(next);
        },
        [drawer.id, drawer.type, setFocusPanelModeState]
    );

    const record = displayVm?.above_fold.record ?? null;

    // Activity-mode background prewarm (sanctioned idle prefetch — never a reveal gate).
    // Whenever the Focus Panel is open, warm Activity metadata (comms, documents, timeline;
    // notes ship on VM) on idle so Work → Activity switches feel instant.
    const prewarmSubjectId = drawer.type === "opportunities" && drawer.id != null ? String(drawer.id) : null;

    useEffect(() => {
        if (!prewarmSubjectId) return;
        markDrawerFamilyWorkspaceTiming("row_selected", { entity_id: prewarmSubjectId });
    }, [prewarmSubjectId]);

    useEffect(() => {
        if (!prewarmSubjectId || !displayVm?.structureSettled) return;
        markDrawerFamilyWorkspaceTiming("drawer_vm_ready", { entity_id: prewarmSubjectId });
        markDrawerFamilyWorkspaceTiming("preview_vm_ready", {
            entity_id: prewarmSubjectId,
            has_preview: Boolean(displayVm.activity?.communicationsPreviewVm),
        });
    }, [prewarmSubjectId, displayVm?.structureSettled, displayVm?.activity?.communicationsPreviewVm]);
    const modePrewarm = useMemo(
        () => ({
            activity: () => {
                if (!prewarmSubjectId) return;
                prewarmFocusPanelActivityMode(prewarmSubjectId);
            },
        }),
        [prewarmSubjectId],
    );
    useFocusPanelModePrewarm({
        enabled: prewarmSubjectId != null,
        activeMode: focusPanelMode,
        subjectId: prewarmSubjectId,
        prewarm: modePrewarm,
    });

    useBosOpportunityDrawerContextSeed({
        drawerId: drawer.type === "opportunities" ? drawer.id : null,
        overviewData: record as Record<string, unknown> | null,
        queuePreviewSeed: drawer.opportunityQueuePreviewSeed ?? null,
        opportunitySingular,
    });

    // ── Reveal + committed-visible guards (identical decisions to the modal runtime) ────
    const selectedSubjectId =
        drawer.type === "opportunities" && drawer.id != null ? String(drawer.id) : null;
    const displayedSubjectId =
        record != null && (record as { id?: unknown }).id != null ?
            String((record as { id?: unknown }).id)
            : null;
    const { subjectResolved, subjectPending } = resolveFocusPanelSubjectReveal({
        shellOpen: selectedSubjectId != null,
        hasDisplayVm: Boolean(displayVm),
        selectedSubjectId,
        displayedSubjectId,
    });

    const lastMarkedFocusRef = useRef<string | null>(null);
    useEffect(() => {
        if (selectedSubjectId == null) {
            lastMarkedFocusRef.current = null;
            return;
        }
        const state = subjectResolved ? "resolved" : subjectPending ? "seed" : "idle";
        const key = `${selectedSubjectId}:${state}`;
        if (lastMarkedFocusRef.current === key) return;
        lastMarkedFocusRef.current = key;
        if (state === "seed") {
            markPerceived("focus_panel_seed", "acknowledge", { opportunity_id: selectedSubjectId });
        } else if (state === "resolved") {
            markPerceived("focus_panel_resolved", "reveal", { opportunity_id: selectedSubjectId });
        }
    }, [selectedSubjectId, subjectResolved, subjectPending]);

    const committedVisible = useMemo(
        () =>
            displayVm != null &&
            drawer.type === "opportunities" &&
            String(drawer.id) === String(displayVm.entity.id),
        [displayVm, drawer.type, drawer.id],
    );

    // ── Permissions / labels ─────────────────────────────────────────────────────────────
    const statusCanMutate = useMemo(
        () => resolveOpportunityVmStatusCanMutate(displayVm, authCanMutate),
        [displayVm, authCanMutate],
    );
    const manageCanMutate = useMemo(
        () => resolvePortalRecordManageAccess({ roleKeys, legacyRole: role }),
        [role, roleKeys],
    );

    const drawerTitle = useMemo(() => {
        if (!record) return opportunitySingular;
        return formatOpportunityInquiryDrawerTitle(record, opportunitySingular) || opportunitySingular;
    }, [record, opportunitySingular]);

    const statusLabel = useMemo(
        () =>
            resolveOpportunityVmStatusLabel({
                drawerId: committedVisible ? drawer.id : displayVm?.entity.id ?? drawer.id,
                displayVm,
                queueSeedStatusLabel: drawer.opportunityQueuePreviewSeed?.statusLabel,
            }),
        [committedVisible, drawer.id, displayVm, drawer.opportunityQueuePreviewSeed?.statusLabel],
    );

    const currentStatusKey = useMemo(() => String(record?.status_key ?? "").trim(), [record]);

    // ── Registry actions + action modals (portal to body is fine — transient chrome) ────
    const { feedback: registryActionFeedback, showSuccess, showError, clearFeedback: clearRegistryActionFeedback } =
        useOpportunityDrawerRegistryActionFeedback(drawer.id);

    const { blocked: actionPreflightBlocked, clearBlocked: clearActionPreflightBlocked, applyBlockedFromDetail } =
        useOpportunityDrawerActionPreflight(drawer.id);

    useEffect(() => {
        clearRegistryActionFeedback();
    }, [drawer.id, clearRegistryActionFeedback]);

    const registryActionHost = useMemo(
        () => ({ patchRecord: patchDisplayRecord }),
        [patchDisplayRecord],
    );

    const headerActionHost = useMemo(
        () => ({
            showSuccess: (message: string, opts?: { workflow_run_id?: string }) => {
                clearActionPreflightBlocked();
                showSuccess(message, opts);
            },
            showError: (message: string) => {
                clearActionPreflightBlocked();
                showError(message);
            },
            clearPreflight: clearActionPreflightBlocked,
            applyPreflightBlocked: applyBlockedFromDetail,
        }),
        [applyBlockedFromDetail, clearActionPreflightBlocked, showError, showSuccess],
    );

    const { modals: registryModals, registryHostExtensions } = useOpportunityDrawerVmRegistryModals({
        opportunityId: drawer.id,
        record,
        canMutate: statusCanMutate,
        actionHost: registryActionHost,
        workspaceWorkUnitId: displayVm?.workspace.work_unit_id ?? null,
        workspaceDepartmentId: displayVm?.workspace.department_id ?? null,
        reloadOpportunityDisplayVm: reloadDisplayVm,
    });

    const { onActionSelect, actionLoadingKey } = useOpportunityDrawerVmHeaderActions({
        opportunityId: drawer.id,
        departmentId: displayVm?.workspace.department_id,
        workUnitId: displayVm?.workspace.work_unit_id,
        registryHostExtensions,
        actionHost: headerActionHost,
    });

    const onRetry = useCallback(() => {
        void reloadDisplayVm();
    }, [reloadDisplayVm]);

    // Nothing selected → no panel (FocusPanelSurface also gates; belt and braces).
    if (drawer.type !== "opportunities" || drawer.id == null) return null;

    // Narrowed payload — full header/body/save-bar render ONLY when the displayed payload
    // matches the selected subject AND the atomic render commit (committedVisible).
    const resolved =
        committedVisible && subjectResolved && displayVm != null && record != null ?
            { displayVm, record }
            : null;

    // Row → row switch: hold the PRIOR resolved grid (loading contract) instead of the
    // skeleton. During a hold `displayVm`/`record` still carry the prior subject's payload
    // (the payload hook returns the held VM), so the previously-resolved composed grid stays
    // on screen while the new subject fetches — no flash back to a placeholder.
    const heldPrior =
        !resolved && holdPriorPayload && displayVm != null && record != null ?
            { displayVm, record }
            : null;

    // ATOMIC SUBJECT COHERENCE. The visible subject — header AND body — is ALWAYS the currently
    // resolved VM. During a swap the operational snapshot commits the destination fast, but its
    // record VM lands later; if the header followed the fast commit while the body held the prior
    // grid, the panel would show the destination identity over the prior subject's cards — a
    // mixed-subject frame. Binding the header to `resolved ?? heldPrior` holds the COMPLETE prior
    // subject (identity + cards) until the destination VM is coherent, then swaps atomically. The
    // seed header appears only on true cold entry (no prior VM to hold).
    const visible = resolved ?? heldPrior;

    // A CHILD PANEL IS TITLED WITH THE CHILD. The queue-preview seed carries the FAMILY's name (it is
    // derived from the case), so on a child subject it titled the panel "Wenc Family" while the
    // committed subject was Jarek Wenc — a family-shaped identity on a child surface. The child's own
    // name comes from the answer's domain-declared identity truth, which is where a child's identity
    // lives; the seed remains the fallback when the answer carried no name.
    const childDisplayName =
        isChildSubject && typeof operational.subjectIdentityTruth?.["child.display_name"] === "string"
            ? (operational.subjectIdentityTruth["child.display_name"] as string).trim() || null
            : null;
    const seedTitle =
        childDisplayName || drawer.opportunityQueuePreviewSeed?.title?.trim() || opportunitySingular;
    const seedContextChips = useMemo(
        () => buildFocusPanelContextChipsFromQueuePreviewSeed(drawer.opportunityQueuePreviewSeed),
        [drawer.opportunityQueuePreviewSeed],
    );
    const seedIdentitySummaryLine = useMemo(
        () => resolveQueuePreviewSeedIdentitySummaryLine(drawer.opportunityQueuePreviewSeed),
        [drawer.opportunityQueuePreviewSeed],
    );

    // `swap` softening: key the body by the displayed subject so a record → record switch
    // remounts the body once (it is prop-driven, so no state is lost) and `settle`s the new
    // grid in — opacity-only, into the same layout. A same-record re-render (save/patch)
    // keeps the key, so edits never trigger a fade. Continuity (held-prior grid + the
    // synchronous seed header) is unchanged; this only softens the final hand-off cut.
    // STABLE across commit-critical → enriched for the SAME subject (A): the key is the committed
    // subject id, which equals the settled VM's entity id — so the ONE Focus Panel body + grid persist
    // through the transition (a model prop change, never a remount → no resize, no card-by-card).
    // Held-prior (subject switch) keeps the prior subject's id until the new subject settles.
    const bodyRenderKey = String(
        visible?.displayVm.entity.id ?? operationalSubjectId ?? "pending",
    );
    const isActivityMode = focusPanelMode === "activity";
    const activityBodyFillClass = "flex min-h-0 flex-1 flex-col overflow-hidden";

    // Phase A — the body source is the authoritative "which loading/content shell rendered" signal.
    // Cold-loader is LOADING #2; commit-critical-seed is instant seed content; enriched is the live VM.
    const bodySource =
        error && !resolved && !holdPriorPayload ? "error"
        : resolved ? "enriched:resolved"
        : heldPrior ? "enriched:held-prior"
        : operationallyResolved ? "commit-critical-seed"
        :   "cold-loader";
    useEffect(() => {
        logCurrentWorkInit("focusPanel.mount", {
            subjectId: operationalSubjectId,
            componentId: componentIdRef.current,
        });
        return () =>
            logCurrentWorkInit("focusPanel.unmount", {
                subjectId: operationalSubjectId,
                componentId: componentIdRef.current,
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- one mount/unmount pair per instance
    }, []);
    useEffect(() => {
        logCurrentWorkInit("focusPanel.body", {
            subjectId: operationalSubjectId,
            componentId: componentIdRef.current,
            note: bodySource,
            cache:
                bodySource === "commit-critical-seed" ? "seed"
                : bodySource.startsWith("enriched") ? "live"
                :   undefined,
        });
    }, [bodySource, operationalSubjectId]);

    return (
        <FocusPanelSummaryDocProvider
            enabled
            // Committed applicability context (P3-B): the Work View the operator entered from and the
            // committed stage — the axes `resolveSurfaceVariant` selects the published composition by.
            // Business Process stays a wildcard (org-global docs need no BP match). Null when nothing is
            // committed → unscoped fetch (behavior-neutral). One resolution, shared by grid + skeleton +
            // nested cards, so a Work-View change re-resolves the whole panel coherently.
            workViewId={operational.decision?.workViewId ?? null}
            stageKey={operational.situation?.stageKey ?? null}
            // A — the answer-resolved published composition: the committed panel's first frame is the
            // PUBLISHED Summary composition (seed covers the window until the scope fetch settles).
            seed={operational.summaryDocSeed}
        >
            <section
                data-inline-focus-panel="true"
                data-inline-focus-panel-mode={focusPanelMode}
                data-inline-focus-panel-subject={selectedSubjectId ?? undefined}
                // OPERATIONAL truth from the committed snapshot — NOT the Settlement fetch.
                data-inline-focus-panel-resolved={operationallyResolved ? "true" : "false"}
                data-focus-panel-operational={operationallyResolved ? "resolved" : "pending"}
                // Detail/History settle after commit. This may never gate the operational panel.
                data-focus-panel-settlement={resolved ? "resolved" : "pending"}
                data-focus-panel-scope={operational.decision?.scopeState ?? undefined}
                aria-label="Focus Panel"
                // Borderless: the FocusPanelSurface boundary owns the outer panel border (single container).
                // Fills the stretched boundary (flex-1) so an open record occupies the SAME shell height
                // as the empty state; the body scrolls internally. Height comes from the parent row.
                className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
            >
                {operational.decision?.scopeState === "out_of_scope" ? (
                    <FocusPanelOutOfViewAffordance
                        destinationViewLabel={
                            operational.decision.destinationViewLabel
                            ?? operational.situation?.stageLabel
                            ?? null
                        }
                        onOpenDestination={
                            operational.decision.destinationViewId
                                ? () => {
                                      // Soft navigate via custom event — Work Unit surface owns pill switch.
                                      if (typeof window === "undefined") return;
                                      window.dispatchEvent(
                                          new CustomEvent("adminv2:open-work-view", {
                                              detail: {
                                                  workViewId: operational.decision?.destinationViewId,
                                              },
                                          }),
                                      );
                                  }
                                : null
                        }
                    />
                ) : null}
                <div
                    className="sticky top-0 z-10 shrink-0 border-b border-alloy-stone/12 bg-white"
                    data-inline-focus-panel-header="true"
                    // Reserve a stable height so the seed compact header (short) → resolved
                    // header (taller: status control + actions) does not jump vertically.
                    style={{ minHeight: "5.25rem" }}
                >
                    {visible ?
                        <OpportunityFocusPanelHeader
                            title={drawerTitle}
                            opportunityId={visible.displayVm.entity.id}
                            record={visible.record}
                            displayVm={visible.displayVm}
                            queuePreviewSeed={drawer.opportunityQueuePreviewSeed}
                            opportunitySingular={opportunitySingular}
                            statusLabel={statusLabel}
                            currentStatusKey={currentStatusKey}
                            statusControl={visible.displayVm.header.status}
                            statusCanMutate={statusCanMutate}
                            manageCanMutate={manageCanMutate}
                            activeMode={focusPanelMode}
                            onModeChange={setFocusPanelMode}
                            onClose={closeDrawer}
                            hideClose
                            onSubjectManageActionSelect={onActionSelect}
                            subjectManageActionLoadingKey={actionLoadingKey}
                            actionPreflightBlocked={actionPreflightBlocked}
                            onDismissActionPreflightBlocked={clearActionPreflightBlocked}
                            registryActionFeedback={registryActionFeedback}
                            primaryHeaderAction={visible.displayVm.actions.header_menu[0] ?? null}
                            onPrimaryHeaderAction={onActionSelect}
                            primaryActionLoading={Boolean(actionLoadingKey)}
                        />
                        : <FocusPanelCompactHeader
                            subjectTitle={seedTitle}
                            contextChips={seedContextChips}
                            identitySummaryLine={seedIdentitySummaryLine}
                            activeMode={focusPanelMode}
                            onModeChange={setFocusPanelMode}
                            onClose={closeDrawer}
                            hideClose
                        />}
                </div>
                <div
                    ref={setBodyScrollEl}
                    data-adminv2-record-modal-scroll
                    className={
                        isActivityMode
                            ? `${activityBodyFillClass} bg-white px-2 py-2 [scrollbar-gutter:stable]`
                            : "min-h-0 flex-1 overflow-y-auto bg-white px-4 py-3 [scrollbar-gutter:stable]"
                    }
                >
                    {/* Keyed `swap` wrapper — remounts + settles the body on a record switch. */}
                    <div
                        key={bodyRenderKey}
                        className={
                            bodyRenderKey === "pending"
                                ? isActivityMode
                                    ? activityBodyFillClass
                                    : undefined
                                : `${MOTION_SETTLE.className}${isActivityMode ? ` ${activityBodyFillClass}` : ""}`
                        }
                    >
                    {error && !resolved && !holdPriorPayload ?
                        <div
                            role="alert"
                            className="m-1 rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember"
                            data-inline-focus-panel-error="true"
                        >
                            <p>{error}</p>
                            <button
                                type="button"
                                onClick={onRetry}
                                className="motion-control mt-1.5 rounded-md border border-alloy-ember/30 bg-white px-2.5 py-1 text-xs font-semibold text-alloy-ember hover:bg-alloy-ember/10"
                            >
                                Retry
                            </button>
                        </div>
                    : resolved || heldPrior || operationallyResolved ?
                        // THE ONE Focus Panel body (A — atomic commit). Commit-critical (from the answer)
                        // OR enriched (from the drawer VM), rendered by the SAME grid instance under a
                        // stable subject key (bodyRenderKey). The pending → enriched transition is a model
                        // PROP CHANGE, never a remount: one commit, one geometry, one card composition,
                        // one readiness boundary, zero resize, zero card-by-card assembly. Settlement only
                        // fills reserved cells in place.
                        <OpportunityFocusPanelBody
                            mode={focusPanelMode}
                            title={visible ? drawerTitle : seedTitle}
                            statusLabel={statusLabel}
                            canMutate={statusCanMutate}
                            enriched={visible ? { displayVm: visible.displayVm, record: visible.record } : null}
                            commitCritical={
                                // Always keep commit-critical while operationally resolved — including
                                // after Settlement — so child Attention can overlay the child's stage
                                // mission onto the family Settlement VM (never replace with Lead work).
                                operationallyResolved
                                    ? {
                                          subjectId: operationalSubjectId ?? "",
                                          statusKey: drawer.opportunityQueuePreviewSeed?.statusKey ?? null,
                                          stageWorkRuntime: operational.stageWorkRuntime,
                                          publishedStageInputs: operational.publishedStageInputs,
                                          situation: operational.situation
                                              ? {
                                                    stageKey: operational.situation.stageKey,
                                                    stageLabel: operational.situation.stageLabel,
                                                    purpose: operational.situation.purpose,
                                                }
                                              : null,
                                          primaryAction: operational.action,
                                          // Carried so the panel can SAY there is no configured action,
                                          // instead of leaving the operator to guess whether the surface
                                          // is deliberately empty or still settling.
                                          actionAbsence: operational.actionAbsence,
                                          subjectIdentityTruth: operational.subjectIdentityTruth,
                                          // R2 — the answer's resolved grain, carried by the single
                                          // subject owner. The panel forwards it; it never decides it.
                                          subjectGrain: operational.subjectGrain,
                                      }
                                    : null
                            }
                            onSelectTab={selectFromDrawerTab}
                            onHeaderAction={onActionSelect}
                            onModeChange={setFocusPanelMode}
                        />
                    :
                        // COLD pending fill (the answer did not resolve stage-work, e.g. an empty/degraded
                        // slice): a single quiet "Thinking…" owner, NOT a card-grid skeleton. On a row →
                        // row switch the prior grid is held above (never this loader), so this shows only
                        // on true cold entry with no operational Current Work in hand.
                        <div
                            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-10 text-center"
                            data-focus-panel-thinking="true"
                            role="status"
                            aria-live="polite"
                            aria-busy="true"
                        >
                            <AlloyIdentityLoader markSize="md" showMessage={false} />
                            <AlloyThinkingLabel size="sm" />
                        </div>}
                    </div>
                </div>
                {resolved ?
                    <div className="shrink-0 overflow-visible">
                        <OpportunityDrawerBodySaveBar canMutate={statusCanMutate} />
                    </div>
                    : null}
            </section>
            {registryModals ?
                <VmDrawerActionModalsPortal>{registryModals}</VmDrawerActionModalsPortal>
                : null}
        </FocusPanelSummaryDocProvider>
    );
}

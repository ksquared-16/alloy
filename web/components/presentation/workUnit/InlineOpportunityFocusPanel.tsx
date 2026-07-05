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
import { MOTION_SETTLE } from "@/lib/motion/motionTokens";
import FocusPanelCompactHeader from "@/components/admin/focusPanel/FocusPanelCompactHeader";
import FocusPanelSummarySkeleton from "@/components/admin/focusPanel/FocusPanelSummarySkeleton";
import OpportunityFocusPanelHeader from "@/components/admin/focusPanel/OpportunityFocusPanelHeader";
import OpportunityFocusPanelModeBody from "@/components/admin/focusPanel/OpportunityFocusPanelModeBody";
import OpportunityDrawerBodySaveBar from "@/components/admin/vmDrawer/OpportunityDrawerBodySaveBar";
import VmDrawerActionModalsPortal from "@/components/admin/vmDrawer/VmDrawerActionModalsPortal";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { useOpportunityDrawerActionPreflight } from "@/lib/admin/actions/useOpportunityDrawerActionPreflight";
import { useOpportunityDrawerRegistryActionFeedback } from "@/lib/admin/actions/useOpportunityDrawerRegistryActionFeedback";
import { resolvePortalRecordManageAccess } from "@/lib/admin/adminPortalRolePick";
import { resolveFocusPanelSubjectReveal } from "@/lib/admin/drawer/focusPanelSubjectReveal";
import { formatOpportunityInquiryDrawerTitle } from "@/lib/admin/drawer/opportunityInquiryDrawerTitle";
import { useBosOpportunityDrawerContextSeed } from "@/lib/adminV2/bos/useBosDrawerOperationalContextSeed";
import { useFocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/useFocusPanelMode";
import { resolveOpportunityVmStatusCanMutate } from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveOpportunityVmStatusCanMutate";
import { resolveOpportunityVmStatusLabel } from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveOpportunityVmStatusLabel";
import { useOpportunityDrawerVmHeaderActions } from "@/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmHeaderActions";
import { useOpportunityDrawerVmPayload } from "@/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmPayload";
import { useOpportunityDrawerVmRegistryModals } from "@/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmRegistryModals";

export function InlineOpportunityFocusPanel() {
    const { canMutate: authCanMutate, role, roleKeys } = useAdminAuth();
    const { labels } = useEntityLabels();
    const opportunitySingular = labels.opportunities?.singular ?? "Opportunity";
    const { drawer, drawerVmRender, closeDrawer } = useAdminDrawer();
    const {
        displayVm,
        error,
        holdPriorPayload,
        patchDisplayRecord,
        reloadOpportunityDisplayVm,
    } = useOpportunityDrawerVmPayload();

    const bodyScrollRef = useRef<HTMLDivElement | null>(null);
    const { mode: focusPanelMode, setMode: setFocusPanelMode, selectFromDrawerTab } =
        useFocusPanelMode({
            subjectId: drawer.type === "opportunities" ? drawer.id : null,
            bodyScrollRef,
        });

    const record = displayVm?.above_fold.record ?? null;

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

    const committedVisible = useMemo(
        () =>
            displayVm != null &&
            drawerVmRender.type === "opportunities" &&
            String(displayVm.entity.id) === String(drawerVmRender.id) &&
            drawer.type === "opportunities" &&
            String(drawer.id) === String(displayVm.entity.id),
        [displayVm, drawerVmRender.type, drawerVmRender.id, drawer.type, drawer.id],
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
        reloadOpportunityDisplayVm,
    });

    const { onActionSelect, actionLoadingKey } = useOpportunityDrawerVmHeaderActions({
        opportunityId: drawer.id,
        departmentId: displayVm?.workspace.department_id,
        workUnitId: displayVm?.workspace.work_unit_id,
        registryHostExtensions,
        actionHost: headerActionHost,
    });

    const onRetry = useCallback(() => {
        void reloadOpportunityDisplayVm();
    }, [reloadOpportunityDisplayVm]);

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

    const seedTitle = drawer.opportunityQueuePreviewSeed?.title?.trim() || opportunitySingular;

    // `swap` softening: key the body by the displayed subject so a record → record switch
    // remounts the body once (it is prop-driven, so no state is lost) and `settle`s the new
    // grid in — opacity-only, into the same layout. A same-record re-render (save/patch)
    // keeps the key, so edits never trigger a fade. Continuity (held-prior grid + the
    // synchronous seed header) is unchanged; this only softens the final hand-off cut.
    const bodyRenderKey = String(
        resolved?.displayVm.entity.id ?? heldPrior?.displayVm.entity.id ?? "pending",
    );

    return (
        <>
            <section
                data-inline-focus-panel="true"
                data-inline-focus-panel-subject={selectedSubjectId ?? undefined}
                data-inline-focus-panel-resolved={resolved ? "true" : "false"}
                aria-label="Focus Panel"
                // Borderless: the FocusPanelSurface boundary owns the outer panel border (single container).
                className="flex max-h-[calc(100vh-6rem)] min-h-0 flex-col overflow-hidden bg-white"
            >
                <div
                    className="sticky top-0 z-10 shrink-0 border-b border-alloy-stone/12 bg-white"
                    // Reserve a stable height so the seed compact header (short) → resolved
                    // header (taller: status control + actions) does not jump vertically.
                    style={{ minHeight: "5.25rem" }}
                >
                    {resolved ?
                        <OpportunityFocusPanelHeader
                            title={drawerTitle}
                            opportunityId={drawer.id}
                            record={resolved.record}
                            displayVm={resolved.displayVm}
                            queuePreviewSeed={drawer.opportunityQueuePreviewSeed}
                            opportunitySingular={opportunitySingular}
                            statusLabel={statusLabel}
                            currentStatusKey={currentStatusKey}
                            statusControl={resolved.displayVm.header.status}
                            statusCanMutate={statusCanMutate}
                            manageCanMutate={manageCanMutate}
                            activeMode={focusPanelMode}
                            onModeChange={setFocusPanelMode}
                            onClose={closeDrawer}
                            onSubjectManageActionSelect={onActionSelect}
                            subjectManageActionLoadingKey={actionLoadingKey}
                            actionPreflightBlocked={actionPreflightBlocked}
                            onDismissActionPreflightBlocked={clearActionPreflightBlocked}
                            registryActionFeedback={registryActionFeedback}
                            primaryHeaderAction={resolved.displayVm.actions.header_menu[0] ?? null}
                            onPrimaryHeaderAction={onActionSelect}
                            primaryActionLoading={Boolean(actionLoadingKey)}
                        />
                        : <FocusPanelCompactHeader
                            subjectTitle={seedTitle}
                            contextChips={[]}
                            activeMode={focusPanelMode}
                            onModeChange={setFocusPanelMode}
                            onClose={closeDrawer}
                        />}
                </div>
                <div
                    ref={bodyScrollRef}
                    data-adminv2-record-modal-scroll
                    className="min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-gutter:stable]"
                >
                    {/* Keyed `swap` wrapper — remounts + settles the body on a record switch. */}
                    <div
                        key={bodyRenderKey}
                        className={bodyRenderKey === "pending" ? undefined : MOTION_SETTLE.className}
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
                    : resolved ?
                        <OpportunityFocusPanelModeBody
                            mode={focusPanelMode}
                            displayVm={resolved.displayVm}
                            drawerId={String(resolved.displayVm.entity.id)}
                            record={resolved.record}
                            drawerTitle={drawerTitle}
                            statusLabel={statusLabel}
                            canMutate={statusCanMutate}
                            onSelectTab={selectFromDrawerTab}
                            onHeaderAction={onActionSelect}
                        />
                    : heldPrior ?
                        // Hold the prior resolved grid during a row → row switch (no flash).
                        <OpportunityFocusPanelModeBody
                            mode={focusPanelMode}
                            displayVm={heldPrior.displayVm}
                            drawerId={String(heldPrior.displayVm.entity.id)}
                            record={heldPrior.record}
                            drawerTitle={drawerTitle}
                            statusLabel={statusLabel}
                            canMutate={statusCanMutate}
                            onSelectTab={selectFromDrawerTab}
                            onHeaderAction={onActionSelect}
                        />
                    : subjectPending ?
                        // Pending final-layout load: the published-grid skeleton (same
                        // strategy + cell positions as resolved) — never a centered spinner.
                        <FocusPanelSummarySkeleton mode={focusPanelMode} />
                        : null}
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
        </>
    );
}

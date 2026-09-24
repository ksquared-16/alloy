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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    logCurrentWorkInit,
    nextCurrentWorkInstanceId,
} from "@/lib/adminV2/runtime/diagnostics/currentWorkInitDiagnostics";
import { MOTION_SETTLE } from "@/lib/motion/motionTokens";
import { markPerceived } from "@/lib/perf/perceivedPerf";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";
import FocusPanelCompactHeader from "@/components/admin/focusPanel/FocusPanelCompactHeader";
import { AlloyIdentityLoader } from "@/app/adminV2/components/bos/identity/AlloyIdentityLoader";
import { AlloyThinkingLabel } from "@/components/admin/workspace/AlloyThinkingLabel";
import OpportunityFocusPanelHeader from "@/components/admin/focusPanel/OpportunityFocusPanelHeader";
import OpportunityFocusPanelBody from "@/components/admin/focusPanel/OpportunityFocusPanelBody";
import type { OperationalParticipantScope } from "@/lib/adminV2/runtime/operationalContext/types";
import OpportunityDrawerBodySaveBar from "@/components/admin/vmDrawer/OpportunityDrawerBodySaveBar";
import VmDrawerActionModalsPortal from "@/components/admin/vmDrawer/VmDrawerActionModalsPortal";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useRecordWorkRuntime } from "@/lib/presentation/runtime/useRecordWorkRuntime";
import { useAttentionSubject } from "@/lib/runtime/kernel/useAttentionCardFocus";
import {
    useOperationalSubject,
    isOperationallyResolved,
    isStructurallyResolved,
} from "./OperationalSubjectContext";
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
import { FocusPanelRenderedSubjectProvider } from "@/components/admin/focusPanel/focusPanelRenderedSubjectContext";
import { prewarmFocusPanelActivityMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelActivityPrewarm";
import {
    beginDrawerTabPrefetchEpoch,
    endDrawerTabPrefetchEpoch,
} from "@/lib/admin/drawerTabPrefetchEpoch";
import { resolveFocusPanelMutationOpportunityId } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
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
    /*
     * The settled participant scope, reported up by the body.
     *
     * Held here because the header and the body are siblings and only the body composes the
     * operational context. The header RENDERS identity; it never resolves it — deriving child
     * identity a second time is exactly how a stale avatar leaks into the next case.
     */
    const [subjectScope, setSubjectScope] = useState<OperationalParticipantScope | null>(null);
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
    /*
     * P0-7.1 — STRUCTURE IS A DIFFERENT QUESTION FROM MEANING.
     *
     * `operationallyResolved` asks whether the business meaning has been answered. The grid does not
     * need that answer to exist; it needs the PUBLISHED COMPOSITION, which the provisioning answer
     * carries record-independently. Gating the surface on the semantic predicate withheld the real
     * configured structure in a state that is perfectly ordinary — a family-grain subject whose stage
     * configures no action — and painted the cold "Thinking…" owner over a composition already in hand.
     */
    const structurallyResolved = isStructurallyResolved(operational);
    // Local subject view — id/type from committed Focus. The queue-preview seed is the INSTANT-IDENTITY
    // seed carried on the committed Operational Subject (derived from the same committed queue row the
    // subject was selected from — never the drawer store). It gives the pending header the family name +
    // status on cold open; the resolved header replaces it once the VM lands.
    // ── SETTLEMENT TRUTH IS FAMILY-SHAPED; ATTENTION MAY BE THE CHILD. ──
    // Product model: Record of Truth = family opportunity; Record of Attention = focused child.
    // `useRecordWorkRuntime` loads the OPPORTUNITY VM — key it on the family opportunity id
    // (`child.family_opportunity_id` / drawer_open.entity_id), never on the process_instance id.
    const isChildSubject =
        operational.entityType === "child"
        || operational.subjectGrain?.grain === "child"
        || operational.subjectGrain?.subjectType === "child";
    const familyOpportunityIdFromTruth = (() => {
        const raw = operational.subjectIdentityTruth?.["child.family_opportunity_id"];
        return typeof raw === "string" && raw.trim() ? raw.trim() : null;
    })();
    // Queue seed carries drawer_open.entity_id when identity truth omitted the family case id.
    const familyOpportunityIdFromSeed = (() => {
        const raw = operational.identitySeed?.familyOpportunityId;
        return typeof raw === "string" && raw.trim() ? raw.trim() : null;
    })();
    const familyOpportunityId = familyOpportunityIdFromTruth ?? familyOpportunityIdFromSeed;
    // Never key Settlement on the child Attention id (process_instance / participation).
    const settlementSubjectId = isChildSubject ? familyOpportunityId : operationalSubjectId;
    const drawer = {
        // Settlement / opportunity VM identity — family case only.
        id: settlementSubjectId,
        type: settlementSubjectId ? ("opportunities" as const) : null,
        opportunityQueuePreviewSeed: operational.identitySeed as OpportunityDrawerQueuePreviewSeed | null,
    };
    const {
        displayVm,
        error,
        holdPriorPayload,
        patchDisplayRecord,
        reloadDisplayVm,
    } = useRecordWorkRuntime(
        settlementSubjectId,
        /*
         * STATE THE PARTICIPATION; do not make the transport owner re-derive it.
         *
         * This component computed `isChildSubject` and holds the participation in
         * `operationalSubjectId` two lines above, then used to hand the runtime only the family id.
         * The runtime's fallback (`useAttentionSubject()`) is null on a cold entry — a SURFACE
         * movement clears `subject`, and committing the surface's DEFAULT subject moves attention
         * nowhere — so the settled request named no participation and the child-scoped producers
         * lost their subject at settlement.
         *
         * Case grain passes null: there is no participation to name, and inventing one would send an
         * opportunity id into a field the server resolves against `process_instances`.
         */
        isChildSubject ? operationalSubjectId : null,
    );
    if (typeof window !== "undefined") {
        (window as Window & { __ALLOY_FOCUS_SETTLEMENT_DIAG__?: Record<string, unknown> }).__ALLOY_FOCUS_SETTLEMENT_DIAG__ = {
            isChildSubject,
            entityType: operational.entityType,
            subjectGrain: operational.subjectGrain,
            operationalSubjectId,
            familyOpportunityIdFromTruth,
            familyOpportunityIdFromSeed,
            settlementSubjectId,
            identitySeed: operational.identitySeed,
            truthFamily: operational.subjectIdentityTruth?.["child.family_opportunity_id"] ?? null,
            displayVmId: displayVm?.entity?.id ?? null,
            structureSettled: displayVm?.structureSettled ?? null,
            runtimeError: error,
            bookingCount: displayVm?.summaries?.active_tour_bookings?.length ?? null,
            activityCount: Array.isArray(
                (displayVm?.above_fold?.record as { _activity_timeline_events?: unknown } | undefined)
                    ?._activity_timeline_events,
            )
                ? (
                      (displayVm?.above_fold?.record as { _activity_timeline_events: unknown[] })
                          ._activity_timeline_events
                  ).length
                : null,
        };
    }

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
    // Waitlist child rows use process-instance Attention ids — resolve to the family
    // opportunity so drawer-recipients / family-workspace prewarm does not 404.
    const prewarmSubjectId = useMemo(() => {
        if (drawer.type !== "opportunities" || drawer.id == null) return null;
        return resolveFocusPanelMutationOpportunityId({
            subjectId: String(drawer.id),
            grain: null,
            truth: (record as Record<string, unknown> | null) ?? null,
        });
    }, [drawer.id, drawer.type, record]);

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
    /**
     * THE ONE OWNER OF SPECULATIVE DRAWER-TAB WORK.
     *
     * The panel's subject binding already knows every way that work can go stale, so declaring the
     * epoch here covers all of them with a single effect rather than a cleanup call at each: the
     * subject changing re-runs it, a Work Unit change re-runs or remounts it, returning to the
     * Workspace unmounts it, and a newer intent is just the next subject. Whatever was queued for
     * the epoch it supersedes can no longer execute.
     *
     * This replaces `invalidateOpportunityDrawerTabPrefetch`, which had no production caller at all.
     */
    useEffect(() => {
        if (!prewarmSubjectId) return;
        const epoch = beginDrawerTabPrefetchEpoch(prewarmSubjectId);
        return () => endDrawerTabPrefetchEpoch(epoch);
    }, [prewarmSubjectId]);

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

    // Nothing selected → no panel. Child Attention may render commit-critical before the family
    // Settlement locator is known — do not require drawer.type === opportunities in that case, and
    // never treat the child Attention id as an opportunity Settlement key.
    if (!operationalSubjectId) return null;
    if (!isChildSubject && (drawer.type !== "opportunities" || drawer.id == null)) return null;

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
    /*
     * HOLDING THE PRIOR SUBJECT IS ONLY TRUTHFUL WHILE IT IS STILL THE COMMITTED SUBJECT.
     *
     * The committed subject now commits as soon as the operator selects a row, rather than when the
     * provisioning answer for it lands. That is what removes ~1,094ms from the operator's wait - but
     * it means this hold can no longer be unconditional: continuing to paint the previous record's
     * VM underneath the new subject's identity is exactly the mixed-subject frame the atomic-subject
     * contract forbids, and would be a correctness regression traded for latency.
     *
     * So the hold applies only while the held payload IS the committed subject. Once selection has
     * moved on, this yields null and the panel falls to its identity-safe frame: the new subject's
     * identity, the published configured geometry, and reserved UNKNOWN cells - no previous value
     * survives under the new record.
     */
    const heldPriorMatchesCommittedSubject =
        displayVm != null
        && operationalSubjectId != null
        && String(displayVm.entity.id) === String(operationalSubjectId);
    const heldPrior =
        !resolved && holdPriorPayload && displayVm != null && record != null
        && heldPriorMatchesCommittedSubject ?
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
    // Attention subject leads. Settlement loads the family opportunity VM for Household/Children/
    // Billing, but the header must still name the focused child — not "Kurzman Family".
    /**
     * IDENTITY COMMITS FROM THE CLICK, NOT FROM PROVISIONING.
     *
     * `childDisplayName` comes from the answer's identity truth, which arrives with the
     * provisioning answer — measured at 11.9s on a row -> row switch. The seed comes from the
     * clicked row's canonical `QueueRowContext` (`row_subject.display_name`) and is now keyed on
     * LIVE attention, so it names the selected child at the click. Preferring it is what makes
     * identity follow the operator instead of trailing eleven seconds behind; it is also
     * latest-click-wins applied to identity, since attention always carries the newest intent.
     *
     * ATOMIC SUBJECT COHERENCE IS PRESERVED. The header names the child (Attention) while the body
     * renders the family opportunity (Settlement) — the certified composition. Those two only
     * disagree when the body is HOLDING a prior payload across a settlement change, i.e. a switch
     * to a different FAMILY. In exactly that case we keep the previous behaviour and let the held
     * subject own the header, so the panel never shows one child's name over another family's
     * cards. Within one family — every child of the same household, which is the common switch and
     * the measured defect — the body is already the correct family VM and there is nothing to
     * mismatch.
     */
    const seedSubjectTitle = drawer.opportunityQueuePreviewSeed?.title?.trim() || null;
    const seedSubjectImageUrl = drawer.opportunityQueuePreviewSeed?.subjectImageUrl?.trim() || null;
    /*
     * ── IDENTITY IS ON THE CLICK CLOCK; CONTENT IS ON THE HOLD CLOCK (P0-7.2) ──
     *
     * `subjectScope` is written only by the body, from `model.context.participantScope` — which during
     * a hold is the PRIOR subject's VM. The title was already moved onto the seed (the click clock);
     * the avatar had no seed to move onto, so it kept rendering the previous child under the new
     * selection. Measured deployed: the row highlighted at 121 ms while the panel's subject and its
     * images did not change until 5,960 ms.
     *
     * The rule this establishes: held prior CONTENT may remain for continuity; prior subject IDENTITY
     * may not. So the image shown is, in order:
     *   1. the image the SELECTED row is already rendering (known at click time), else
     *   2. the scope's image ONLY while that scope is genuinely this selection's, else
     *   3. nothing — the identity falls back to initials rather than to somebody else's face.
     *
     * Case (3) is the whole point. An unknown image is an honest gap; the previous child's photo
     * labelled as this child is a false statement about who the operator is looking at.
     */
    /*
     * ── THE GUARD MUST BE ON THE CLICK CLOCK TOO (P0-7.2, deployed correction) ──
     *
     * This compared against `operationalSubjectId`, and `OperationalSubjectContext` feeds that from
     * `committed.snapshot` — the COMMIT clock. So in the exact window this guard exists to protect it
     * evaluated "the prior scope against the prior still-committed subject", answered TRUE, and kept
     * the previous child's photo until the provisioning answer committed. Deployed measurement: the
     * header TEXT switched at 183 ms (it reads the seed, which IS click-clocked) while the avatar
     * stayed on the previous child for 5,785 ms across 199 of 485 frames.
     *
     * The seed carries no subject id to compare against, so the click-clocked identity is live
     * ATTENTION — the value `openRecord` writes synchronously from `row.entityId` on the click, and
     * the same id space a child-grain scope's `participationId` is in.
     *
     * Family grain is unaffected: the settled route resolves no participation for an opportunity id
     * and the candidate scan finds no match for one either, so `subjectScope` is null there and this
     * guard never decides anything.
     */
    const clickClockSubjectId = useAttentionSubject();
    const scopeIsThisSelection =
        subjectScope != null
        && clickClockSubjectId != null
        && (subjectScope.participationId === clickClockSubjectId
            || subjectScope.customerMemberId === clickClockSubjectId);
    const identityImageUrl = seedSubjectImageUrl ?? (scopeIsThisSelection ? subjectScope?.imageUrl ?? null : null);
    /*
     * The scope handed to the header carries the SELECTION's image. Everything else about the scope is
     * left exactly as the body resolved it — this narrows one field, it does not become a second
     * participant resolver.
     */
    const headerSubjectScope = subjectScope ? { ...subjectScope, imageUrl: identityImageUrl } : null;
    /*
     * ── S3-1: ACKNOWLEDGED IDENTITY IS MONOTONIC ────────────────────────────────────────────────
     *
     * This chain used to suppress the seed title while the body held a prior payload
     * (`!bodyHoldsPriorSettlement ? seedSubjectTitle : null`), so the header fell through to the
     * HELD subject's name. Each half was defensible on its own; together they reversed the
     * operator's acknowledged intent. Frame-sampled on Firefly, one A → B switch:
     *
     *     2ms  header "Specq0913 Family"   (A)
     *    86ms  header "Kurzman Family"     (B)   ← the click is acknowledged
     *   775ms  header "Specq0913 Family"   (A)   ← REVERTS to the previous subject
     *  2216ms  header "Kurzman Family"     (B)
     *
     * The operator selected Kurzman and was told, for about 1.4 seconds, that they were looking at
     * Specq0913 again. It reproduced whenever the incoming payload was slow enough for the resolved
     * header to render during the hold — i.e. more often on slower connections, not less.
     *
     * The rule now: once chrome has acknowledged a selection, that identity does not move backwards.
     * The seed comes from the clicked row keyed on LIVE attention, so it always carries the newest
     * intent; a resolved payload may still ENRICH the chrome around it (context chips, summary
     * line), but it can no longer rename the subject to a stale one.
     *
     * THE TWO IDENTITIES STAY SEPARATE, which is what makes this safe. Chrome answers "who did the
     * operator select"; the held body answers "what valid content can remain visible while the
     * replacement resolves". The hold/reveal contract below is untouched — nothing here relabels
     * held content as belonging to the new subject, and the body still carries its own subject
     * attribute for anything that needs to know which payload is on screen.
     */
    const headerTitle = seedSubjectTitle || childDisplayName || (visible ? drawerTitle : null);
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
    /*
     * THE KEY IS THE SUBJECT OF ATTENTION — NOT WHICHEVER ID HAPPENS TO HAVE RESOLVED.
     *
     * This read `visible?.displayVm.entity.id ?? operationalSubjectId`, which looks stable and is
     * not. On a CHILD subject those two ids are different things by construction: `operationalSubjectId`
     * is the child Attention id (process_instance / participation) while the drawer VM is an
     * OPPORTUNITY vm keyed on `settlementSubjectId` (the family opportunity — see `drawer` above,
     * "Never key Settlement on the child Attention id"). So the key flipped from child id to
     * opportunity id the moment the VM resolved, and React remounted the whole body.
     *
     * Measured on deployed staging bcd20f004: WU-08 and WU-09 each mounted TWICE on a single cold
     * entry (2366 ms, then 6486 ms), and all three self-fetching cards re-ran their loads —
     * financials/attendance/health each fetched twice with IDENTICAL parameters, 3773 ms apart, with
     * no operator interaction. That is 3 wasted round-trips of 48, plus a second geometry pass on a
     * panel that had already composed.
     *
     * The body directly below documents the intended contract — "the pending → enriched transition is
     * a model PROP CHANGE, never a remount: one commit, one geometry, one card composition, one
     * readiness boundary, zero resize". Keying on the committed subject is what makes that true.
     * `operationalSubjectId` is non-null here (guarded above), and a genuine record switch still
     * changes it, so the keyed swap still remounts and settles when the operator moves.
     */
    /*
     * ── F-4: THE BODY IS ONE SURFACE, NOT ONE PER SUBJECT ────────────────────────────────────────
     *
     * This was `String(operationalSubjectId)`, which made the wrapper a NEW element on every record
     * switch. Everything above about the pending → enriched transition stays true and is why a key
     * exists at all — but keying it on the SUBJECT bought that within-subject stability by paying a
     * full teardown across subjects.
     *
     * Measured on Firefly with a mount counter (not inferred from the DOM): four subject selections
     * produced FOUR mounts and THREE unmounts of the card tree. Every card therefore started from
     * nothing on every selection, which is why no card-level reuse was observable anywhere in the
     * Phase 1 audit, and why a revisit 12.1s later re-fetched a 126 KB answer that was still inside
     * its own 60s TTL.
     *
     * A constant keeps the property that key was introduced for — one element, so the pending →
     * enriched transition remains a PROP CHANGE and cannot re-run a card's load — and drops the one
     * it should never have had. Subject identity is state INSIDE this surface, not the identity OF
     * it.
     *
     * WHAT STILL GUARANTEES SUBJECT COHERENCE. The remount was also acting as a crude reset, so
     * removing it must not let one subject's body render under another's name. It does not: every
     * self-fetching card already clears before it loads (`setVm(null); void load();` in
     * FinancialsCard, and the same shape in Attendance, Health, Scheduling and Assignment), and the
     * hold/reveal contract below (`holdPriorPayload` / `heldPrior`) is the only sanctioned way prior
     * content stays on screen. That contract is unchanged here.
     *
     * The subject still rides the DOM as an attribute so the committed subject is provable in the
     * browser without the element identity having to carry it.
     */
    const bodyRenderKey = String(operationalSubjectId);
    const isActivityMode = focusPanelMode === "activity";
    const activityBodyFillClass = "flex min-h-0 flex-1 flex-col overflow-hidden";

    // Phase A — the body source is the authoritative "which loading/content shell rendered" signal.
    // Cold-loader is LOADING #2; commit-critical-seed is instant seed content; enriched is the live VM.
    const bodySource =
        error && !resolved && !holdPriorPayload ? "error"
        : resolved ? "enriched:resolved"
        : heldPrior ? "enriched:held-prior"
        : operationallyResolved ? "commit-critical-seed"
        // PHASE 1 — the published composition is authoritative but its meaning is not answered yet.
        // The real configured cells commit here and say what they truthfully can (P0-7.4 resolving),
        // instead of the whole surface waiting behind a semantic fact it does not need.
        : structurallyResolved ? "published-structure"
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

    /*
     * BOTH OF THESE ARE MEMOISED BECAUSE THE BODY MEMOISES ON THEM.
     *
     * They used to be object literals written inline in the JSX below, so each one was a new
     * reference on every render of this component. `OpportunityFocusPanelBody` derives its whole
     * focus model with a `useMemo` keyed on them, which meant the model was rebuilt every render
     * and its identity was never stable for a single frame.
     *
     * That is one half of a closed loop. The body reports the settled participant scope back up to
     * `setSubjectScope` when the model changes; storing it re-renders this component; re-rendering
     * rebuilt these two props; rebuilding them produced a new model; the new model reported again.
     * The body now compares the scope by value, which breaks the circuit on its own — but leaving
     * these unstable would keep rebuilding the model and every card composition under it on every
     * render for no reason, which is the cost that made the loop expensive rather than merely
     * present.
     *
     * Contents are unchanged. Only the identity is now allowed to survive a render.
     */
    const enriched = useMemo(
        () => (visible ? { displayVm: visible.displayVm, record: visible.record } : null),
        [visible],
    );
    const commitCritical = useMemo(
        () =>
            // Always keep commit-critical while operationally resolved — including after
            // Settlement — so child Attention can overlay the child's stage mission onto the
            // family Settlement VM (never replace with Lead work).
            operationallyResolved || structurallyResolved
                ? {
                      subjectId: operationalSubjectId ?? "",
                      statusKey: drawer.opportunityQueuePreviewSeed?.statusKey ?? null,
                      stageWorkRuntime: operational.stageWorkRuntime,
                      operationalProjection: operational.operationalProjection,
                      situation: operational.situation
                          ? {
                                stageKey: operational.situation.stageKey,
                                stageLabel: operational.situation.stageLabel,
                                purpose: operational.situation.purpose,
                            }
                          : null,
                      primaryAction: operational.action,
                      // Carried so the panel can SAY there is no configured action, instead of
                      // leaving the operator to guess whether the surface is deliberately empty
                      // or still settling.
                      actionAbsence: operational.actionAbsence,
                      subjectIdentityTruth: operational.subjectIdentityTruth,
                      resolvedParticipant: operational.resolvedParticipant ?? null,
                      resolvedTour: operational.resolvedTour ?? null,
                      // R2 — the answer's resolved grain, carried by the single subject owner.
                      // The panel forwards it; it never decides it.
                      subjectGrain: operational.subjectGrain,
                  }
                : null,
        [
            operationallyResolved,
            operationalSubjectId,
            drawer.opportunityQueuePreviewSeed?.statusKey,
            operational.stageWorkRuntime,
            operational.operationalProjection,
            operational.situation,
            operational.action,
            operational.actionAbsence,
            operational.subjectIdentityTruth,
            operational.resolvedParticipant,
            operational.resolvedTour,
            operational.subjectGrain,
        ],
    );

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
                {...alloySectionDomAttrs("WU-07")}
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
                            subjectScope={headerSubjectScope}
                            title={headerTitle || drawerTitle}
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
                            : // Work mode: the cards should begin close to the Work / Activity
                              // control. Top padding is trimmed; the bottom keeps its breathing
                              // room so the last card never touches the panel edge.
                              "min-h-0 flex-1 overflow-y-auto bg-white px-4 pt-1 pb-3 [scrollbar-gutter:stable]"
                    }
                >
                    {/* STABLE body surface. Subject changes inside it; it is not rebuilt per subject. */}
                    <FocusPanelRenderedSubjectProvider
                        /*
                         * The payload the cards are ACTUALLY rendering, which is not
                         * `bodyRenderKey`. That id is the committed operational snapshot and moves
                         * to the destination fast, while `visible` (resolved ?? heldPrior) is what
                         * is on screen — so during a hold this correctly names the PRIOR subject
                         * and only becomes the destination at the atomic swap. Feeding a diagnostic
                         * from the fast id would label the prior subject's cards as the new one.
                         */
                        value={visible ? String(visible.displayVm.entity.id) : null}
                    >
                    <div
                        key="focus-panel-body"
                        data-focus-panel-body-subject={bodyRenderKey}
                        // The `"pending"` arm this used to carry was already unreachable: the subject
                        // is guarded non-null far above, so the key was never the literal "pending".
                        className={`${MOTION_SETTLE.className}${isActivityMode ? ` ${activityBodyFillClass}` : ""}`}
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
                    : resolved || heldPrior || operationallyResolved || structurallyResolved ?
                        // THE ONE Focus Panel body (A — atomic commit). Commit-critical (from the answer)
                        // OR enriched (from the drawer VM), rendered by the SAME grid instance under a
                        // stable subject key (bodyRenderKey). The pending → enriched transition is a model
                        // PROP CHANGE, never a remount: one commit, one geometry, one card composition,
                        // one readiness boundary, zero resize, zero card-by-card assembly. Settlement only
                        // fills reserved cells in place.
                        <OpportunityFocusPanelBody
                            onSubjectScope={setSubjectScope}
                            mode={focusPanelMode}
                            title={headerTitle || (visible ? drawerTitle : seedTitle)}
                            statusLabel={statusLabel}
                            canMutate={statusCanMutate}
                            enriched={enriched}
                            commitCritical={commitCritical}
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
                    </FocusPanelRenderedSubjectProvider>
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

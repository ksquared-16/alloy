"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CurrentWorkActionPanel from "@/components/admin/focusPanel/cards/CurrentWorkActionPanel";
import CurrentWorkActivityPreview, {
    CurrentWorkActivityKindIcon,
    type CurrentWorkActivityPreviewItem,
} from "@/components/admin/focusPanel/cards/CurrentWorkActivityPreview";
import CurrentWorkFocusedSurface from "@/components/admin/focusPanel/cards/CurrentWorkFocusedSurface";
import { ReadinessSummary } from "@/components/admin/focusPanel/cards/CurrentWorkReadinessSummary";
import { useWorkIntentOutcomeCompletion } from "@/components/workIntent/useWorkIntentOutcomeCompletion";
import { buildCurrentWorkActivityPreviewItemsFromContext } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkActivityPreviewItems";
import { buildCurrentWorkCardEvidence } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkCardEvidence";
import { buildOutcomeCompletionSummary } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildOutcomeCompletionSummary";
import type { CurrentWorkChecklistItem } from "@/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork";
import { resolveWorkItemHandoff } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveWorkItemHandoff";
import { handoffOwnerCardForChecklistScope } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import {
    resolveCurrentWorkRequirementOwner,
    type CurrentWorkRequirementOwner,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkRequirementOwner";
import { planCurrentWorkActionExecution } from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import { resolveCurrentWorkActionButtons } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionButtons";
import CurrentWorkActionButtonContent from "@/components/admin/focusPanel/cards/CurrentWorkActionButtonContent";
import CurrentWorkTourGroupedActions from "@/components/admin/focusPanel/cards/CurrentWorkTourGroupedActions";
import CurrentWorkContextStrip from "@/components/admin/focusPanel/cards/CurrentWorkContextStrip";
import type {
    CurrentWorkActionVM,
    CurrentWorkChecklistItemVM,
    CurrentWorkCompletionSummary,
    CurrentWorkSurfaceVM,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import { useDismissSignal, useReportPerspective } from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import type { FocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { ADMIN_V2_OPPORTUNITY_FOCUS_CURRENT_WORK } from "@/lib/workItems/workItemsNavigation";
import {
    ADMIN_V2_CONTACT_FAMILY_SEND_COMPLETE,
    buildContactFamilySendFollowOnNotice,
    type ContactFamilySendCompleteDetail,
} from "@/lib/communications/v2/familyWorkspace/contactFamilySendComplete";
import ViewInWorkItemsLink from "@/components/workItems/ViewInWorkItemsLink";
import { stageWorkOutcomeEffectLines } from "@/lib/workIntent/stageWorkOutcomeEffectLines";
import { logCurrentWorkInit } from "@/lib/adminV2/runtime/diagnostics/currentWorkInitDiagnostics";
import {
    warmCurrentWorkCapabilitiesForActions,
    warmCurrentWorkCapabilityOnIntent,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/warmCurrentWorkCapabilities";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
    mutation?: FocusPanelMutation;
    /** Summary card in the identity grid, or full Focus Panel workspace takeover. */
    presentation?: "summary" | "workspace";
};

type CompletionPhase = "working" | "select_result" | "confirm" | "processing" | "complete";

export default function CurrentWorkCard({
    model,
    context,
    receded = false,
    coordination,
    mutation,
    presentation = "summary",
}: Props) {
    const evidence = useMemo(() => buildCurrentWorkCardEvidence(context), [context]);
    const vm = evidence.viewModel;
    const surface = vm.surface;
    const opportunityId = context.subject.id;
    // Phase A — count how many times the card re-composes with a distinct evidence identity per
    // subject (seed context → enriched context = two composes for one navigation).
    const cardPerspective = context.stageWorkPending ? "pending" : evidence.isEmpty ? "empty" : "content";
    useEffect(() => {
        logCurrentWorkInit("currentWorkCard.compose", {
            subjectId: opportunityId,
            note: cardPerspective,
            cache: cardPerspective === "pending" ? "miss" : undefined,
        });
    }, [opportunityId, cardPerspective]);

    // Warm configured capabilities on intent: as soon as What's Next shows its actions, prefetch the
    // data each capability's host will need (keyed on the capability host, never the action name) so
    // the centered host opens with warmed content — e.g. Schedule tour shows availability instantly.
    useEffect(() => {
        if (context.stageWorkPending || evidence.isEmpty) return;
        const actions = [
            surface.primaryAction,
            ...surface.supportingActions,
            ...surface.communicationActions,
        ].filter(Boolean) as CurrentWorkActionVM[];
        warmCurrentWorkCapabilitiesForActions(actions, context);
    }, [context, surface, evidence.isEmpty]);
    const { completeOutcome, busy, error, clearError } = useWorkIntentOutcomeCompletion(opportunityId);
    // Slice A: Current Work elevates as a centered Focus Card. It is "open" (focused) when the
    // coordination host marks it open (drill-in / requestFocus) — or, for back-compat, when a
    // caller still passes presentation="workspace". The card then renders the configured-work
    // surface inside the elevated cell instead of a full-canvas replace.
    const isWorkspace = presentation === "workspace" || coordination?.currentWorkWorkspace?.open === true;
    // Tier-2 stage work still resolving — hold a neutral loading treatment in the region's final
    // geometry. A pending projection must NEVER render as "No active work" (false-empty).
    const stageWorkPending = context.stageWorkPending === true;

    const [completionPhase, setCompletionPhase] = useState<CompletionPhase>("working");
    const [pendingOutcomeKey, setPendingOutcomeKey] = useState<string | null>(null);
    const [completionSummary, setCompletionSummary] = useState<CurrentWorkCompletionSummary | null>(null);
    const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
    const [activePanelAction, setActivePanelAction] = useState<CurrentWorkActionVM | null>(null);
    const [activityPreviewOpen, setActivityPreviewOpen] = useState(false);
    /** Work Items → Focus Panel deep-link: highlight the shared work identity when present. */
    const [focusedWorkItemId, setFocusedWorkItemId] = useState<string | null>(null);
    const openWorkspaceTriggerRef = useRef<HTMLButtonElement>(null);

    // Canonical local-time doctrine: activity timestamps render in the operator's resolved timezone.
    const viewerTimeZone = useAdminViewerTimezone();
    const activityPreviewItems = useMemo(
        () => buildCurrentWorkActivityPreviewItemsFromContext(context, {
            currentWorkId: vm.primaryWorkItem?.work_id ?? undefined,
            workTemplateKey: vm.primaryWorkItem?.template_key ?? undefined,
            timeZone: viewerTimeZone,
            limit: 3,
        }),
        [context, vm.primaryWorkItem?.template_key, vm.primaryWorkItem?.work_id, viewerTimeZone],
    );

    const closeActionPanel = useCallback(() => {
        setActivePanelAction(null);
    }, []);

    const handleViewFullActivity = useCallback(() => {
        setActivityPreviewOpen(false);
        coordination?.openFocusPanelMode?.("activity");
    }, [coordination]);

    const handleCloseActivityPreview = useCallback(() => {
        setActivityPreviewOpen(false);
    }, []);

    const handleActionPanelComplete = useCallback(() => {
        closeActionPanel();
    }, [closeActionPanel]);

    const pendingOutcome =
        vm.completionOutcomes.find((row) => row.outcome_key === pendingOutcomeKey) ?? null;

    const resetCompletion = useCallback(() => {
        setCompletionPhase("working");
        setPendingOutcomeKey(null);
        setCompletionSummary(null);
        clearError();
    }, [clearError]);

    const openWorkspace = useCallback(
        (intent: NonNullable<Parameters<NonNullable<FocusPanelCoordination["openCurrentWorkWorkspace"]>>[0]> = {
            kind: "drill_in",
        }) => {
            resetCompletion();
            closeActionPanel();
            coordination?.openCurrentWorkWorkspace?.(intent);
        },
        [closeActionPanel, coordination, resetCompletion],
    );

    const closeWorkspace = useCallback(() => {
        resetCompletion();
        closeActionPanel();
        setActivityPreviewOpen(false);
        coordination?.closeCurrentWorkWorkspace?.();
        queueMicrotask(() => openWorkspaceTriggerRef.current?.focus());
    }, [closeActionPanel, coordination, resetCompletion]);

    // Slice A: report the centered-elevation depth so the host raises this cell (backdrop +
    // centered) — the same path Household/Children use — and collapse on backdrop/ESC dismiss.
    useReportPerspective(coordination, "current_work", isWorkspace ? "focused" : "base");
    useDismissSignal(coordination, "current_work", () => {
        resetCompletion();
        closeActionPanel();
        setActivityPreviewOpen(false);
        coordination?.closeCurrentWorkWorkspace?.();
    });

    useEffect(() => {
        const onFocusCurrentWork = (event: Event) => {
            const detail = (event as CustomEvent<{ opportunity_id?: string; task_id?: string | null }>).detail;
            if (detail?.opportunity_id !== opportunityId) return;
            const taskId = typeof detail.task_id === "string" ? detail.task_id.trim() : "";
            if (taskId) setFocusedWorkItemId(taskId);
            openWorkspace({ kind: "drill_in" });
        };
        window.addEventListener(ADMIN_V2_OPPORTUNITY_FOCUS_CURRENT_WORK, onFocusCurrentWork as EventListener);
        return () => window.removeEventListener(ADMIN_V2_OPPORTUNITY_FOCUS_CURRENT_WORK, onFocusCurrentWork as EventListener);
    }, [openWorkspace, opportunityId]);

    useEffect(() => {
        const onContactFamilySend = (event: Event) => {
            const detail = (event as CustomEvent<ContactFamilySendCompleteDetail>).detail;
            if (!detail || detail.opportunity_id !== opportunityId) return;
            const sentLine = detail.recipient_label
                ? `${detail.success_message} · just now`
                : detail.success_message;
            const followOn = buildContactFamilySendFollowOnNotice({
                associated: detail.associated,
                outcome_key: detail.outcome_key,
            });
            setHandoffNotice(followOn ? `${sentLine} ${followOn}` : sentLine);
            closeActionPanel();
        };
        window.addEventListener(ADMIN_V2_CONTACT_FAMILY_SEND_COMPLETE, onContactFamilySend as EventListener);
        return () =>
            window.removeEventListener(ADMIN_V2_CONTACT_FAMILY_SEND_COMPLETE, onContactFamilySend as EventListener);
    }, [closeActionPanel, opportunityId]);

    // Consume one-shot workspace intents (action panel / record outcome) after mount.
    const workspaceIntent = coordination?.currentWorkWorkspace?.intent ?? null;
    const workspaceIntentKind = workspaceIntent?.kind ?? null;
    const workspaceIntentActionKey =
        workspaceIntent && workspaceIntent.kind === "action" ? workspaceIntent.actionKey : null;
    useEffect(() => {
        if (!isWorkspace || !workspaceIntentKind) return;
        if (workspaceIntentKind === "record_outcome") {
            setCompletionPhase("select_result");
        } else if (workspaceIntentKind === "action" && workspaceIntentActionKey) {
            const allActions = [
                surface.primaryAction,
                surface.recordOutcomeAction,
                ...surface.supportingActions,
                ...surface.communicationActions,
                ...surface.alternatePaths,
            ].filter(Boolean) as CurrentWorkActionVM[];
            const match = allActions.find(
                (action) =>
                    action.key === workspaceIntentActionKey
                    || action.actionRef === workspaceIntentActionKey
                    || action.handlerKey === workspaceIntentActionKey,
            );
            if (match) setActivePanelAction(match);
        }
        coordination?.clearCurrentWorkWorkspaceIntent?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- consume intent once per open
    }, [isWorkspace, workspaceIntentKind, workspaceIntentActionKey]);

    const invokeHeaderDelegate = (action: CurrentWorkActionVM) => {
        const resolved = action.resolved;
        if (resolved && coordination?.invokeHeaderAction) {
            coordination.invokeHeaderAction(resolved);
            return;
        }
        if (coordination?.invokeHeaderAction) {
            coordination.invokeHeaderAction({
                key: action.handlerKey ?? action.key,
                label: action.label,
                description: action.description ?? null,
                action_type: "registry",
                icon: action.icon ?? null,
                style: null,
                display_style: "outline",
                payload: {},
                workflow_id: null,
            });
        }
    };

    // Warm a capability's data on hover/focus of its action (extra lead time before the click) so the
    // host opens with content already in hand. Keyed on the capability host — no action-name branching.
    const warmAction = useCallback(
        (action: CurrentWorkActionVM) => warmCurrentWorkCapabilityOnIntent(action, context),
        [context],
    );

    const invokeAction = (action: CurrentWorkActionVM) => {
        const plan = planCurrentWorkActionExecution(action);
        switch (plan.kind) {
            case "blocked":
                setHandoffNotice(plan.reason);
                return;
            case "unsupported":
                setHandoffNotice(plan.reason);
                return;
            case "record_outcome":
                if (!isWorkspace) {
                    openWorkspace({ kind: "record_outcome" });
                    return;
                }
                closeActionPanel();
                setCompletionPhase("select_result");
                return;
            case "open_workspace":
                openWorkspace({ kind: "drill_in" });
                return;
            case "open_inline_panel":
                setHandoffNotice(null);
                if (!isWorkspace) {
                    openWorkspace({ kind: "action", actionKey: plan.action.key });
                    return;
                }
                setActivePanelAction(plan.action);
                return;
            case "process_transition":
                setHandoffNotice(null);
                if (!isWorkspace) {
                    openWorkspace({ kind: "action", actionKey: plan.action.key });
                    return;
                }
                setActivePanelAction(plan.action);
                return;
            case "communications_composer":
                // #1: open the real communications composer INLINE in the centered surface (not the
                // legacy modal). From the summary, elevate first, then the composer opens inline.
                setHandoffNotice(null);
                if (!isWorkspace) {
                    openWorkspace({ kind: "action", actionKey: action.key });
                    return;
                }
                setActivePanelAction(action);
                return;
            case "header_delegate":
                setHandoffNotice(null);
                invokeHeaderDelegate(plan.action);
                return;
            default:
                setHandoffNotice("This action is not available from What's Next.");
        }
    };

    const handleChecklistItem = (item: CurrentWorkChecklistItemVM) => {
        if (item.status === "complete") return;

        const legacyItem = vm.checklist.find(
            (row) => row.id === item.handoffItemId || row.id === item.key,
        );
        if (legacyItem) {
            handleLegacyChecklistItem(legacyItem);
            return;
        }

        // Owner comes from runtime metadata (Slice E); fall back to the legacy scope map.
        const ownerCard = item.owner?.card ?? handoffOwnerCardForChecklistScope(item.scope);
        if (ownerCard && coordination?.requestFocus) {
            setHandoffNotice(null);
            const source = { card: "current_work" as const, focus: null };
            if (isWorkspace) coordination.closeCurrentWorkWorkspace?.();
            resetCompletion();
            coordination.requestFocus(ownerCard, item.owner?.focus ?? null, source);
            return;
        }

        if (item.actionRef && coordination?.invokeHeaderAction) {
            invokeAction({
                key: item.actionRef,
                label: item.label,
                category: "supporting",
                placement: "current_work_supporting",
                actionRef: item.actionRef,
            });
        }
    };

    const handleLegacyChecklistItem = (item: CurrentWorkChecklistItem) => {
        if (item.state === "complete") return;

        const plan = resolveWorkItemHandoff(item, coordination);
        if (!plan) return;

        switch (plan.kind) {
            case "blocked":
                setHandoffNotice(plan.message);
                return;
            case "activity":
                setHandoffNotice(null);
                setActivityPreviewOpen(true);
                return;
            case "header_action": {
                const composerAction = coordination?.resolveCommunicationsComposerAction?.();
                if (composerAction && coordination?.invokeHeaderAction) {
                    setHandoffNotice(null);
                    coordination.invokeHeaderAction(composerAction);
                    return;
                }
                setHandoffNotice(
                    "No communications composer is available — open Activity or add Communications to this panel.",
                );
                return;
            }
            case "focus": {
                setHandoffNotice(null);
                const source = { card: "current_work" as const, focus: null };
                if (isWorkspace) coordination?.closeCurrentWorkWorkspace?.();
                resetCompletion();
                coordination?.requestFocus(plan.card, plan.focus, source);
                return;
            }
        }
    };

    const handleConfirmOutcome = useCallback(() => {
        if (!pendingOutcomeKey || !vm.primaryProjection || !vm.primaryWorkItem) return;
        setCompletionPhase("processing");
        void completeOutcome(vm.primaryProjection, pendingOutcomeKey).then(() => {
            const effectLines = stageWorkOutcomeEffectLines(vm.primaryWorkItem!, pendingOutcomeKey);
            setCompletionSummary(
                buildOutcomeCompletionSummary({
                    workItem: vm.primaryWorkItem!,
                    outcomeKey: pendingOutcomeKey,
                    effectLines,
                }),
            );
            setCompletionPhase("complete");
            setPendingOutcomeKey(null);
        });
    }, [completeOutcome, pendingOutcomeKey, vm.primaryProjection, vm.primaryWorkItem]);

    // #6: the status is expressed through the SHARED UniversalCard status-chip system (one canonical
    // chip aligned with the card title), never a bespoke pill nested inside the card's own status
    // slot (that double-pill was the "detached, unfinished" look). Tone is derived generically from
    // the surface status — no per-process/per-stage styling.
    const statusChip = surface.statusLabel;
    const statusTone: "blocked" | "done" | "neutral" =
        surface.status === "blocked" ? "blocked"
        : surface.status === "completed" ? "done"
        :   "neutral";

    // Footer opens recent activity (same canonical preview as the Activity timeline), not a
    // second work surface. Focused Current Work still opens via Work Items → Open work.
    const canPreviewActivity =
        !isWorkspace
        && !stageWorkPending
        && !evidence.isEmpty
        && completionPhase !== "complete";
    const footerAction = canPreviewActivity ? (
        <div className="alloy-os-currentwork__activity-link-wrap relative">
            <button
                ref={openWorkspaceTriggerRef}
                type="button"
                className="alloy-os-currentwork__summary-open"
                data-work-action="preview-activity"
                aria-expanded={activityPreviewOpen}
                onClick={() => setActivityPreviewOpen((open) => !open)}
            >
                View activity
            </button>
            <CurrentWorkActivityPreview
                open={activityPreviewOpen}
                items={activityPreviewItems}
                onClose={handleCloseActivityPreview}
                onViewFullActivity={handleViewFullActivity}
                triggerRef={openWorkspaceTriggerRef}
            />
        </div>
    ) : null;
    const stageLabel = context.businessProcess?.stageKey ?? null;
    const ownerLabel = null;

    void stageLabel;
    void ownerLabel;

    // Slice A: the focused (elevated) state renders a PURPOSE-BUILT centered configured-work
    // surface — NOT the legacy two-column workspace body — inside the same UniversalCard so the
    // grid's centered elevation applies. Summary and focused share one card; only the body swaps.
    const focusedBody = (
        <CurrentWorkFocusedSurface
            surface={surface}
            completionPhase={completionPhase}
            pendingOutcome={pendingOutcome}
            pendingOutcomeKey={pendingOutcomeKey}
            busy={busy}
            error={error}
            handoffNotice={handoffNotice}
            activityItems={activityPreviewItems}
            truth={context.truth as Record<string, unknown>}
            onChecklistItem={handleChecklistItem}
            onAction={invokeAction}
            onWarm={warmAction}
            onSelectOutcome={(key) => {
                clearError();
                setPendingOutcomeKey(key);
                setCompletionPhase("confirm");
            }}
            onCancelOutcome={() => {
                setPendingOutcomeKey(null);
                setCompletionPhase("working");
            }}
            onConfirmOutcome={handleConfirmOutcome}
            onClose={closeWorkspace}
            actionPanel={
                activePanelAction ?
                    <CurrentWorkActionPanel
                        action={activePanelAction}
                        context={context}
                        mutation={mutation}
                        onClose={closeActionPanel}
                        onComplete={handleActionPanelComplete}
                    />
                :   null
            }
        />
    );

    const body =
        stageWorkPending ? (
            <div className="alloy-os-household__summary" data-work-pending="true" aria-busy="true">
                <p className="alloy-os-household__row-detail alloy-os-currentwork__pending" aria-label="Loading What's Next">
                    Loading What&apos;s Next…
                </p>
            </div>
        ) : evidence.isEmpty ? (
            <div className="alloy-os-household__summary" data-work-empty="true">
                <p className="alloy-os-household__row-detail">No What&apos;s Next configured</p>
            </div>
        ) : completionPhase === "complete" && completionSummary ?
            <OutcomeCompleteBody
                surface={surface}
                summary={completionSummary}
                activityPreviewOpen={activityPreviewOpen}
                onToggleActivityPreview={() => setActivityPreviewOpen((open) => !open)}
                onCloseActivityPreview={handleCloseActivityPreview}
                onViewFullActivity={handleViewFullActivity}
                activityPreviewItems={activityPreviewItems}
                onContinue={() => {
                    resetCompletion();
                }}
            />
        : isWorkspace ? focusedBody
        :   <SummaryBody
                surface={surface}
                opportunityId={opportunityId}
                focusedWorkItemId={focusedWorkItemId}
                truth={context.truth as Record<string, unknown>}
                activityItems={activityPreviewItems}
                onChecklistItem={handleChecklistItem}
                onAction={invokeAction}
                onWarm={warmAction}
            />;

    // Shared hosted-capability mode: when a capability panel is active in the focused card, What's
    // Next collapses to a COMPACT CONTEXT FRAME — the explanatory sentence is dropped and the card
    // becomes a fill/scroll host so the capability's own footer stays visible. Driven by the
    // presence of an active capability, never by action name.
    const capabilityActive = isWorkspace && activePanelAction != null;

    return (
        <div
            className="alloy-os-household alloy-os-currentwork"
            data-work-card="true"
            data-work-card-perspective={stageWorkPending ? "pending" : evidence.isEmpty ? "empty" : isWorkspace ? "focused" : "summary"}
            data-capability-active={capabilityActive ? "true" : undefined}
            data-current-work-surface="true"
            data-focused-work-id={focusedWorkItemId ?? undefined}
        >
            {capabilityActive ?
                <button
                    type="button"
                    className="alloy-os-currentwork__capability-close"
                    onClick={closeActionPanel}
                    aria-label="Close composer"
                    data-work-action-panel-close="true"
                >
                    Close
                </button>
            :   null}
            <UniversalCard
                title={vm.microLabel}
                insight={surface.title}
                supportingInsight={null}
                iconName={model.iconName}
                tier={model.tier}
                archetype="status"
                statusChip={statusChip}
                statusTone={statusTone}
                density="compact"
                gridSpan={model.span}
                data-universal-card-key={model.key}
                receded={receded}
                footerAction={footerAction}
            >
                {body}
            </UniversalCard>
        </div>
    );
}

// ReadinessSummary (Slice E ownership grouping) lives in its own module so the focused
// configured-work surface (Slice A) can reuse it without a circular import. Re-exported here
// for back-compat with existing importers.
export { ReadinessSummary } from "@/components/admin/focusPanel/cards/CurrentWorkReadinessSummary";

function SummaryBody({
    surface,
    opportunityId,
    focusedWorkItemId,
    truth,
    activityItems,
    onChecklistItem,
    onAction,
    onWarm,
}: {
    surface: CurrentWorkSurfaceVM;
    opportunityId: string;
    focusedWorkItemId: string | null;
    truth?: Record<string, unknown> | null;
    activityItems: CurrentWorkActivityPreviewItem[];
    onChecklistItem: (item: CurrentWorkChecklistItemVM) => void;
    onAction: (action: CurrentWorkActionVM) => void;
    onWarm: (action: CurrentWorkActionVM) => void;
}) {
    // ONE shared derivation so the summary and the focused "View details" surface show the SAME
    // buttons — a dominant command (or outcome when outcome-led), configured helpful actions, and
    // Record outcome as a subordinate button when a command leads.
    const { dominant, helpful, subordinateOutcome, dominantIsOutcome } = resolveCurrentWorkActionButtons(surface);
    const workId = surface.primaryWorkItem?.work_id?.trim() || "";
    const workItemsLinkActive =
        Boolean(workId) && (!focusedWorkItemId || focusedWorkItemId === workId);

    /**
     * Why this work cannot be resolved. The summary is where the "Blocked" chip appears, so it is
     * where the reason belongs — a status word with no explanation is the dead end this sprint
     * exists to remove. Computed by the runtime, previously discarded here.
     */
    const outcomeBlockReason =
        !surface.showOutcomeCompletion ? surface.outcomeCompletionBlockReason?.trim() || null : null;

    const hasSupporting = helpful.length > 0 || Boolean(subordinateOutcome);
    const recentActivity = activityItems.slice(0, 3);

    return (
        <div
            className="alloy-os-currentwork__summary"
            data-work-summary="true"
            data-focused-work-id={focusedWorkItemId ?? undefined}
            role="group"
            aria-label="What's Next summary"
        >
            {outcomeBlockReason ?
                <p className="alloy-os-currentwork__outcome-blocked" data-work-outcome-blocked="true" role="status">
                    {outcomeBlockReason}
                </p>
            :   null}
            <div className="alloy-os-currentwork__summary-controls">
                <CurrentWorkContextStrip surface={surface} truth={truth} />
                {dominant ?
                    <div className="alloy-os-currentwork__primary-stack" data-work-primary-stack="true">
                        <div className="alloy-os-currentwork__primary-lead" data-work-primary-row="true">
                            <button
                                type="button"
                                className="alloy-os-currentwork__primary-action"
                                data-work-primary-action={dominant.key}
                                data-work-action={dominantIsOutcome ? "record-outcome" : undefined}
                                onClick={() => onAction(dominant)}
                                onMouseEnter={() => onWarm(dominant)}
                                onFocus={() => onWarm(dominant)}
                            >
                                <CurrentWorkActionButtonContent action={dominant} />
                            </button>
                        </div>
                        {hasSupporting ?
                            <div
                                className="alloy-os-currentwork__supporting-row"
                                data-work-supporting-row="true"
                            >
                                {helpful.length > 0 ?
                                    <CurrentWorkTourGroupedActions
                                        actions={helpful}
                                        onAction={onAction}
                                        onWarm={onWarm}
                                        variant="summary"
                                    />
                                :   null}
                                {subordinateOutcome ?
                                    <button
                                        type="button"
                                        className="alloy-os-currentwork__record-outcome alloy-os-currentwork__record-outcome--summary"
                                        data-work-action="record-outcome"
                                        onClick={() => onAction(subordinateOutcome)}
                                    >
                                        <CurrentWorkActionButtonContent action={subordinateOutcome} />
                                    </button>
                                :   null}
                            </div>
                        :   null}
                    </div>
                :   null}
                <ReadinessSummary surface={surface} onNavigate={onChecklistItem} />
                {recentActivity.length > 0 ?
                    <div className="alloy-os-currentwork__recent-activity" data-work-recent-activity="true">
                        <p className="alloy-os-currentwork__context-label">Recent activity</p>
                        <ul className="alloy-os-currentwork__recent-activity-list">
                            {recentActivity.map((item, index) => (
                                <li key={`${item.label}-${item.occurredAt ?? index}`}>
                                    <span className="alloy-os-currentwork__recent-activity-icon" aria-hidden>
                                        <CurrentWorkActivityKindIcon kind={item.kind} />
                                    </span>
                                    <span className="alloy-os-currentwork__recent-activity-body">
                                        <span className="alloy-os-currentwork__recent-activity-label">{item.label}</span>
                                        {item.occurredAt ?
                                            <span className="alloy-os-currentwork__recent-activity-when">{item.occurredAt}</span>
                                        :   null}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                :   null}
                {workId ?
                    <div
                        className="mt-2 flex flex-wrap items-center gap-2"
                        data-current-work-work-items-link="true"
                        data-work-items-link-active={workItemsLinkActive ? "true" : undefined}
                    >
                        <span className="text-[10px] text-alloy-midnight/50">Also in Work Items</span>
                        <ViewInWorkItemsLink
                            taskId={workId}
                            opportunityId={opportunityId}
                            source="business_process"
                        />
                    </div>
                :   null}
            </div>
        </div>
    );
}

function OutcomeCompleteBody({
    surface,
    summary,
    activityPreviewOpen,
    onToggleActivityPreview,
    onCloseActivityPreview,
    onViewFullActivity,
    activityPreviewItems,
    onContinue,
}: {
    surface: CurrentWorkSurfaceVM;
    summary: CurrentWorkCompletionSummary;
    activityPreviewOpen: boolean;
    onToggleActivityPreview: () => void;
    onCloseActivityPreview: () => void;
    onViewFullActivity?: () => void;
    activityPreviewItems: CurrentWorkActivityPreviewItem[];
    onContinue: () => void;
}) {
    const triggerRef = useRef<HTMLButtonElement>(null);

    return (
        <div className="alloy-os-currentwork__complete" data-work-completion="complete">
            <p className="alloy-os-currentwork__complete-eyebrow">What's Next</p>
            <span className="alloy-os-card-pill alloy-os-card-pill--complete">Completed</span>
            <h3 className="alloy-os-currentwork__complete-title">{surface.title}</h3>
            <p className="alloy-os-currentwork__complete-outcome">{summary.outcomeLabel}</p>
            <div className="alloy-os-currentwork__complete-changes">
                {summary.changeLines.map((line) => (
                    <p key={line} className="alloy-os-currentwork__complete-change">
                        ✓ {line}
                    </p>
                ))}
                <p className="alloy-os-currentwork__complete-summary">{summary.summary}</p>
            </div>
            {summary.nextReminderLabel ?
                <p className="alloy-os-currentwork__complete-reminder">{summary.nextReminderLabel}</p>
            :   null}
            {summary.nextWorkLabel ?
                <div className="alloy-os-currentwork__complete-next">
                    <p className="alloy-os-currentwork__supporting-title">What&apos;s next</p>
                    <p className="alloy-os-currentwork__complete-next-label">{summary.nextWorkLabel}</p>
                </div>
            :   null}
            <div className="alloy-os-card-nav" data-work-complete-actions="true">
                <div className="alloy-os-currentwork__activity-link-wrap">
                    <button
                        ref={triggerRef}
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        onClick={onToggleActivityPreview}
                        aria-expanded={activityPreviewOpen}
                        data-work-action="preview-activity"
                    >
                        View recent activity
                    </button>
                    <CurrentWorkActivityPreview
                        open={activityPreviewOpen}
                        items={activityPreviewItems}
                        onClose={onCloseActivityPreview}
                        onViewFullActivity={onViewFullActivity}
                        triggerRef={triggerRef}
                    />
                </div>
                <button
                    type="button"
                    className="alloy-os-ucard__action alloy-os-ucard__action--system5 alloy-os-ucard__action--cta"
                    onClick={onContinue}
                >
                    Continue Work
                </button>
            </div>
        </div>
    );
}

"use client";

import clsx from "clsx";
import dynamic from "next/dynamic";

import ArchetypeCardBody from "@/components/admin/focusPanel/ArchetypeCardBody";
import HouseholdCard from "@/components/admin/focusPanel/cards/HouseholdCard";
import ChildrenCard from "@/components/admin/focusPanel/cards/ChildrenCard";
import EmploymentCard from "@/components/admin/focusPanel/cards/EmploymentCard";
import SchedulingCard from "@/components/admin/focusPanel/cards/SchedulingCard";
import CurrentWorkCard from "@/components/admin/focusPanel/cards/CurrentWorkCard";
import ReadinessCard from "@/components/admin/focusPanel/cards/ReadinessCard";
import TourCard from "@/components/admin/focusPanel/cards/TourCard";
import CommunicationsCard from "@/components/admin/focusPanel/cards/CommunicationsCard";
import BillingPreviewCard from "@/components/admin/focusPanel/cards/BillingPreviewCard";
import TimelineCard from "@/components/admin/focusPanel/cards/TimelineCard";
import MilestonesCard from "@/components/admin/focusPanel/cards/MilestonesCard";
import AttendanceCard from "@/components/admin/focusPanel/cards/AttendanceCard";
import BusinessProcessCard from "@/components/admin/focusPanel/cards/BusinessProcessCard";
import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import ProofDoctrineLifecycleRail from "@/components/layout/proofShell/ProofDoctrineLifecycleRail";
// Drill-only content: renders ONLY inside the `documents` / `notes` cards on drill-down (an operator
// interaction), never at first paint — yet statically importing it forced the whole tab-panes graph
// (CommunicationsDrawerSection ~1.4k lines + EntityDocumentsSection) into FocusPanelCardRenderer's
// first-paint chunk. Load on drill so it leaves the critical path.
const OpportunityDrawerVmTabPanes = dynamic(
    () => import("@/components/admin/vmDrawer/OpportunityDrawerVmTabPanes"),
    { ssr: false },
);
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { FocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { system5ArchetypeSuppressesFooterAction } from "@/lib/adminV2/runtime/focusPanel/system5CardArchetypes";
import type { DrawerTabKey } from "@/lib/entityPresentation";

/**
 * INTERNAL COMPATIBILITY ONLY — isolated drawer/VM drill dependencies for the four
 * not-yet-migrated cards (`workflow_steps` / `timeline` / `documents` / `notes`).
 * This is deliberately NOT part of the main card contract: pure cards (Household and
 * every archetype-payload card) never read it. It is removed entirely once the drill
 * cards are re-projected from `OperationalContext` (Phase D1).
 *
 * @see focus-panel-runtime-cutover-report.md
 */
export type FocusPanelCardCompat = {
    /** Drawer-tab drill navigation — the last compat dependency; migrates out with the tab-pane cards. */
    onSelectTab: (tab: DrawerTabKey) => void;
};

type Props = {
    model: FocusPanelCardModel;
    /**
     * Canonical card boundary. Subject identity (`context.subject.id`) and observed
     * truth (`context.truth`) come from here — cards never take a separate `drawerId`
     * or `record`. @see operational-context-boundary.md
     */
    context: OperationalContext;
    /** Card composition mode (Summary / Work / Activity) — presentation, not subject-shaped. */
    focusPanelMode: FocusPanelMode;
    onPrimaryAction?: (key: FocusPanelCardKey) => void;
    receded?: boolean;
    /** Cross-card handoff orchestration (Perspective Change on owner cards). */
    coordination?: FocusPanelCoordination;
    /** Injected save seam for truth cards (Edit depth). Absent → cards stay read-only. */
    mutation?: FocusPanelMutation;
    /** Internal compatibility wrapper — see {@link FocusPanelCardCompat}. Pure cards ignore it. */
    compat: FocusPanelCardCompat;
};

function CardFooterAction({
    model,
    onPrimaryAction,
}: {
    model: FocusPanelCardModel;
    onPrimaryAction?: (key: FocusPanelCardKey) => void;
}) {
    if (!model.primaryAction) return null;
    return (
        <button
            type="button"
            className={clsx(
                "alloy-os-ucard__action",
                "alloy-os-ucard__action--system5",
                model.primaryAction.variant === "primary" && "alloy-os-ucard__action--primary",
            )}
            onClick={() => onPrimaryAction?.(model.key)}
        >
            {model.primaryAction.label}
        </button>
    );
}

/** Renders one Universal Card by System 5A archetype — body is drill detail or structured payload. */
export default function FocusPanelCardRenderer({
    model,
    context,
    focusPanelMode,
    onPrimaryAction,
    receded = false,
    coordination,
    mutation,
    compat,
}: Props) {
    if (!model.visible) return null;

    // Household is the first operational reference card (Identity archetype). It
    // observes the Operational Context (not the drawer VM), owns its collapsed →
    // expanded → focused-evidence perspective state locally, and assembles its
    // answer from `context.truth` — no fetch on expand. It therefore bypasses the
    // generic profile-payload body. NOTE: pure cards read only `model` + `context`.
    if (model.key === "household") {
        return (
            <HouseholdCard
                model={model}
                context={context}
                receded={receded}
                coordination={coordination}
                mutation={mutation}
            />
        );
    }

    // Core Four operational cards — pure cards on the Operational Context boundary.
    // Each owns its collapsed → expanded → focused perspective locally and derives
    // its answer from `context` (truth + projected signals). No fetch on expand.
    // `coordination` lets a referencing card hand off focus here (Perspective Change).
    if (model.key === "children") {
        return (
            <ChildrenCard
                model={model}
                context={context}
                receded={receded}
                coordination={coordination}
                mutation={mutation}
            />
        );
    }
    // Employment reads the person-owned composition projected onto the context. Pure card: it
    // observes `model` + `context` only, and never mutates — Add/Edit/End live at
    // /organization/staff, so this surface has exactly one execution path for the capability.
    // `staff` is the person-grain successor to this presentation. One component, because the two
    // keys name one owner's truth at two grains — a second component would be a second presentation.
    if (model.key === "employment" || model.key === "staff") {
        return (
            <EmploymentCard model={model} context={context} receded={receded} coordination={coordination} />
        );
    }
    // Attendance reads its own composed VM for the SCOPED participant; the panel stays case-grain.
    if (model.key === "attendance") {
        return (
            <AttendanceCard model={model} context={context} receded={receded} coordination={coordination} />
        );
    }
    if (model.key === "scheduling") {
        return (
            <SchedulingCard model={model} context={context} receded={receded} coordination={coordination} />
        );
    }
    // The production Business Process card — the canonical successor's own presentation. Current
    // Work remains a consumed data owner (the evidence builder reads it); what changed is which
    // card renders, not who owns the truth.
    if (model.key === "business_process") {
        return (
            <BusinessProcessCard
                model={model}
                context={context}
                receded={receded}
                coordination={coordination}
            />
        );
    }
    if (model.key === "current_work") {
        return (
            <CurrentWorkCard
                model={model}
                context={context}
                receded={receded}
                coordination={coordination}
                mutation={mutation}
            />
        );
    }
    if (model.key === "readiness_kpi") {
        return <ReadinessCard model={model} context={context} receded={receded} coordination={coordination} />;
    }

    // Tour, Communications, BillingPreview, Timeline — pure cards on the Operational
    // Context boundary. Each derives its answer from context.signals or context.truth.
    // No compat wrapper needed.
    if (model.key === "tour_summary") {
        return <TourCard model={model} context={context} receded={receded} mutation={mutation} />;
    }
    if (model.key === "communications") {
        return (
            <CommunicationsCard
                model={model}
                context={context}
                receded={receded}
                coordination={coordination}
                mutation={mutation}
            />
        );
    }
    if (model.key === "billing_preview") {
        return <BillingPreviewCard model={model} context={context} receded={receded} coordination={coordination} />;
    }
    if (model.key === "milestones") {
        return (
            <MilestonesCard
                model={model}
                context={context}
                receded={receded}
                coordination={coordination}
            />
        );
    }
    if (model.key === "timeline") {
        return <TimelineCard model={model} context={context} receded={receded} />;
    }

    // Subject identity + observed truth derive from the Operational Context. Only the
    // not-yet-migrated drill cards below reach into the compat wrapper for the legacy
    // lifecycle rail + drawer-tab panes (Phase D1).
    const drawerId = context.subject.id;
    const record = context.truth;

    // The lifecycle rail is a SETTLEMENT projection carried on the context (built by the enriched
    // adapter). At commit it is null → `workflow_steps` renders reserved; the drawer VM fills it.
    const lifecycleRailModel = context.lifecycleRail ?? null;
    const drillDownAllowed = model.density === "standard" || model.density === "expanded";
    const suppressFooter = system5ArchetypeSuppressesFooterAction(model.archetype);
    const isLauncher = model.archetype === "launcher";

    let drillBody: React.ReactNode = null;

    switch (model.key) {
        case "workflow_steps":
            drillBody =
                lifecycleRailModel && lifecycleRailModel.steps.length > 0 ?
                    <ProofDoctrineLifecycleRail model={lifecycleRailModel} aria-label="Workflow steps" />
                :   null;
            break;
        case "documents":
            if (drillDownAllowed) {
                drillBody = (
                    <OpportunityDrawerVmTabPanes
                        drawerId={drawerId}
                        drawerTab="documents"
                        record={record}
                        onSelectTab={compat.onSelectTab}
                    />
                );
            }
            break;
        case "notes":
            if (drillDownAllowed) {
                drillBody = (
                    <OpportunityDrawerVmTabPanes
                        drawerId={drawerId}
                        drawerTab="notes"
                        record={record}
                        onSelectTab={compat.onSelectTab}
                    />
                );
            }
            break;
        default:
            break;
    }

    const archetypeBody = (
        <ArchetypeCardBody
            archetype={model.archetype}
            payload={model.payload}
            fallbackBody={drillBody}
        />
    );

    const body = isLauncher ? archetypeBody : (
        <>
            {archetypeBody}
            {drillBody && model.archetype !== "timeline" && model.archetype !== "launcher" ?
                <div className="alloy-os-ucard__drill">{drillBody}</div>
            :   null}
        </>
    );

    const showBody = body != null && model.density !== "micro" && (isLauncher || model.payload || drillBody);
    const isPrimaryNextAction = model.key === "primary_next_action";
    const hideHeaderInsight = isLauncher;

    return (
        <UniversalCard
            title={model.title}
            insight={hideHeaderInsight ? "" : model.insight}
            supportingInsight={isLauncher ? model.insight : model.secondaryInsight}
            iconName={model.iconName}
            tier={model.tier}
            archetype={model.archetype}
            statusChip={model.statusChip}
            statusTone={model.statusTone}
            density={model.density}
            gridSpan={model.span}
            data-universal-card-key={model.key}
            receded={receded}
            className={isPrimaryNextAction ? "alloy-os-ucard--primary-action" : undefined}
            footerAction={
                !suppressFooter && model.primaryAction && model.density !== "micro" ?
                    <CardFooterAction model={model} onPrimaryAction={onPrimaryAction} />
                :   null
            }
        >
            {showBody ? body : null}
        </UniversalCard>
    );
}

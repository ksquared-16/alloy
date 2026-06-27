"use client";

import clsx from "clsx";

import ArchetypeCardBody from "@/components/admin/focusPanel/ArchetypeCardBody";
import HouseholdCard from "@/components/admin/focusPanel/cards/HouseholdCard";
import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import ProofDoctrineLifecycleRail from "@/components/layout/proofShell/ProofDoctrineLifecycleRail";
import OpportunityDrawerVmTabPanes from "@/components/admin/vmDrawer/OpportunityDrawerVmTabPanes";
import { buildOpportunityVmLifecycleRailModel } from "@/lib/adminV2/viewModel/drawer/vmRuntime/buildOpportunityVmLifecycleRailModel";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import { system5ArchetypeSuppressesFooterAction } from "@/lib/adminV2/runtime/focusPanel/system5CardArchetypes";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";

type Props = {
    model: FocusPanelCardModel;
    displayVm: OpportunityDrawerViewModel;
    drawerId: string;
    record: Record<string, unknown>;
    opportunitySingular: string;
    canMutate: boolean;
    focusPanelMode: FocusPanelMode;
    onSelectTab: (tab: DrawerTabKey) => void;
    onPrimaryAction?: (key: FocusPanelCardKey) => void;
    receded?: boolean;
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
    displayVm,
    drawerId,
    record,
    opportunitySingular,
    canMutate,
    focusPanelMode,
    onSelectTab,
    onPrimaryAction,
    receded = false,
}: Props) {
    if (!model.visible) return null;

    // Household is the first operational reference card (Identity archetype). It
    // owns its collapsed → expanded → focused-evidence perspective state locally
    // and assembles its answer from the already-loaded record — no fetch on
    // expand. It therefore bypasses the generic profile-payload body.
    if (model.key === "household") {
        return <HouseholdCard model={model} record={record} receded={receded} />;
    }

    const lifecycleRailModel = buildOpportunityVmLifecycleRailModel({ displayVm, drawerId });
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
        case "communications":
            if (focusPanelMode !== "activity" && model.secondaryInsight) {
                drillBody = <p className="alloy-os-ucard__secondary-line">{model.secondaryInsight}</p>;
            }
            break;
        case "timeline":
            if (drillDownAllowed) {
                drillBody = (
                    <OpportunityDrawerVmTabPanes
                        drawerId={drawerId}
                        drawerTab="activity"
                        record={record}
                        onSelectTab={onSelectTab}
                    />
                );
            }
            break;
        case "documents":
            if (drillDownAllowed) {
                drillBody = (
                    <OpportunityDrawerVmTabPanes
                        drawerId={drawerId}
                        drawerTab="documents"
                        record={record}
                        onSelectTab={onSelectTab}
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
                        onSelectTab={onSelectTab}
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

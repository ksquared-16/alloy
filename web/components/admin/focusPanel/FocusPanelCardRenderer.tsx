"use client";

import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import ProofDoctrineLifecycleRail from "@/components/layout/proofShell/ProofDoctrineLifecycleRail";
import CommunicationsDrawerSection from "@/components/admin/communications/CommunicationsDrawerSection";
import OpportunityDrawerVmTabPanes from "@/components/admin/vmDrawer/OpportunityDrawerVmTabPanes";
import { buildOpportunityVmLifecycleRailModel } from "@/lib/adminV2/viewModel/drawer/vmRuntime/buildOpportunityVmLifecycleRailModel";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";

type Props = {
    model: FocusPanelCardModel;
    displayVm: OpportunityDrawerViewModel;
    drawerId: string;
    record: Record<string, unknown>;
    opportunitySingular: string;
    canMutate: boolean;
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
                model.primaryAction.variant === "primary" && "alloy-os-ucard__action--primary",
            )}
            onClick={() => onPrimaryAction?.(model.key)}
        >
            {model.primaryAction.label}
        </button>
    );
}

/** Renders one Universal Card blueprint — body is drill detail only, never a field dump. */
export default function FocusPanelCardRenderer({
    model,
    displayVm,
    drawerId,
    record,
    opportunitySingular,
    canMutate,
    onSelectTab,
    onPrimaryAction,
    receded = false,
}: Props) {
    if (!model.visible) return null;

    const lifecycleRailModel = buildOpportunityVmLifecycleRailModel({ displayVm, drawerId });
    const drillDownAllowed = model.density === "standard" || model.density === "expanded";

    let body: React.ReactNode = null;

    switch (model.key) {
        case "work_launcher":
            body = (
                <div className="alloy-os-work-launcher-rows" data-work-launcher-compact="true">
                    <button type="button" className="alloy-os-work-launcher-row">◦ Manual work</button>
                    <button type="button" className="alloy-os-work-launcher-row">◦ BOS Assist</button>
                    <button type="button" className="alloy-os-work-launcher-row">◦ Import / Intake</button>
                </div>
            );
            break;
        case "workflow_steps":
            body =
                lifecycleRailModel && lifecycleRailModel.steps.length > 0 ?
                    <ProofDoctrineLifecycleRail model={lifecycleRailModel} aria-label="Workflow steps" />
                :   null;
            break;
        case "communications":
            if (drillDownAllowed) {
                body = (
                    <CommunicationsDrawerSection
                        apiEntityType="opportunities"
                        entityId={drawerId}
                        embedded
                        embeddedHeaderMode="description_only"
                    />
                );
            }
            break;
        case "timeline":
            if (drillDownAllowed) {
                body = (
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
                body = (
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
                body = (
                    <OpportunityDrawerVmTabPanes
                        drawerId={drawerId}
                        drawerTab="notes"
                        record={record}
                        onSelectTab={onSelectTab}
                    />
                );
            }
            break;
        case "children":
            if (model.secondaryInsight) {
                body = <p className="text-[12px] text-alloy-midnight/65">{model.secondaryInsight}</p>;
            }
            break;
        case "household":
            if (model.secondaryInsight && model.secondaryInsight !== model.insight) {
                body = <p className="text-[12px] text-alloy-midnight/65">{model.secondaryInsight}</p>;
            }
            break;
        case "tasks":
            if (displayVm.summaries.tasks?.open_tasks?.length) {
                body = (
                    <ul className="alloy-os-ucard__list">
                        {displayVm.summaries.tasks.open_tasks.slice(0, 3).map((t) => (
                            <li key={t.id ?? t.title}>{t.title ?? "Task"}</li>
                        ))}
                    </ul>
                );
            }
            break;
        default:
            break;
    }

    const showBody = body != null && body !== false && model.density !== "micro";

    return (
        <UniversalCard
            title={model.title}
            insight={model.insight}
            tier={model.tier}
            statusChip={model.statusChip}
            statusTone={model.statusTone}
            density={model.density}
            gridSpan={model.span}
            data-universal-card-key={model.key}
            receded={receded}
            footerAction={
                model.primaryAction && model.density !== "micro" ?
                    <CardFooterAction model={model} onPrimaryAction={onPrimaryAction} />
                :   null
            }
        >
            {showBody ? body : null}
        </UniversalCard>
    );
}

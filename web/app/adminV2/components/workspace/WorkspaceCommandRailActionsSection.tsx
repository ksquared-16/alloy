"use client";

import type { ReactNode } from "react";

import ActionsBlock from "@/app/adminV2/components/workspace/blocks/ActionsBlock";
import { CommandRailCollapsibleActionsSection } from "@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";
import type { ActionsVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";

type Surface = "department" | "work_unit" | "company";

type Props = {
    model: ActionsVm;
    onAction: WorkspaceActionHandler;
    surface: Surface;
    actionCount: number | null;
    loading?: boolean;
    title?: string;
    slotTestId?: string;
    slotState?: string;
    footer?: ReactNode;
};

/**
 * Shared command-rail Actions shell — same collapsible header, panel chrome, and button stack
 * on department (/workspace/dept) and work-unit surfaces.
 */
export function WorkspaceCommandRailActionsSection({
    model,
    onAction,
    surface,
    actionCount,
    loading = false,
    title = "Actions",
    slotTestId,
    slotState,
    footer,
}: Props) {
    return (
        <CommandRailCollapsibleActionsSection actionCount={actionCount} loading={loading}>
            <section
                className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary"
                data-ws-command-rail-actions-surface={surface}
                {...(surface === "work_unit" ? alloySectionDomAttrs("WU-12") : surface === "company" ? alloySectionDomAttrs("WS-07") : {})}
                {...(slotTestId ? { "data-testid": slotTestId } : {})}
                {...(slotState ? { "data-wu-above-fold-state": slotState } : {})}
                aria-busy={loading}
                aria-label={title}
            >
                {loading ?
                    <div className="adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column gap-2">
                        <div className="adminv2-ws-rail-ph-btn adminv2-shimmer-bar h-9 w-full rounded-md bg-alloy-stone/18" />
                        <div className="adminv2-ws-rail-ph-btn adminv2-shimmer-bar h-9 w-full rounded-md bg-alloy-stone/16" />
                        <div className="adminv2-ws-rail-ph-btn adminv2-shimmer-bar h-9 w-[92%] rounded-md bg-alloy-stone/14" />
                    </div>
                :   <ActionsBlock
                        model={model}
                        onAction={onAction}
                        title={title}
                        surface={surface === "company" ? "company" : surface}
                        suppressSectionTitles
                        executableRows
                    />
                }
                {footer}
            </section>
        </CommandRailCollapsibleActionsSection>
    );
}

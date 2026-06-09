"use client";

/**
 * Operational queue record row — v3 config-driven card shell.
 * One content grid + fixed action rail. Field rendering via QueueRecordFieldRenderer.
 *
 * DOCTRINE entry shell (docs/system/queue-record-doctrine.md): Lead, Qualification, and Waitlist
 * work-unit rows compose columns through QueueRecordScopedColumn — not bespoke per-queue renderers.
 */

import { useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { ChevronDown, ChevronRight, Home as HomeIcon } from "lucide-react";
import { defaultLeadQueueLayoutV3, type QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import { columnGridTemplate } from "@/lib/layout/queueRecordLayoutEditorModel";
import type { QueueLayoutDrawerIconHandlers } from "@/lib/layout/runtime/buildQueueLayoutRuntimeAdornmentHandler";
import type { OperationalQueueRecordViewModel } from "@/lib/layout/runtime/buildOperationalQueueRecordViewModel";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import type { QueueItemQuickActionVm } from "@/lib/ui-v2/workspace-types";
import LayoutRuntimeLinkDebugModeBanner from "@/components/layout/LayoutRuntimeLinkDebugModeBanner";
import QueueRowActionRail from "@/components/layout/QueueRowActionsMenu";
import QueueRecordScopedColumn from "@/components/layout/QueueRecordScopedColumn";
import { queueRowContextDebugDataAttributes } from "@/lib/layout/runtime/applyQueueRowContextToLayoutRuntime";
import { handleQueueRowContentOpenClick } from "@/lib/layout/runtime/queueRowOpenClick";
import { resolveQueueRowContextPresentation } from "@/lib/workUnits/resolveQueueRowContextPresentation";

type Props = {
    vm: OperationalQueueRecordViewModel;
    record: ProofRuntimeRecord;
    config?: QueueRecordLayoutConfigV3;
    onOpen?: () => void;
    drawerHandlers?: QueueLayoutDrawerIconHandlers;
    rowActions?: QueueItemQuickActionVm[];
    onRowAction?: (qa: QueueItemQuickActionVm, dispatchId: string) => void;
    rowActionsPending?: boolean;
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
    showAttentionAccent?: boolean;
};

function CollapseToggle({
    collapsed,
    onToggleCollapsed,
}: {
    collapsed: boolean;
    onToggleCollapsed?: () => void;
}) {
    if (!onToggleCollapsed) return null;
    return (
        <button
            type="button"
            className="operational-queue-row__collapse-toggle"
            data-queue-row-interactive="true"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand queue record" : "Collapse queue record"}
            onClick={(e) => {
                e.stopPropagation();
                onToggleCollapsed();
            }}
        >
            {collapsed ?
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            :   <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
        </button>
    );
}

function CollapsedSummary({
    vm,
    collapsed,
    onToggleCollapsed,
    onOpen,
}: {
    vm: OperationalQueueRecordViewModel;
    collapsed: boolean;
    onToggleCollapsed?: () => void;
    onOpen?: () => void;
}) {
    return (
        <div
            className={`operational-queue-row operational-queue-row--collapsed${vm.hasAttention ? " operational-queue-row--attention" : ""}`}
            data-queue-record-layout="operational-row"
            data-queue-record-state="collapsed"
            data-queue-row-operational="true"
            data-queue-row-content-open={onOpen ? "true" : undefined}
            onClick={(e) => handleQueueRowContentOpenClick(e, onOpen)}
        >
            <div className="operational-queue-row__collapsed-line">
                <CollapseToggle collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
                <span className="operational-queue-row__collapsed-identity" title={vm.identity.title}>
                    <HomeIcon className="operational-queue-row__collapsed-icon" aria-hidden />
                    <span className="operational-queue-row__collapsed-title truncate">{vm.identity.title}</span>
                </span>
            </div>
        </div>
    );
}

export default function OperationalQueueRecordRow({
    vm,
    record,
    config = defaultLeadQueueLayoutV3(),
    onOpen,
    drawerHandlers,
    rowActions,
    onRowAction,
    rowActionsPending = false,
    collapsed = false,
    onToggleCollapsed,
    showAttentionAccent = false,
}: Props) {
    const showActions = Boolean((rowActions?.length ?? 0) > 0 && onRowAction);
    const fixedControls = config.fixedControls ?? { actionsMenu: true, workWithBos: true };
    const visibleColumns = config.columns;
    const childrenRepeatBlock = config.columns
        .flatMap((col) => col.blocks)
        .find(
            (block): block is import("@/lib/layout/queueRecordLayoutV3").QueueRecordBlockConfig & {
                type: "repeated_record_block";
            } => block.type === "repeated_record_block" && block.relationshipKey === "children",
        );
    const childrenMaxItems =
        childrenRepeatBlock?.type === "repeated_record_block" ? (childrenRepeatBlock.maxItems ?? 5) : 5;
    const attentionActive = showAttentionAccent || vm.hasAttention;
    const contentGridTemplate = columnGridTemplate(config);
    const contextPresentation = useMemo(
        () => resolveQueueRowContextPresentation({ legacy: { record } }),
        [record],
    );
    const contextDebugAttrs = useMemo(
        () => queueRowContextDebugDataAttributes(contextPresentation),
        [contextPresentation],
    );

    if (collapsed) {
        return (
            <CollapsedSummary
                vm={vm}
                collapsed={collapsed}
                onToggleCollapsed={onToggleCollapsed}
                onOpen={onOpen}
            />
        );
    }

    return (
        <>
            <LayoutRuntimeLinkDebugModeBanner />
            <div
                className={`operational-queue-row-shell${attentionActive ? " operational-queue-row-shell--attention" : ""}`}
                data-queue-record-layout={config.variant}
                data-queue-record-version={config.version}
                data-queue-record-state="expanded"
                data-queue-row-operational="true"
                data-queue-record-config-columns={config.columns.map((c) => c.id).join(",")}
                data-queue-row-runtime-path="operational-queue-record-row-v3"
                data-action-rail-style={fixedControls.actionRailStyle ?? "stacked"}
                data-queue-children-max-items={childrenMaxItems}
                {...contextDebugAttrs}
            >
                <div
                    className={`operational-queue-row__content${attentionActive ? " operational-queue-row--attention" : ""}`}
                    style={{ gridTemplateColumns: contentGridTemplate }}
                    data-queue-row-content-open={onOpen ? "true" : undefined}
                    onClick={(e) => handleQueueRowContentOpenClick(e, onOpen)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            handleQueueRowContentOpenClick(e as unknown as MouseEvent, onOpen);
                        }
                    }}
                    role={onOpen ? "button" : undefined}
                    tabIndex={onOpen ? 0 : undefined}
                >
                    {visibleColumns.map((col, colIndex) => (
                        <QueueRecordScopedColumn
                            key={col.id}
                            column={col}
                            mainRecord={record}
                            drawerHandlers={drawerHandlers}
                            onOpen={onOpen}
                            hideColumnLabel
                            collapseToggle={
                                colIndex === 0 ?
                                    <CollapseToggle collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
                                :   null
                            }
                        />
                    ))}
                </div>
                {showActions && fixedControls.actionsMenu !== false ?
                    <QueueRowActionRail
                        actions={rowActions!}
                        pending={rowActionsPending}
                        onSelect={onRowAction!}
                    />
                :   null}
            </div>
        </>
    );
}

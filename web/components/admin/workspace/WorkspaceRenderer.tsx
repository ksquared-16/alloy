"use client";

import type { DepartmentWorkspaceLayout, WorkspaceRuntimeData } from "@/lib/workspace/types";
import { partitionDepartmentBlocks } from "@/lib/workspace/partitionBlocks";
import { DepartmentWorkspaceBridgeShell } from "./DepartmentWorkspaceBridgeShell";
import { ActionsBlock } from "./blocks/ActionsBlock";
import { ContextBlock } from "./blocks/ContextBlock";
import { KpiBlock } from "./blocks/KpiBlock";
import { QueueBlock } from "./blocks/QueueBlock";
import { SignalsBlock } from "./blocks/SignalsBlock";

type Presentation = "flat" | "department_bridge";

/**
 * Renders a department workspace from `DepartmentWorkspaceLayout` + runtime data.
 * `department_bridge` maps blocks into Admin V2 zones (control deck, throughput lane, rail).
 */
export function WorkspaceRenderer({
    layout,
    departmentId,
    runtime,
    presentation = "flat",
    bridgeBriefTitle,
    bridgeBriefSubtitle,
    /** Base path for workspace routes (e.g. `/admin/workspace` or `/adminV2/workspace`). Queue links resolve under `…/dept/:id/…`. */
    workspaceBasePath = "/admin/workspace",
}: {
    layout: DepartmentWorkspaceLayout;
    departmentId: string;
    runtime: WorkspaceRuntimeData;
    presentation?: Presentation;
    /** Headline in the control deck top stack (e.g. department display name). */
    bridgeBriefTitle?: string;
    /** Subline under the briefing headline when `presentation="department_bridge"`. */
    bridgeBriefSubtitle?: string;
    workspaceBasePath?: string;
}) {
    if (presentation === "department_bridge") {
        const parts = partitionDepartmentBlocks(layout.blocks);

        const signalsSlot =
            parts.signals.length > 0 ? (
                <>
                    {parts.signals.map((b) => (
                        <SignalsBlock key={b.id} block={b} runtime={runtime} presentation="bridge" />
                    ))}
                </>
            ) : null;

        const kpiSlot =
            parts.kpis.length > 0 ? (
                <>
                    {parts.kpis.map((b, i) => (
                        <div key={b.id} style={i > 0 ? { marginTop: 8 } : undefined}>
                            <KpiBlock block={b} presentation="bridge" />
                        </div>
                    ))}
                </>
            ) : null;

        const throughputSlot =
            parts.queues.length > 0 ? (
                <>
                    {parts.queues.map((b, i) => (
                        <div key={b.id} style={i > 0 ? { marginTop: 16 } : undefined}>
                            <QueueBlock
                                block={b}
                                departmentId={departmentId}
                                runtime={runtime}
                                presentation="bridge"
                                workspaceBasePath={workspaceBasePath}
                            />
                        </div>
                    ))}
                </>
            ) : (
                <p className="text-sm px-1 py-3" style={{ color: "var(--d-muted)" }}>
                    No queue blocks in this layout.
                </p>
            );

        const contextSlot =
            parts.contexts.length > 0 ? (
                <>
                    {parts.contexts.map((b) => (
                        <ContextBlock key={b.id} block={b} presentation="bridge" />
                    ))}
                </>
            ) : null;

        const railSlot =
            parts.actions.length > 0 ? (
                <>
                    {parts.actions.map((b) => (
                        <ActionsBlock key={b.id} block={b} presentation="bridge" />
                    ))}
                </>
            ) : (
                <p className="text-xs px-2 py-4" style={{ color: "var(--d-muted)" }}>
                    No actions configured for this layout.
                </p>
            );

        return (
            <div data-workspace-renderer data-department-key={layout.department_key ?? "generic"} data-presentation="department_bridge">
                <DepartmentWorkspaceBridgeShell
                    briefTitle={(bridgeBriefTitle ?? "Department workspace").trim() || "Department workspace"}
                    briefSubtitle={bridgeBriefSubtitle}
                    signalsSlot={signalsSlot}
                    kpiSlot={kpiSlot}
                    throughputSlot={throughputSlot}
                    contextSlot={contextSlot}
                    railSlot={railSlot}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6" data-workspace-renderer data-department-key={layout.department_key ?? "generic"} data-presentation="flat">
            {layout.blocks.map((block) => {
                switch (block.type) {
                    case "signals":
                        return <SignalsBlock key={block.id} block={block} runtime={runtime} />;
                    case "queue":
                        return (
                            <QueueBlock
                                key={block.id}
                                block={block}
                                departmentId={departmentId}
                                runtime={runtime}
                                workspaceBasePath={workspaceBasePath}
                            />
                        );
                    case "kpi":
                        return <KpiBlock key={block.id} block={block} />;
                    case "actions":
                        return <ActionsBlock key={block.id} block={block} />;
                    case "context":
                        return <ContextBlock key={block.id} block={block} />;
                    default:
                        return null;
                }
            })}
        </div>
    );
}

"use client";

import type { DepartmentWorkspaceLayout, WorkspaceRuntimeData } from "@/lib/workspace/types";
import { ActionsBlock } from "./blocks/ActionsBlock";
import { ContextBlock } from "./blocks/ContextBlock";
import { KpiBlock } from "./blocks/KpiBlock";
import { QueueBlock } from "./blocks/QueueBlock";
import { SignalsBlock } from "./blocks/SignalsBlock";

/**
 * Renders a department workspace from `DepartmentWorkspaceLayout` + runtime data.
 * No department-specific JSX — add or change layouts in `web/lib/workspace/registry.ts`.
 */
export function WorkspaceRenderer({
    layout,
    departmentId,
    runtime,
}: {
    layout: DepartmentWorkspaceLayout;
    departmentId: string;
    runtime: WorkspaceRuntimeData;
}) {
    return (
        <div className="space-y-6" data-workspace-renderer data-department-key={layout.department_key ?? "generic"}>
            {layout.blocks.map((block) => {
                switch (block.type) {
                    case "signals":
                        return <SignalsBlock key={block.id} block={block} runtime={runtime} />;
                    case "queue":
                        return (
                            <QueueBlock key={block.id} block={block} departmentId={departmentId} runtime={runtime} />
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

"use client";

import type { GlobalAssistantEntityContext } from "@/contexts/GlobalAssistantContext";
import TaskAssistOpportunityWorkspace from "@/components/admin/taskAssist/TaskAssistOpportunityWorkspace";

export type GlobalAssistantPanelRouterProps = {
    context: GlobalAssistantEntityContext;
    active: boolean;
};

export default function GlobalAssistantPanelRouter({ context, active }: GlobalAssistantPanelRouterProps) {
    if (context.entity_type === "opportunities") {
        return (
            <TaskAssistOpportunityWorkspace
                entityId={context.entity_id}
                active={active}
                source_surface={context.source_surface}
                className="mb-0 border-0 bg-transparent px-0 py-0 shadow-none"
            />
        );
    }

    return (
        <p className="text-sm text-alloy-midnight/70" data-global-assistant-unsupported="true">
            Task Assist is not available for this record type yet.
        </p>
    );
}

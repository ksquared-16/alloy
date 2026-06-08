"use client";

/**
 * @deprecated Prefer {@link TaskAssistOpportunityWorkspace} in the global assistant shell.
 * Thin compatibility wrapper for tests and legacy imports.
 */
export {
    computeReminderSubmitDisabled,
    computeScheduleSendDisabled,
    computeTaskAssistSendDisabled,
} from "@/components/admin/taskAssist/TaskAssistOpportunityWorkspace";

export type { TaskAssistOpportunityWorkspaceProps as TaskAssistV1OpportunityPanelProps } from "@/components/admin/taskAssist/TaskAssistOpportunityWorkspace";

import TaskAssistOpportunityWorkspace from "@/components/admin/taskAssist/TaskAssistOpportunityWorkspace";

export default function TaskAssistV1OpportunityPanel(props: {
    entityId: string;
    active?: boolean;
    className?: string;
}) {
    return <TaskAssistOpportunityWorkspace {...props} source_surface="opportunity_drawer" />;
}

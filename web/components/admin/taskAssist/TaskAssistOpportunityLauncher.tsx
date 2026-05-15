"use client";

import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";

export type TaskAssistOpportunityLauncherProps = {
    entityId: string;
    label: string;
    className?: string;
};

/**
 * Drawer contextual launcher — sets opportunity context and focuses the bottom AdminV2 command bar (Task Assist mode).
 */
export default function TaskAssistOpportunityLauncher({ entityId, label, className = "" }: TaskAssistOpportunityLauncherProps) {
    const assistant = useGlobalAssistantOptional();

    if (!isTaskAssistV1UiEnabled() || !assistant) return null;

    const { openAssistantWithContext } = assistant;

    return (
        <div className={`rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.04] px-3 py-2.5 ${className}`} data-task-assist-launcher="true">
            <p className="text-[11px] text-alloy-midnight/65 mb-2">
                Draft messages, save for review, schedule sends, and reminders from the bottom assistant bar — not in this drawer.
            </p>
            <button
                type="button"
                data-task-assist-open-assistant="true"
                onClick={() =>
                    openAssistantWithContext({
                        entity_type: "opportunities",
                        entity_id: entityId,
                        label: label.trim() || "Opportunity",
                        source_surface: "opportunity_drawer",
                    })
                }
                className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-alloy-midnight"
            >
                Use assistant for this opportunity
            </button>
        </div>
    );
}

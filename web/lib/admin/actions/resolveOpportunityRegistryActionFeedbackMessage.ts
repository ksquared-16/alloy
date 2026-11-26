import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

const SUCCESS_BY_KEY: Record<string, string> = {
    schedule_tour: "Tour scheduled.",
    reschedule_tour: "Tour rescheduled.",
    record_tour_outcome: "Tour outcome recorded.",
    add_note: "Note added.",
    create_task: "Work Item created.",
    create_work_item: "Work Item created.",
    send_form: "Form link ready — share it with the family.",
    send_enrollment_packet: "Enrollment packet sent.",
};

export function resolveOpportunityRegistryActionSuccessMessage(
    action: ResolvedActionForClient | { key: string; label?: string },
    executionResult?: Record<string, unknown> | null
): string {
    const key = action.key.trim();
    if (executionResult?.kind === "start_workflow" && typeof executionResult.workflow_run_id === "string") {
        const rid = executionResult.workflow_run_id.trim();
        if (rid) return `Workflow run completed (${rid.slice(0, 8)}…).`;
    }
    if (SUCCESS_BY_KEY[key]) return SUCCESS_BY_KEY[key];
    const label = "label" in action && typeof action.label === "string" ? action.label.trim() : "";
    return label ? `${label} completed.` : "Action completed.";
}

export function resolveOpportunityRegistryActionErrorMessage(error?: string | null): string {
    const msg = (error ?? "").trim();
    return msg || "Action failed. Try again or contact support if this continues.";
}

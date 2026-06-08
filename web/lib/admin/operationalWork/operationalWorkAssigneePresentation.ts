/** Operator-facing assignee copy for operational work surfaces. */
export function operationalWorkAssigneeCompactLabel(params: {
    assignedToUserId: string | null | undefined;
    assigneeLabel: string | null | undefined;
    currentUserId: string | null | undefined;
}): string | null {
    const assigneeId = params.assignedToUserId?.trim() || null;
    if (!assigneeId) return "Unassigned";
    if (params.currentUserId?.trim() && assigneeId === params.currentUserId.trim()) return "Mine";
    return params.assigneeLabel?.trim() || "Assigned";
}

export function operationalWorkAssigneeDetailLabel(params: {
    assignedToUserId: string | null | undefined;
    assigneeLabel: string | null | undefined;
    currentUserId: string | null | undefined;
}): string {
    const assigneeId = params.assignedToUserId?.trim() || null;
    if (!assigneeId) return "Unassigned";
    if (params.currentUserId?.trim() && assigneeId === params.currentUserId.trim()) {
        return params.assigneeLabel?.trim() ? `You (${params.assigneeLabel.trim()})` : "You";
    }
    return params.assigneeLabel?.trim() || "Assigned user";
}

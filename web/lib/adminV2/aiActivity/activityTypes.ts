export type ActivityStatus = "applied" | "failed" | "unknown";

export type ActivityItem = {
    id: string;
    result_id: string;
    proposal_id: string;
    request_id: string;
    correlation_id: string;
    created_at: string;
    proposed_at: string;
    org_id: string;
    user_id: string;
    agent_domain: "agent_v1";
    intent_type: string;
    target_kind: string;
    entity_type: string;
    surface: string;
    status: ActivityStatus;
    terminal_status: string;
    applied_config_version: number;
    request_text: string | null;
    outcome_summary: string;
    intent_json: unknown;
};

export function formatActivityTs(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

/** User-facing status word for summary lines (audit v1 is apply-centric). */
export function activityStatusWord(s: ActivityStatus): string {
    switch (s) {
        case "applied":
            return "Applied";
        case "failed":
            return "Error";
        default:
            return "Unknown";
    }
}

export function shortActivityId(id: string): string {
    if (!id || id.length < 10) return id;
    return `${id.slice(0, 8)}…`;
}

/** One-line summary for list/strip: status · outcome. */
export function activitySummaryLine(it: ActivityItem): string {
    const word = activityStatusWord(it.status);
    const tail = it.outcome_summary?.trim() || `Job overview · ${it.entity_type}/${it.surface}`;
    return `${word} · ${tail}`;
}

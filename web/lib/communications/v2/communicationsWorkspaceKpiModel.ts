/** Pure KPI derivations for Communications workspace orientation strips. */

export type CommsInboxKpiMetrics = {
    requiresResponse: number;
    slaAtRisk: number;
    unread: number;
    unclassified: number;
};

export type CommsTemplateKpiRow = {
    status: string;
    category: string;
    updated_at: string | null;
    has_version?: boolean;
};

export type CommsAnnouncementKpiRow = {
    status: string;
    updated_at: string | null;
};

export function computeTemplateWorkspaceKpis(rows: CommsTemplateKpiRow[]): {
    active: number;
    draft: number;
    categories: number;
    lastUpdatedLabel: string;
} {
    let active = 0;
    let draft = 0;
    const categories = new Set<string>();
    let newest: string | null = null;
    for (const row of rows) {
        const status = row.status.toLowerCase();
        if (status === "active") active += 1;
        if (status === "draft") draft += 1;
        if (row.category.trim()) categories.add(row.category.trim());
        if (row.updated_at && (!newest || row.updated_at > newest)) newest = row.updated_at;
    }
    return {
        active,
        draft,
        categories: categories.size,
        lastUpdatedLabel: formatRelativeOrDash(newest),
    };
}

export function computeAnnouncementWorkspaceKpis(rows: CommsAnnouncementKpiRow[]): {
    draft: number;
    scheduled: number;
    active: number;
    sentRecently: number;
} {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let draft = 0;
    let scheduled = 0;
    let active = 0;
    let sentRecently = 0;
    for (const row of rows) {
        const status = row.status.toLowerCase();
        if (status === "draft") draft += 1;
        else if (status === "scheduled") scheduled += 1;
        else if (status === "sent") {
            active += 1;
            const at = row.updated_at ? Date.parse(row.updated_at) : NaN;
            if (!Number.isNaN(at) && at >= cutoff) sentRecently += 1;
        } else {
            active += 1;
        }
    }
    return { draft, scheduled, active, sentRecently };
}

function formatRelativeOrDash(iso: string | null): string {
    if (!iso) return "—";
    const at = Date.parse(iso);
    if (Number.isNaN(at)) return "—";
    const diffMs = Date.now() - at;
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export function inboxKpiStatusLine(label: string, value: number): string | null {
    switch (label) {
        case "Needs reply":
            return value > 0 ? "awaiting response" : "all caught up";
        case "Overdue":
            return value > 0 ? "act now" : "none overdue";
        case "Unread":
            return value > 0 ? "new inbound" : "caught up";
        case "Needs review":
            return value > 0 ? "not yet triaged" : "all triaged";
        default:
            return null;
    }
}

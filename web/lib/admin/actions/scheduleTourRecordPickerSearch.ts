import { formatOpportunityOperatorDisplayLabel } from "@/lib/admin/opportunityDisplayLabel";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";
import type { ScheduleTourPickerRowVm } from "@/lib/admin/actions/scheduleTourWorkUnitActions";

export type ScheduleTourEntitySearchResponse = {
    ok?: boolean;
    candidates?: TaskAssistEntitySearchCandidate[];
    error?: string;
};

export function buildScheduleTourPickerRowFromEntitySearch(
    candidate: TaskAssistEntitySearchCandidate,
    opts?: { opportunityEntityLabel?: string | null }
): ScheduleTourPickerRowVm | null {
    const opportunityId = candidate.entity_id?.trim();
    if (!opportunityId) return null;
    const location =
        candidate.disambiguation?.location_name?.trim() ||
        (candidate.subtitle?.startsWith("Location:")
            ? candidate.subtitle.replace(/^Location:\s*/i, "").trim()
            : null);
    const customerName = candidate.disambiguation?.customer_name?.trim() || null;
    const primaryLabel = formatOpportunityOperatorDisplayLabel(candidate.label, {
        entitySingularLabel: opts?.opportunityEntityLabel,
        locationName: location,
        customerName,
    });
    const subtitle = candidate.subtitle?.trim() || null;
    const statusLine = [location, subtitle?.startsWith("Customer:") ? subtitle : null]
        .filter(Boolean)
        .join(" · ");
    return {
        opportunityId,
        primaryLabel,
        contactLine: subtitle && !subtitle.startsWith("Location:") ? subtitle : null,
        childProgramLine: null,
        statusLine: statusLine || null,
    };
}

export function filterScheduleTourEntitySearchRows(
    candidates: TaskAssistEntitySearchCandidate[],
    query: string,
    opts?: { opportunityEntityLabel?: string | null }
): ScheduleTourPickerRowVm[] {
    const q = query.trim().toLowerCase();
    const rows = candidates
        .map((c) => buildScheduleTourPickerRowFromEntitySearch(c, opts))
        .filter((r): r is ScheduleTourPickerRowVm => r != null);
    if (!q) return rows;
    return rows.filter((row) => {
        const hay = [row.primaryLabel, row.contactLine, row.statusLine, row.opportunityId]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return hay.includes(q);
    });
}

/** Org-scoped opportunity search for Schedule Tour record picker (permission-aware). */
export async function searchScheduleTourAccessibleRecords(params: {
    query: string;
    departmentId?: string | null;
    siteId?: string | null;
    opportunityEntityLabel?: string | null;
    limit?: number;
    fetchInit?: RequestInit;
}): Promise<ScheduleTourPickerRowVm[]> {
    const q = params.query.trim();
    if (q.length < 2 && !/^[\da-f-]{36}$/i.test(q)) return [];

    const qs = new URLSearchParams({
        q,
        entity_type: "opportunities",
        include_customers: "1",
        limit: String(params.limit ?? 20),
    });
    if (params.siteId?.trim()) qs.set("site_id", params.siteId.trim());

    const res = await fetch(`/api/admin/ai/task-assist/entity-search?${qs}`, {
        credentials: "include",
        ...params.fetchInit,
    });
    const json = (await res.json().catch(() => ({}))) as ScheduleTourEntitySearchResponse;
    if (!res.ok || !Array.isArray(json.candidates)) return [];
    return filterScheduleTourEntitySearchRows(json.candidates, q, {
        opportunityEntityLabel: params.opportunityEntityLabel,
    });
}

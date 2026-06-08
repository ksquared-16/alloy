import type {
    WorkUnitQueueRecordFilterContext,
    WorkUnitQueueRecordFilterFacets,
    WorkUnitQueueRecordFilterFieldSpec,
    WorkUnitQueueRecordSortKey,
} from "@/lib/workspace/workUnitQueueRecordFilterTypes";

const SORT_LABELS: Record<WorkUnitQueueRecordSortKey, string> = {
    newest: "Newest",
    oldest: "Oldest",
    follow_up_due: "Follow-up due",
    tour_date: "Tour date",
    priority_order: "Priority / order",
};

function defaultSortOptions(ctx: WorkUnitQueueRecordFilterContext): WorkUnitQueueRecordSortKey[] {
    const keys: WorkUnitQueueRecordSortKey[] = ["newest", "oldest"];
    if (ctx.entityType === "opportunity") {
        if (ctx.grain === "candidate" || ctx.domain === "waitlist") {
            keys.push("priority_order");
        }
        if (ctx.grain === "case" || !ctx.grain) {
            keys.push("follow_up_due", "tour_date");
        }
        if (ctx.domain === "tours") {
            if (!keys.includes("tour_date")) keys.push("tour_date");
        }
    }
    return keys;
}

/** Config-driven filter fields for the active queue lane (grain-aware). */
export function resolveWorkUnitQueueRecordFilterFields(
    ctx: WorkUnitQueueRecordFilterContext
): WorkUnitQueueRecordFilterFieldSpec[] {
    const fields: WorkUnitQueueRecordFilterFieldSpec[] = [{ kind: "search", label: "Search" }];

    if (ctx.entityType === "opportunity") {
        if (ctx.grain === "child") {
            fields.push({ kind: "status", label: "Lifecycle status" });
        } else if (ctx.grain === "candidate") {
            fields.push({ kind: "status", label: "Waitlist status" });
        } else {
            fields.push({ kind: "status", label: "Status" });
        }
        fields.push({ kind: "date_range", label: "Date range" });
        fields.push({ kind: "site", label: "Site / location" });
        fields.push({ kind: "program", label: "Program / cohort" });
        fields.push({ kind: "owner", label: "Assigned owner" });
        if (ctx.isNeedsAttention) {
            fields.push({ kind: "attention_reason", label: "Needs-attention reason" });
        }
    } else if (ctx.entityType === "job") {
        fields.push({ kind: "status", label: "Status" });
        fields.push({ kind: "date_range", label: "Date range" });
        fields.push({ kind: "owner", label: "Assigned vendor" });
    }

    fields.push({ kind: "sort", label: "Sort" });
    return fields;
}

export function buildWorkUnitQueueRecordFilterFacets(
    ctx: WorkUnitQueueRecordFilterContext,
    extracted: Pick<
        WorkUnitQueueRecordFilterFacets,
        "statusOptions" | "siteOptions" | "programOptions" | "ownerOptions" | "attentionReasonOptions"
    >
): WorkUnitQueueRecordFilterFacets {
    const sortKeys = defaultSortOptions(ctx);
    return {
        ...extracted,
        sortOptions: sortKeys.map((value) => ({ value, label: SORT_LABELS[value] })),
    };
}

export function workUnitQueueRecordFilterIsActive(
    filters: { search: string; statusKey: string; dateFrom: string; dateTo: string; siteKey: string; program: string; ownerKey: string; attentionReasonCode: string; sort: WorkUnitQueueRecordSortKey }
): boolean {
    return Boolean(
        filters.search.trim() ||
            filters.statusKey.trim() ||
            filters.dateFrom.trim() ||
            filters.dateTo.trim() ||
            filters.siteKey.trim() ||
            filters.program.trim() ||
            filters.ownerKey.trim() ||
            filters.attentionReasonCode.trim() ||
            filters.sort !== "newest"
    );
}

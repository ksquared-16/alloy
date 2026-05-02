import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import { formatWorkspaceUsdGrouped } from "@/lib/ui-v2/formatWorkspaceCurrency";
import type {
    OpportunityLifecycleKpisRuntime,
    WorkspaceOpportunityQueueRuntime,
    WorkspaceRuntimeData,
} from "@/lib/workspace/types";

export type EnrollmentDepartmentActionLinkVm = {
    id: string;
    label: string;
    href: string;
    variant: "primary" | "secondary";
};

/** Funnel pipeline card — explicit slots for future AI/config mapping (no ad hoc JSX composition). */
export type EnrollmentPipelineCardVm = {
    /** Stable segment id: `all` | `new` | `contacted` | `tours` | `decision`. */
    segmentKey: string;
    /** Primary stage label on the card. */
    stageLabel: string;
    /** Supporting copy (funnel semantics / operator hint). */
    supportingCopy: string;
    /** Raw count from lifecycle KPI breakdown when available. */
    count: number | null;
    /** Preformatted count for display (includes "—" when unknown). */
    countDisplay: string;
    /** Positive-quote USD total from department lifecycle KPI API (`pricedInMotion` / per-status slice), else "—". */
    valueDisplay: string;
    /** Primary drill action for this funnel segment. */
    openQueueAction: { label: string; href: string };
};

export type EnrollmentNeedsAttentionGroupVm = {
    label: string;
    count: number;
    openQueueHref: string;
};

/** Top outlier rows for the Needs Attention panel (CRM preview lines; not the full queue). */
export type EnrollmentNeedsAttentionPreviewVm = {
    id: string;
    headline: string;
    detail: string;
    openQueueHref: string;
};

const OPEN_QUEUE_ACTION_LABEL = "Open queue";

function countsByStatusKey(k: OpportunityLifecycleKpisRuntime & { status: "ready" }): Map<string, number> {
    const m = new Map<string, number>();
    for (const s of k.statusBreakdown ?? []) {
        m.set(String(s.status_key ?? "").trim().toLowerCase(), Number(s.count ?? 0));
    }
    return m;
}

/**
 * Pipeline-card dollar totals — same department lifecycle KPI dataset as counts (`GET …/opportunity-lifecycle-kpis`),
 * never sums from queue preview rows (partial pages / merged lanes).
 */
function authoritativePositiveQuoteUsdForSegment(
    k: OpportunityLifecycleKpisRuntime & { status: "ready" },
    statusKeys: Set<string> | null
): number {
    if (statusKeys == null) {
        return Number(k.values.pricedInMotion ?? 0);
    }
    const by = k.positiveQuoteSumByNonTerminalStatus ?? {};
    let s = 0;
    for (const sk of statusKeys) {
        s += Number(by[sk.toLowerCase()] ?? 0);
    }
    return s;
}

function valueDisplayForSum(sum: number): string {
    return sum > 0 ? formatWorkspaceUsdGrouped(sum) : "—";
}

/** Enrollment funnel KPI strip only (status breakdown + pipeline value). No Needs Attention in this band. */
export function buildEnrollmentDepartmentKpis(runtime: WorkspaceRuntimeData): KPIVm[] {
    const k = runtime.opportunityLifecycleKpis;
    if (!k || k.status !== "ready") return [];
    const by = countsByStatusKey(k);
    const get = (s: string) => by.get(s) ?? 0;
    const enrolled = get("enrolled");
    const lost = get("lost");
    const inquiries = Math.max(0, (k.counts?.total ?? 0) - enrolled - lost);
    const contactAttempted = get("contact_attempted");
    const tourScheduled = get("tour_scheduled");
    const tourCompleted = get("tour_completed");
    const enrolling = get("enrolling");
    const waitlisted = get("waitlisted");
    const enrolledWaitlisted = enrolled + waitlisted;
    const pipeline =
        k.values?.openPipeline != null ? formatWorkspaceUsdGrouped(Number(k.values.openPipeline)) : "—";

    return [
        { id: "en_inquiries", label: "Active inquiries", value: String(inquiries), lane: "business" },
        { id: "en_contact_attempted", label: "Contact attempted", value: String(contactAttempted), lane: "business" },
        { id: "en_tour_scheduled", label: "Tours scheduled", value: String(tourScheduled), lane: "business" },
        { id: "en_tour_completed", label: "Tours completed", value: String(tourCompleted), lane: "business" },
        { id: "en_enrolling", label: "Enrolling", value: String(enrolling), lane: "business" },
        {
            id: "en_enrolled_wait",
            label: "Enrolled / waitlisted",
            value: String(enrolledWaitlisted),
            lane: "business",
        },
        { id: "en_pipeline_value", label: "Pipeline value", value: pipeline, lane: "business" },
    ];
}

type CardDef = {
    segmentKey: string;
    stageLabel: string;
    supportingCopy: string;
    count: (by: Map<string, number>, total: number) => number | null;
    /** Limit KPI dollar sums to these statuses; `null` = full scoped pipeline (`pricedInMotion`). */
    valueStatusKeys: string[] | null;
    workUnitKey: "pipeline_overview" | "quoting" | "priced_followup";
    /** Query params for the drill link (status filter on the work unit queue). */
    linkStatusKeys: string[] | null;
};

const PIPELINE_CARD_DEFS: CardDef[] = [
    {
        segmentKey: "all",
        stageLabel: "All inquiries",
        supportingCopy: "Active inquiries only (terminal enrolled/lost excluded from this funnel view).",
        count: (by, total) => {
            const closed = (by.get("enrolled") ?? 0) + (by.get("lost") ?? 0);
            return Math.max(0, total - closed);
        },
        valueStatusKeys: null,
        workUnitKey: "pipeline_overview",
        linkStatusKeys: null,
    },
    {
        segmentKey: "new",
        stageLabel: "New",
        supportingCopy: "New inquiries not yet progressed.",
        count: (by) => by.get("new_inquiry") ?? null,
        valueStatusKeys: ["new_inquiry"],
        workUnitKey: "pipeline_overview",
        linkStatusKeys: ["new_inquiry"],
    },
    {
        segmentKey: "contacted",
        stageLabel: "Contact Attempted",
        supportingCopy: "A first contact attempt was logged; schedule a tour next.",
        count: (by) => by.get("contact_attempted") ?? null,
        valueStatusKeys: ["contact_attempted"],
        workUnitKey: "pipeline_overview",
        linkStatusKeys: ["contact_attempted"],
    },
    {
        segmentKey: "tours",
        stageLabel: "Tours in progress",
        supportingCopy: "Tours scheduled, completed, or no-show.",
        count: (by) => (by.get("tour_scheduled") ?? 0) + (by.get("tour_completed") ?? 0) + (by.get("tour_no_show") ?? 0),
        valueStatusKeys: ["tour_scheduled", "tour_completed", "tour_no_show"],
        workUnitKey: "quoting",
        linkStatusKeys: ["tour_scheduled", "tour_completed", "tour_no_show"],
    },
    {
        segmentKey: "decision",
        stageLabel: "Enrolling / waitlisted",
        supportingCopy: "Enrollment steps in progress or waitlist decision.",
        count: (by) => (by.get("enrolling") ?? 0) + (by.get("waitlisted") ?? 0),
        valueStatusKeys: ["enrolling", "waitlisted"],
        workUnitKey: "priced_followup",
        linkStatusKeys: ["enrolling", "waitlisted"],
    },
];

export function buildEnrollmentPipelineCardsVm(
    runtime: WorkspaceRuntimeData,
    workspaceBasePath: string,
    departmentId: string
): EnrollmentPipelineCardVm[] {
    const k = runtime.opportunityLifecycleKpis;
    const base = `${workspaceBasePath.replace(/\/$/, "")}/dept/${encodeURIComponent(departmentId)}`;
    const wu = (key: string) => runtime.workUnits?.find((w) => String(w.key ?? "").trim().toLowerCase() === key);

    const by = k?.status === "ready" ? countsByStatusKey(k) : new Map<string, number>();
    const total = k?.status === "ready" ? k.counts?.total ?? 0 : 0;

    return PIPELINE_CARD_DEFS.map((def) => {
        const wuRow = wu(def.workUnitKey);
        const href =
            wuRow?.id != null
                ? `${base}/work-unit/${encodeURIComponent(wuRow.id)}${
                      def.linkStatusKeys?.length
                          ? `?status_keys=${encodeURIComponent(def.linkStatusKeys.join(","))}`
                          : ""
                  }`
                : base;

        const statusFilter = def.valueStatusKeys ? new Set(def.valueStatusKeys.map((s) => s.toLowerCase())) : null;
        const quoteSum =
            k?.status === "ready" ? authoritativePositiveQuoteUsdForSegment(k, statusFilter) : 0;

        const rawCount = k?.status === "ready" ? def.count(by, total) : null;
        const countDisplay = rawCount == null ? "—" : String(Math.max(0, rawCount));

        return {
            segmentKey: def.segmentKey,
            stageLabel: def.stageLabel,
            supportingCopy: def.supportingCopy,
            count: rawCount,
            countDisplay,
            valueDisplay: valueDisplayForSum(quoteSum),
            openQueueAction: { label: OPEN_QUEUE_ACTION_LABEL, href },
        };
    });
}

export function buildEnrollmentNeedsAttentionPreviewVm(
    runtime: WorkspaceRuntimeData,
    workspaceBasePath: string,
    departmentId: string,
    limit = 4
): EnrollmentNeedsAttentionPreviewVm[] {
    const oq = runtime.opportunityQueues?.needs_attention;
    const items = (oq?.items ?? []) as Array<{
        id: string;
        _customer_name?: string | null;
        name?: string | null;
        _attention_reason_label?: string | null;
        _lifecycle_stage_title?: string | null;
        _status_display?: string | null;
    }>;
    const base = `${workspaceBasePath.replace(/\/$/, "")}/dept/${encodeURIComponent(departmentId)}`;
    const wu = runtime.workUnits?.find((w) => String(w.key ?? "").trim().toLowerCase() === "needs_attention");

    if (items.length === 0) return [];

    return items.slice(0, Math.max(0, limit)).map((it) => {
        const family = String(it._customer_name ?? "").trim();
        const nm = String(it.name ?? "").trim();
        const headline = family || nm || "Inquiry";
        const stage = String(it._lifecycle_stage_title ?? "").trim();
        const st = String(it._status_display ?? "").trim();
        const reason = String(it._attention_reason_label ?? "").trim() || "Needs attention";
        const detail = [reason, stage && st ? `${stage} · ${st}` : stage || st].filter(Boolean).join(" — ");
        const label = reason;
        const href = wu?.id
            ? `${base}/work-unit/${encodeURIComponent(wu.id)}?attention_reason=${encodeURIComponent(label)}`
            : base;
        return { id: it.id, headline, detail, openQueueHref: href };
    });
}

export function buildEnrollmentNeedsAttentionGroupsVm(
    runtime: WorkspaceRuntimeData,
    workspaceBasePath: string,
    departmentId: string
): EnrollmentNeedsAttentionGroupVm[] {
    const oq = runtime.opportunityQueues?.needs_attention;
    const summary = oq?.attention_reason_counts;
    const base = `${workspaceBasePath.replace(/\/$/, "")}/dept/${encodeURIComponent(departmentId)}`;
    const wu = runtime.workUnits?.find((w) => String(w.key ?? "").trim().toLowerCase() === "needs_attention");

    if (!summary?.length) return [];

    return summary.map((row) => {
        const label = row.label.trim() || String(row.reason_key ?? "").trim() || "Needs attention";
        return {
            label,
            count: Math.max(0, Math.floor(Number(row.count) || 0)),
            openQueueHref: wu?.id
                ? `${base}/work-unit/${encodeURIComponent(wu.id)}?attention_reason=${encodeURIComponent(label)}`
                : base,
        };
    });
}

export function buildEnrollmentDepartmentActionLinks(params?: {
    workspaceBasePath?: string;
    departmentId?: string;
    primaryWorkUnitId?: string | null;
}): EnrollmentDepartmentActionLinkVm[] {
    const base =
        params?.workspaceBasePath && params?.departmentId
            ? `${params.workspaceBasePath.replace(/\/$/, "")}/dept/${encodeURIComponent(params.departmentId)}`
            : null;
    const primaryHref =
        base && params?.primaryWorkUnitId
            ? `${base}/work-unit/${encodeURIComponent(params.primaryWorkUnitId)}`
            : null;
    return [
        {
            id: "new_inquiry",
            label: "New inquiry",
            href: primaryHref ?? "/adminV2/workspace",
            variant: "primary",
        },
        {
            id: "open_all_inquiries",
            label: "Open all inquiries",
            href: primaryHref ?? "/adminV2/workspace",
            variant: "secondary",
        },
        { id: "manage_work_units", label: "Manage work units", href: "/adminV2/settings/work-units", variant: "secondary" },
    ];
}

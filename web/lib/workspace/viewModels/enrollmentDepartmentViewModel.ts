import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { OpportunityLifecycleKpisRuntime, WorkspaceRuntimeData } from "@/lib/workspace/types";
import { closedCountFromLifecycleCounts, inMotionCountFromLifecycleCounts } from "@/lib/workspace/viewModels/workspaceRootRollup";

export type EnrollmentDepartmentActionLinkVm = {
    id: string;
    label: string;
    href: string;
    variant: "primary" | "secondary";
};

export type EnrollmentLaneVm = {
    key: string;
    label: string;
    description: string;
    workUnitKey: "pipeline_overview" | "quoting" | "priced_followup";
    statusKeys?: string[];
    count: number | null;
    openQueueHref: string;
};

export type EnrollmentNeedsAttentionGroupVm = {
    label: string;
    count: number;
    openQueueHref: string;
};

function countsByStatusKey(k: OpportunityLifecycleKpisRuntime & { status: "ready" }): Map<string, number> {
    const m = new Map<string, number>();
    for (const s of k.statusBreakdown ?? []) {
        m.set(String(s.status_key ?? "").trim().toLowerCase(), Number(s.count ?? 0));
    }
    return m;
}

/** Funnel KPI strip — lifecycle buckets from `opportunity-lifecycle-kpis` + Needs Attention total from queue runtime. */
export function buildEnrollmentDepartmentKpis(runtime: WorkspaceRuntimeData): KPIVm[] {
    const k = runtime.opportunityLifecycleKpis;
    if (!k || k.status !== "ready") return [];
    const c = k.counts;
    const motion = inMotionCountFromLifecycleCounts(c);
    const closed = closedCountFromLifecycleCounts(c);
    const needs = runtime.opportunityQueues?.needs_attention?.total ?? 0;
    const pipeline = k.values?.openPipeline != null ? `$${Math.round(Number(k.values.openPipeline))}` : "—";

    return [
        { id: "en_in_motion", label: "In motion", value: String(Math.max(0, motion)), lane: "business" },
        { id: "en_intake", label: "Intake", value: String(Math.max(0, c.intake ?? 0)), lane: "business" },
        { id: "en_qual", label: "Qualification", value: String(Math.max(0, c.qualification ?? 0)), lane: "business" },
        { id: "en_exec", label: "Execution", value: String(Math.max(0, c.execution ?? 0)), lane: "business" },
        { id: "en_decision", label: "Decision", value: String(Math.max(0, c.decision ?? 0)), lane: "business" },
        { id: "en_closed", label: "Closed", value: String(Math.max(0, closed)), lane: "business" },
        {
            id: "en_needs_attention",
            label: "Needs attention",
            value: String(Math.max(0, needs)),
            lane: "business",
            tone: needs > 0 ? "risk" : "neutral",
        },
        { id: "en_pipeline_value", label: "Pipeline value", value: pipeline, lane: "business" },
    ];
}

export function buildEnrollmentPipelineLanesVm(
    runtime: WorkspaceRuntimeData,
    workspaceBasePath: string,
    departmentId: string
): EnrollmentLaneVm[] {
    const k = runtime.opportunityLifecycleKpis;
    const base = `${workspaceBasePath.replace(/\/$/, "")}/dept/${encodeURIComponent(departmentId)}`;
    const wu = (key: string) => runtime.workUnits?.find((w) => String(w.key ?? "").trim().toLowerCase() === key);

    const countFor = (laneKey: EnrollmentLaneVm["key"]): number | null => {
        if (!k || k.status !== "ready") return null;
        const by = countsByStatusKey(k);
        const get = (s: string) => by.get(s) ?? 0;
        if (laneKey === "all") {
            const closed = get("enrolled") + get("lost");
            return Math.max(0, (k.counts?.total ?? 0) - closed);
        }
        if (laneKey === "new") return get("new_inquiry");
        if (laneKey === "contacted") return get("contacted");
        if (laneKey === "tours") return get("tour_scheduled") + get("tour_completed");
        if (laneKey === "decision") return get("ready_to_enroll") + get("waitlisted");
        return null;
    };

    const pipelineWu = wu("pipeline_overview");
    const quotingWu = wu("quoting");
    const pricedWu = wu("priced_followup");

    const lanes: Omit<EnrollmentLaneVm, "openQueueHref" | "count">[] = [
        {
            key: "all",
            label: "All inquiries",
            description: "Active inquiries only (terminal outcomes excluded from this lane).",
            workUnitKey: "pipeline_overview",
        },
        {
            key: "new",
            label: "New",
            description: "New inquiries not yet progressed.",
            workUnitKey: "pipeline_overview",
            statusKeys: ["new_inquiry"],
        },
        {
            key: "contacted",
            label: "Contacted",
            description: "Conversation started; advance toward tour.",
            workUnitKey: "pipeline_overview",
            statusKeys: ["contacted"],
        },
        {
            key: "tours",
            label: "Tours in progress",
            description: "Tours scheduled or completed.",
            workUnitKey: "quoting",
        },
        {
            key: "decision",
            label: "Ready / waitlist",
            description: "Awaiting family decision.",
            workUnitKey: "priced_followup",
        },
    ];

    return lanes.map((lane) => {
        const wuRow =
            lane.workUnitKey === "pipeline_overview"
                ? pipelineWu
                : lane.workUnitKey === "quoting"
                  ? quotingWu
                  : pricedWu;
        const href =
            wuRow?.id != null
                ? `${base}/work-unit/${encodeURIComponent(wuRow.id)}${
                      lane.statusKeys?.length ? `?status_keys=${encodeURIComponent(lane.statusKeys.join(","))}` : ""
                  }`
                : base;
        return {
            ...lane,
            count: countFor(lane.key),
            openQueueHref: href,
        };
    });
}

export function buildEnrollmentNeedsAttentionGroupsVm(
    runtime: WorkspaceRuntimeData,
    workspaceBasePath: string,
    departmentId: string
): EnrollmentNeedsAttentionGroupVm[] {
    const oq = runtime.opportunityQueues?.needs_attention;
    const items = oq?.items ?? [];
    const m = new Map<string, number>();
    for (const it of items as Array<{ _attention_reason_label?: string | null }>) {
        const label = String(it._attention_reason_label ?? "").trim() || "Needs attention";
        m.set(label, (m.get(label) ?? 0) + 1);
    }
    const groups = [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({ label, count }));

    const base = `${workspaceBasePath.replace(/\/$/, "")}/dept/${encodeURIComponent(departmentId)}`;
    const wu = runtime.workUnits?.find((w) => String(w.key ?? "").trim().toLowerCase() === "needs_attention");
    return groups.map((g) => ({
        label: g.label,
        count: g.count,
        openQueueHref: wu?.id
            ? `${base}/work-unit/${encodeURIComponent(wu.id)}?attention_reason=${encodeURIComponent(g.label)}`
            : base,
    }));
}

export function buildEnrollmentDepartmentActionLinks(): EnrollmentDepartmentActionLinkVm[] {
    return [
        { id: "new_inquiry", label: "New inquiry", href: "/admin/opportunities", variant: "primary" },
        { id: "open_all_inquiries", label: "Open all inquiries", href: "/admin/opportunities", variant: "secondary" },
        { id: "manage_work_units", label: "Manage work units", href: "/admin/system/work-units", variant: "secondary" },
    ];
}

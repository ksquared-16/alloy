import type { WorkspaceOpportunityQueueRuntime } from "@/lib/workspace/types";
import type { QueueItemVm, QueueVm, WorkUnitWorkspaceModel } from "@/lib/ui-v2/workspace-types";

function formatUsd(n: number): string {
    return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: n >= 100 ? 0 : 2,
    }).format(n);
}

function opportunityQuickActionsForLane(workUnitKey: string): QueueItemVm["quickActions"] {
    const k = workUnitKey.trim().toLowerCase();
    if (k === "needs_attention") {
        // Quick actions depend on attention reason; rows override when possible.
        return [{ id: "open_quote", label: "Open" }];
    }
    if (k === "priced_followup") {
        return [
            { id: "open_quote", label: "Open inquiry" },
            { id: "mark_won", label: "Enrolled" },
            { id: "mark_lost", label: "Lost" },
        ];
    }
    if (k === "quoting") {
        return [
            { id: "open_quote", label: "Open inquiry" },
            { id: "start_quote", label: "Schedule tour" },
            { id: "mark_lost", label: "Lost" },
        ];
    }
    // Default: early pipeline.
    return [
        { id: "qualify_opportunity", label: "Conversation had" },
        { id: "start_quote", label: "Schedule tour" },
        { id: "mark_lost", label: "Lost" },
    ];
}

export function buildRealOpportunityWorkUnitWorkspaceModel(input: {
    workUnitId: string;
    workUnitKey: string;
    workUnitName: string;
    departmentId: string;
    deptName: string;
    departmentKey?: string | null;
    oq: WorkspaceOpportunityQueueRuntime;
}): WorkUnitWorkspaceModel {
    const items: QueueItemVm[] = input.oq.items.map((row) => {
        const title = (row.name ?? "").trim() || "Family inquiry";
        const stage = row._lifecycle_stage_title?.trim() || "Pipeline";
        const status = (row.status_key ?? "").trim();
        const customer = (row._customer_name ?? "").trim();
        const subtitle = [customer || null, status || null].filter(Boolean).join(" · ") || undefined;
        const value =
            row.quote_total != null && Number.isFinite(Number(row.quote_total)) && Number(row.quote_total) > 0
                ? formatUsd(Number(row.quote_total))
                : undefined;

        const reasonLabel = (row as { _attention_reason_label?: string | null })._attention_reason_label?.trim() || null;
        const reason = (row as { _attention_reason?: string | null })._attention_reason?.trim() || null;

        const quickActions =
            input.workUnitKey.trim().toLowerCase() === "needs_attention" && reason
                ? (() => {
                      if (reason === "stale_quote_followup") {
                          return [
                              { id: "open_quote", label: "Open inquiry" },
                              { id: "mark_won", label: "Enrolled" },
                              { id: "mark_lost", label: "Lost" },
                          ];
                      }
                      if (reason === "missing_quote_after_execution") {
                          return [
                              { id: "open_quote", label: "Open inquiry" },
                              { id: "start_quote", label: "Schedule tour" },
                              { id: "mark_lost", label: "Lost" },
                          ];
                      }
                      // stale_new_inquiry / stale_qualified
                      return [
                          { id: "qualify_opportunity", label: "Conversation had" },
                          { id: "start_quote", label: "Schedule tour" },
                          { id: "mark_lost", label: "Lost" },
                      ];
                  })()
                : opportunityQuickActionsForLane(input.workUnitKey);

        return {
            id: row.id,
            title,
            subtitle,
            valueLabel: value,
            metaLines: [
                { label: "Lifecycle", value: stage },
                ...(status ? [{ label: "Status", value: status }] : []),
                ...(reasonLabel ? [{ label: "Reason", value: reasonLabel }] : []),
            ],
            quickActions,
            urgencyTier: input.workUnitKey.trim().toLowerCase() === "priced_followup" ? "warning" : "standard",
        };
    });

    const queue: QueueVm = {
        id: `oq:${input.workUnitId}`,
        title: input.workUnitName,
        countBadge: input.oq.total,
        items,
        sortCaption: "Newest updates first",
        workUnitMidlineKeys: { left: "Lifecycle", right: "Status" },
    };

    const laneKey = input.workUnitKey;
    const focusLabel = `${input.deptName} · ${input.workUnitName}`;

    return {
        workspaceLevel: "work_unit",
        workUnitId: input.workUnitId,
        departmentKey: input.departmentKey ?? undefined,
        focusLabel,
        laneKey,
        signals: [],
        kpis: [],
        laneInterpretation: {
            laneStatusLine: `${input.oq.total} in this queue`,
            recommendedActionLine:
                laneKey.toLowerCase() === "priced_followup"
                    ? "Follow up on offers that have a price and are awaiting a decision."
                    : "Work the oldest blockers first; use quick actions to move the inquiry forward.",
        },
        primaryQueue: queue,
        actionsRail: {
            primaries: [{ id: "back_department", label: "Back to department", variant: "secondary" }],
            overflow: [{ id: "open_admin_opportunities", label: "All inquiries", variant: "secondary" }],
        },
        contextRail: { title: "About this queue", groups: [] },
    };
}


import type { WorkspaceOpportunityQueueRuntime } from "@/lib/workspace/types";
import type { QueueItemQuickActionVm, QueueItemVm, QueueVm, WorkUnitWorkspaceModel } from "@/lib/ui-v2/workspace-types";
import { formatWorkspaceUsdGrouped } from "@/lib/ui-v2/formatWorkspaceCurrency";
import {
    buildEnrollmentOpportunityQueueItemVm,
    buildEnrollmentWorkUnitActionsRail,
} from "@/lib/workspace/viewModels/enrollmentWorkUnitViewModel";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { mergeEnrollmentRightRailActions } from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import { isEnrollmentLikeDepartmentKey } from "@/lib/workspace/enrollmentDepartmentKey";

function parseIsoMs(ts: string | null | undefined): number | null {
    if (!ts) return null;
    const ms = Date.parse(ts);
    return Number.isFinite(ms) ? ms : null;
}

function formatAgeCompact(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d`;
    if (h > 0) return `${h}h`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
}

function defaultOpportunityQueueItemVm(row: WorkspaceOpportunityQueueRuntime["items"][number], workUnitKey: string): QueueItemVm {
    const customer = (row._customer_name ?? "").trim();
    const titleBase = (row.name ?? "").trim();
    const title = customer || titleBase || row.id.slice(-8);
    const status = (row.status_key ?? "").trim();
    const statusLabel = (row._status_display ?? "").trim() || status;
    const value =
        row.quote_total != null && Number.isFinite(Number(row.quote_total)) && Number(row.quote_total) > 0
            ? formatWorkspaceUsdGrouped(Number(row.quote_total))
            : undefined;

    const reasonLabel = (row as { _attention_reason_label?: string | null })._attention_reason_label?.trim() || null;

    const nextStep = row._lifecycle_next_step?.title?.trim() || "";
    const wfAt = (row as { last_activity_at?: string | null }).last_activity_at;
    const wfSummary = (row as { last_activity_summary?: string | null }).last_activity_summary?.trim() || null;
    let lastActivityLabel: string | null = null;
    if (wfAt) {
        const wfMs = parseIsoMs(wfAt);
        if (wfMs != null) {
            const rel = `${formatAgeCompact(Date.now() - wfMs)} ago`;
            lastActivityLabel = wfSummary ? `${rel} · ${wfSummary}` : rel;
        }
    }
    if (!lastActivityLabel) {
        const lastTouchedMs =
            parseIsoMs((row as { updated_at?: string | null }).updated_at) ??
            parseIsoMs((row as { created_at?: string | null }).created_at);
        lastActivityLabel =
            lastTouchedMs != null ? `${formatAgeCompact(Date.now() - lastTouchedMs)} ago` : "";
    }

    /** Quick-action chips are stable per lane — do not branch on attention-rule preview codes (`_attention_reason`). */
    const quickActions = (() => {
        const k = workUnitKey.trim().toLowerCase();
        if (k === "needs_attention") {
            return [
                { id: "qualify_opportunity", label: "Conversation had" },
                { id: "start_quote", label: "Schedule tour" },
                { id: "mark_lost", label: "Lost" },
            ];
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
        return [
            { id: "qualify_opportunity", label: "Conversation had" },
            { id: "start_quote", label: "Schedule tour" },
            { id: "mark_lost", label: "Lost" },
        ];
    })();

    const stale = (row as { stale_signal?: { label: string; severity: "low" | "medium" | "high" } | null }).stale_signal;
    const tags =
        stale && String(stale.label ?? "").trim() ? [String(stale.label).trim()] : undefined;

    const item: QueueItemVm = {
        id: row.id,
        title,
        valueLabel: value,
        metaLines: [
            ...(statusLabel ? [{ label: "Status", value: statusLabel }] : []),
            ...(nextStep ? [{ label: "Next step", value: nextStep }] : []),
            ...(reasonLabel ? [{ label: "Reason", value: reasonLabel }] : []),
            ...(lastActivityLabel ? [{ label: "Last activity", value: lastActivityLabel }] : []),
        ],
        ...(tags ? { tags } : {}),
        quickActions,
        urgencyTier: workUnitKey.trim().toLowerCase() === "priced_followup" ? "warning" : "standard",
    };
    if (statusLabel) {
        item.groupKey = status;
        item.groupLabel = statusLabel;
    }
    return item;
}

export function buildRealOpportunityWorkUnitWorkspaceModel(input: {
    workUnitId: string;
    workUnitKey: string;
    workUnitName: string;
    departmentId: string;
    deptName: string;
    departmentKey?: string | null;
    oq: WorkspaceOpportunityQueueRuntime;
    /** When set (e.g. from GET /api/admin/actions?surface=queue_row), overrides per-row hardcoded quick actions. */
    queueRowQuickActions?: QueueItemQuickActionVm[] | null;
    /** Resolved `right_rail` placements (GET …/actions?surface=right_rail); merged ahead of hardcoded enrollment rail. */
    rightRailResolved?: ResolvedActionForClient[] | null;
    /** Queue definition `ui.row_preview.field_labels` merged with defaults (CRM compact captions). */
    rowPreviewFieldLabels?: Record<string, string> | null;
}): WorkUnitWorkspaceModel {
    const workUnitKeyLower = input.workUnitKey.trim().toLowerCase();
    const isAllInquiries = workUnitKeyLower === "pipeline_overview";
    const isEnrollmentDept = isEnrollmentLikeDepartmentKey(input.departmentKey);

    const rawItems: QueueItemVm[] = input.oq.items.map((row) => {
        const base = isEnrollmentDept
            ? buildEnrollmentOpportunityQueueItemVm(row, {
                  workUnitKey: input.workUnitKey,
                  rowPreviewFieldLabels: input.rowPreviewFieldLabels,
              })
            : defaultOpportunityQueueItemVm(row, input.workUnitKey);
        if (input.queueRowQuickActions?.length) {
            return { ...base, quickActions: input.queueRowQuickActions };
        }
        return base;
    });

    const items = rawItems.slice().sort((a, b) => {
        const ak = (a.groupLabel ?? "").toLowerCase();
        const bk = (b.groupLabel ?? "").toLowerCase();
        if (ak !== bk) return ak.localeCompare(bk);
        return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    });

    const queue: QueueVm = {
        id: `oq:${input.workUnitId}`,
        title: input.workUnitName,
        queueEntityType: "opportunity",
        countBadge: input.oq.total,
        items,
        sortCaption: "Grouped by status",
        workUnitMidlineKeys: isEnrollmentDept
            ? { left: "Lifecycle", right: "Next step" }
            : { left: "Next step", right: "Status" },
        workUnitGroupHeaders: Object.fromEntries(
            [...new Set(items.map((i) => i.groupKey || i.groupLabel).filter(Boolean) as string[])].map((k) => [
                k,
                { label: items.find((i) => (i.groupKey || i.groupLabel) === k)?.groupLabel ?? k },
            ])
        ),
    };

    const laneKey = input.workUnitKey;
    const focusLabel = `${input.deptName} · ${input.workUnitName}`;

    /** Oldest timestamp uses loaded preview page only — triage hint, not authoritative latency KPI. */
    let oldestMs: number | null = null;
    for (const row of input.oq.items) {
        const touched =
            parseIsoMs((row as { updated_at?: string | null }).updated_at) ??
            parseIsoMs((row as { created_at?: string | null }).created_at);
        if (touched != null) oldestMs = oldestMs == null ? touched : Math.min(oldestMs, touched);
    }
    const oldestAgeLabel = oldestMs != null ? `${formatAgeCompact(Date.now() - oldestMs)} ago` : "—";

    const actionsRail: WorkUnitWorkspaceModel["actionsRail"] = isEnrollmentDept
        ? mergeEnrollmentRightRailActions(input.rightRailResolved ?? [], {
              primaries: [],
              systemActions: [],
              quickOperations: [],
              overflow: [],
          })
        : {
              primaries: [{ id: "back_department", label: "Back to department", variant: "secondary" as const }],
              overflow: [{ id: "open_admin_opportunities", label: "All inquiries", variant: "secondary" as const }],
          };

    return {
        workspaceLevel: "work_unit",
        workUnitId: input.workUnitId,
        departmentKey: input.departmentKey ?? undefined,
        focusLabel,
        laneKey,
        aiSummary: {
            headline: input.workUnitName.trim() || "Queue",
            aiAwarenessLine: "Grouped by configured status labels from definitions.",
        },
        signals: [],
        kpis: [
            { id: "wu_count", label: "In queue", value: String(Math.max(0, input.oq.total ?? 0)), lane: "business" },
            {
                id: "wu_oldest",
                label: "Oldest on page",
                value: oldestAgeLabel,
                lane: "business",
            },
        ],
        laneInterpretation: {
            laneStatusLine: `${input.oq.total} in this queue`,
            recommendedActionLine:
                laneKey.toLowerCase() === "priced_followup"
                    ? "Follow up on offers that have a price and are awaiting a decision."
                    : isAllInquiries
                      ? "Work by status group — move families forward with the next clear step."
                      : "Work the oldest blockers first; use quick actions to move the inquiry forward.",
        },
        primaryQueue: queue,
        actionsRail,
        contextRail: { title: "About this queue", groups: [] },
    };
}

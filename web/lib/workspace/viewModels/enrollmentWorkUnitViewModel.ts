import type { ActionsVm, QueueItemQuickActionVm, QueueItemVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceOpportunityQueueRuntime } from "@/lib/workspace/types";

type OppRow = WorkspaceOpportunityQueueRuntime["items"][number];

function formatUsd(n: number): string {
    return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: n >= 100 ? 0 : 2,
    }).format(n);
}

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

function opportunityQuickActionsForLane(workUnitKey: string): QueueItemQuickActionVm[] {
    const k = workUnitKey.trim().toLowerCase();
    if (k === "needs_attention") {
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
    return [
        { id: "qualify_opportunity", label: "Conversation had" },
        { id: "start_quote", label: "Schedule tour" },
        { id: "mark_lost", label: "Lost" },
    ];
}

function quickActionsForRow(row: OppRow, workUnitKey: string): QueueItemQuickActionVm[] {
    const wk = workUnitKey.trim().toLowerCase();
    const reason = (row as { _attention_reason?: string | null })._attention_reason?.trim() || null;
    if (wk === "needs_attention" && reason) {
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
        return [
            { id: "qualify_opportunity", label: "Conversation had" },
            { id: "start_quote", label: "Schedule tour" },
            { id: "mark_lost", label: "Lost" },
        ];
    }
    return opportunityQuickActionsForLane(workUnitKey);
}

/**
 * Enrollment work-unit queue row — titles, subtitles, and meta lines derived from queue/runtime fields
 * (`_status_display`, lifecycle presentation, attention labels), not from page JSX.
 */
export function buildEnrollmentOpportunityQueueItemVm(row: OppRow, ctx: { workUnitKey: string }): QueueItemVm {
    const customer = (row._customer_name ?? "").trim();
    const titleBase = (row.name ?? "").trim();
    const title = customer || titleBase || row.id.slice(-8);
    const stage = row._lifecycle_stage_title?.trim() || "";
    const status = (row.status_key ?? "").trim();
    const statusLabel = (row._status_display ?? "").trim() || status;
    const value =
        row.quote_total != null && Number.isFinite(Number(row.quote_total)) && Number(row.quote_total) > 0
            ? formatUsd(Number(row.quote_total))
            : undefined;

    const reasonLabel = (row as { _attention_reason_label?: string | null })._attention_reason_label?.trim() || null;

    const nextStep = row._lifecycle_next_step?.title?.trim() || "";
    const lastTouchedMs =
        parseIsoMs((row as { updated_at?: string | null }).updated_at) ??
        parseIsoMs((row as { created_at?: string | null }).created_at);
    const lastActivityLabel =
        lastTouchedMs != null ? `${formatAgeCompact(Date.now() - lastTouchedMs)} ago` : "";

    const subtitle =
        stage && statusLabel && stage !== statusLabel
            ? `${stage} · ${statusLabel}`
            : stage || statusLabel || undefined;

    const metaLines: NonNullable<QueueItemVm["metaLines"]> = [];
    if (stage) metaLines.push({ label: "Lifecycle", value: stage });
    if (statusLabel) metaLines.push({ label: "Status", value: statusLabel });
    if (nextStep) metaLines.push({ label: "Next step", value: nextStep });
    if (reasonLabel) metaLines.push({ label: "Attention", value: reasonLabel });
    if (lastActivityLabel) metaLines.push({ label: "Last activity", value: lastActivityLabel });

    const quickActions = quickActionsForRow(row, ctx.workUnitKey);

    const item: QueueItemVm = {
        id: row.id,
        title,
        subtitle,
        valueLabel: value,
        metaLines,
        quickActions,
        urgencyTier: ctx.workUnitKey.trim().toLowerCase() === "priced_followup" ? "warning" : "standard",
    };
    if (statusLabel) {
        item.groupKey = status;
        item.groupLabel = statusLabel;
    }
    return item;
}

export function buildEnrollmentWorkUnitActionsRail(): ActionsVm {
    return {
        primaries: [],
        systemActions: [
            { id: "wu_back_department", label: "Back to department", variant: "primary" },
            { id: "wu_new_inquiry", label: "New inquiry", variant: "primary" },
        ],
        quickOperations: [
            { id: "wu_open_needs_attention", label: "Open Needs attention queue" },
            { id: "wu_open_all_inquiries", label: "Browse all inquiries" },
            { id: "wu_manage_work_units", label: "Manage work units" },
        ],
        overflow: [{ id: "wu_workspace_root", label: "Organization workspace", variant: "secondary" }],
    };
}

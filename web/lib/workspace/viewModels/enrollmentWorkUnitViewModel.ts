import type {
    ActionsVm,
    EnrollmentCrmRowSemanticSlots,
    QueueItemQuickActionVm,
    QueueItemVm,
} from "@/lib/ui-v2/workspace-types";
import type { WorkspaceOpportunityQueueRuntime } from "@/lib/workspace/types";

type OppRow = WorkspaceOpportunityQueueRuntime["items"][number];

/**
 * Desired CRM fields that are **not** currently supplied by the workspace queue API / enrichment
 * (no persons.children join, no messaging routes). Used for docs + future payload work.
 */
export const ENROLLMENT_CRM_QUEUE_PAYLOAD_GAPS = [
    "child_name (no `opportunities` → child person join in queue payload; optional `metadata.demo_child_name` only if seeded)",
    "dedicated_sms_action (no SMS/comms API route wired from workspace queue)",
    "in_app_message_action (no threaded message UI route from workspace row)",
] as const;

export type EnrollmentCrmContactCapability = {
    /** `mailto:` when `persons.email` is present for `primary_person_id`. */
    emailMailto: boolean;
    /** `tel:` when a dialable phone exists on the primary person row. */
    phoneTel: boolean;
};

export function enrollmentCrmContactCapabilityForRow(row: OppRow): EnrollmentCrmContactCapability {
    const email = Boolean((row as { _primary_email?: string | null })._primary_email?.trim());
    const phoneRaw = (row as { _primary_phone?: string | null })._primary_phone?.trim() ?? "";
    const phoneTel = phoneRaw.replace(/\D/g, "").length >= 10;
    return { emailMailto: email, phoneTel };
}

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

function laneQuickActionsForAttentionRow(row: OppRow, workUnitKey: string): QueueItemQuickActionVm[] {
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

function crmContactQuickActions(row: OppRow): QueueItemQuickActionVm[] {
    const cap = enrollmentCrmContactCapabilityForRow(row);
    const email = (row as { _primary_email?: string | null })._primary_email?.trim();
    const phone = (row as { _primary_phone?: string | null })._primary_phone?.trim();
    const out: QueueItemQuickActionVm[] = [];
    if (cap.emailMailto && email) {
        out.push({ id: "crm_mailto", label: "Email", payload: { href: `mailto:${email}` } });
    }
    if (cap.phoneTel && phone) {
        const digits = phone.replace(/\D/g, "");
        out.push({ id: "crm_tel", label: "Call", payload: { href: `tel:${digits}` } });
    }
    return out;
}

export function buildEnrollmentCrmRowSemanticSlots(row: OppRow): EnrollmentCrmRowSemanticSlots {
    const customer = (row._customer_name ?? "").trim();
    const titleBase = (row.name ?? "").trim();
    const primaryIdentity = customer || titleBase || row.id.slice(-8);

    const childName = (row as { _child_display_name?: string | null })._child_display_name?.trim() || null;

    const stageLabel = row._lifecycle_stage_title?.trim() || null;
    const statusLabel = (row._status_display ?? "").trim() || (row.status_key ?? "").trim() || null;

    const nextStep = row._lifecycle_next_step?.title?.trim() || null;
    const lastTouchedMs =
        parseIsoMs((row as { updated_at?: string | null }).updated_at) ??
        parseIsoMs((row as { created_at?: string | null }).created_at);
    const lastActivity =
        lastTouchedMs != null ? `${formatAgeCompact(Date.now() - lastTouchedMs)} ago` : null;

    const commercialValue =
        row.quote_total != null && Number.isFinite(Number(row.quote_total)) && Number(row.quote_total) > 0
            ? formatUsd(Number(row.quote_total))
            : null;

    const contactSnippet =
        (row as { _primary_contact_line?: string | null })._primary_contact_line?.trim() ||
        [((row as { _primary_email?: string | null })._primary_email ?? "").trim(), ((row as { _primary_phone?: string | null })._primary_phone ?? "").trim()]
            .filter(Boolean)
            .join(" · ") ||
        null;

    const programContext = (row as { _requested_program?: string | null })._requested_program?.trim() || null;
    const roomContext = (row as { _room_label?: string | null })._room_label?.trim() || null;
    const ageContext = (row as { _age_band?: string | null })._age_band?.trim() || null;
    const tourContext = (row as { _tour_timing?: string | null })._tour_timing?.trim() || null;

    const attentionReason = (row as { _attention_reason_label?: string | null })._attention_reason_label?.trim() || null;
    const familyNote = (row as { _notes_preview?: string | null })._notes_preview?.trim() || null;

    return {
        primaryIdentity,
        childName,
        stageLabel,
        statusLabel,
        nextStep,
        lastActivity,
        commercialValue,
        contactSnippet,
        programContext,
        roomContext,
        ageContext,
        tourContext,
        attentionReason,
        familyNote,
    };
}

/**
 * Enrollment work-unit queue row — binds `semanticEnrollmentCrm` for config/AI-driven layout,
 * plus legacy `QueueItemVm` fields for grouping and fallbacks.
 */
export function buildEnrollmentOpportunityQueueItemVm(row: OppRow, ctx: { workUnitKey: string }): QueueItemVm {
    const slots = buildEnrollmentCrmRowSemanticSlots(row);
    const titleBase = (row.name ?? "").trim();
    const title = (row._customer_name ?? "").trim() || titleBase || row.id.slice(-8);
    const status = (row.status_key ?? "").trim();
    const statusLabel = (row._status_display ?? "").trim() || status;

    const laneActions =
        ctx.workUnitKey.trim().toLowerCase() === "needs_attention"
            ? laneQuickActionsForAttentionRow(row, ctx.workUnitKey)
            : opportunityQuickActionsForLane(ctx.workUnitKey);
    const quickActions = [...crmContactQuickActions(row), ...laneActions];

    const item: QueueItemVm = {
        id: row.id,
        title,
        subtitle:
            slots.stageLabel && slots.statusLabel && slots.stageLabel !== slots.statusLabel
                ? `${slots.stageLabel} · ${slots.statusLabel}`
                : slots.stageLabel || slots.statusLabel || undefined,
        valueLabel: slots.commercialValue ?? undefined,
        quickActions,
        semanticEnrollmentCrm: slots,
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

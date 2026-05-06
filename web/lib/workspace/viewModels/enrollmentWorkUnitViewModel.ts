import type {
    ActionsVm,
    CrmCompactRowSemanticSlots,
    QueueItemQuickActionVm,
    QueueItemVm,
} from "@/lib/ui-v2/workspace-types";
import {
    formatOpportunityQueueNotesPreview,
    formatOpportunityQueueNotesPreviewParts,
} from "@/lib/admin/opportunityActivityTimelineFormat";
import {
    buildCrmCompactWorkUnitFactGroups,
    buildCrmQueueRowPreviewPresentation,
    dedupeRedundantProgramAgeInPreview,
    deriveCrmCompactChildrenLinesForWorkUnitRow,
    extractCrmChildDisplayLineFromQueueRow,
    parseQueueRowCrmChildrenStructured,
} from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
import type { QueueUiRowPreviewField } from "@/lib/ui-v2/queueUiConfig";
import { normalizePhone } from "@/lib/contactNormalize";
import { formatWorkspaceUsdGrouped } from "@/lib/ui-v2/formatWorkspaceCurrency";
import type { WorkspaceOpportunityQueueRuntime } from "@/lib/workspace/types";
import { buildQueueOperationalAttentionPresentation } from "@/lib/opportunities/operationalAttentionExplain";

type OppRow = WorkspaceOpportunityQueueRuntime["items"][number];

/**
 * Desired CRM fields that are **not** currently supplied by the workspace queue API / enrichment
 * (no persons.children join, no messaging routes). Used for docs + future payload work.
 */
export const ENROLLMENT_CRM_QUEUE_PAYLOAD_GAPS = [
    "structured multi-child CRM rows use `_crm_compact_children[]` from queue enrichment (household children from `customer_members`, not opportunity metadata).",
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
        if (reason === "waiting_on_staff") {
            return [
                { id: "open_quote", label: "Open inquiry" },
                { id: "qualify_opportunity", label: "Conversation had" },
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
        const tel = normalizePhone(phone) ?? `+1${phone.replace(/\D/g, "").slice(-10)}`;
        out.push({ id: "crm_tel", label: "Call", payload: { href: `tel:${tel}` } });
    }
    return out;
}

export type BuildEnrollmentCrmRowOptions = {
    rowPreviewFieldLabels?: Record<string, string> | null;
    previewWant?: ((field: QueueUiRowPreviewField) => boolean) | null;
    viewerTimezone?: string | null;
};

export function buildEnrollmentCrmRowSemanticSlots(row: OppRow, options?: BuildEnrollmentCrmRowOptions): CrmCompactRowSemanticSlots {
    const customer = (row._customer_name ?? "").trim();
    const titleBase = (row.name ?? "").trim();
    const primaryIdentity = customer || titleBase || row.id.slice(-8);

    const rowRec = row as unknown as Record<string, unknown>;
    const structuredChildren = parseQueueRowCrmChildrenStructured(rowRec._crm_compact_children);
    const multiChild = structuredChildren.length >= 2;
    const childDisplayLine = extractCrmChildDisplayLineFromQueueRow(rowRec);
    const childName =
        multiChild
            ? null
            : structuredChildren.length === 1
                ? structuredChildren[0]!.primary.trim() || null
                : childDisplayLine || null;

    const stageLabel = row._lifecycle_stage_title?.trim() || null;
    const statusLabel = (row._status_display ?? "").trim() || (row.status_key ?? "").trim() || null;

    const nextStep =
        (row as { _next_step_preview?: string | null })._next_step_preview?.trim() ||
        row._lifecycle_next_step?.title?.trim() ||
        null;
    const wfAt = (row as { last_activity_at?: string | null }).last_activity_at;
    const wfSummary = (row as { last_activity_summary?: string | null }).last_activity_summary?.trim() || null;
    let lastActivity: string | null = null;
    if (wfAt) {
        const ms = parseIsoMs(wfAt);
        if (ms != null) {
            const rel = `${formatAgeCompact(Date.now() - ms)} ago`;
            lastActivity = wfSummary ? `${rel} · ${wfSummary}` : rel;
        }
    }
    if (!lastActivity) {
        const lastTouchedMs =
            parseIsoMs((row as { updated_at?: string | null }).updated_at) ??
            parseIsoMs((row as { created_at?: string | null }).created_at);
        lastActivity =
            lastTouchedMs != null ? `${formatAgeCompact(Date.now() - lastTouchedMs)} ago` : null;
    }

    const commercialValue =
        row.quote_total != null && Number.isFinite(Number(row.quote_total)) && Number(row.quote_total) > 0
            ? formatWorkspaceUsdGrouped(Number(row.quote_total))
            : null;

    const roomContext = (row as { _room_label?: string | null })._room_label?.trim() || null;

    const attnPres = buildQueueOperationalAttentionPresentation(row as Record<string, unknown>);
    const attentionReason =
        attnPres.summaryLine ??
        ((row as { _attention_reason_label?: string | null })._attention_reason_label?.trim() || null);
    const operationalNextHint = attnPres.nextHintLine;
    const notesRaw = (row as { _notes_preview?: string | null })._notes_preview;
    const familyNotePreview = formatOpportunityQueueNotesPreviewParts(notesRaw, options?.viewerTimezone ?? undefined);
    const familyNote = formatOpportunityQueueNotesPreview(notesRaw, options?.viewerTimezone ?? undefined);

    const staleSig = (row as { stale_signal?: { label: string; severity: "low" | "medium" | "high" } | null }).stale_signal;
    const activityStale =
        staleSig && String(staleSig.label ?? "").trim()
            ? { label: String(staleSig.label).trim(), severity: staleSig.severity }
            : null;

    const programRaw = (row as { _requested_program?: string | null })._requested_program?.trim() || null;
    const programContextDeduped = programRaw ? dedupeRedundantProgramAgeInPreview(programRaw) : null;

    const want = options?.previewWant ?? ((_f: QueueUiRowPreviewField) => true);
    const childrenLinesRefined = deriveCrmCompactChildrenLinesForWorkUnitRow({
        want,
        crmChildrenParsed: structuredChildren,
        childDisplayLine,
        programFamily: programContextDeduped,
    });

    const previewPresentation = buildCrmQueueRowPreviewPresentation(
        row as Record<string, unknown>,
        want,
        options?.rowPreviewFieldLabels
    );

    const crmFactGroups = buildCrmCompactWorkUnitFactGroups({
        row: row as Record<string, unknown>,
        want,
        rowPreviewFieldLabels: options?.rowPreviewFieldLabels,
        childrenLines: childrenLinesRefined?.length ? childrenLinesRefined : null,
        childNameSingle: childrenLinesRefined?.length ? null : !multiChild ? childDisplayLine || null : null,
        programSingle: childrenLinesRefined?.length ? null : multiChild ? null : want("program") ? programContextDeduped : null,
        roomContext,
        ageBandContext: previewPresentation.ageBandContext ?? null,
    });

    const programContext =
        want("program") && !childrenLinesRefined?.length && !multiChild ? programContextDeduped : null;

    return {
        primaryIdentity,
        childName,
        childrenLines: childrenLinesRefined,
        stageLabel,
        statusLabel,
        nextStep,
        lastActivity,
        commercialValue,
        ...previewPresentation,
        crmFactGroups,
        programContext,
        roomContext,
        attentionReason,
        operationalNextHint,
        familyNote,
        familyNotePreview,
        activityStale,
    };
}

/**
 * Enrollment work-unit queue row — binds `semanticCrmCompact` for config-driven layout,
 * plus legacy `QueueItemVm` fields for grouping and fallbacks.
 */
export function buildEnrollmentOpportunityQueueItemVm(
    row: OppRow,
    ctx: { workUnitKey: string; rowPreviewFieldLabels?: Record<string, string> | null }
): QueueItemVm {
    const slots = buildEnrollmentCrmRowSemanticSlots(row, { rowPreviewFieldLabels: ctx.rowPreviewFieldLabels });
    const titleBase = (row.name ?? "").trim();
    const title = (row._customer_name ?? "").trim() || titleBase || row.id.slice(-8);
    const status = (row.status_key ?? "").trim();
    const statusLabel = (row._status_display ?? "").trim() || status;

    const laneActions =
        ctx.workUnitKey.trim().toLowerCase() === "needs_attention"
            ? laneQuickActionsForAttentionRow(row, ctx.workUnitKey)
            : opportunityQuickActionsForLane(ctx.workUnitKey);
    const quickActions = [...crmContactQuickActions(row), ...laneActions];

    const wk = ctx.workUnitKey.trim().toLowerCase();
    const needsAttention = Boolean((row as { _needs_attention?: boolean })._needs_attention);
    const item: QueueItemVm = {
        id: row.id,
        title,
        subtitle:
            slots.stageLabel && slots.statusLabel && slots.stageLabel !== slots.statusLabel
                ? `${slots.stageLabel} · ${slots.statusLabel}`
                : slots.stageLabel || slots.statusLabel || undefined,
        valueLabel: slots.commercialValue ?? undefined,
        quickActions,
        semanticCrmCompact: slots,
        urgencyTier:
            needsAttention
                ? "warning"
                : wk === "priced_followup"
                  ? "warning"
                  : "standard",
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
        ],
        quickOperations: [
            { id: "wu_open_needs_attention", label: "Open Needs attention queue" },
            { id: "wu_manage_work_units", label: "Manage work units" },
        ],
        overflow: [{ id: "wu_workspace_root", label: "Organization workspace", variant: "secondary" }],
    };
}

/** Department overview (Enrollment) — command rail when no per-row entity context. */
export function buildEnrollmentDepartmentCommandRail(): ActionsVm {
    return {
        primaries: [],
        systemActions: [
            { id: "dept_open_enrollment_wu", label: "Open enrollment queue", variant: "primary" },
        ],
        quickOperations: [
            { id: "wu_manage_work_units", label: "Manage work units" },
        ],
        overflow: [{ id: "wu_workspace_root", label: "Organization workspace", variant: "secondary" }],
    };
}

/**
 * Partial QueueRowContext adapter for today's case-grain opportunity queue rows.
 *
 * Does not change queue membership. When production queues are still case-grain,
 * row_subject is honestly subject_type: "case".
 *
 * @see docs/sprints/06_2026/status_ownership_and_lifecycle_grain_expansion.md §4
 * @see docs/system/work-unit-surface-context-contract.md
 */

import { humanizeSnakeCaseToken } from "@/lib/admin/activityTimelineFormat";
import {
    childLifecycleMembersFromInquiryChildren,
    type OpportunityChildLifecycleSummary,
} from "@/lib/opportunities/buildOpportunityChildLifecycleSummary";
import type { QueueGrain } from "@/lib/config/queueDefinitionV2Runtime";
import {
    QUEUE_ROW_CONTEXT_CONTRACT_VERSION,
    type LifecycleSubjectRef,
    type LifecycleSubjectType,
    type QueueMembershipGrain,
    type QueueRowContext,
    type QueueRowNextBestAction,
    type RelatedSubjectSummary,
    type SubjectPlacementContext,
    type WorkUnitSurfaceContext,
    type WorkUnitSurfaceContextRow,
    isQueueMembershipGrain,
} from "@/lib/workUnits/lifecycleSubjectContracts";

export type PartialQueueRowContextQueueMeta = {
    key: string;
    label: string;
    lifecycle_key?: string;
    stage_key?: string;
    /**
     * Declared membership grain for this queue lane.
     * Defaults to `case` — honest for current production paths.
     * TODO(phase-6): pass child/candidate from NormalizedQueueEntry.grain.
     */
    subject_grain?: LifecycleSubjectType;
};

export type BuildPartialQueueRowContextInput = {
    /** Enriched opportunity queue preview row (`enrichOpportunityRows` output shape). */
    row: Record<string, unknown>;
    queue: PartialQueueRowContextQueueMeta;
    work_unit_id?: string;
    /** Operator case type label — default "Enrollment Case". */
    case_type_label?: string;
};

function trimOrNull(raw: unknown): string | null {
    if (raw == null) return null;
    const t = String(raw).trim();
    return t || null;
}

function readInquiryChildrenFromRow(row: Record<string, unknown>): unknown[] {
    const direct = row._inquiry_children;
    if (Array.isArray(direct) && direct.length) {
        return direct.filter((x) => x != null && typeof x === "object");
    }
    const md = row.metadata;
    if (md != null && typeof md === "object" && !Array.isArray(md)) {
        const ic = (md as { inquiry_children?: unknown }).inquiry_children;
        if (Array.isArray(ic)) {
            return ic.filter((x) => x != null && typeof x === "object");
        }
    }
    return [];
}

function resolveCaseDisplayName(row: Record<string, unknown>): string {
    return (
        trimOrNull(row.title) ??
        trimOrNull(row.name) ??
        trimOrNull(row._customer_name) ??
        "Case"
    );
}

function resolveStatusKey(row: Record<string, unknown>): string {
    return trimOrNull(row.status_key) ?? "";
}

function resolveStatusLabel(row: Record<string, unknown>, statusKey: string): string {
    return trimOrNull(row._status_display) ?? humanizeSnakeCaseToken(statusKey);
}

/**
 * Target boring case labels — full mapping ships with case status migration (phase 5).
 * Until then, pipeline keys may still appear on case_status_label.
 */
export function resolveBoringCaseStatusLabel(statusKey: string, fallbackLabel: string): string {
    const k = statusKey.trim().toLowerCase();
    switch (k) {
        case "open":
        case "new_inquiry":
        case "new":
            return "Active";
        case "closed":
        case "lost":
            return "Closed";
        case "archived":
            return "Archived";
        case "inactive":
            return "Inactive";
        default:
            return fallbackLabel;
    }
}

function buildSubjectPlacementFromInquiryChildRaw(raw: Record<string, unknown>): SubjectPlacementContext | null {
    const location_id = trimOrNull(raw.location_id);
    const location_label = trimOrNull(raw.location_label);
    const program_key = trimOrNull(raw.desired_program_type);
    const program_label =
        trimOrNull(raw.desired_program_label) ??
        (program_key ? humanizeSnakeCaseToken(program_key) : null);
    const room_id = trimOrNull(raw.program_room_cohort_key);
    const room_label = trimOrNull(raw.program_room_cohort_label);
    const schedule_key = trimOrNull(raw.desired_schedule_type);
    const schedule_label =
        trimOrNull(raw.desired_schedule_label) ??
        (schedule_key ? humanizeSnakeCaseToken(schedule_key) : null);

    if (!location_id && !program_key && !room_id && !schedule_key) {
        return null;
    }

    return {
        location_id,
        location_label,
        program_key,
        program_label,
        room_id,
        room_label,
        schedule_key,
        schedule_label,
    };
}

function placementSignature(placement: SubjectPlacementContext): string {
    return [
        placement.location_id ?? "",
        placement.program_key ?? "",
        placement.room_id ?? "",
        placement.schedule_key ?? "",
    ].join("|");
}

/**
 * Case-grain rows: populate placement when one child or all children share identical OCM placement.
 * Returns undefined when ambiguous (multiple distinct placements).
 */
export function resolveRowPlacementContextFromInquiryChildren(
    inquiryChildren: unknown[],
): SubjectPlacementContext | undefined {
    if (!inquiryChildren.length) return undefined;

    const placements: SubjectPlacementContext[] = [];
    for (const raw of inquiryChildren) {
        if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
        const placement = buildSubjectPlacementFromInquiryChildRaw(raw as Record<string, unknown>);
        if (placement) placements.push(placement);
    }

    if (!placements.length) return undefined;
    if (placements.length === 1) return placements[0];

    const firstSig = placementSignature(placements[0]!);
    const allSame = placements.every((p) => placementSignature(p) === firstSig);
    return allSame ? placements[0] : undefined;
}

function buildRelatedSubjectsSummary(row: Record<string, unknown>): RelatedSubjectSummary[] {
    const inquiryChildren = readInquiryChildrenFromRow(row);
    if (!inquiryChildren.length) {
        // TODO(phase-6): child-grain rows — derive siblings from OCM join, not metadata.inquiry_children.
        return [];
    }

    const members = childLifecycleMembersFromInquiryChildren(inquiryChildren);
    const out: RelatedSubjectSummary[] = [];

    for (let i = 0; i < inquiryChildren.length; i++) {
        const raw = inquiryChildren[i] as Record<string, unknown>;
        const member = members[i];
        const subjectId =
            trimOrNull(raw.ocm_id) ??
            trimOrNull(raw.id) ??
            trimOrNull(raw.customer_member_id);
        if (!subjectId) continue;

        const displayName =
            trimOrNull(raw.display_name) ??
            trimOrNull(raw.child_display_name) ??
            trimOrNull(member?.display_name) ??
            "Child";

        const statusLabel =
            trimOrNull(raw.outcome_status_label) ??
            trimOrNull(member?.outcome_status_label) ??
            (member?.outcome_status_key
                ? humanizeSnakeCaseToken(member.outcome_status_key)
                : "—");

        const placement = buildSubjectPlacementFromInquiryChildRaw(raw);

        out.push({
            subject_type: "child",
            subject_id: subjectId,
            display_name: displayName,
            status_label: statusLabel,
            location_id: placement?.location_id ?? trimOrNull(raw.location_id),
            location_label: placement?.location_label ?? trimOrNull(raw.location_label),
            program_label: placement?.program_label ?? null,
            room_label: placement?.room_label ?? trimOrNull(raw.program_room_cohort_label),
            schedule_label: placement?.schedule_label ?? trimOrNull(raw.desired_schedule_label),
        });
    }

    return out;
}

function buildAttentionSummary(row: Record<string, unknown>): QueueRowContext["attention_summary"] {
    const needs =
        row._needs_attention === true ||
        (typeof row._attention_reason === "string" && row._attention_reason.trim() !== "");
    if (!needs) return null;

    const label =
        trimOrNull(row._attention_reason_label) ??
        trimOrNull(row._attention_reason) ??
        null;

    return {
        needs_attention: true,
        primary_reason_label: label,
    };
}

function buildWorkSummary(row: Record<string, unknown>): QueueRowContext["work_summary"] {
    const preview = row._operational_summary_preview;
    if (preview == null || typeof preview !== "object" || Array.isArray(preview)) {
        // TODO(phase-5): query open operational_tasks for subject-scoped counts.
        return null;
    }
    const p = preview as Record<string, unknown>;
    const headline = trimOrNull(p.headline) ?? trimOrNull(p.primary_label);
    const openCountRaw = p.open_count ?? p.open_items_count;
    const openCount =
        typeof openCountRaw === "number" && Number.isFinite(openCountRaw)
            ? Math.max(0, Math.floor(openCountRaw))
            : headline
              ? 1
              : 0;
    if (!openCount && !headline) return null;
    return {
        open_count: openCount,
        primary_open_label: headline,
    };
}

function buildNextBestAction(row: Record<string, unknown>): QueueRowNextBestAction | null {
    const preview = row._operational_recommendation_preview;
    if (preview == null || typeof preview !== "object" || Array.isArray(preview)) {
        return null;
    }
    const p = preview as Record<string, unknown>;
    const label = trimOrNull(p.suggested_action_label) ?? trimOrNull(p.headline);
    if (!label) return null;
    const actionKey = trimOrNull(p.suggested_action_key) ?? undefined;
    return {
        label,
        action_key: actionKey,
        source: "recommendation",
    };
}

function resolveLifecycleKey(queue: PartialQueueRowContextQueueMeta): string {
    return trimOrNull(queue.lifecycle_key) ?? "enrollment";
}

function resolveStageKey(queue: PartialQueueRowContextQueueMeta): string {
    return trimOrNull(queue.stage_key) ?? queue.key;
}

function resolveSubjectGrain(queue: PartialQueueRowContextQueueMeta): LifecycleSubjectType {
    const g = queue.subject_grain;
    if (g) return g;
    return "case";
}

function buildLifecycleSubjectRef(params: {
    subjectType: LifecycleSubjectType;
    subjectId: string;
    lifecycleKey: string;
    stageKey: string;
    statusKey: string;
    caseId: string;
}): LifecycleSubjectRef {
    const base: LifecycleSubjectRef = {
        subject_type: params.subjectType,
        subject_id: params.subjectId,
        lifecycle_key: params.lifecycleKey,
        stage_key: params.stageKey,
        status_key: params.statusKey,
    };
    if (params.subjectType !== "case") {
        base.case_anchor = { entity_type: "opportunities", entity_id: params.caseId };
    }
    return base;
}

/**
 * Build partial QueueRowContext from an enriched case-grain opportunity row.
 *
 * Child/candidate grain membership is not synthesized — pass subject_grain when
 * queue_definition declares it; row_subject still uses opportunity id until phase 6.
 */
export function buildPartialQueueRowContext(input: BuildPartialQueueRowContextInput): QueueRowContext {
    const row = input.row;
    const caseId = trimOrNull(row.id) ?? "";
    const statusKey = resolveStatusKey(row);
    const statusLabel = resolveStatusLabel(row, statusKey);
    const caseDisplayName = resolveCaseDisplayName(row);
    const lifecycleKey = resolveLifecycleKey(input.queue);
    const stageKey = resolveStageKey(input.queue);
    // Honest representation: opportunity preview rows are still case-shaped in production.
    // Declared queue grain (input.queue.subject_grain) may differ until phase 6 child/candidate rows ship.
    // TODO(phase-6): when queue returns child/candidate row ids, set row_subject from OCM/candidate.
    const subjectType: LifecycleSubjectType = "case";
    const subjectId = caseId;
    const subjectDisplayName = caseDisplayName;

    const activeSubject = buildLifecycleSubjectRef({
        subjectType,
        subjectId,
        lifecycleKey,
        stageKey,
        statusKey,
        caseId,
    });

    const primaryContactName = trimOrNull(row._primary_contact_line);
    const primaryContact =
        primaryContactName != null
            ? {
                  display_name: primaryContactName,
                  phone: trimOrNull(row._primary_phone),
                  email: trimOrNull(row._primary_email),
              }
            : null;

    const boringCaseLabel = resolveBoringCaseStatusLabel(statusKey, statusLabel);
    const inquiryChildren = readInquiryChildrenFromRow(row);
    const placement_context = resolveRowPlacementContextFromInquiryChildren(inquiryChildren);

    return {
        contract_version: QUEUE_ROW_CONTEXT_CONTRACT_VERSION,
        row_subject: {
            subject_type: subjectType,
            subject_id: subjectId,
            display_name: subjectDisplayName,
        },
        row_stage: input.queue.label.trim() || input.queue.key,
        lifecycle_key: lifecycleKey,
        row_status_key: statusKey,
        row_status_label: statusLabel,
        case_context: {
            case_id: caseId,
            display_name: caseDisplayName,
            case_type_label: input.case_type_label?.trim() || "Enrollment Case",
            case_status_key: statusKey,
            case_status_label: boringCaseLabel,
        },
        primary_contact: primaryContact,
        related_subjects_summary: buildRelatedSubjectsSummary(row),
        attention_summary: buildAttentionSummary(row),
        work_summary: buildWorkSummary(row),
        next_best_action: buildNextBestAction(row),
        drawer_open: {
            entity_type: "opportunities",
            entity_id: caseId,
            active_subject: activeSubject,
        },
        ...(placement_context ? { placement_context } : {}),
    };
}

/** Attach `_queue_row_context` on a row copy — safe optional enrichment for APIs / devtools. */
export function attachPartialQueueRowContext(
    row: Record<string, unknown>,
    queue: PartialQueueRowContextQueueMeta,
    options?: { case_type_label?: string }
): Record<string, unknown> {
    return {
        ...row,
        _queue_row_context: buildPartialQueueRowContext({
            row,
            queue,
            case_type_label: options?.case_type_label,
        }),
    };
}

export function attachPartialQueueRowContextToRows(
    rows: Record<string, unknown>[],
    queue: PartialQueueRowContextQueueMeta,
    options?: { case_type_label?: string }
): Record<string, unknown>[] {
    return rows.map((row) => attachPartialQueueRowContext(row, queue, options));
}

export function queueGrainToLifecycleSubjectType(grain: QueueGrain | null | undefined): QueueMembershipGrain {
    if (grain && isQueueMembershipGrain(grain)) return grain;
    return "case";
}

export function buildWorkUnitSurfaceContextFromRows(params: {
    work_unit_id: string;
    queue_key: string;
    queue: PartialQueueRowContextQueueMeta;
    rows: Record<string, unknown>[];
    case_type_label?: string;
}): WorkUnitSurfaceContext {
    const queueGrain = resolveSubjectGrain(params.queue); // declared lane grain — row_subject may still be case until phase 6
    const contextRows: WorkUnitSurfaceContextRow[] = params.rows.map((row) => {
        const id = trimOrNull(row.id) ?? "";
        const queue_row_context = buildPartialQueueRowContext({
            row,
            queue: params.queue,
            work_unit_id: params.work_unit_id,
            case_type_label: params.case_type_label,
        });
        return { id, queue_row_context };
    });

    return {
        contract_version: QUEUE_ROW_CONTEXT_CONTRACT_VERSION,
        work_unit_id: params.work_unit_id,
        queue_key: params.queue_key,
        queue_grain: queueGrain,
        lifecycle_key: resolveLifecycleKey(params.queue),
        // TODO(phase-6): map NormalizedQueueEntry.count_unit → WorkUnitQueueCountUnit
        rows: contextRows,
    };
}

/** Read child lifecycle summary if already attached by queue enrichment. */
export function readChildLifecycleSummaryFromRow(
    row: Record<string, unknown>
): OpportunityChildLifecycleSummary | null {
    const raw = row._child_lifecycle_summary;
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as OpportunityChildLifecycleSummary;
}

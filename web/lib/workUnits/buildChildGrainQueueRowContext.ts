/**
 * Honest QueueRowContext for child/candidate grain queue rows (Phase A).
 *
 * Used when builder or legacy child-grain routing enables the lane and the row
 * carries ocmrow:/pcrow: ids or explicit row_grain.
 *
 * @see docs/sprints/archive/06_2026/child_grain_queue_conversion_design.md §7
 */

import { humanizeSnakeCaseToken } from "@/lib/admin/activityTimelineFormat";
import { inquiryChildProfileFieldsFromRaw } from "@/lib/admin/drawer/inquiryChildrenHydration";
import {
    buildHouseholdChildrenLookup,
    mergeInquiryChildProfileFromHousehold,
} from "@/lib/workUnits/queueRowChildProfileMerge";
import { placementCandidateQueueRowId } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";
import { enrollmentOffersChildQueueRowId } from "@/lib/queues/childGrainEnrollmentQueue";
import {
    QUEUE_ROW_CONTEXT_CONTRACT_VERSION,
    type LifecycleSubjectRef,
    type LifecycleSubjectType,
    type QueueRowContext,
    type QueueRowNextBestAction,
    type RelatedSubjectSummary,
    type SubjectPlacementContext,
} from "@/lib/workUnits/lifecycleSubjectContracts";
import {
    applyRelatedSubjectLocationVisibility,
    relatedSubjectVisibilityForLocation,
} from "@/lib/queues/queueMembershipLocationScope";
import { buildQueueCurrentWorkSummary } from "@/lib/workUnits/buildQueueCurrentWorkSummary";
import {
    buildAttentionSummary,
    buildNextBestAction,
    buildWorkSummary,
    resolveBoringCaseStatusLabel,
    resolveSubjectStatusLabel,
    type PartialQueueRowContextQueueMeta,
} from "@/lib/workUnits/buildPartialQueueRowContextHelpers";
import { filterQueueRelevantInquiryChildren, readInquiryChildrenFromRow } from "@/lib/workUnits/filterQueueRelevantInquiryChildren";
import { resolveChildProcessStageLabel } from "@/lib/lifecycle/childEnrollmentProcessStageLabel";

export type BuildChildGrainQueueRowContextInput = {
    row: Record<string, unknown>;
    queue: PartialQueueRowContextQueueMeta;
    case_type_label?: string;
    /** When set, redact sibling summaries outside allowed site scope. */
    allowedLocationIds?: readonly string[] | null;
};

function trimOrNull(raw: unknown): string | null {
    if (raw == null) return null;
    const t = String(raw).trim();
    return t || null;
}

/** Prefer household `_customer_name` over opportunity title (often primary contact). */
function resolveCaseDisplayName(row: Record<string, unknown>): string {
    return (
        trimOrNull(row._customer_name) ??
        trimOrNull(row.title) ??
        trimOrNull(row.name) ??
        "Case"
    );
}

function resolveCaseId(row: Record<string, unknown>): string {
    const oppId = trimOrNull(row.opportunity_id);
    if (oppId) return oppId;
    const id = trimOrNull(row.id) ?? "";
    if (id.startsWith("ocmrow:") || id.startsWith("pcrow:")) {
        const parts = id.split(":");
        if (parts.length >= 3) return parts[1]!;
    }
    return id;
}

function buildSubjectPlacementFromInquiryChildRaw(raw: Record<string, unknown>): SubjectPlacementContext | null {
    const location_id = trimOrNull(raw.location_id);
    const location_label = trimOrNull(raw.location_label);
    const program_key = trimOrNull(raw.program_key);
    const program_label =
        trimOrNull(raw.desired_program_label) ??
        (program_key ? humanizeSnakeCaseToken(program_key) : null);
    const room_id = trimOrNull(raw.program_room_cohort_key);
    const room_label = trimOrNull(raw.program_room_cohort_label);
    const schedule_key = trimOrNull(raw.schedule_type);
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

function buildPlacementFromRowSubjectHints(row: Record<string, unknown>): SubjectPlacementContext | null {
    const hints = row._row_subject_placement;
    if (hints == null || typeof hints !== "object" || Array.isArray(hints)) return null;
    const h = hints as Record<string, unknown>;
    const location_id = trimOrNull(h.location_id);
    const program_key = trimOrNull(h.program_key);
    const room_id = trimOrNull(h.room_id);
    const schedule_key = trimOrNull(h.schedule_key);
    if (!location_id && !program_key && !room_id && !schedule_key) return null;
    return {
        location_id,
        program_key,
        program_label: program_key ? humanizeSnakeCaseToken(program_key) : null,
        room_id,
        room_label: room_id ? humanizeSnakeCaseToken(room_id) : null,
        schedule_key,
        schedule_label: schedule_key ? humanizeSnakeCaseToken(schedule_key) : null,
    };
}

function resolvePlacementContext(row: Record<string, unknown>, activeOcmId: string | null): SubjectPlacementContext | undefined {
    const fromHints = buildPlacementFromRowSubjectHints(row);
    if (fromHints) return fromHints;

    const inquiryChildren = readInquiryChildrenFromRow(row);
    if (activeOcmId && inquiryChildren.length) {
        for (const raw of inquiryChildren) {
            const rec = raw as Record<string, unknown>;
            const ocmId = trimOrNull(rec.ocm_id) ?? trimOrNull(rec.id);
            if (ocmId === activeOcmId) {
                const placement = buildSubjectPlacementFromInquiryChildRaw(rec);
                if (placement) return placement;
            }
        }
    }

    const waitlistProj = row._placement_waitlist_row;
    if (waitlistProj != null && typeof waitlistProj === "object" && !Array.isArray(waitlistProj)) {
        const p = waitlistProj as Record<string, unknown>;
        const siteId = trimOrNull(p.site_id);
        const cohortKey = trimOrNull(p.program_room_cohort_key);
        const cohortLabel = trimOrNull(p.program_room_group_label);
        if (siteId || cohortKey) {
            return {
                location_id: siteId,
                room_id: cohortKey,
                room_label: cohortLabel,
            };
        }
    }

    return undefined;
}

function resolveRowGrain(row: Record<string, unknown>): LifecycleSubjectType | null {
    const grain = trimOrNull(row.row_grain) ?? trimOrNull(row.queue_grain);
    if (grain === "child" || grain === "candidate") return grain;
    const id = trimOrNull(row.id) ?? "";
    if (id.startsWith("ocmrow:")) return "child";
    if (id.startsWith("pcrow:")) return "candidate";
    return null;
}

function resolveActiveSubjectIds(row: Record<string, unknown>, subjectType: LifecycleSubjectType): {
    subjectId: string;
    displayName: string;
    statusKey: string;
    statusLabel: string;
    stageKey: string;
} | null {
    const ocmTrack = row._ocm_enrollment_track_row;
    if (subjectType === "child" && ocmTrack != null && typeof ocmTrack === "object" && !Array.isArray(ocmTrack)) {
        const t = ocmTrack as Record<string, unknown>;
        const ocmId = trimOrNull(row.opportunity_customer_member_id) ?? trimOrNull(t.opportunity_customer_member_id);
        if (!ocmId) return null;
        const statusKey = trimOrNull(t.outcome_status_key) ?? trimOrNull(row.child_lifecycle_status) ?? "";
        const stageKey = trimOrNull(t.stage_key) ?? trimOrNull(row.enrollment_track_stage_key) ?? "";
        return {
            subjectId: ocmId,
            displayName: trimOrNull(row._child_display_name) ?? "Child",
            statusKey,
            // Operator-facing label is the child's PROCESS STAGE (retired participation status).
            // Prefer the true stage_key; fall back to the humanized key only if stage is unknown.
            statusLabel: resolveChildProcessStageLabel({ stageKey, dispositionKey: statusKey }) ?? resolveSubjectStatusLabel(statusKey),
            stageKey,
        };
    }

    const childGrain = row._child_lifecycle_grain_row;
    if (subjectType === "child" && childGrain != null && typeof childGrain === "object" && !Array.isArray(childGrain)) {
        const g = childGrain as Record<string, unknown>;
        const ocmId = trimOrNull(row.opportunity_customer_member_id) ?? trimOrNull(g.opportunity_customer_member_id);
        if (!ocmId) return null;
        const statusKey = trimOrNull(g.child_lifecycle_status) ?? trimOrNull(row.child_lifecycle_status) ?? "";
        const stageKey =
            trimOrNull(g.enrollment_track_stage_key) ??
            trimOrNull(row.enrollment_track_stage_key) ??
            trimOrNull(row.enrollment_track_stage_label)?.toLowerCase() ??
            "";
        return {
            subjectId: ocmId,
            displayName: trimOrNull(g.child_display_name) ?? trimOrNull(row._child_display_name) ?? "Child",
            statusKey,
            // Operator-facing label is the child's PROCESS STAGE (retired participation status).
            // Prefer the true stage_key; fall back to the humanized key only if stage is unknown.
            statusLabel: resolveChildProcessStageLabel({ stageKey, dispositionKey: statusKey }) ?? resolveSubjectStatusLabel(statusKey),
            stageKey,
        };
    }

    if (subjectType === "candidate") {
        const waitlistProj = row._placement_waitlist_row;
        let candidateId = trimOrNull(row.placement_candidate_id);
        if (!candidateId && waitlistProj != null && typeof waitlistProj === "object" && !Array.isArray(waitlistProj)) {
            candidateId = trimOrNull((waitlistProj as Record<string, unknown>).placement_candidate_id);
        }
        const id = trimOrNull(row.id) ?? "";
        if (!candidateId && id.startsWith("pcrow:")) {
            const parts = id.split(":");
            if (parts.length >= 3) candidateId = parts[2]!;
        }
        if (!candidateId) return null;
        // `candidate_status` (active/paused/…) stays INTERNAL — the operator sees the Process Stage
        // (Waitlist); placement rank/adjustment is supporting context (waitlist_context), not status.
        const statusKey = trimOrNull(row.candidate_status) ?? trimOrNull(row.status) ?? "active";
        const stageKey = trimOrNull((row as { _queue_lane_stage_key?: unknown })._queue_lane_stage_key) ?? "waitlist";
        return {
            subjectId: candidateId,
            displayName:
                trimOrNull(row._child_display_name) ??
                (waitlistProj != null && typeof waitlistProj === "object" && !Array.isArray(waitlistProj)
                    ? trimOrNull((waitlistProj as Record<string, unknown>).child_display_name)
                    : null) ??
                "Child",
            statusKey,
            statusLabel: resolveChildProcessStageLabel({ stageKey }) ?? resolveSubjectStatusLabel(statusKey),
            stageKey,
        };
    }

    return null;
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

function resolveLaneDispositionKeys(
    row: Record<string, unknown>,
    queue: PartialQueueRowContextQueueMeta,
): readonly string[] | null {
    const fromRow = row._queue_lane_disposition_keys;
    if (Array.isArray(fromRow)) {
        const keys = fromRow.map((k) => trimOrNull(k)).filter((k): k is string => Boolean(k));
        if (keys.length) return keys;
    }
    const fromOcmTrack = row._ocm_enrollment_track_row;
    if (fromOcmTrack != null && typeof fromOcmTrack === "object" && !Array.isArray(fromOcmTrack)) {
        const keys = (fromOcmTrack as { disposition_keys?: unknown }).disposition_keys;
        if (Array.isArray(keys)) {
            const parsed = keys.map((k) => trimOrNull(k)).filter((k): k is string => Boolean(k));
            if (parsed.length) return parsed;
        }
    }
    const fromQueue = queue.included_disposition_keys;
    if (fromQueue?.length) return fromQueue;
    return null;
}

function buildRelatedSubjectsSummary(
    row: Record<string, unknown>,
    activeSubjectId: string,
    activeSubjectType: LifecycleSubjectType,
    allowedLocationIds?: readonly string[] | null,
    queue?: PartialQueueRowContextQueueMeta,
): RelatedSubjectSummary[] {
    const dispositionKeys = queue ? resolveLaneDispositionKeys(row, queue) : null;
    const relevant = filterQueueRelevantInquiryChildren({
        row,
        activeSubjectId,
        dispositionKeys,
    });

    const out: RelatedSubjectSummary[] = [];
    for (const child of relevant) {
        if (child.subject_id === activeSubjectId && activeSubjectType === "child") continue;

        const raw = readInquiryChildrenFromRow(row).find((x) => {
            const rec = x as Record<string, unknown>;
            const subjectId = trimOrNull(rec.ocm_id) ?? trimOrNull(rec.id) ?? trimOrNull(rec.customer_member_id);
            return subjectId === child.subject_id;
        }) as Record<string, unknown> | undefined;

        const subjectType: LifecycleSubjectType =
            raw && trimOrNull(raw.placement_candidate_id) ? "candidate" : "child";
        const placement = raw ? buildSubjectPlacementFromInquiryChildRaw(raw) : null;
        const subjectLocationId = placement?.location_id ?? (raw ? trimOrNull(raw.location_id) : null);
        // Sibling summary also shows Process Stage, not the retired participation status.
        const siblingStageKey = raw ? trimOrNull(raw.stage_key) ?? trimOrNull(raw.enrollment_track_stage_key) : null;
        const statusLabel =
            resolveChildProcessStageLabel({ stageKey: siblingStageKey, dispositionKey: child.outcome_status_key }) ??
            resolveSubjectStatusLabel(child.outcome_status_key);

        const summary: RelatedSubjectSummary = {
            subject_type: subjectType,
            subject_id: child.subject_id,
            display_name: child.display_name,
            status_label: statusLabel,
            location_id: subjectLocationId,
            location_label: placement?.location_label ?? (raw ? trimOrNull(raw.location_label) : null),
            program_label: placement?.program_label ?? null,
            room_label: placement?.room_label ?? (raw ? trimOrNull(raw.program_room_cohort_label) : null),
            schedule_label: placement?.schedule_label ?? (raw ? trimOrNull(raw.desired_schedule_label) : null),
            ...(raw
                ? mergeInquiryChildProfileFromHousehold(raw, buildHouseholdChildrenLookup(row))
                : {}),
        };
        const visibility = relatedSubjectVisibilityForLocation(subjectLocationId, allowedLocationIds);
        out.push(applyRelatedSubjectLocationVisibility(summary, visibility));
    }

    return out;
}

function resolveLifecycleKey(queue: PartialQueueRowContextQueueMeta): string {
    return trimOrNull(queue.lifecycle_key) ?? "enrollment";
}

function resolveStageLabel(queue: PartialQueueRowContextQueueMeta, row?: Record<string, unknown>): string {
    const fromRow =
        row
            ? trimOrNull(row.enrollment_track_stage_label)
                ?? trimOrNull(row._lifecycle_stage_title)
                ?? trimOrNull(row.stage_label)
            : null;
    if (fromRow) return fromRow;
    const stageKey = trimOrNull(queue.stage_key);
    if (stageKey) return humanizeSnakeCaseToken(stageKey);
    return queue.label.trim() || queue.key;
}

function resolveStageKey(queue: PartialQueueRowContextQueueMeta, activeStageKey: string): string {
    const fromActive = trimOrNull(activeStageKey);
    if (fromActive) return fromActive;
    return trimOrNull(queue.stage_key) ?? queue.key;
}

/**
 * Waitlist ranking context for a candidate-grain row, from the placement waitlist projection.
 * Presentation-only; undefined when the row carries no projection / no rank. (Variants Phase 5.)
 */
function resolveWaitlistContext(
    row: Record<string, unknown>,
): { position_label?: string | null; wait_since?: string | null } | undefined {
    const proj = row._placement_waitlist_row;
    if (proj == null || typeof proj !== "object" || Array.isArray(proj)) return undefined;
    const p = proj as Record<string, unknown>;
    const positionLabel = trimOrNull(p.runtime_position_label);
    const waitSince = trimOrNull(p.wait_since);
    if (!positionLabel && !waitSince) return undefined;
    return { position_label: positionLabel, wait_since: waitSince };
}

/** Whether this row should receive honest child/candidate QueueRowContext. */
export function isHonestChildCandidateGrainRow(row: Record<string, unknown>): boolean {
    return resolveRowGrain(row) != null;
}

/**
 * Build honest QueueRowContext for child or candidate grain rows.
 */
export function buildChildGrainQueueRowContext(input: BuildChildGrainQueueRowContextInput): QueueRowContext | null {
    const row = input.row;
    const subjectType = resolveRowGrain(row);
    if (!subjectType) return null;

    const active = resolveActiveSubjectIds(row, subjectType);
    if (!active) return null;

    const caseId = resolveCaseId(row);
    const caseDisplayName = resolveCaseDisplayName(row);
    const lifecycleKey = resolveLifecycleKey(input.queue);
    const stageKey = resolveStageKey(input.queue, active.stageKey);
    const rowStage =
        trimOrNull(row.enrollment_track_stage_label) ??
        resolveStageLabel(input.queue, row);

    const caseStatusKey =
        trimOrNull(row.opportunity_status_key) ?? trimOrNull(row.status_key) ?? "open";
    const caseStatusLabel = trimOrNull(row._status_display) ?? humanizeSnakeCaseToken(caseStatusKey);
    const boringCaseLabel = resolveBoringCaseStatusLabel(caseStatusKey, caseStatusLabel);

    const activeSubject = buildLifecycleSubjectRef({
        subjectType,
        subjectId: active.subjectId,
        lifecycleKey,
        stageKey,
        statusKey: active.statusKey,
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

    const placement_context = resolvePlacementContext(row, subjectType === "child" ? active.subjectId : null);
    // Waitlist ranking fields are Placement-owned. Candidate grain always carries the projection;
    // child-grain Waitlist provisioning now attaches the same `_placement_waitlist_row` shape.
    const waitlist_context =
        subjectType === "candidate" || subjectType === "child" ? resolveWaitlistContext(row) : undefined;

    const activeInquiryRaw = readInquiryChildrenFromRow(row).find((entry) => {
        if (entry == null || typeof entry !== "object" || Array.isArray(entry)) return false;
        const raw = entry as Record<string, unknown>;
        const subjectId =
            trimOrNull(raw.ocm_id) ?? trimOrNull(raw.id) ?? trimOrNull(raw.customer_member_id);
        return subjectId === active.subjectId;
    }) as Record<string, unknown> | undefined;
    const householdLookup = buildHouseholdChildrenLookup(row);
    const activeProfile = activeInquiryRaw
        ? mergeInquiryChildProfileFromHousehold(activeInquiryRaw, householdLookup)
        : null;

    return {
        contract_version: QUEUE_ROW_CONTEXT_CONTRACT_VERSION,
        row_presentation_mode: "single_subject",
        row_subject: {
            subject_type: subjectType,
            subject_id: active.subjectId,
            display_name: active.displayName,
            ...(activeProfile ?? {}),
        },
        row_count: 1,
        row_count_unit:
            input.queue.count_unit ??
            (subjectType === "candidate" ? "candidates" : "enrollment_track"),
        row_stage: rowStage,
        lifecycle_key: lifecycleKey,
        row_status_key: active.statusKey,
        row_status_label: active.statusLabel,
        case_context: {
            case_id: caseId,
            display_name: caseDisplayName,
            case_type_label: input.case_type_label?.trim() || "Enrollment Case",
            case_status_key: caseStatusKey,
            case_status_label: boringCaseLabel,
        },
        primary_contact: primaryContact,
        related_subjects_summary: buildRelatedSubjectsSummary(
            row,
            active.subjectId,
            subjectType,
            input.allowedLocationIds,
            input.queue,
        ),
        attention_summary: buildAttentionSummary(row),
        work_summary: buildWorkSummary(row),
        current_work_summary: buildQueueCurrentWorkSummary(row),
        next_best_action: buildNextBestAction(row),
        drawer_open: {
            entity_type: "opportunities",
            entity_id: caseId,
            active_subject: activeSubject,
            stage_focus_key: stageKey,
        },
        ...(placement_context ? { placement_context } : {}),
        ...(waitlist_context ? { waitlist_context } : {}),
    };
}

export function attachChildGrainQueueRowContext(
    row: Record<string, unknown>,
    queue: PartialQueueRowContextQueueMeta,
    options?: { case_type_label?: string; allowedLocationIds?: readonly string[] | null },
): Record<string, unknown> {
    const context = buildChildGrainQueueRowContext({
        row,
        queue,
        case_type_label: options?.case_type_label,
        allowedLocationIds: options?.allowedLocationIds,
    });
    if (!context) return row;
    return {
        ...row,
        _queue_row_context: context,
    };
}

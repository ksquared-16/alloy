/**
 * Partial QueueRowContext adapter for today's case-grain opportunity queue rows.
 *
 * Does not change queue membership. When production queues are still case-grain,
 * row_subject is honestly subject_type: "case".
 *
 * @see docs/sprints/archive/06_2026/status_ownership_and_lifecycle_grain_expansion.md §4
 * @see docs/system/work-unit-surface-context-contract.md
 */

import { humanizeSnakeCaseToken } from "@/lib/admin/activityTimelineFormat";
import { formatHouseholdLeadDisplayTitle } from "@/lib/admin/opportunity/buildHouseholdLeadDisplayName";
import { inquiryChildProfileFieldsFromRaw } from "@/lib/admin/drawer/inquiryChildrenHydration";
import {
    buildHouseholdChildrenLookup,
    mergeCrmCompactLineProfile,
    mergeInquiryChildProfileFromHousehold,
} from "@/lib/workUnits/queueRowChildProfileMerge";
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
    type RelatedSubjectSummary,
    type SubjectPlacementContext,
    type WorkUnitSurfaceContext,
    type WorkUnitSurfaceContextRow,
    isQueueMembershipGrain,
} from "@/lib/workUnits/lifecycleSubjectContracts";
import {
    applyRelatedSubjectLocationVisibility,
    relatedSubjectVisibilityForLocation,
} from "@/lib/queues/queueMembershipLocationScope";
import { buildOperationalStateQueueContext } from "@/lib/workUnits/buildOperationalStateQueueContext";
import {
    buildAttentionSummary,
    buildNextBestAction,
    buildWorkSummary,
    resolveBoringCaseStatusLabel,
    resolveSubjectStatusLabel,
    type PartialQueueRowContextQueueMeta,
} from "@/lib/workUnits/buildPartialQueueRowContextHelpers";
import { canonicalNewLeadStatusLabel } from "@/lib/lifecycle/enrollmentLeadStageStatusAliases";
import { buildQueueCurrentWorkSummary } from "@/lib/workUnits/buildQueueCurrentWorkSummary";
import { parseQueueRowCrmChildrenStructured } from "@/lib/ui-v2/crmQueueRowPreviewPresentation";

export type { PartialQueueRowContextQueueMeta };
export { resolveBoringCaseStatusLabel };

export type BuildPartialQueueRowContextInput = {
    /** Enriched opportunity queue preview row (`enrichOpportunityRows` output shape). */
    row: Record<string, unknown>;
    queue: PartialQueueRowContextQueueMeta;
    work_unit_id?: string;
    /** Operator case type label — default "Enrollment Case". */
    case_type_label?: string;
    allowedLocationIds?: readonly string[] | null;
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

/**
 * Case / household identity for queue row subject + `customer.display_name`.
 * Prefer `_customer_name` (household) over opportunity `title` — lead titles are
 * often the primary contact name, which must not displace authored household name.
 * Format to `{Base} Family` so queue subject matches Focus Panel household titles.
 */
function resolveCaseDisplayName(row: Record<string, unknown>): string {
    const householdBase =
        trimOrNull(row._customer_name)
        ?? trimOrNull(row["customer.display_name"])
        ?? trimOrNull(row["customer.name"]);
    if (householdBase) {
        return formatHouseholdLeadDisplayTitle(householdBase);
    }
    const titleOrName = trimOrNull(row.title) ?? trimOrNull(row.name);
    if (titleOrName) {
        // Opportunity name may already be household-formatted (`Lyons Family`) after create;
        // formatHouseholdLeadDisplayTitle is idempotent for those.
        return formatHouseholdLeadDisplayTitle(titleOrName);
    }
    return "Case";
}

function resolveStatusKey(row: Record<string, unknown>): string {
    return trimOrNull(row.status_key) ?? "";
}

function resolveStatusLabel(row: Record<string, unknown>, statusKey: string): string {
    // Prefer the hydrated display, but canonicalize a raw New Lead key so `new_inquiry` never
    // survives as a display string; otherwise resolve through the shared status-label pipeline.
    const display = trimOrNull(row._status_display);
    if (display) return canonicalNewLeadStatusLabel(display) ?? display;
    return resolveSubjectStatusLabel(statusKey);
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

function relatedSubjectFromInquiryChildRaw(
    raw: Record<string, unknown>,
    member: ReturnType<typeof childLifecycleMembersFromInquiryChildren>[number] | undefined,
    allowedLocationIds?: readonly string[] | null,
    householdLookup?: Map<string, Record<string, unknown>>,
): RelatedSubjectSummary | null {
    const subjectId =
        trimOrNull(raw.ocm_id) ??
        trimOrNull(raw.id) ??
        trimOrNull(raw.customer_member_id) ??
        trimOrNull(raw.person_id);
    if (!subjectId) return null;

    const displayName =
        trimOrNull(raw.display_name) ??
        trimOrNull(raw.child_display_name) ??
        trimOrNull(member?.display_name) ??
        "Child";

    const statusLabel =
        trimOrNull(raw.outcome_status_label) ??
        trimOrNull(member?.outcome_status_label) ??
        resolveSubjectStatusLabel(member?.outcome_status_key);

    const placement = buildSubjectPlacementFromInquiryChildRaw(raw);
    const subjectLocationId = placement?.location_id ?? trimOrNull(raw.location_id);
    const profile = householdLookup
        ? mergeInquiryChildProfileFromHousehold(raw, householdLookup)
        : inquiryChildProfileFieldsFromRaw(raw);
    const summary: RelatedSubjectSummary = {
        subject_type: trimOrNull(raw.placement_candidate_id) ? "candidate" : "child",
        subject_id: subjectId,
        display_name: displayName,
        status_label: statusLabel,
        location_id: subjectLocationId,
        location_label: placement?.location_label ?? trimOrNull(raw.location_label),
        program_label: placement?.program_label ?? null,
        room_label: placement?.room_label ?? trimOrNull(raw.program_room_cohort_label),
        schedule_label: placement?.schedule_label ?? trimOrNull(raw.desired_schedule_label),
        date_of_birth: profile.date_of_birth,
        age_label: profile.age_label,
        gender_label: profile.gender_label,
    };
    const visibility = relatedSubjectVisibilityForLocation(subjectLocationId, allowedLocationIds);
    return applyRelatedSubjectLocationVisibility(summary, visibility);
}

function buildRelatedSubjectsSummaryFromHouseholdChildren(
    row: Record<string, unknown>,
): RelatedSubjectSummary[] {
    const household = row._household_children;
    if (!Array.isArray(household) || !household.length) return [];

    const out: RelatedSubjectSummary[] = [];
    for (const entry of household) {
        if (entry == null || typeof entry !== "object" || Array.isArray(entry)) continue;
        const raw = entry as Record<string, unknown>;
        const subjectId =
            trimOrNull(raw.customer_member_id) ??
            trimOrNull(raw.id) ??
            trimOrNull(raw.person_id);
        const displayName =
            trimOrNull(raw.display_name) ??
            ([trimOrNull(raw.first_name), trimOrNull(raw.last_name)].filter(Boolean).join(" ").trim() || null);
        if (!subjectId || !displayName) continue;
        const profile = inquiryChildProfileFieldsFromRaw(raw);
        out.push({
            subject_type: "child",
            subject_id: subjectId,
            display_name: displayName,
            status_label: "—",
            date_of_birth: profile.date_of_birth,
            age_label: profile.age_label,
            gender_label: profile.gender_label,
        });
    }
    return out;
}

function buildRelatedSubjectsSummaryFromCrmCompactChildren(
    row: Record<string, unknown>,
    householdLookup: Map<string, Record<string, unknown>>,
): RelatedSubjectSummary[] {
    const parsed = parseQueueRowCrmChildrenStructured(row._crm_compact_children);
    if (!parsed.length) return [];

    return parsed.map((line, index) => {
        const merged = mergeCrmCompactLineProfile(line, householdLookup);
        return {
            subject_type: "child" as const,
            subject_id:
                line.ocmId?.trim()
                || line.customerMemberId?.trim()
                || line.personId?.trim()
                || `crm-child-${index}`,
            display_name: merged.displayName,
            status_label: line.secondary?.trim() || "—",
            date_of_birth: merged.date_of_birth,
            age_label: merged.age_label,
            gender_label: merged.gender_label,
        };
    });
}

function buildRelatedSubjectsSummary(
    row: Record<string, unknown>,
    allowedLocationIds?: readonly string[] | null,
): RelatedSubjectSummary[] {
    const householdLookup = buildHouseholdChildrenLookup(row);
    const inquiryChildren = readInquiryChildrenFromRow(row);
    if (inquiryChildren.length) {
        const members = childLifecycleMembersFromInquiryChildren(inquiryChildren);
        const out: RelatedSubjectSummary[] = [];
        for (let i = 0; i < inquiryChildren.length; i++) {
            const summary = relatedSubjectFromInquiryChildRaw(
                inquiryChildren[i] as Record<string, unknown>,
                members[i],
                allowedLocationIds,
                householdLookup,
            );
            if (summary) out.push(summary);
        }
        if (out.length) return out;
    }

    const fromCrm = buildRelatedSubjectsSummaryFromCrmCompactChildren(row, householdLookup);
    if (fromCrm.length) return fromCrm;

    const fromHousehold = buildRelatedSubjectsSummaryFromHouseholdChildren(row);
    if (fromHousehold.length) return fromHousehold;

    const singleChild = trimOrNull(row._child_display_name);
    if (singleChild) {
        const personId = trimOrNull(row._primary_child_person_id);
        const householdRaw = personId ? householdLookup.get(personId) : undefined;
        const profile = householdRaw ? inquiryChildProfileFieldsFromRaw(householdRaw) : {};
        return [
            {
                subject_type: "child",
                subject_id: personId ?? "primary-child",
                display_name: singleChild,
                status_label: "—",
                ...profile,
            },
        ];
    }

    return [];
}

/**
 * Process / lifecycle stage label for the queue row Stage field.
 * Prefer Effective Process Position rollup (participant stages) when attached —
 * family inventory must not show raw opportunity stage as the sole current position.
 * Prefer the record's stage_key (or membership stage_key) — never the Work View /
 * queue lane label (e.g. "New Leads"), which is a filter surface, not the stage.
 */
function resolveProcessStageLabel(
    row: Record<string, unknown>,
    queue: PartialQueueRowContextQueueMeta,
): string {
    const eppRollup = trimOrNull(row._effective_stage_rollup_label);
    let base: string;
    if (eppRollup) {
        // Title-case snake tokens inside "waitlist · lead" / keep "N active stages".
        if (/\d+\s+active stages/i.test(eppRollup)) {
            base = eppRollup;
        } else {
            base = eppRollup
                .split(" · ")
                .map((part) => {
                    const t = part.trim();
                    if (!t) return t;
                    if (/^[a-z0-9_]+$/i.test(t)) return humanizeSnakeCaseToken(t);
                    return t;
                })
                .filter(Boolean)
                .join(" · ");
        }
    } else {
        const fromRow =
            trimOrNull(row._lifecycle_stage_title)
            ?? trimOrNull(row.stage_label)
            ?? trimOrNull(row._stage_label)
            ?? trimOrNull(row.enrollment_track_stage_label);
        if (fromRow) {
            base = fromRow;
        } else {
            const stageKey =
                trimOrNull(row.stage_key)
                ?? trimOrNull(queue.stage_key);
            if (stageKey) {
                base = humanizeSnakeCaseToken(stageKey);
            } else {
                // Legacy lanes without a stage_key — last resort only.
                base = queue.label.trim() || queue.key;
            }
        }
    }

    // Overlapping operational Tour is not a stage move — surface it on the Stage slot when the
    // published Surface asks for `queue_row.stage_label` and booking truth says a Tour is active.
    const hasActiveTour = row._has_active_tour === true || row.has_active_tour === true;
    if (hasActiveTour && base && !/tour/i.test(base)) {
        return `${base} · Tour Scheduled`;
    }
    if (hasActiveTour && !base) return "Tour Scheduled";
    return base;
}

/**
 * Lead / opportunity site when children do not yet carry placement on the row.
 * Create Lead persists opportunity.location_id; compact enrichment must surface it.
 */
function resolveOpportunityPlacementFallback(
    row: Record<string, unknown>,
): SubjectPlacementContext | undefined {
    const location_id = trimOrNull(row.location_id) ?? trimOrNull(row._location_id);
    const location_label =
        trimOrNull(row._location_label)
        ?? trimOrNull(row._location_name)
        ?? trimOrNull(row._room_label);
    if (!location_id && !location_label) return undefined;
    return {
        location_id,
        location_label,
        program_key: null,
        program_label: null,
        room_id: null,
        room_label: null,
        schedule_key: null,
        schedule_label: null,
    };
}

function mergePlacementWithOpportunityFallback(
    fromChildren: SubjectPlacementContext | undefined,
    row: Record<string, unknown>,
): SubjectPlacementContext | undefined {
    const eppLocation = trimOrNull(row._effective_location_rollup_label);
    const fromOpportunity = resolveOpportunityPlacementFallback(row);
    if (!fromChildren) {
        if (eppLocation) {
            return {
                location_id: fromOpportunity?.location_id ?? null,
                location_label: eppLocation,
                program_key: null,
                program_label: null,
                room_id: null,
                room_label: null,
                schedule_key: null,
                schedule_label: null,
            };
        }
        return fromOpportunity;
    }
    if (eppLocation) {
        return {
            ...fromChildren,
            location_label: eppLocation,
            location_id: fromChildren.location_id ?? fromOpportunity?.location_id ?? null,
        };
    }
    if (fromChildren.location_id || fromChildren.location_label) return fromChildren;
    if (!fromOpportunity) return fromChildren;
    return {
        ...fromChildren,
        location_id: fromOpportunity.location_id ?? fromChildren.location_id,
        location_label: fromOpportunity.location_label ?? fromChildren.location_label,
    };
}

function resolveLifecycleKey(queue: PartialQueueRowContextQueueMeta): string {
    return trimOrNull(queue.lifecycle_key) ?? "enrollment";
}

/**
 * The SUBJECT's stage, not the lane's.
 *
 * A Work View scopes a list of stages, so rows inside one lane are routinely in different
 * stages — taking the stage from the lane made every row in a view read identically. Stage is a
 * persisted column written by outcome execution and intake (`lifecycle_stage_key` materialized by
 * the Canonical Operational Projection, else the raw `stage_key`); the lane is only a last resort
 * for rows that carry no stage of their own.
 */
function resolveStageKey(
    row: Record<string, unknown>,
    queue: PartialQueueRowContextQueueMeta
): string {
    return (
        trimOrNull(row.lifecycle_stage_key)
        ?? trimOrNull(row.stage_key)
        ?? trimOrNull(queue.stage_key)
        ?? queue.key
    );
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
    const stageKey = resolveStageKey(row, input.queue);
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

    // FIDELITY: `display_name` is the NAME ONLY — the value the authored `person.primary_contact_name`
    // field renders. It must NOT be the `_primary_contact_line` composite (name · email · phone), or the
    // renderer would emit phone/email the operator never authored. The composite remains available to the
    // DEFAULT (unauthored) contact line via phone/email fields. Fall back to the line's first token for
    // legacy rows enriched before `_primary_contact_name` existed.
    const primaryContactName =
        trimOrNull(row._primary_contact_name)
        ?? trimOrNull(row._primary_contact_line)?.split(" · ")[0]?.trim()
        ?? null;
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
    const placement_context = mergePlacementWithOpportunityFallback(
        resolveRowPlacementContextFromInquiryChildren(inquiryChildren),
        row,
    );

    return {
        contract_version: QUEUE_ROW_CONTEXT_CONTRACT_VERSION,
        row_subject: {
            subject_type: subjectType,
            subject_id: subjectId,
            display_name: subjectDisplayName,
        },
        row_stage: resolveProcessStageLabel(row, input.queue),
        ...(input.queue.stage_labels_by_key
            ? { stage_labels_by_key: input.queue.stage_labels_by_key }
            : {}),
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
        related_subjects_summary: buildRelatedSubjectsSummary(row, input.allowedLocationIds),
        attention_summary: buildAttentionSummary(row),
        work_summary: buildWorkSummary(row),
        current_work_summary: buildQueueCurrentWorkSummary(row),
        next_best_action: buildNextBestAction(row),
        drawer_open: {
            entity_type: "opportunities",
            entity_id: caseId,
            active_subject: activeSubject,
        },
        ...(placement_context ? { placement_context } : {}),
        operational_state: buildOperationalStateQueueContext({
            orgId: trimOrNull(row.org_id) ?? "",
            grain: "case",
            subjectType: "case",
            subjectId: caseId,
            currentStageKey: stageKey,
            persistedStageEnteredAt: trimOrNull(row.stage_entered_at),
            intakeCreatedAt: trimOrNull(row.created_at),
            // Intake-only fallback: still in lead with no persisted entry stamp.
            neverTransitioned:
                !trimOrNull(row.stage_entered_at) &&
                (trimOrNull(stageKey)?.toLowerCase() === "lead"),
        }),
    };
}

/** Attach `_queue_row_context` on a row copy — safe optional enrichment for APIs / devtools. */
export function attachPartialQueueRowContext(
    row: Record<string, unknown>,
    queue: PartialQueueRowContextQueueMeta,
    options?: { case_type_label?: string; allowedLocationIds?: readonly string[] | null },
): Record<string, unknown> {
    return {
        ...row,
        _queue_row_context: buildPartialQueueRowContext({
            row,
            queue,
            case_type_label: options?.case_type_label,
            allowedLocationIds: options?.allowedLocationIds,
        }),
    };
}

export function attachPartialQueueRowContextToRows(
    rows: Record<string, unknown>[],
    queue: PartialQueueRowContextQueueMeta,
    options?: { case_type_label?: string; allowedLocationIds?: readonly string[] | null },
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

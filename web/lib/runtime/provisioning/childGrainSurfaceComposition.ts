/**
 * PHASE 4 — THE CHILD RUNTIME VIEWMODEL. Composition only.
 *
 * This module turns "a child row + the configured process" into the fields a child surface renders.
 * It CALCULATES NOTHING that Business Process owns. Specifically it does not decide:
 *
 *   effective stage  — the PROVIDER resolved it (`process_instances.stage_key ?? opportunities.stage_key`)
 *                      and carried it on the row.
 *   journey segment  — `resolveJourneySegment` (the canonical 3B translation) decides it, from the
 *                      stage's grain and its plan's declared segment.
 *   work / readiness — the stage-work runtime projection owns those; this module only says WHETHER to
 *                      ask for them and WITH WHICH child identity.
 *   actions          — the stage's operating plan declares them. An absent action stays absent.
 *
 * ── THE ONE JUDGEMENT THIS MODULE DOES MAKE, AND WHY IT IS NOT A SECOND AUTHORITY ──
 *
 * A child's effective stage can be a FAMILY-segment stage. That is the live Firefly case, not a
 * hypothetical: all thirteen child participations carry `stage_key = NULL`, so their effective stage
 * is their family's `lead` — a stage whose grain is `family` and whose plan declares
 * `journey_segment: "family"`.
 *
 * The work configured at such a stage belongs to the FAMILY. Handing it to a child surface as "this
 * child's current work" would be the wrong-subject substitution this whole sprint exists to remove —
 * and it would look like success, because the projection would populate. So when the segment is
 * `family`, this module reports that the child has no work OF ITS OWN at this stage, and the surface
 * says so. That is reading the segment BP already computed, not computing a segment.
 *
 * ── "NO CONFIGURED ACTION" IS A RESULT, NOT A FAILURE ──
 *
 * The family path refuses (`no_truthful_primary_action`) when a stage offers no reachable primary
 * action, because a family surface claiming `operational` on identity alone is not operational. A
 * CHILD surface is different: Firefly's child-grain stages (`decision`/`waitlist`/`enrolling`/
 * `enrolled`) configure NO primary action at all, and a child riding a family stage has none either.
 * Refusing there would make the entire child surface unreachable for a configuration that is
 * perfectly coherent — the tenant simply has not authored child actions yet.
 *
 * So the child path returns `primaryAction: null` WITH a reason, and the surface renders the absence
 * deliberately. The reason is carried because "no actions" and "actions failed to load" must never
 * look the same.
 */

import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { resolveJourneySegment, type JourneySegment } from "@/lib/lifecycle/grainVocabulary";
import type { ChildProvisioningRow } from "@/lib/runtime/provisioning/childGrainProvisioningRows";
import type { ChildProvisioningRowWithPlacement } from "@/lib/runtime/provisioning/attachChildGrainWaitlistPlacement";
import { waitlistContextFromPlacementProjection } from "@/lib/runtime/provisioning/attachChildGrainWaitlistPlacement";
import type { ChildParticipationIdentity } from "@/lib/lifecycle/childParticipationIdentity";
import {
    QUEUE_ROW_CONTEXT_CONTRACT_VERSION,
    type LifecycleSubjectRef,
    type QueueRowContext,
    type SubjectPlacementContext,
} from "@/lib/workUnits/lifecycleSubjectContracts";
// Type-only: erased at build time, so this does NOT create an import cycle back into the answer.
import type { CurrentBusinessState, TruthfulPrimaryAction } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import type { ChildPrimaryActionAbsence } from "@/lib/runtime/provisioning/childPrimaryActionAbsenceCopy";
import { programLabelWithoutAgeRange } from "@/lib/childcare/childCareProgramFromDob";
import { buildOperationalStateQueueContext } from "@/lib/workUnits/buildOperationalStateQueueContext";
import { approximateAgeMonthsFromDobIso } from "@/lib/childcare/childCareProgramFromDob";

export type { ChildPrimaryActionAbsence } from "@/lib/runtime/provisioning/childPrimaryActionAbsenceCopy";
// Do not re-export CHILD_PRIMARY_ACTION_ABSENCE_COPY from this module — client surfaces must import
// the copy module directly so Turbopack does not treat this provisioning composer as a client entry.

/** The child's family context — identity only, resolved from rows the answer already holds. */
export type ChildFamilyContext = {
    /** `opportunities.id` — the family case the participation hangs off. */
    opportunityId: string;
    /** The family's operator-facing name, when the in-scope rows carry one. Never invented. */
    name: string | null;
};

export type ChildSurfaceComposition = {
    /** The configured stage the child is EFFECTIVELY at. */
    stage: LifecycleBuilderStageRecord;
    /** Which journey this stage belongs to, per the canonical translation. */
    segment: JourneySegment;
    plan: StageOperatingPlanV1 | null;
    currentBusinessState: CurrentBusinessState;
    /** Null is a TRUTHFUL, renderable state — see {@link ChildPrimaryActionAbsence}. */
    primaryAction: TruthfulPrimaryAction | null;
    primaryActionAbsence: ChildPrimaryActionAbsence | null;
    /**
     * True only when the work at this stage is the CHILD's own. False means the stage's work belongs
     * to the family — the surface must not present it as the child's, and must not ask for it.
     */
    childOwnsStageWork: boolean;
    /** The canonical four-part identity, carried whole. Never collapsed to a scalar. */
    identity: ChildParticipationIdentity;
    family: ChildFamilyContext | null;
};

export type ChildSurfaceCompositionResult =
    | { ok: true; composition: ChildSurfaceComposition }
    | { ok: false; reason: string };

/**
 * Compose the child surface's business state.
 *
 * Refuses only for the one thing that is genuinely incoherent: a child sitting at a stage the process
 * does not configure. That is the same refusal the family path makes, for the same reason — a surface
 * cannot describe a position the Business Process does not define.
 */
export function composeChildGrainSurface(params: {
    row: ChildProvisioningRow;
    stages: readonly LifecycleBuilderStageRecord[];
    /** Family display names by `opportunities.id`, from rows the answer already fetched. */
    familyNamesByOpportunityId?: ReadonlyMap<string, string | null>;
}): ChildSurfaceCompositionResult {
    const { row, stages } = params;

    const stageKey = row.stageKey;
    if (!stageKey) {
        return {
            ok: false,
            reason: "the child's effective stage is unresolved — neither the participation nor its family case holds a stage",
        };
    }
    const stage = stages.find((s) => s.key === stageKey) ?? null;
    if (!stage) {
        return {
            ok: false,
            reason: `child holds effective stage "${stageKey}" which is not an active configured stage`,
        };
    }

    const plan = stage.stage_operating_plan_v1 ?? null;

    // 3B, unchanged: the plan's declared segment and the STAGE's grain are reconciled by ONE function,
    // and a contradiction between them is refused rather than silently resolved in either direction.
    const segmentResolution = resolveJourneySegment({
        planSegment: plan?.journey_segment ?? null,
        stageGrain: stage.grain ?? null,
    });
    if (!segmentResolution.ok) {
        return { ok: false, reason: `stage "${stage.key}": ${segmentResolution.reason}` };
    }
    const segment = segmentResolution.segment;
    const childOwnsStageWork = segment === "child";

    // The work template is only meaningful when the work is the child's. At a family-segment stage the
    // template describes the FAMILY's work, and naming it here would attribute it to the child.
    const template = childOwnsStageWork
        ? plan?.work_templates?.find((t) => t.primary) ?? plan?.work_templates?.[0] ?? null
        : null;
    const actionRef = template?.primary_action?.action_ref ?? null;

    let primaryAction: TruthfulPrimaryAction | null = null;
    let primaryActionAbsence: ChildPrimaryActionAbsence | null = null;
    if (!childOwnsStageWork) primaryActionAbsence = "stage_is_family_segment";
    else if (!plan) primaryActionAbsence = "stage_has_no_operating_plan";
    else if (!template) primaryActionAbsence = "stage_configures_no_child_work";
    else if (!actionRef) {
        // Work Templates exist without a primary action_ref — What's Next still owns the stage
        // work presentation. Do not claim "this stage's work configures no action" (contradicts
        // configured work items / outcomes).
        primaryActionAbsence = null;
    } else {
        primaryAction = {
            actionRef,
            label: template.primary_action?.override_label ?? template.label,
            workTemplateKey: template.template_key,
        };
    }

    const family: ChildFamilyContext | null = row.contextId
        ? { opportunityId: row.contextId, name: params.familyNamesByOpportunityId?.get(row.contextId) ?? null }
        : null;

    return {
        ok: true,
        composition: {
            stage,
            segment,
            plan,
            currentBusinessState: {
                stageKey: stage.key,
                stageLabel: stage.label,
                purpose: plan?.purpose ?? null,
                // Null, not a stand-in: a child at a family stage genuinely has no work template of
                // its own, and an empty string here would render as work that does not exist.
                workTemplateKey: template?.template_key ?? null,
                workTemplateLabel: template?.label ?? null,
                required: template?.required ?? null,
            },
            primaryAction,
            primaryActionAbsence,
            childOwnsStageWork,
            identity: {
                subjectId: row.subjectId,
                participationId: row.participationId,
                contextId: row.contextId,
                legacyOcmId: row.legacyOcmId,
            },
            family,
        },
    };
}

/**
 * THE CHILD ROW'S PRESENTATION CONTEXT.
 *
 * A queue row renders entirely from its `QueueRowContext`; with none, `CondensedQueueRow` falls back
 * to the row's entity id, and the child lens rendered thirteen raw UUIDs. So a child row needs one —
 * but NOT the one that already exists. `buildChildGrainQueueRowContext` is the OCM-vintage builder:
 * it requires `opportunity_customer_member_id` and makes that the row's subject, which would put back
 * exactly the identity ambiguity 3A removed (`docs/runtime/GRAIN-AUTHORITY-MAP.md` §4).
 *
 * This one is PI-native and fills ONLY what a child row genuinely knows. Everything Settlement owns —
 * attention, work rollup, next best action, the primary contact — is `null`, because the honest value
 * for "we have not resolved this yet" is nothing, and the family's contact is not the child's.
 *
 * `drawer_open` names the FAMILY case. That is the frozen contract (`entity_type: "opportunities"`)
 * and it is not a fallback: `active_subject` names the child, so the affordance reads "open the case,
 * focused on this child" rather than "this child is a case".
 */
function placementContextFromChildPlacement(
    row: ChildProvisioningRowWithPlacement,
): SubjectPlacementContext | undefined {
    const proj = row.placementWaitlistRow;
    const inquiryProgram = programLabelWithoutAgeRange(row.inquiryProgramLabel) ?? null;
    if (!proj) {
        if (!inquiryProgram) return undefined;
        return {
            location_id: null,
            program_key: null,
            program_label: inquiryProgram,
            room_id: null,
            room_label: inquiryProgram,
        };
    }
    const locationId = typeof proj.site_id === "string" ? proj.site_id.trim() || null : null;
    const programKey = typeof proj.program_key === "string" ? proj.program_key.trim() || null : null;
    const programLabel =
        programLabelWithoutAgeRange(proj.program_room_group_label)
        || programKey
        || inquiryProgram
        || null;
    const roomId =
        (typeof proj.program_room_cohort_key === "string" && proj.program_room_cohort_key.trim()) || null;
    if (!locationId && !programKey && !programLabel && !roomId) return undefined;
    return {
        location_id: locationId,
        program_key: programKey,
        program_label: programLabel,
        room_id: roomId,
        room_label: programLabel,
    };
}

export function childQueueRowContext(params: {
    row: ChildProvisioningRow | ChildProvisioningRowWithPlacement;
    /** The child's effective stage, in the operator's configured words. */
    stageLabel: string;
    stageLabelsByKey: Readonly<Record<string, string>>;
    lifecycleKey: string;
    familyName: string | null;
}): QueueRowContext | null {
    const { row } = params;
    // No child identity → not a child row. Never guess one into existence.
    if (!row.subjectId) return null;

    const subject: LifecycleSubjectRef = {
        subject_type: "child",
        subject_id: row.subjectId,
        lifecycle_key: params.lifecycleKey,
        stage_key: row.stageKey ?? "",
        status_key: row.statusKey ?? "",
        ...(row.contextId ? { case_id: row.contextId } : {}),
    } as LifecycleSubjectRef;

    const withPlacement = row as ChildProvisioningRowWithPlacement;
    const fromProjection = waitlistContextFromPlacementProjection(withPlacement.placementWaitlistRow);
    // Prefer process-instance stage entry for wait-since (canonical stage clock). Placement
    // candidates historically stamped opportunity.created_at, which freezes lead age.
    const stageEnteredIso = withPlacement.stageEnteredAtIso?.trim() || null;
    const waitlist_context = (() => {
        const base =
            fromProjection
            ?? (withPlacement.inquiryWaitSinceLabel?.trim() || withPlacement.placementCandidateId
                ? {
                      position_label: null as string | null,
                      wait_since: withPlacement.inquiryWaitSinceLabel?.trim() ?? null,
                      priority: null as number | null,
                      placement_candidate_id: withPlacement.placementCandidateId ?? null,
                      can_adjust_placement: Boolean(withPlacement.placementCandidateId),
                  }
                : undefined);
        if (!base) return undefined;
        if (withPlacement.inquiryWaitSinceLabel?.trim()) {
            return { ...base, wait_since: withPlacement.inquiryWaitSinceLabel.trim() };
        }
        return base;
    })();
    const placement_context = placementContextFromChildPlacement(withPlacement);

    const dobIso = withPlacement.dateOfBirthIso?.trim() || null;
    const ageMonths = dobIso ? approximateAgeMonthsFromDobIso(dobIso) : null;
    const ageLabel =
        ageMonths != null
            ? ageMonths < 24
                ? `${ageMonths}m`
                : `${Math.floor(ageMonths / 12)}y${ageMonths % 12 ? `${ageMonths % 12}m` : ""}`
            : null;

    // Resolved by `attachChildGrainAvatar` over the whole row set. Absent stays absent: the
    // presentation falls back to initials rather than rendering an empty avatar.
    const avatarImageUrl =
        typeof (row as { avatarImageUrl?: unknown }).avatarImageUrl === "string"
            ? (row as { avatarImageUrl?: string }).avatarImageUrl!.trim() || null
            : null;

    const operational_state = buildOperationalStateQueueContext({
        orgId: "",
        grain: "child",
        subjectType: "customer_members",
        subjectId: row.subjectId,
        currentStageKey: row.stageKey,
        persistedStageEnteredAt: stageEnteredIso,
        intakeCreatedAt: null,
        neverTransitioned: false,
    });

    return {
        contract_version: QUEUE_ROW_CONTEXT_CONTRACT_VERSION,
        row_presentation_mode: "single_subject",
        row_subject: {
            subject_type: "child",
            subject_id: row.subjectId,
            display_name: row.title ?? "Child",
            // Effective stage key — required for Queue Row variant matching (Waitlist appliesWhen.stage_key).
            stage_key: row.stageKey ?? null,
            date_of_birth: dobIso,
            age_label: ageLabel,
            // Same property the OCM builder emits, so the child-grain queue presentation needs no
            // change — one child identity fact, not a parallel queue-only avatar field.
            ...(avatarImageUrl ? { image_url: avatarImageUrl } : {}),
        },
        row_stage: params.stageLabel,
        // Machine stage key for variant match input (labels alone cannot match authored stage_key rules).
        row_stage_key: row.stageKey ?? null,
        stage_labels_by_key: { ...params.stageLabelsByKey },
        lifecycle_key: params.lifecycleKey,
        // `process_instances.state` is null for a child that has not been dispositioned. That is a real
        // state, and "" would render as a blank chip pretending to be a status.
        row_status_key: row.statusKey ?? "",
        row_status_label: row.statusKey ? (params.stageLabelsByKey[row.statusKey] ?? row.statusKey) : "",
        case_context: {
            case_id: row.contextId ?? "",
            display_name: params.familyName ?? "",
            case_type_label: "",
            case_status_key: "",
            case_status_label: "",
        },
        // Settlement-owned, and genuinely unresolved on a child row today. Null is the truthful value.
        primary_contact: null,
        related_subjects_summary: [],
        attention_summary: null,
        work_summary: null,
        current_work_summary: null,
        next_best_action: null,
        operational_state,
        drawer_open: {
            entity_type: "opportunities",
            entity_id: row.contextId ?? "",
            active_subject: subject,
            ...(row.stageKey ? { stage_focus_key: row.stageKey } : {}),
        },
        ...(placement_context ? { placement_context } : {}),
        ...(waitlist_context ? { waitlist_context } : {}),
    };
}

/**
 * The DOMAIN-declared identity truth bindings a child surface commits with.
 *
 * Same seam the family composer uses: the domain names the keys, the platform forwards them opaquely.
 * Only genuinely-resolved values are emitted — an absent family name yields no binding at all rather
 * than an empty string, so an identity card reserves instead of rendering a blank as if it were data.
 */
export function childSubjectIdentityTruthBindings(
    composition: ChildSurfaceComposition,
    childDisplayName: string | null,
): Record<string, unknown> | null {
    const bindings: Record<string, unknown> = {};
    if (childDisplayName) bindings["child.display_name"] = childDisplayName;
    if (composition.family?.name) bindings["child.family_name"] = composition.family.name;
    // Prefer family context; fall back to participation identity.contextId so Settlement
    // can always key the opportunity VM when Attention is the child.
    const familyOpportunityId =
        composition.family?.opportunityId?.trim()
        || composition.identity.contextId?.trim()
        || null;
    if (familyOpportunityId) bindings["child.family_opportunity_id"] = familyOpportunityId;
    if (composition.identity.subjectId) bindings["child.customer_member_id"] = composition.identity.subjectId;
    if (composition.identity.participationId) {
        bindings["child.process_instance_id"] = composition.identity.participationId;
    }
    return Object.keys(bindings).length ? bindings : null;
}

/**
 * Enrollment Business Process template — OPTIONAL SEED CONFIGURATION, not doctrine.
 *
 * The stage keys below are an EXAMPLE a tenant may start from and then change: rename, reorder,
 * re-grain, add or delete any of them. They are not a required Enrollment shape, and no runtime
 * invariant may depend on any of them existing.
 *
 * In particular the platform does NOT require an Enrollment process to contain `closed` or
 * `closed_withdrawn`. A family case ends through `opportunities.status_key`; a child's
 * participation ends through `process_instances.state`. Representing either terminal result as a
 * stage is a tenant's choice, not the platform's model.
 *
 * Used by: apply template action, template UI card, enrollment-specific tests.
 * Generic runtime must NOT import this module.
 */

import { randomUUID } from "crypto";
import type {
    LifecycleBuilderProcessRecord,
    LifecycleBuilderStageRecord,
    LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { defaultEnrollmentQueueMembershipForStage } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import type { StageGrain } from "@/lib/lifecycle/stageGrainV1";

export const ENROLLMENT_TEMPLATE_PROCESS_KEY = ENROLLMENT_PROCESS_KEY;

export const ENROLLMENT_TRACK_FAMILY_KEY = "family_track" as const;
export const ENROLLMENT_TRACK_CHILD_KEY = "child_track" as const;

export const ENROLLMENT_FAMILY_STAGE_SPECS = [
    { key: "lead", label: "New Lead", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { key: "tour", label: "Tour", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { key: "decision", label: "Placement / Decision", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { key: "closed", label: "Closed", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
] as const;
// `qualification` removed (Part 9): no distinct work — folded into the Lead stage's qualify_fit work.

export const ENROLLMENT_CHILD_STAGE_SPECS = [
    { key: "waitlist", label: "Waitlist", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { key: "enrolling", label: "Enrolling", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { key: "enrolled", label: "Enrolled", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { key: "closed_withdrawn", label: "Closed / Withdrawn", track_key: ENROLLMENT_TRACK_CHILD_KEY },
] as const;

export const ENROLLMENT_STAGE_SPECS = [
    ...ENROLLMENT_FAMILY_STAGE_SPECS,
    ...ENROLLMENT_CHILD_STAGE_SPECS,
] as const;

/**
 * The CURRENT enrollment template stage keys — the only stages a fresh tenant receives, and the
 * only sanctioned built-in stage vocabulary for pre-configuration bootstrap. Deliberately does
 * NOT contain `qualification` (removed in Part 9). Do not confuse with the broad legacy
 * ENROLLMENT_TEMPLATE_STAGE_KEYS set, which retains historical keys for migration support only.
 */
export const CURRENT_ENROLLMENT_TEMPLATE_STAGE_KEYS: ReadonlySet<string> = new Set(
    ENROLLMENT_STAGE_SPECS.map((s) => s.key),
);

export const ENROLLMENT_STATUS_ROLLUP_HINTS: Record<
    string,
    { family_status_examples?: string[]; enrollment_status_examples?: string[] }
> = {
    lead: { family_status_examples: ["Open"] },
    tour: { family_status_examples: ["Open"] },
    decision: { family_status_examples: ["Open"] },
    closed: { family_status_examples: ["Closed"] },
    waitlist: { enrollment_status_examples: ["Waitlisted", "Offer Pending"] },
    enrolling: { enrollment_status_examples: ["Enrolling", "Future Start"] },
    enrolled: { enrollment_status_examples: ["Enrolled"] },
    closed_withdrawn: { enrollment_status_examples: ["Withdrawn", "Closed"] },
};

export const ENROLLMENT_DEFAULT_TRACKS: ProcessTracksV1 = {
    version: 1,
    tracks: [
        {
            key: ENROLLMENT_TRACK_FAMILY_KEY,
            label: "Family Track",
            subject: "family_case",
            sort_order: 0,
        },
        {
            key: ENROLLMENT_TRACK_CHILD_KEY,
            label: "Child Track",
            subject: "child_enrollment_track",
            sort_order: 1,
        },
    ],
    split_rules: [
        {
            version: 1,
            from_track_key: ENROLLMENT_TRACK_FAMILY_KEY,
            from_stage_key: "decision",
            into_track_key: ENROLLMENT_TRACK_CHILD_KEY,
            per_subject_outcomes: [
                { outcome_key: "waitlist", label: "Waitlist", target_stage_key: "waitlist" },
                { outcome_key: "enrolling", label: "Enrolling", target_stage_key: "enrolling" },
                {
                    outcome_key: "closed_withdrawn",
                    label: "Closed / Withdrawn",
                    target_stage_key: "closed_withdrawn",
                },
                { outcome_key: "no_action", label: "No action — keep with family", target_stage_key: null },
            ],
        },
    ],
};

/** Build enrollment template stage records (metadata only — no DB seeding). */
export function buildEnrollmentTemplateStageRecords(): LifecycleBuilderStageRecord[] {
    return ENROLLMENT_STAGE_SPECS.map((spec, index) => {
        const membership = defaultEnrollmentQueueMembershipForStage(spec.key) ?? undefined;
        const operatingPlan = defaultStageOperatingPlanForEnrollmentStage(spec.key) ?? undefined;
        // Seed the row-type grain so Work Views can be scoped per grain (family vs child) and the
        // grain banner has data. Family track = one row per case; child track = one row per enrollment track.
        const grain: StageGrain = spec.track_key === ENROLLMENT_TRACK_CHILD_KEY ? "child" : "family";
        return {
            id: randomUUID(),
            key: spec.key,
            label: spec.label,
            track_key: spec.track_key,
            sort_order: index,
            is_active: true,
            grain,
            ...(membership ? { queue_membership_v1: membership } : {}),
            ...(operatingPlan ? { stage_operating_plan_v1: operatingPlan } : {}),
        };
    });
}

export function applyEnrollmentTemplateToProcess(
    process: LifecycleBuilderProcessRecord,
): LifecycleBuilderProcessRecord {
    if (process.key !== ENROLLMENT_PROCESS_KEY) {
        throw new Error("Enrollment template applies only to enrollment processes");
    }
    if (process.stages.length > 0) {
        throw new Error("Process already has stages — remove stages before applying the template");
    }
    return {
        ...process,
        tracks_v1: structuredClone(ENROLLMENT_DEFAULT_TRACKS),
        stages: buildEnrollmentTemplateStageRecords(),
    };
}

export function applyEnrollmentTemplateInConfig(
    config: LifecycleBuilderV1,
    processId: string,
): LifecycleBuilderV1 {
    const pid = processId.trim();
    return {
        ...config,
        processes: config.processes.map((p) => {
            if (p.id !== pid) return p;
            return applyEnrollmentTemplateToProcess(p);
        }),
    };
}

/** @deprecated Use applyEnrollmentTemplateToProcess */
export const applyEnrollmentV2TemplateToProcess = applyEnrollmentTemplateToProcess;
/** @deprecated Use applyEnrollmentTemplateInConfig */
export const applyEnrollmentV2TemplateInConfig = applyEnrollmentTemplateInConfig;
/** @deprecated Use buildEnrollmentTemplateStageRecords */
export const buildEnrollmentV2StageRecords = buildEnrollmentTemplateStageRecords;
/** @deprecated Use ENROLLMENT_STAGE_SPECS */
export const ENROLLMENT_V2_STAGE_SPECS = ENROLLMENT_STAGE_SPECS;
/** @deprecated Use ENROLLMENT_FAMILY_STAGE_SPECS */
export const ENROLLMENT_V2_FAMILY_STAGE_SPECS = ENROLLMENT_FAMILY_STAGE_SPECS;
/** @deprecated Use ENROLLMENT_CHILD_STAGE_SPECS */
export const ENROLLMENT_V2_CHILD_STAGE_SPECS = ENROLLMENT_CHILD_STAGE_SPECS;
/** @deprecated Use ENROLLMENT_DEFAULT_TRACKS */
export const ENROLLMENT_V2_DEFAULT_TRACKS = ENROLLMENT_DEFAULT_TRACKS;

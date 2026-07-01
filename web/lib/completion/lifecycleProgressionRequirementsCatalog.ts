/**
 * Operator-facing lifecycle progression requirements by stage.
 * Single doctrine source for Settings, BOS, and progression messaging — not form/modal rules.
 */

import {
    effectiveLifecycleProgressionRequirementsForStage,
} from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import {
    completionValueEmpty,
    trimOrNull,
} from "@/lib/completion/valueEmpty";
import type { InquiryChildCompletionSnapshot } from "@/lib/completion/requirementValidationTypes";

export type LifecycleOperatorStage =
    | "lead"
    | "qualification"
    | "tour"
    | "waitlist"
    | "enrollment"
    | "enrolled";

export type LifecycleProgressionRequirementRow = {
    /** Operator label — no field_key */
    label: string;
    /** required = blocks canonical advancement; recommended = guidance only */
    kind: "required" | "recommended";
};

export type LifecycleStageProgressionSnapshot = {
    stage: LifecycleOperatorStage;
    stage_label: string;
    required: LifecycleProgressionRequirementRow[];
    recommended: LifecycleProgressionRequirementRow[];
    /** Satisfied required labels for checklist UI */
    satisfied_required: string[];
    /** Missing required labels */
    missing_required: string[];
    ready_to_advance: boolean;
};

export const LIFECYCLE_STAGE_LABELS: Record<LifecycleOperatorStage, string> = {
    lead: "Lead",
    qualification: "Qualification",
    tour: "Tour",
    waitlist: "Waitlist",
    enrollment: "Enrollment",
    enrolled: "Enrolled",
};

/** Operator-facing stage order for Settings and walkthroughs. */
export const LIFECYCLE_STAGE_ORDER: readonly LifecycleOperatorStage[] = [
    "lead",
    "qualification",
    "tour",
    "waitlist",
    "enrollment",
    "enrolled",
] as const;

/** What each enrollment stage means in the pipeline (Settings hub). */
export const LIFECYCLE_STAGE_MEANINGS: Record<LifecycleOperatorStage, string> = {
    lead: "A new family inquiry has entered your pipeline. Capture at least one parent or guardian so staff can respond.",
    qualification:
        "Staff is confirming fit — who the child is, program interest, and timing — before scheduling a tour or placing the family on the waitlist.",
    tour: "The family has a center visit on the calendar. Confirm the tour, record the outcome, and decide the next step.",
    waitlist:
        "The family wants care but cannot be placed yet. Maintain schedule, start date, and program interest while they wait for an opening.",
    enrollment:
        "The family is moving toward a confirmed start. Classroom, schedule, start date, and paperwork should be in place before approval.",
    enrolled:
        "Enrollment is confirmed. Ongoing operations focus on profile completeness and steady-state care — not advancing through the intake pipeline.",
};

/** Shared capture note — requirements are not tied to a single intake path. */
export const LIFECYCLE_REQUIREMENTS_CAPTURE_NOTE =
    "Families can meet these requirements through forms, intake, imports, or manual entry in the record drawer.";

function childHasProgram(child: InquiryChildCompletionSnapshot): boolean {
    return (
        !completionValueEmpty(child.desired_program_type) ||
        !completionValueEmpty(child.program_room_cohort_key)
    );
}

function resolveStageFromStatusKey(statusKey: string | null | undefined): LifecycleOperatorStage | null {
    const sk = trimOrNull(statusKey)?.toLowerCase() ?? "";
    if (!sk) return null;
    if (sk === "new_inquiry" || sk === "open" || sk === "new") return "lead";
    if (sk === "qualification" || sk === "contact_attempted" || sk === "contacted") return "qualification";
    if (
        sk === "tour_scheduled" ||
        sk === "tour_completed" ||
        sk === "tour_no_show" ||
        sk === "follow_up_attempted"
    ) {
        return "tour";
    }
    if (sk === "waitlisted") return "waitlist";
    if (sk === "enrolling" || sk === "ready_to_enroll") return "enrollment";
    if (sk === "enrolled") return "enrolled";
    return null;
}

function evaluateChildFieldGaps(children: InquiryChildCompletionSnapshot[]) {
    const hasChild = children.length > 0;
    const allHaveProgram = hasChild && children.every((c) => childHasProgram(c));
    const allHaveSchedule =
        hasChild && children.every((c) => !completionValueEmpty(c.desired_schedule_type));
    const allHaveStart = hasChild && children.every((c) => !completionValueEmpty(c.desired_start_date));
    const allHaveClassroom =
        hasChild && children.every((c) => !completionValueEmpty(c.program_room_cohort_key));
    const allHavePersonLink = hasChild && children.every((c) => !completionValueEmpty(c.person_id));
    return {
        hasChild,
        allHaveProgram,
        allHaveSchedule,
        allHaveStart,
        allHaveClassroom,
        allHavePersonLink,
    };
}

/**
 * Platform-default doctrine checklist for a stage (no department overrides).
 */
export function platformLifecycleProgressionRequirementsForStage(
    stage: LifecycleOperatorStage
): { required: LifecycleProgressionRequirementRow[]; recommended: LifecycleProgressionRequirementRow[] } {
    switch (stage) {
        case "lead":
            return {
                required: [{ label: "Person", kind: "required" }],
                recommended: [{ label: "Child", kind: "recommended" }],
            };
        case "qualification":
            return {
                required: [
                    { label: "Child", kind: "required" },
                    { label: "Program", kind: "required" },
                ],
                recommended: [
                    { label: "Desired Schedule", kind: "recommended" },
                    { label: "Desired Start Date", kind: "recommended" },
                ],
            };
        case "tour":
            return {
                required: [
                    { label: "Child", kind: "required" },
                    { label: "Program", kind: "required" },
                    { label: "Tour Date and Time", kind: "required" },
                ],
                recommended: [{ label: "Tour Outcome", kind: "recommended" }],
            };
        case "waitlist":
            return {
                required: [
                    { label: "Child", kind: "required" },
                    { label: "Program", kind: "required" },
                    { label: "Desired Schedule", kind: "required" },
                    { label: "Desired Start Date", kind: "required" },
                ],
                recommended: [],
            };
        case "enrollment":
            return {
                required: [
                    { label: "Child", kind: "required" },
                    { label: "Classroom", kind: "required" },
                    { label: "Schedule", kind: "required" },
                    { label: "Enrollment Start Date", kind: "required" },
                ],
                recommended: [{ label: "Enrollment Packet Reviewed", kind: "recommended" }],
            };
        case "enrolled":
            return {
                required: [
                    { label: "Enrollment Date", kind: "required" },
                    { label: "Classroom", kind: "required" },
                    { label: "Schedule", kind: "required" },
                    { label: "Start Date", kind: "required" },
                ],
                recommended: [],
            };
    }
}

function satisfiesLabel(
    label: string,
    gaps: ReturnType<typeof evaluateChildFieldGaps>,
    input: { hasPrimaryContact: boolean; hasEnrollmentDate: boolean }
): boolean {
    switch (label) {
        case "Person":
            return input.hasPrimaryContact;
        case "Child":
            return gaps.hasChild;
        case "Program":
            return gaps.allHaveProgram;
        case "Desired Schedule":
        case "Schedule":
            return gaps.allHaveSchedule;
        case "Desired Start Date":
        case "Enrollment Start Date":
        case "Start Date":
            return gaps.allHaveStart;
        case "Classroom":
            return gaps.allHaveClassroom;
        case "Child Identity":
            return gaps.allHavePersonLink;
        case "Enrollment Date":
            return input.hasEnrollmentDate;
        case "Tour Date and Time":
        case "Tour Outcome":
        case "Enrollment Packet Reviewed":
            return true;
        default:
            return false;
    }
}

/** Effective requirements (platform defaults merged with department metadata when provided). */
export function lifecycleProgressionRequirementsForStage(
    stage: LifecycleOperatorStage,
    departmentMetadata?: Record<string, unknown> | null
): { required: LifecycleProgressionRequirementRow[]; recommended: LifecycleProgressionRequirementRow[] } {
    const effective = effectiveLifecycleProgressionRequirementsForStage(stage, departmentMetadata);
    return { required: effective.required, recommended: effective.recommended };
}

export function evaluateLifecycleStageProgression(input: {
    status_key: string | null | undefined;
    inquiry_children?: InquiryChildCompletionSnapshot[] | null;
    primary_person_id?: string | null;
    primary_contact_id?: string | null;
    enrollment_date?: string | null;
    metadata?: Record<string, unknown> | null;
    department_metadata?: Record<string, unknown> | null;
}): LifecycleStageProgressionSnapshot | null {
    const stage = resolveStageFromStatusKey(input.status_key);
    if (!stage) return null;

    const children = input.inquiry_children ?? [];
    const gaps = evaluateChildFieldGaps(children);
    const hasPrimaryContact =
        !completionValueEmpty(input.primary_person_id) ||
        !completionValueEmpty(input.primary_contact_id);
    const md = input.metadata ?? {};
    const enrollmentDate =
        input.enrollment_date ??
        (typeof md.enrollment_date === "string" ? md.enrollment_date : null);

    const doctrine = lifecycleProgressionRequirementsForStage(stage, input.department_metadata);
    const requiredLabels = doctrine.required.map((r) => r.label);
    const satisfied_required = requiredLabels.filter((label) =>
        satisfiesLabel(label, gaps, {
            hasPrimaryContact,
            hasEnrollmentDate: !completionValueEmpty(enrollmentDate),
        })
    );
    const missing_required = requiredLabels.filter(
        (label) => !satisfied_required.includes(label)
    );

    return {
        stage,
        stage_label: LIFECYCLE_STAGE_LABELS[stage],
        required: doctrine.required,
        recommended: doctrine.recommended,
        satisfied_required,
        missing_required,
        ready_to_advance: missing_required.length === 0,
    };
}

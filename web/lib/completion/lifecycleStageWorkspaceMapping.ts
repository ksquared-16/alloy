/**
 * Operator-facing mapping: lifecycle stage → enrollment pipeline work unit queues (Settings).
 * Based on canonical `enrollment_pipeline` queue_definition v2 — not loaded from DB in Settings.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_TYPICAL_ACTIONS } from "@/lib/completion/lifecycleStageTypicalActions";
import { CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED } from "@/lib/opportunities/enrollmentNeedsAttentionBucketsSeed";

export type LifecycleStageWorkspaceAppearance = {
    mapped: boolean;
    workUnitName: string;
    queues: readonly { label: string; description?: string }[];
    statusLabels: readonly string[];
    actions: readonly string[];
    needsAttentionSignals: readonly string[];
};

const STATUS_LABELS: Record<string, string> = {
    new_inquiry: "New Lead",
    open: "Open",
    new: "New",
    contact_attempted: "Contact Attempted",
    contacted: "Contacted",
    qualification: "Qualification",
    tour_scheduled: "Tour Scheduled",
    tour_completed: "Tour Completed",
    follow_up_attempted: "Follow-Up Attempted",
    tour_no_show: "Tour No-Show",
    waitlisted: "Waitlisted",
    enrolling: "Enrolling",
    ready_to_enroll: "Ready to Enroll",
    enrolled: "Enrolled",
};

function labelsForStatusKeys(keys: readonly string[]): string[] {
    const out: string[] = [];
    for (const k of keys) {
        const label = STATUS_LABELS[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        if (!out.includes(label)) out.push(label);
    }
    return out;
}

const STAGE_NEEDS_ATTENTION: Record<LifecycleOperatorStage, readonly string[]> = {
    lead: ["New inquiry — first response overdue"],
    qualification: ["Qualification — follow-up overdue", "Follow-up commitment overdue"],
    tour: ["Tour — outcome needed", "Follow-up commitment overdue"],
    waitlist: ["Waiting on family", "Waiting on staff"],
    enrollment: ["Waiting on family", "Waiting on staff"],
    enrolled: [],
};

const ENROLLMENT_PIPELINE_APPEARANCE: Record<LifecycleOperatorStage, Omit<LifecycleStageWorkspaceAppearance, "actions" | "mapped">> = {
    lead: {
        workUnitName: "Enrollment Pipeline",
        queues: [{ label: "New Leads", description: "First touch and new families" }],
        statusLabels: labelsForStatusKeys(["new_inquiry", "open", "new"]),
        needsAttentionSignals: STAGE_NEEDS_ATTENTION.lead,
    },
    qualification: {
        workUnitName: "Enrollment Pipeline",
        queues: [{ label: "Follow Up", description: "Qualification and follow-up before tour or waitlist" }],
        statusLabels: labelsForStatusKeys(["contact_attempted", "contacted", "qualification"]),
        needsAttentionSignals: STAGE_NEEDS_ATTENTION.qualification,
    },
    tour: {
        workUnitName: "Enrollment Pipeline",
        queues: [
            { label: "Tours", description: "Scheduled tour on the calendar" },
            { label: "Tours (post-visit)", description: "Completed tour, follow-up, or no-show" },
        ],
        statusLabels: labelsForStatusKeys([
            "tour_scheduled",
            "tour_completed",
            "follow_up_attempted",
            "tour_no_show",
        ]),
        needsAttentionSignals: STAGE_NEEDS_ATTENTION.tour,
    },
    waitlist: {
        workUnitName: "Enrollment Pipeline",
        queues: [{ label: "Waitlist", description: "Families waiting for an opening" }],
        statusLabels: labelsForStatusKeys(["waitlisted"]),
        needsAttentionSignals: STAGE_NEEDS_ATTENTION.waitlist,
    },
    enrollment: {
        workUnitName: "Enrollment Pipeline",
        queues: [{ label: "Enrolling", description: "Paperwork and placement in motion" }],
        statusLabels: labelsForStatusKeys(["enrolling", "ready_to_enroll"]),
        needsAttentionSignals: STAGE_NEEDS_ATTENTION.enrollment,
    },
    enrolled: {
        workUnitName: "Enrollment Pipeline",
        queues: [{ label: "Enrolled", description: "Confirmed enrollment" }],
        statusLabels: labelsForStatusKeys(["enrolled"]),
        needsAttentionSignals: STAGE_NEEDS_ATTENTION.enrolled,
    },
};

/** Global needs-attention bucket labels (reference for operators). */
export const LIFECYCLE_NEEDS_ATTENTION_REFERENCE_LABELS = CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED.map(
    (b) => b.label
);

export function lifecycleStageWorkspaceAppearance(stage: LifecycleOperatorStage): LifecycleStageWorkspaceAppearance {
    const base = ENROLLMENT_PIPELINE_APPEARANCE[stage];
    return {
        mapped: true,
        ...base,
        actions: LIFECYCLE_STAGE_TYPICAL_ACTIONS[stage],
    };
}

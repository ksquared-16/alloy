/**
 * Canonical enrollment operator stage ↔ CRM status keys (reference until DB metadata binding).
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";

export const ENROLLMENT_STAGE_STATUS_KEYS: Record<LifecycleOperatorStage, readonly string[]> = {
    lead: ["new_inquiry", "open", "new"],
    qualification: ["contact_attempted", "contacted", "qualification", "qualified"],
    tour: ["tour_scheduled", "tour_completed", "follow_up_attempted", "tour_no_show"],
    waitlist: ["waitlisted"],
    enrollment: ["enrolling", "ready_to_enroll"],
    enrolled: ["enrolled"],
};

const STATUS_DISPLAY: Record<string, string> = {
    new_inquiry: "New Inquiry",
    open: "Open",
    new: "New",
    contact_attempted: "Contact Attempted",
    contacted: "Contacted",
    qualification: "Qualification",
    qualified: "Qualified",
    tour_scheduled: "Tour Scheduled",
    tour_completed: "Tour Completed",
    follow_up_attempted: "Follow-Up Attempted",
    tour_no_show: "Tour No-Show",
    waitlisted: "Waitlisted",
    enrolling: "Enrolling",
    ready_to_enroll: "Ready to Enroll",
    enrolled: "Enrolled",
};

export function enrollmentStageStatusDisplayLabels(stage: LifecycleOperatorStage): string[] {
    return ENROLLMENT_STAGE_STATUS_KEYS[stage].map(
        (k) => STATUS_DISPLAY[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    );
}

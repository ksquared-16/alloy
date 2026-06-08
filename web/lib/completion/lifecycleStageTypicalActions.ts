/**
 * Operator-facing typical actions per lifecycle stage (Settings display only).
 * Visibility is configured in Settings → Action buttons, not here.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";

export const LIFECYCLE_STAGE_TYPICAL_ACTIONS: Record<LifecycleOperatorStage, readonly string[]> = {
    lead: ["Create lead", "Move to qualification", "Send message", "Add note", "Mark lost"],
    qualification: [
        "Add child",
        "Add contact",
        "Schedule tour",
        "Move to waitlist",
        "Send form",
        "Mark lost",
    ],
    tour: [
        "Schedule tour",
        "Confirm tour",
        "Record tour outcome",
        "Send enrollment packet",
        "Move to waitlist",
        "Mark lost",
    ],
    waitlist: [
        "Move to waitlist",
        "Send message",
        "Schedule tour",
        "Adjust waitlist position",
        "Mark lost",
    ],
    enrollment: [
        "Approve enrollment",
        "Assign classroom",
        "Set schedule",
        "Set start date",
        "Review enrollment packet",
        "Send form",
        "Mark lost",
    ],
    enrolled: ["Send message", "Add note", "Upload document", "View child profile"],
};

import { CREATE_LEAD_GATHER_FIELDS } from "@/lib/admin/actions/createLeadPlatformGather";
import type { BosRecommendation } from "@/lib/admin/actions/bosRecommendationTypes";

const LABEL_BY_KEY = Object.fromEntries(
    CREATE_LEAD_GATHER_FIELDS.map((f) => [f.payload_key, f.field_label])
) as Record<string, string>;

const SCHEDULE_TOUR_ACTION_KEY = "schedule_tour";
const SEND_WELCOME_ACTION_KEY = "send_welcome_email";

const MISSING_FOLLOW_UP_FIELDS: { key: string; label: string }[] = [
    { key: "child_date_of_birth", label: "Child DOB" },
    { key: "child_desired_start_date", label: "Desired start date" },
    { key: "child_program", label: "Program interest" },
    { key: "location_id", label: "Location" },
    { key: "child_desired_schedule_type", label: "Schedule" },
];

function scheduleTourBlockingRequirements(values: Record<string, string>): string[] {
    const missing: string[] = [];
    if (!(values.child_first_name ?? "").trim()) missing.push("Child name");
    if (!(values.child_program ?? "").trim()) missing.push("Program interest");
    if (!(values.location_id ?? "").trim()) missing.push("Location");
    if (!(values.child_desired_start_date ?? "").trim()) missing.push("Desired start date");
    return missing;
}

function buildScheduleTourRecommendation(values: Record<string, string>): BosRecommendation {
    const blockingRequirements = scheduleTourBlockingRequirements(values);
    if (blockingRequirements.length > 0) {
        return {
            key: "schedule-tour",
            title: "Schedule Tour",
            reason: "Needs child/program info",
            readiness: "blocked",
            blockingRequirements,
            actionKey: SCHEDULE_TOUR_ACTION_KEY,
        };
    }

    return {
        key: "schedule-tour",
        title: "Schedule Tour",
        reason: "Available after opening lead",
        readiness: "ready",
        actionKey: SCHEDULE_TOUR_ACTION_KEY,
    };
}

function buildSendWelcomeRecommendation(): BosRecommendation {
    return {
        key: "send-welcome",
        title: "Send Welcome Email",
        reason: "Template ready soon",
        readiness: "coming_soon",
        actionKey: SEND_WELCOME_ACTION_KEY,
    };
}

function buildMissingInfoRecommendations(values: Record<string, string>): BosRecommendation[] {
    const recommendations: BosRecommendation[] = [];
    for (const field of MISSING_FOLLOW_UP_FIELDS) {
        if ((values[field.key] ?? "").trim()) continue;
        const label = LABEL_BY_KEY[field.key] ?? field.label;
        recommendations.push({
            key: `required-info:${field.key}`,
            title: field.label,
            reason: "Required Information — complete after opening lead",
            readiness: "blocked",
            blockingRequirements: [label],
        });
    }
    return recommendations;
}

/** Truthful post-create recommendations for Create Lead success. */
export function resolveCreateLeadPostCreateRecommendations(values: Record<string, string>): BosRecommendation[] {
    return [
        buildScheduleTourRecommendation(values),
        buildSendWelcomeRecommendation(),
        ...buildMissingInfoRecommendations(values),
    ];
}

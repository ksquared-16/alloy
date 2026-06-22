import { CREATE_LEAD_GATHER_FIELDS } from "@/lib/admin/actions/createLeadPlatformGather";
import type { BosRecommendation } from "@/lib/admin/actions/bosRecommendationTypes";

const LABEL_BY_KEY = Object.fromEntries(
    CREATE_LEAD_GATHER_FIELDS.map((f) => [f.payload_key, f.field_label])
) as Record<string, string>;

const SCHEDULE_TOUR_ACTION_KEYS = ["schedule_tour", "reschedule_tour"] as const;
const SEND_WELCOME_ACTION_KEY = "send_welcome_email";

const MISSING_FOLLOW_UP_FIELDS: { key: string; label: string }[] = [
    { key: "child_date_of_birth", label: "Child DOB" },
    { key: "child_desired_start_date", label: "Desired start date" },
    { key: "child_program", label: "Program interest" },
    { key: "location_id", label: "Location" },
    { key: "child_desired_schedule_type", label: "Schedule" },
];

export type CreateLeadPostCreateContext = {
    /** Configured opportunity header action keys (from action registry). */
    availableActionKeys?: readonly string[];
};

function hasConfiguredAction(available: ReadonlySet<string>, keys: readonly string[]): boolean {
    return keys.some((key) => available.has(key));
}

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
            actionKey: "schedule_tour",
        };
    }

    return {
        key: "schedule-tour",
        title: "Schedule Tour",
        reason: "Available after opening lead",
        readiness: "ready",
        actionKey: "schedule_tour",
    };
}

function buildSendWelcomeRecommendation(): BosRecommendation {
    return {
        key: "send-welcome",
        title: "Send Welcome Email",
        reason: "Available after opening lead",
        readiness: "ready",
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

/** Truthful post-create recommendations for Create Lead success — config-driven actions only. */
export function resolveCreateLeadPostCreateRecommendations(
    values: Record<string, string>,
    context?: CreateLeadPostCreateContext,
): BosRecommendation[] {
    const available = new Set((context?.availableActionKeys ?? []).map((key) => key.trim()).filter(Boolean));
    const recommendations: BosRecommendation[] = [];

    if (hasConfiguredAction(available, SCHEDULE_TOUR_ACTION_KEYS)) {
        recommendations.push(buildScheduleTourRecommendation(values));
    }

    if (available.has(SEND_WELCOME_ACTION_KEY)) {
        recommendations.push(buildSendWelcomeRecommendation());
    }

    recommendations.push(...buildMissingInfoRecommendations(values));
    return recommendations;
}

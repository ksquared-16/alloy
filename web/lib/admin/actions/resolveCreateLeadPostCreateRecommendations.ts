import type { BosRecommendation } from "@/lib/admin/actions/bosRecommendationTypes";
import { resolveCreateLeadPostCreateMissingInfoRecommendations } from "@/lib/admin/actions/createLead/postCreateMissingInfoRecommendations";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";

const SCHEDULE_TOUR_ACTION_KEYS = ["schedule_tour", "reschedule_tour"] as const;
const SEND_WELCOME_ACTION_KEY = "send_welcome_email";

export type CreateLeadPostCreateContext = {
    /** Configured opportunity header action keys (from action registry). */
    availableActionKeys?: readonly string[];
    intakeSpec?: ActionIntakeSpec | null;
};

function hasConfiguredAction(available: ReadonlySet<string>, keys: readonly string[]): boolean {
    return keys.some((key) => available.has(key));
}

function scheduleTourBlockingRequirements(values: Record<string, string>): string[] {
    const missing: string[] = [];
    if (!(values.child_first_name ?? "").trim()) missing.push("Child name");
    if (!(values.child_program ?? "").trim()) missing.push("Program interest");
    if (!(values.location_id ?? "").trim()) missing.push("Location");
    if (!(values.child_start_date ?? "").trim()) missing.push("Desired start date");
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

    recommendations.push(
        ...resolveCreateLeadPostCreateMissingInfoRecommendations({
            values,
            intakeSpec: context?.intakeSpec,
        }),
    );
    return recommendations;
}

import type { BosRecommendation } from "@/lib/admin/actions/bosRecommendationTypes";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";

/**
 * Temporary Create Lead adapter for post-create "required information" gaps.
 * Replace with BP Required Information / stage completion resolver when available.
 */
const TEMPORARY_FOLLOW_UP_PAYLOAD_KEYS = [
    "child_date_of_birth",
    "child_desired_start_date",
    "child_program",
    "location_id",
    "child_desired_schedule_type",
] as const;

function labelForField(spec: ActionIntakeSpec | null | undefined, payloadKey: string): string {
    if (!spec) return payloadKey;
    const field = [...spec.required, ...spec.recommended, ...spec.optional].find(
        (entry) => entry.payload_key === payloadKey,
    );
    return field?.field_label ?? payloadKey;
}

/** Build missing-info recommendations from ActionIntakeSpec tiers (recommended + optional runtime fields). */
export function resolveCreateLeadPostCreateMissingInfoRecommendations(input: {
    values: Record<string, string>;
    intakeSpec?: ActionIntakeSpec | null;
}): BosRecommendation[] {
    const spec = input.intakeSpec;
    const followUpKeys =
        spec ?
            [...spec.recommended, ...spec.optional]
                .map((field) => field.payload_key)
                .filter((key) => TEMPORARY_FOLLOW_UP_PAYLOAD_KEYS.includes(key as (typeof TEMPORARY_FOLLOW_UP_PAYLOAD_KEYS)[number]))
        :   [...TEMPORARY_FOLLOW_UP_PAYLOAD_KEYS];

    const uniqueKeys = [...new Set(followUpKeys)];
    const recommendations: BosRecommendation[] = [];

    for (const payloadKey of uniqueKeys) {
        if ((input.values[payloadKey] ?? "").trim()) continue;
        const label = labelForField(spec, payloadKey);
        recommendations.push({
            key: `required-info:${payloadKey}`,
            title: label,
            reason: "Required Information — complete after opening lead",
            readiness: "blocked",
            blockingRequirements: [label],
        });
    }

    return recommendations;
}

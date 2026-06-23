/**
 * Allowed enrollment status destinations — BP-aware defaults with parking-lot waitlist.
 */

import { LIFECYCLE_STAGE_LABELS, type LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { ENROLLMENT_STAGE_STATUS_KEYS } from "@/lib/lifecycle/enrollmentProcessStageBindings";
import type {
    EnrollmentStatusDestinationKey,
    EnrollmentStatusTransitionDestinationOption,
    EnrollmentStatusTransitionGrain,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";

const OPERATOR_DESTINATIONS: readonly EnrollmentStatusDestinationKey[] = [
    "lead",
    "qualification",
    "tour",
    "waitlist",
    "enrollment",
    "enrolled",
    "closed_withdrawn",
];

const PARKING_LOT_DESTINATIONS = new Set<EnrollmentStatusDestinationKey>(["waitlist"]);

function defaultStatusForOperatorStage(stage: LifecycleOperatorStage, grain: EnrollmentStatusTransitionGrain): string {
    const keys = ENROLLMENT_STAGE_STATUS_KEYS[stage];
    if (grain === "case") {
        return keys[0] ?? stage;
    }
    if (stage === "waitlist") return "waitlisted";
    if (stage === "enrollment") return "enrolling";
    if (stage === "enrolled") return "enrolled";
    if (stage === "lead") return "new_inquiry";
    if (stage === "qualification") return "qualified";
    if (stage === "tour") return "tour_scheduled";
    return keys[0] ?? stage;
}

function closedWithdrawnDefaultStatus(grain: EnrollmentStatusTransitionGrain): string {
    return grain === "case" ? "withdrawn" : "family_withdrew";
}

export function enrollmentStatusDestinationLabel(key: EnrollmentStatusDestinationKey): string {
    if (key === "closed_withdrawn") return "Lost / Withdrawn";
    return LIFECYCLE_STAGE_LABELS[key as LifecycleOperatorStage] ?? key.replace(/_/g, " ");
}

export function resolveEnrollmentStatusTargetKey(
    destinationKey: EnrollmentStatusDestinationKey,
    grain: EnrollmentStatusTransitionGrain,
): string {
    if (destinationKey === "closed_withdrawn") return closedWithdrawnDefaultStatus(grain);
    return defaultStatusForOperatorStage(destinationKey as LifecycleOperatorStage, grain);
}

/** Default reachable destinations — waitlist is a parking lot reachable from any non-terminal stage. */
export function defaultEnrollmentStatusDestinations(input: {
    grain: EnrollmentStatusTransitionGrain;
    currentOperatorStage: string | null;
    currentStatusKey: string | null;
}): EnrollmentStatusTransitionDestinationOption[] {
    const grain = input.grain;
    const entityType: EnrollmentStatusTransitionDestinationOption["entityType"] =
        grain === "case" ? "opportunities" : "opportunity_customer_members";

    const current = input.currentStatusKey?.trim() ?? "";
    const out: EnrollmentStatusTransitionDestinationOption[] = [];

    for (const destinationKey of OPERATOR_DESTINATIONS) {
        const defaultStatusKey = resolveEnrollmentStatusTargetKey(destinationKey, grain);
        if (defaultStatusKey === current) continue;
        out.push({
            destinationKey,
            label: enrollmentStatusDestinationLabel(destinationKey),
            defaultStatusKey,
            entityType,
            parkingLot: PARKING_LOT_DESTINATIONS.has(destinationKey),
        });
    }

    return out;
}

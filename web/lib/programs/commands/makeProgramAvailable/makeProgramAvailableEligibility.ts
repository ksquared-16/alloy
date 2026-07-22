/**
 * Shared eligibility for Make Program Available preview + commit.
 * Preview and commit MUST call this — never fork eligibility rules.
 */

import type { ProgramConsumerContext } from "@/lib/programs/publication/programPublicationAdapter";
import type { MakeProgramAvailableLocationResult } from "@/lib/programs/commands/makeProgramAvailable/makeProgramAvailableModel";

export type ResolvedSiteTarget = {
    locationId: string;
    locationLabel: string;
    /** Present when the site is eligible for association evaluation. */
    context: ProgramConsumerContext | null;
    block?: { code: string; reason: string };
};

export function classifyMakeProgramAvailableTarget(input: {
    locationId: string;
    locationLabel: string;
    context: ProgramConsumerContext;
    nextRevisionId: string;
}): MakeProgramAvailableLocationResult {
    const hasLocalConfiguration = Boolean(input.context.localDescriptionOverride?.trim());
    const sameRevision =
        input.context.offeringExists
        && input.context.currentRevisionId === input.nextRevisionId;

    if (sameRevision) {
        return {
            locationId: input.locationId,
            locationLabel: input.locationLabel,
            status: hasLocalConfiguration ? "already_available_local" : "already_available",
            hasLocalConfiguration,
            offered: input.context.offered,
            currentRevisionId: input.context.currentRevisionId,
            reason: hasLocalConfiguration
                ? "Already available; local configuration will be retained."
                : "Already available at this Location.",
        };
    }

    if (input.context.offeringExists) {
        return {
            locationId: input.locationId,
            locationLabel: input.locationLabel,
            status: "new_association",
            code: "revision_update",
            reason: "Update the Location association to the selected published revision. Local configuration is retained.",
            hasLocalConfiguration,
            offered: input.context.offered,
            currentRevisionId: input.context.currentRevisionId,
        };
    }

    return {
        locationId: input.locationId,
        locationLabel: input.locationLabel,
        status: "new_association",
        code: "create_association",
        reason: "Create a Location association for this published Program.",
        hasLocalConfiguration: false,
        offered: null,
        currentRevisionId: null,
    };
}

export function partitionMakeProgramAvailableTargets(input: {
    resolved: readonly ResolvedSiteTarget[];
    nextRevisionId: string;
}): {
    newAssociations: MakeProgramAvailableLocationResult[];
    alreadyAvailable: MakeProgramAvailableLocationResult[];
    locallyConfigured: MakeProgramAvailableLocationResult[];
    retainedLocalConfiguration: MakeProgramAvailableLocationResult[];
    blocked: Array<{ locationId: string; locationLabel: string; code: string; reason: string }>;
    eligibleLocationIds: string[];
} {
    const newAssociations: MakeProgramAvailableLocationResult[] = [];
    const alreadyAvailable: MakeProgramAvailableLocationResult[] = [];
    const locallyConfigured: MakeProgramAvailableLocationResult[] = [];
    const retainedLocalConfiguration: MakeProgramAvailableLocationResult[] = [];
    const blocked: Array<{ locationId: string; locationLabel: string; code: string; reason: string }> =
        [];
    const eligibleLocationIds: string[] = [];

    for (const row of input.resolved) {
        if (row.block || !row.context) {
            blocked.push({
                locationId: row.locationId,
                locationLabel: row.locationLabel,
                code: row.block?.code ?? "location_ineligible",
                reason: row.block?.reason ?? "This Location cannot receive the Program.",
            });
            continue;
        }
        const classified = classifyMakeProgramAvailableTarget({
            locationId: row.locationId,
            locationLabel: row.locationLabel,
            context: row.context,
            nextRevisionId: input.nextRevisionId,
        });
        if (classified.hasLocalConfiguration) {
            locallyConfigured.push(classified);
            retainedLocalConfiguration.push(classified);
        }
        if (
            classified.status === "already_available"
            || classified.status === "already_available_local"
        ) {
            alreadyAvailable.push(classified);
            eligibleLocationIds.push(classified.locationId);
            continue;
        }
        newAssociations.push(classified);
        eligibleLocationIds.push(classified.locationId);
    }

    return {
        newAssociations,
        alreadyAvailable,
        locallyConfigured,
        retainedLocalConfiguration,
        blocked,
        eligibleLocationIds,
    };
}

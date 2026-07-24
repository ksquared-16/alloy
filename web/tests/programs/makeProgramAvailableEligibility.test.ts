import { describe, expect, it } from "vitest";
import {
    classifyMakeProgramAvailableTarget,
    partitionMakeProgramAvailableTargets,
} from "@/lib/programs/commands/makeProgramAvailable/makeProgramAvailableEligibility";
import {
    buildMakeProgramAvailableRefreshTargets,
    MAKE_PROGRAM_AVAILABLE_COMMAND_KEY,
} from "@/lib/programs/commands/makeProgramAvailable/makeProgramAvailableModel";
import type { ProgramConsumerContext } from "@/lib/programs/publication/programPublicationAdapter";

function ctx(partial: Partial<ProgramConsumerContext>): ProgramConsumerContext {
    return {
        currentRevisionId: null,
        offeringExists: false,
        offered: null,
        localDescriptionOverride: null,
        localAuthorizationEvidence: null,
        protectedResourceAssignmentCount: 0,
        ...partial,
    };
}

describe("makeProgramAvailableEligibility", () => {
    it("classifies new association vs already available vs local retain", () => {
        const nextRevisionId = "rev-2";
        expect(
            classifyMakeProgramAvailableTarget({
                locationId: "loc-1",
                locationLabel: "North",
                nextRevisionId,
                context: ctx({}),
            }).status,
        ).toBe("new_association");

        expect(
            classifyMakeProgramAvailableTarget({
                locationId: "loc-2",
                locationLabel: "South",
                nextRevisionId,
                context: ctx({
                    offeringExists: true,
                    currentRevisionId: "rev-2",
                    offered: true,
                }),
            }).status,
        ).toBe("already_available");

        expect(
            classifyMakeProgramAvailableTarget({
                locationId: "loc-3",
                locationLabel: "East",
                nextRevisionId,
                context: ctx({
                    offeringExists: true,
                    currentRevisionId: "rev-2",
                    localDescriptionOverride: "Campus note",
                    offered: true,
                }),
            }).status,
        ).toBe("already_available_local");
    });

    it("partitions 35 Locations with mix of new, existing, local, and blocked", () => {
        const nextRevisionId = "rev-1";
        const resolved = Array.from({ length: 35 }, (_, index) => {
            const locationId = `loc-${index}`;
            if (index % 17 === 0 && index > 0) {
                return {
                    locationId,
                    locationLabel: `Campus ${index}`,
                    context: null,
                    block: { code: "location_inactive", reason: "Inactive" },
                };
            }
            if (index < 3) {
                return {
                    locationId,
                    locationLabel: `Campus ${index}`,
                    context: ctx({
                        offeringExists: true,
                        currentRevisionId: nextRevisionId,
                        localDescriptionOverride: index === 2 ? "Local" : null,
                        offered: true,
                    }),
                };
            }
            return {
                locationId,
                locationLabel: `Campus ${index}`,
                context: ctx({}),
            };
        });

        const partition = partitionMakeProgramAvailableTargets({ resolved, nextRevisionId });
        expect(partition.blocked.length).toBeGreaterThan(0);
        expect(partition.alreadyAvailable.length).toBe(3);
        expect(partition.locallyConfigured.length).toBe(1);
        expect(partition.retainedLocalConfiguration.length).toBe(1);
        expect(partition.newAssociations.length).toBe(
            35 - partition.blocked.length - partition.alreadyAvailable.length,
        );
        expect(partition.eligibleLocationIds.length).toBe(
            partition.newAssociations.length + partition.alreadyAvailable.length,
        );
    });
});

describe("makeProgramAvailableModel", () => {
    it("exports stable command key and precise refresh targets", () => {
        expect(MAKE_PROGRAM_AVAILABLE_COMMAND_KEY).toBe("programs.make_available.v1");
        const targets = buildMakeProgramAvailableRefreshTargets({
            programId: "prog-1",
            associatedLocationIds: ["loc-a", "loc-b"],
            originatingLocationId: "loc-a",
        });
        expect(targets).toContain("programs:collection");
        expect(targets).toContain("programs:program:prog-1:assignment");
        expect(targets).toContain("locations:location:loc-b:programs");
        expect(targets).toContain("organization:programs-locations");
    });
});

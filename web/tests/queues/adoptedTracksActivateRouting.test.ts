/**
 * ADOPTION IS ONLY REAL IF THE RESOLVER SEES IT.
 *
 * Writing `tracks_v1` into a draft proves nothing on its own. The claim the operator is being asked
 * to believe is that after adoption the RUNTIME routes differently — family stages keep resolving
 * one row per case, child stages start resolving one row per child — and that claim is only settled
 * by driving the real resolver.
 *
 * So these tests build the tenant's actual shape (a builder-owned Enrollment process with its own
 * stages and NO tracks), adopt through the real evaluator and writer, and then call
 * `resolveOpportunityQueueLaneRouting` on the result. Nothing here is a fixture of what adoption
 * "would" produce: the department metadata is the adopted configuration.
 *
 * The before/after pair is the point. Asserting only the "after" would pass just as well if the
 * resolver had been routing that way all along, which is exactly the thing in dispute.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { adoptProcessTracks, evaluateProcessTrackAdoption } from "@/lib/businessProcesses/configuration/processTrackAdoption";
import { trackAdoptionTemplateForProcessKey } from "@/lib/businessProcessTemplates/processTrackTemplates";
import { defaultEnrollmentQueueMembershipForStage } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { LifecycleBuilderProcessRecord, LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { QUEUE_MEMBERSHIP_METADATA_KEY } from "@/lib/lifecycle/seedEnrollmentQueueMembershipV1";
import { isQueueMembershipFromBuilderEnabled } from "@/lib/queues/queueMembershipFromBuilderFeatureFlag";
import { resolveOpportunityQueueLaneRouting } from "@/lib/queues/queueMembershipRuntimeResolver";
import type { StageGrain } from "@/lib/lifecycle/stageGrainV1";

const TEMPLATE = trackAdoptionTemplateForProcessKey(ENROLLMENT_PROCESS_KEY)!;

/** The tenant's stages: correct grain and membership after Phase 1A, but no tracks. */
const STAGES: { key: string; label: string; grain: StageGrain }[] = [
    { key: "lead", label: "New Lead", grain: "family" },
    { key: "tour", label: "Tour", grain: "family" },
    { key: "decision", label: "Placement / Decision", grain: "family" },
    { key: "closed", label: "Closed", grain: "family" },
    { key: "waitlist", label: "Waitlist", grain: "child" },
    { key: "enrolling", label: "Enrolling", grain: "child" },
    { key: "enrolled", label: "Enrolled", grain: "child" },
    { key: "closed_withdrawn", label: "Closed / Withdrawn", grain: "child" },
];

function builderOwnedProcessWithoutTracks(): LifecycleBuilderProcessRecord {
    return {
        id: "proc-tenant",
        key: ENROLLMENT_PROCESS_KEY,
        name: "Enrollment",
        primary_entity: "opportunity",
        sort_order: 0,
        is_active: true,
        // Deliberately NO tracks_v1 — this is the state the product had no way out of.
        stages: STAGES.map((s, index) => ({
            id: `stage-${s.key}`,
            key: s.key,
            label: s.label,
            sort_order: index,
            is_active: true,
            grain: s.grain,
            queue_membership_v1: defaultEnrollmentQueueMembershipForStage(s.key)!,
        })),
    };
}

function departmentMetadataFor(config: LifecycleBuilderV1) {
    return { [LIFECYCLE_BUILDER_METADATA_KEY]: config };
}

function configOf(process: LifecycleBuilderProcessRecord): LifecycleBuilderV1 {
    return { version: 1, active_process_id: process.id, processes: [process] };
}

function adopt(config: LifecycleBuilderV1): LifecycleBuilderV1 {
    const process = config.processes[0]!;
    const evaluation = evaluateProcessTrackAdoption({ process, template: TEMPLATE });
    expect(evaluation.ok, evaluation.blockers.map((b) => b.message).join(" ")).toBe(true);
    return adoptProcessTracks(config, process.id, evaluation.tracks, evaluation.assignments);
}

/**
 * The queue definition document the runtime resolves against.
 *
 * The Waitlist lane is candidate-grain and its context is built from the QUEUE entry, not from
 * membership alone, so a document with no candidate queue makes that lane unresolvable for reasons
 * that have nothing to do with adoption. Declaring the entry keeps this test measuring the thing it
 * claims to measure.
 */
const NORMALIZED_QUEUES = {
    isV2: true,
    /*
     * One entry per stage, not just the candidate one. `resolveWaitlistCandidateGrainContext` falls
     * back to "any waitlist-domain candidate queue" when it cannot find the key it was asked for, so
     * a document containing ONLY the candidate queue makes every other lane resolve as candidate —
     * which would have made this test report child-grain routing for the Lead lane and call it a
     * pass.
     */
    queues: STAGES.map((s) => ({
        key: s.key,
        domain: s.key === "waitlist" ? "waitlist" : "enrollment",
        grain: s.key === "waitlist" ? "candidate" : s.grain === "child" ? "child" : "case",
        aliases: [],
        filters: [],
    })),
} as never;

/** Route one stage the way the queue runtime would. */
function routeStage(departmentMetadata: unknown, stageKey: string) {
    return resolveOpportunityQueueLaneRouting({
        normalized: NORMALIZED_QUEUES,
        executableQueueKey: stageKey,
        workUnitMetadata: {
            lifecycle_stage_key: stageKey,
            [QUEUE_MEMBERSHIP_METADATA_KEY]: defaultEnrollmentQueueMembershipForStage(stageKey)!,
        },
        departmentMetadata,
    });
}

describe("adopted tracks activate builder routing", () => {
    let restore: () => void;

    beforeEach(() => {
        const previous = {
            ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER: process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER,
            ALLOY_QUEUE_CHILD_GRAIN_LANES: process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES,
        };
        // No env path on either side: the only thing that may change routing here is adoption.
        delete process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER;
        delete process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
        restore = () => {
            for (const [k, v] of Object.entries(previous)) {
                if (v === undefined) delete process.env[k];
                else process.env[k] = v;
            }
        };
    });

    afterEach(() => restore());

    it("BEFORE adoption no stage routes from the builder", () => {
        const metadata = departmentMetadataFor(configOf(builderOwnedProcessWithoutTracks()));
        expect(isQueueMembershipFromBuilderEnabled(metadata)).toBe(false);

        for (const s of STAGES) {
            expect(routeStage(metadata, s.key).routingSource, `${s.key} must not be builder`).not.toBe(
                "builder",
            );
        }
    });

    it("BEFORE adoption Waitlist alone already had a child-grain path, and the rest did not", () => {
        /*
         * This asymmetry is the reason Waitlist V1 could ship on a process with no tracks: the
         * candidate-grain lane had its own legacy route, which the family stages never needed and
         * Enrolling never had. Stating it here means the "after" assertions below are measured
         * against what was actually true rather than against a uniform "everything was legacy" that
         * would quietly excuse a Waitlist regression.
         */
        const metadata = departmentMetadataFor(configOf(builderOwnedProcessWithoutTracks()));

        expect(routeStage(metadata, "waitlist").routingSource).toBe("child_grain_flag");
        for (const key of ["lead", "tour", "decision", "closed", "enrolling", "enrolled"]) {
            expect(routeStage(metadata, key).routingSource, `${key} before adoption`).toBe("legacy");
        }
    });

    it("AFTER adoption the same process routes from the builder", () => {
        const metadata = departmentMetadataFor(adopt(configOf(builderOwnedProcessWithoutTracks())));
        expect(isQueueMembershipFromBuilderEnabled(metadata)).toBe(true);
    });

    it("7. family stages keep family routing after activation", () => {
        const metadata = departmentMetadataFor(adopt(configOf(builderOwnedProcessWithoutTracks())));

        for (const key of ["lead", "tour", "decision"]) {
            const routing = routeStage(metadata, key);
            expect(routing.routingSource, `${key} routing source`).toBe("builder");
            expect(routing.builderMembership?.subject_type, `${key} subject`).toBe("case");
            expect(routing.builderMembership?.count_unit, `${key} count unit`).toBe("cases");
        }
    });

    it("8. child stages become child routing after activation", () => {
        const metadata = departmentMetadataFor(adopt(configOf(builderOwnedProcessWithoutTracks())));

        for (const key of ["enrolling", "enrolled"]) {
            const routing = routeStage(metadata, key);
            expect(routing.routingSource, `${key} routing source`).toBe("builder");
            expect(routing.builderMembership?.subject_type, `${key} subject`).toBe("child");
            expect(routing.builderMembership?.stage_key, `${key} membership stage`).toBe(key);
        }
    });

    it("9. Waitlist stays candidate-grain — adoption does not re-home the lane V1 certified", () => {
        const metadata = departmentMetadataFor(adopt(configOf(builderOwnedProcessWithoutTracks())));
        const routing = routeStage(metadata, "waitlist");

        expect(routing.routingSource).toBe("builder");
        expect(routing.builderMembership?.subject_type).toBe("candidate");
        expect(routing.builderMembership?.stage_key).toBe("waitlist");
    });

    it("10. a family at Lead and a child at Enrolling resolve on different grains at once", () => {
        /*
         * The mixed-grain claim, stated as the two lanes an operator sees side by side. One process,
         * one department, one resolver call each: the Lead lane must still be counting cases while
         * the Enrolling lane counts children. A single-grain regression would make these agree.
         */
        const metadata = departmentMetadataFor(adopt(configOf(builderOwnedProcessWithoutTracks())));

        const lead = routeStage(metadata, "lead");
        const enrolling = routeStage(metadata, "enrolling");

        expect(lead.builderMembership?.subject_type).toBe("case");
        expect(enrolling.builderMembership?.subject_type).toBe("child");
        expect(lead.builderMembership?.subject_type).not.toBe(enrolling.builderMembership?.subject_type);
    });

    it("the kill switch still overrides an adopted process", () => {
        // Adoption must not create a configuration the emergency switch cannot turn off.
        const metadata = departmentMetadataFor(adopt(configOf(builderOwnedProcessWithoutTracks())));
        process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER = "0";
        expect(isQueueMembershipFromBuilderEnabled(metadata)).toBe(false);
    });
});

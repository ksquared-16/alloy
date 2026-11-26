import { describe, expect, it } from "vitest";
import {
    applyEnrollmentTemplateToProcess,
    buildEnrollmentTemplateStageRecords,
    ENROLLMENT_STAGE_SPECS,
    ENROLLMENT_DEFAULT_TRACKS,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { defaultEnrollmentQueueMembershipForStage } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import {
    emptyLifecycleBuilderV1,
    parseLifecycleBuilderV1,
    stageKeysForProcess,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { businessProcessTracksConfigured } from "@/lib/businessProcesses/businessProcessConfigReader";
import { isQueueMembershipFromBuilderEnabled } from "@/lib/queues/queueMembershipFromBuilderFeatureFlag";
import { stagesForTrack } from "@/lib/businessProcesses/businessProcessConfigReader";
import { ENROLLMENT_TRACK_FAMILY_KEY } from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";

describe("Enrollment process template", () => {
    it("defines eight rollup stages across two tracks (qualification folded into lead)", () => {
        expect(ENROLLMENT_STAGE_SPECS).toHaveLength(8);
    });

    it("apply template adds tracks, stages, and split rule", () => {
        const process = {
            id: "p1",
            key: ENROLLMENT_PROCESS_KEY,
            name: "Enrollment",
            primary_entity: "opportunity" as const,
            sort_order: 0,
            is_active: true,
            stages: [],
        };
        const next = applyEnrollmentTemplateToProcess(process);
        expect(next.tracks_v1?.tracks).toHaveLength(2);
        expect(next.stages).toHaveLength(8);
        expect(next.tracks_v1?.split_rules[0]?.from_stage_key).toBe("decision");
    });

    it("family track stages map to case membership defaults", () => {
        for (const key of ["lead", "tour", "decision", "closed"]) {
            expect(defaultEnrollmentQueueMembershipForStage(key)?.subject_type).toBe("case");
        }
    });

    it("child track stages map to child or candidate membership defaults", () => {
        expect(defaultEnrollmentQueueMembershipForStage("waitlist")?.subject_type).toBe("candidate");
        expect(defaultEnrollmentQueueMembershipForStage("enrolling")?.subject_type).toBe("child");
    });

    it("enables builder routing when tracks configured", () => {
        const prev = process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER;
        delete process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER;
        const config = applyEnrollmentTemplateToProcess({
            id: "p1",
            key: ENROLLMENT_PROCESS_KEY,
            name: "Enrollment",
            primary_entity: "opportunity",
            sort_order: 0,
            is_active: true,
            stages: [],
        });
        const metadata = {
            [LIFECYCLE_BUILDER_METADATA_KEY]: {
                version: 1,
                active_process_id: config.id,
                processes: [config],
            },
        };
        expect(businessProcessTracksConfigured(metadata)).toBe(true);
        expect(isQueueMembershipFromBuilderEnabled(metadata)).toBe(true);
        if (prev === undefined) delete process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER;
        else process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER = prev;
    });

    it("stages filter by track from metadata", () => {
        const stages = buildEnrollmentTemplateStageRecords();
        const process = {
            id: "p1",
            key: ENROLLMENT_PROCESS_KEY,
            name: "Enrollment",
            primary_entity: "opportunity" as const,
            sort_order: 0,
            is_active: true,
            tracks_v1: ENROLLMENT_DEFAULT_TRACKS,
            stages,
        };
        expect(stagesForTrack(process, ENROLLMENT_TRACK_FAMILY_KEY).map((s) => s.key)).toEqual([
            "lead",
            "tour",
            "decision",
            "closed",
        ]);
    });

    it("legacy thirteen-stage processes still parse", () => {
        const legacy = parseLifecycleBuilderV1({
            version: 1,
            active_process_id: "p1",
            processes: [
                {
                    id: "p1",
                    key: ENROLLMENT_PROCESS_KEY,
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    stages: [
                        { id: "s1", key: "new_lead", label: "New Lead", sort_order: 0, is_active: true },
                    ],
                },
            ],
        });
        expect(legacy?.processes[0]?.stages).toHaveLength(1);
    });

    it("empty config has no processes", () => {
        expect(emptyLifecycleBuilderV1().processes).toHaveLength(0);
    });
});

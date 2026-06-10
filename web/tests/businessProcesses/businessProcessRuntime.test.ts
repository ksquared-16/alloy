import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseProcessTracksV1 } from "@/lib/businessProcesses/parseProcessTracksV1";
import {
    businessProcessTracksConfigured,
    stagesForTrack,
    splitRuleForStage,
} from "@/lib/businessProcesses/businessProcessConfigReader";
import { parseQueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import { resolveQueueMembershipForStage } from "@/lib/businessProcesses/resolveQueueMembership";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";

const root = resolve(__dirname, "../..");

describe("generic business process runtime", () => {
    it("queueMembershipV1.ts does not import enrollment template modules", () => {
        const src = readFileSync(resolve(root, "lib/lifecycle/queueMembershipV1.ts"), "utf8");
        expect(src).not.toMatch(/^import\s+.*enrollment/m);
        expect(src).not.toMatch(/^import\s+.*businessProcessTemplates/m);
        expect(src).not.toMatch(/^import\s+.*ENROLLMENT_/m);
    });

    it("parses billing/collections tracks without enrollment constants", () => {
        const tracks = parseProcessTracksV1({
            version: 1,
            tracks: [
                {
                    key: "payer_track",
                    label: "Payer Obligation",
                    subject: "payer_account",
                    sort_order: 0,
                },
            ],
            split_rules: [],
        });
        expect(tracks?.tracks[0]?.subject).toBe("payer_account");
    });

    it("billing process fixture renders stages from metadata", () => {
        const process: LifecycleBuilderProcessRecord = {
            id: "billing-1",
            key: "billing",
            name: "Billing",
            primary_entity: "opportunity",
            sort_order: 0,
            is_active: true,
            tracks_v1: {
                version: 1,
                tracks: [
                    { key: "payer_track", label: "Payer", subject: "payer_account", sort_order: 0 },
                ],
                split_rules: [],
            },
            stages: [
                {
                    id: "s1",
                    key: "past_due",
                    label: "Past Due",
                    track_key: "payer_track",
                    sort_order: 0,
                    is_active: true,
                    queue_membership_v1: {
                        version: 1,
                        lifecycle_key: "billing",
                        stage_key: "past_due",
                        subject_type: "case",
                        count_unit: "cases",
                        included_disposition_keys: [],
                        included_status_keys: ["past_due"],
                    },
                },
            ],
        };
        expect(stagesForTrack(process, "payer_track")).toHaveLength(1);
        const membership = resolveQueueMembershipForStage(process.stages[0], "past_due");
        expect(membership?.lifecycle_key).toBe("billing");
        expect(parseQueueMembershipV1(membership)).not.toBeNull();
    });

    it("detects tracks configured on any active process", () => {
        const metadata = {
            [LIFECYCLE_BUILDER_METADATA_KEY]: {
                version: 1,
                active_process_id: "billing-1",
                processes: [
                    {
                        id: "billing-1",
                        key: "billing",
                        name: "Billing",
                        primary_entity: "opportunity",
                        sort_order: 0,
                        is_active: true,
                        tracks_v1: {
                            version: 1,
                            tracks: [
                                {
                                    key: "payer_track",
                                    label: "Payer",
                                    subject: "payer_account",
                                    sort_order: 0,
                                },
                            ],
                            split_rules: [],
                        },
                        stages: [],
                    },
                ],
            },
        };
        expect(businessProcessTracksConfigured(metadata)).toBe(true);
    });

    it("split rules parse per_subject_outcomes and legacy per_child_outcomes", () => {
        const tracks = parseProcessTracksV1({
            version: 1,
            tracks: [{ key: "a", label: "A", subject: "subject_a", sort_order: 0 }],
            split_rules: [
                {
                    version: 1,
                    from_track_key: "a",
                    from_stage_key: "decision",
                    into_track_key: "b",
                    per_child_outcomes: [
                        { outcome_key: "path_a", label: "Path A", target_stage_key: "next" },
                    ],
                },
            ],
        });
        expect(tracks?.split_rules[0]?.per_subject_outcomes[0]?.outcome_key).toBe("path_a");
    });

    it("splitRuleForStage reads from process metadata", () => {
        const process: LifecycleBuilderProcessRecord = {
            id: "p1",
            key: "enrollment",
            name: "Enrollment",
            primary_entity: "opportunity",
            sort_order: 0,
            is_active: true,
            tracks_v1: {
                version: 1,
                tracks: [
                    { key: "family_track", label: "Family", subject: "family_case", sort_order: 0 },
                    { key: "child_track", label: "Child", subject: "child_track", sort_order: 1 },
                ],
                split_rules: [
                    {
                        version: 1,
                        from_track_key: "family_track",
                        from_stage_key: "decision",
                        into_track_key: "child_track",
                        per_subject_outcomes: [],
                    },
                ],
            },
            stages: [],
        };
        expect(splitRuleForStage(process, "decision")?.into_track_key).toBe("child_track");
    });
});

describe("module import safety", () => {
    it("evaluates generic parser chain without ReferenceError", async () => {
        await expect(import("@/lib/lifecycle/queueMembershipV1")).resolves.toBeDefined();
        await expect(import("@/lib/businessProcesses/resolveQueueMembership")).resolves.toBeDefined();
        await expect(import("@/lib/businessProcesses/businessProcessConfigReader")).resolves.toBeDefined();
        await expect(
            import("@/lib/businessProcessTemplates/enrollmentProcessTemplate"),
        ).resolves.toBeDefined();
    });
});

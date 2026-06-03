import { describe, expect, it } from "vitest";

import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 } from "@/lib/config/enrollmentPipelineQueueDefinitionV1";
import {
    __testing,
    isWaitlistCandidateGrainGloballyDisabled,
    resolveWaitlistCandidateGrainContext,
    resolveWaitlistPlacementConfigQueueKey,
} from "@/lib/queues/candidateGrainWaitlistQueue";
import { resolveQueueKeyFromDefinition } from "@/lib/config/queueDefinitionV2Runtime";
import { buildLifecycleWaitlistStageQueueDefinition } from "@/lib/lifecycle/lifecycleStageQueuePresentation";

const v2Bundle = loadQueueDefinitionBundle(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2);

describe("candidateGrainWaitlistQueue", () => {
    describe("resolveWaitlistCandidateGrainContext", () => {
        it("enables for v2 waitlist queue with candidate grain", () => {
            const ctx = resolveWaitlistCandidateGrainContext({
                normalized: v2Bundle.normalized,
                executableQueueKey: "waitlist",
            });
            expect(ctx).not.toBeNull();
            expect(ctx!.queueEntry.grain).toBe("candidate");
            expect(ctx!.filters.candidate_statuses).toEqual(["active", "paused"]);
        });

        it("does not enable for v1 config", () => {
            const v1Bundle = loadQueueDefinitionBundle(CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1);
            expect(
                resolveWaitlistCandidateGrainContext({
                    normalized: v1Bundle.normalized,
                    executableQueueKey: "waitlisted",
                })
            ).toBeNull();
        });

        it("does not enable for non-waitlist queues", () => {
            expect(
                resolveWaitlistCandidateGrainContext({
                    normalized: v2Bundle.normalized,
                    executableQueueKey: "new_leads",
                })
            ).toBeNull();
        });

        it("enables for lifecycle waitlist stage queue key", () => {
            const raw = buildLifecycleWaitlistStageQueueDefinition({
                stageKey: "waitlist",
                label: "Waitlist",
                statusKeys: ["waitlisted"],
            });
            const { normalized } = loadQueueDefinitionBundle(raw);
            const primary = normalized.queues[0]?.key ?? "";
            const ctx = resolveWaitlistCandidateGrainContext({
                normalized,
                executableQueueKey: primary,
            });
            expect(ctx).not.toBeNull();
            expect(ctx?.queueEntry.grain).toBe("candidate");
        });

        it("respects global disable env gate", () => {
            const prev = process.env.ALLOY_QUEUE_WAITLIST_CANDIDATE_GRAIN_DISABLED;
            process.env.ALLOY_QUEUE_WAITLIST_CANDIDATE_GRAIN_DISABLED = "1";
            expect(isWaitlistCandidateGrainGloballyDisabled()).toBe(true);
            expect(
                resolveWaitlistCandidateGrainContext({
                    normalized: v2Bundle.normalized,
                    executableQueueKey: "waitlist",
                })
            ).toBeNull();
            if (prev === undefined) delete process.env.ALLOY_QUEUE_WAITLIST_CANDIDATE_GRAIN_DISABLED;
            else process.env.ALLOY_QUEUE_WAITLIST_CANDIDATE_GRAIN_DISABLED = prev;
        });
    });

    it("waitlisted alias resolves to waitlist canonical key", () => {
        const resolution = resolveQueueKeyFromDefinition("waitlisted", v2Bundle.normalized.queues);
        expect(resolution.resolvedKey).toBe("waitlist");
        expect(resolution.matchedBy).toBe("alias");
    });

    it("maps placement config queue key to legacy waitlisted", () => {
        const waitlist = v2Bundle.normalized.queues.find((q) => q.key === "waitlist")!;
        expect(resolveWaitlistPlacementConfigQueueKey(waitlist)).toBe("waitlisted");
    });

    describe("child lifecycle soft filter", () => {
        it("allows rows without OCM outcome status", () => {
            expect(
                __testing.passesChildLifecycleFilter(
                    {
                        id: "pc-1",
                        opportunity_customer_members: null,
                    } as never,
                    ["waitlisted"]
                )
            ).toBe(true);
        });

        it("filters when OCM outcome is present and not allowed", () => {
            expect(
                __testing.passesChildLifecycleFilter(
                    {
                        id: "pc-1",
                        opportunity_customer_members: { outcome_status_key: "enrolled" },
                    } as never,
                    ["waitlisted"]
                )
            ).toBe(false);
        });

        it("passes when OCM outcome matches allowed set", () => {
            expect(
                __testing.passesChildLifecycleFilter(
                    {
                        id: "pc-1",
                        opportunity_customer_members: { outcome_status_key: "waitlisted" },
                    } as never,
                    ["waitlisted", "offer_pending"]
                )
            ).toBe(true);
        });
    });
});

describe("candidate grain vs case queue separation", () => {
    it("new_leads remains case grain in v2 bundle", () => {
        const entry = v2Bundle.normalized.queues.find((q) => q.key === "new_leads");
        expect(entry?.grain).toBe("case");
        expect(
            resolveWaitlistCandidateGrainContext({
                normalized: v2Bundle.normalized,
                executableQueueKey: "new_leads",
            })
        ).toBeNull();
    });
});

import { describe, expect, it } from "vitest";
import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { buildLifecycleWaitlistStageQueueDefinition } from "@/lib/lifecycle/lifecycleStageQueuePresentation";
import { resolveLifecycleVisibilityStatusKeys } from "@/lib/lifecycle/lifecycleVisibilityEvaluator";
import {
    __testing,
    resolveLifecycleWaitlistQueryContext,
    SYNTHETIC_WAITLIST_CANDIDATE_ID_PREFIX,
} from "@/lib/queues/candidateGrainWaitlistQueue";

describe("lifecycle waitlist visibility bridge", () => {
    const waitlistRaw = buildLifecycleWaitlistStageQueueDefinition({
        stageKey: "waitlist",
        label: "Waitlist",
        statusKeys: ["waitlisted"],
    });
    const { normalized } = loadQueueDefinitionBundle(waitlistRaw);
    const waitlistKey = normalized.queues[0]!.key;

    it("merges waitlisted status from queue_definition and metadata", () => {
        const keys = resolveLifecycleVisibilityStatusKeys({
            workUnitMetadata: {
                lifecycle_builder_owned_v1: { builder_owned: true },
                lifecycle_stage_key: "waitlist",
                status_keys: ["waitlisted"],
            },
            queueDefinition: waitlistRaw,
        });
        expect(keys).toContain("waitlisted");
    });

    it("resolveLifecycleWaitlistQueryContext enables lifecycle visibility without assignment", () => {
        const ctx = resolveLifecycleWaitlistQueryContext({
            workUnitMetadata: {
                lifecycle_builder_owned_v1: { builder_owned: true },
                lifecycle_stage_key: "waitlist",
                status_keys: ["waitlisted"],
            },
            queueDefinition: waitlistRaw,
        });
        expect(ctx.use_lifecycle_visibility).toBe(true);
        expect(ctx.status_keys).toContain("waitlisted");
        expect(ctx.lifecycle_stage_key).toBe("waitlist");
    });

    it("synthetic candidate rows preserve opportunity visibility when no placement_candidate", () => {
        const opp = {
            id: "opp-1",
            name: "Test",
            title: null,
            status_key: "waitlisted",
            customer_id: null,
            primary_person_id: null,
            primary_contact_id: null,
            work_unit_id: "other-wu",
            location_id: null,
            metadata: null,
            created_at: "2026-01-01",
            updated_at: "2026-01-02",
        };
        const row = __testing.syntheticWaitlistCandidateRow(opp, "org-1");
        expect(row.id).toBe(`${SYNTHETIC_WAITLIST_CANDIDATE_ID_PREFIX}opp-1`);
        expect(row.opportunity_id).toBe("opp-1");
        const oppSet = new Set(["opp-1"]);
        const candSet = new Set<string>();
        expect(
            __testing.waitlistRowMatchesMatchedSet(
                { id: row.id, opportunity_id: "opp-1" },
                candSet,
                oppSet
            )
        ).toBe(true);
    });

    it("waitlist queue key is lifecycle_* from stage definition", () => {
        expect(waitlistKey.startsWith("lifecycle_")).toBe(true);
    });
});

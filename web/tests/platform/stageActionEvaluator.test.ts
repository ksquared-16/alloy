import { describe, expect, it } from "vitest";
import {
    evaluateActionForStage,
    evaluateStageActions,
    sortEvaluatedActions,
} from "@/lib/platform/actions/stageActionEvaluator";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";

const enrollmentCatalog: StageActionCatalogV1 = {
    version: 1,
    candidate_actions: [
        { action_key: "waitlist_child", recommendation: "recommended" },
        { action_key: "enroll_child", recommendation: "ready" },
    ],
};

describe("evaluateActionForStage", () => {
    it("returns recommended when action is in catalog with recommended and eligible", () => {
        const result = evaluateActionForStage({
            actionKey: "waitlist_child",
            stageCatalog: enrollmentCatalog,
            subjectGrain: "opportunity_customer_member",
            eligibility: { eligible: true },
        });
        expect(result.state).toBe("recommended");
    });

    it("returns ready when action is in catalog with ready recommendation", () => {
        const result = evaluateActionForStage({
            actionKey: "enroll_child",
            stageCatalog: enrollmentCatalog,
            subjectGrain: "opportunity_customer_member",
            eligibility: { eligible: true },
        });
        expect(result.state).toBe("ready");
    });

    it("returns ready when action is not in stage catalog (eligible but not configured)", () => {
        const result = evaluateActionForStage({
            actionKey: "update_child_enrollment_status",
            stageCatalog: enrollmentCatalog,
            subjectGrain: "opportunity_customer_member",
            eligibility: { eligible: true },
        });
        expect(result.state).toBe("ready");
    });

    it("returns blocked when eligibility fails", () => {
        const result = evaluateActionForStage({
            actionKey: "waitlist_child",
            stageCatalog: enrollmentCatalog,
            subjectGrain: "opportunity_customer_member",
            eligibility: { eligible: false, blockedReason: "Missing required fields" },
        });
        expect(result.state).toBe("blocked");
        expect(result.reason).toBe("Missing required fields");
    });

    it("returns unavailable when grain does not match", () => {
        const result = evaluateActionForStage({
            actionKey: "close_lead",
            stageCatalog: enrollmentCatalog,
            subjectGrain: "opportunity_customer_member",
            eligibility: { eligible: true },
        });
        expect(result.state).toBe("unavailable");
    });

    it("returns recommended even with no catalog when action has recommendation in null catalog", () => {
        const result = evaluateActionForStage({
            actionKey: "waitlist_child",
            stageCatalog: null,
            subjectGrain: "opportunity_customer_member",
            eligibility: { eligible: true },
        });
        // No catalog → default to ready
        expect(result.state).toBe("ready");
    });

    it("uses override_label from stage catalog when present", () => {
        const catalogWithOverride: StageActionCatalogV1 = {
            version: 1,
            candidate_actions: [
                { action_key: "waitlist_child", recommendation: "recommended", override_label: "Add to Waitlist" },
            ],
        };
        const result = evaluateActionForStage({
            actionKey: "waitlist_child",
            stageCatalog: catalogWithOverride,
            subjectGrain: "opportunity_customer_member",
            eligibility: { eligible: true },
        });
        expect(result.label).toBe("Add to Waitlist");
    });
});

describe("evaluateStageActions", () => {
    it("evaluates a batch of action keys", () => {
        const results = evaluateStageActions({
            resolvedActionKeys: ["waitlist_child", "enroll_child", "update_child_enrollment_status"],
            stageCatalog: enrollmentCatalog,
            subjectGrain: "opportunity_customer_member",
        });
        expect(results).toHaveLength(3);
        expect(results.find((r) => r.key === "waitlist_child")?.state).toBe("recommended");
        expect(results.find((r) => r.key === "enroll_child")?.state).toBe("ready");
        expect(results.find((r) => r.key === "update_child_enrollment_status")?.state).toBe("ready");
    });
});

describe("sortEvaluatedActions", () => {
    it("orders recommended before ready before blocked", () => {
        const actions = [
            { key: "a", label: "A", state: "blocked" as const },
            { key: "b", label: "B", state: "ready" as const },
            { key: "c", label: "C", state: "recommended" as const },
        ];
        const sorted = sortEvaluatedActions(actions);
        expect(sorted[0]?.state).toBe("recommended");
        expect(sorted[1]?.state).toBe("ready");
        expect(sorted[2]?.state).toBe("blocked");
    });
});

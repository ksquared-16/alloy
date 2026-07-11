import { describe, expect, it } from "vitest";
import { computeCommitIdempotencyKey, computeDecisionVersion } from "@/lib/intake/proposals/decisionVersion";

describe("decisionVersion", () => {
    it("is stable for equivalent normalized decisions", () => {
        const a = computeDecisionVersion({
            proposal_id: "p1",
            field_decisions: [{ provider_ref: "child.child_first_name", decision: "approve" }],
        });
        const b = computeDecisionVersion({
            proposal_id: "p1",
            field_decisions: [{ provider_ref: "child.child_first_name", decision: "approve" }, { provider_ref: "child.child_first_name", decision: "approve" }],
        });
        expect(a).toBe(b);
        expect(computeCommitIdempotencyKey("p1", a)).toHaveLength(32);
    });
});

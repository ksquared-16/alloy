import { describe, expect, it } from "vitest";

import {
    summarizeCommitPlan,
    summarizeIdentityConfidence,
} from "@/lib/pos/processingIdentity/operator/reviewSummary";

describe("summarizeIdentityConfidence", () => {
    it("reads as clear when nothing matches an existing record", () => {
        const c = summarizeIdentityConfidence([
            { subject_role: "parent", decision_action: null, candidates: [] },
            { subject_role: "child", decision_action: null, candidates: [{ recordId: "none" }] },
        ]);
        expect(c.level).toBe("clear");
        expect(c.newRecords).toBe(2);
        expect(c.needsDecision).toBe(0);
    });

    it("asks for a decision only while a plausible match is unsettled", () => {
        const c = summarizeIdentityConfidence([
            { subject_role: "parent", decision_action: null, candidates: [{ recordId: "p-1" }] },
        ]);
        expect(c.level).toBe("needs_decision");
        expect(c.needsDecision).toBe(1);
        expect(c.summary).toMatch(/choose before confirming/i);
    });

    it("does not re-ask once the operator chose create-new over a plausible match", () => {
        const c = summarizeIdentityConfidence([
            { subject_role: "parent", decision_action: "create_new", candidates: [{ recordId: "p-1" }] },
        ]);
        expect(c.level).toBe("clear");
        expect(c.newRecords).toBe(1);
    });

    it("counts linked and updated subjects as matched", () => {
        const c = summarizeIdentityConfidence([
            { subject_role: "parent", decision_action: "link_existing", candidates: [{ recordId: "p-1" }] },
            { subject_role: "child", decision_action: "update_existing", candidates: [{ recordId: "c-1" }] },
        ]);
        expect(c.matched).toBe(2);
        expect(c.level).toBe("clear");
        expect(c.summary).toMatch(/Matched 2 existing records/);
    });
});

describe("summarizeCommitPlan", () => {
    it("states what will exist without plan ids, hashes or risk bands", () => {
        const s = summarizeCommitPlan([
            { kind: "CREATE", label: "Create household · new household", included: true },
            { kind: "CREATE", label: "Create child · new child", included: true },
            { kind: "LINK", label: "Link household · link guardian to household", included: true },
        ]);
        expect(s.lines).toEqual(["Create household", "Create child", "Link household"]);
        expect(s.recordCount).toBe(2);
    });

    it("ignores excluded operations", () => {
        const s = summarizeCommitPlan([
            { kind: "CREATE", label: "Create person", included: true },
            { kind: "CREATE", label: "Create person", included: false },
        ]);
        expect(s.lines).toHaveLength(1);
        expect(s.recordCount).toBe(1);
    });
});

/**
 * A family whose children have diverged reads as counts in the tenant's stage labels — "1 Offer
 * pending · 1 undecided" — and children still at the family's own stage read "undecided", last.
 */
import { describe, expect, it } from "vitest";
import { buildPartialQueueRowContext } from "@/lib/workUnits/buildPartialQueueRowContext";

const queue = {
    key: "decision",
    label: "Decision",
    lifecycle_key: "enrollment",
    stage_key: "decision",
    stage_labels_by_key: { decision: "Decision", offered: "Offer pending", waitlist: "Waitlist" },
};

const row = (counts: Array<{ stageKey: string; count: number }>) => ({
    id: "opp-1",
    name: "Q Family",
    status_key: "decision",
    _effective_stage_counts: { contextStageKey: "decision", counts },
});

describe("mixed child-stage row label", () => {
    it("counts each stage in configured words, undecided last", () => {
        const ctx = buildPartialQueueRowContext({ row: row([{ stageKey: "decision", count: 1 }, { stageKey: "offered", count: 1 }]), queue });
        expect(ctx.row_stage).toContain("1 Offer pending · 1 undecided");
    });

    it("names two child stages without an undecided child", () => {
        const ctx = buildPartialQueueRowContext({ row: row([{ stageKey: "offered", count: 1 }, { stageKey: "waitlist", count: 2 }]), queue });
        expect(ctx.row_stage).toContain("1 Offer pending · 2 Waitlist");
    });

    it("falls back to the ordinary label when the children agree", () => {
        const ctx = buildPartialQueueRowContext({ row: row([{ stageKey: "offered", count: 2 }]), queue });
        expect(ctx.row_stage).not.toContain("·");
    });
});

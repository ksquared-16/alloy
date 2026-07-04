import { describe, expect, it } from "vitest";
import {
    queueRowVariantRuleMatches,
    resolveQueueRowVariant,
    type QueueRowVariantMatchInput,
} from "@/lib/presentation/runtime/resolveQueueRowVariant";
import type { QueueRowVariant } from "@/lib/layout/queueRecordLayoutV3";

function variant(over: Partial<QueueRowVariant> & Pick<QueueRowVariant, "id" | "priority">): QueueRowVariant {
    return {
        label: over.label ?? over.id,
        columns: over.columns ?? [],
        appliesWhen: over.appliesWhen,
        sort: over.sort,
        fixedControls: over.fixedControls,
        ...over,
    };
}

const TOUR = variant({ id: "tour", priority: 10, appliesWhen: { stage_key: ["tour"] } });
const WAITLIST = variant({ id: "waitlist", priority: 20, appliesWhen: { grain: ["candidate"] } });
const ENROLLING = variant({ id: "enrolling", priority: 30, appliesWhen: { stage_key: ["enrolling"], status_key: ["enrolling"] } });
const DEFAULT = variant({ id: "default", priority: 100 }); // no rule → catch-all

describe("queueRowVariantRuleMatches", () => {
    const base: QueueRowVariantMatchInput = { stageKey: "tour", statusKey: "open", grain: "case" };

    it("catch-all (no rule / empty rule) always matches", () => {
        expect(queueRowVariantRuleMatches(undefined, base)).toBe(true);
        expect(queueRowVariantRuleMatches({}, base)).toBe(true);
    });

    it("single clause matches case-insensitively", () => {
        expect(queueRowVariantRuleMatches({ stage_key: ["Tour"] }, base)).toBe(true);
        expect(queueRowVariantRuleMatches({ stage_key: ["waitlist"] }, base)).toBe(false);
    });

    it("all present clauses must match (AND)", () => {
        expect(queueRowVariantRuleMatches({ stage_key: ["tour"], grain: ["case"] }, base)).toBe(true);
        expect(queueRowVariantRuleMatches({ stage_key: ["tour"], grain: ["candidate"] }, base)).toBe(false);
    });

    it("a constrained clause with no row value cannot match", () => {
        expect(queueRowVariantRuleMatches({ work_view_id: ["wv-1"] }, base)).toBe(false);
        expect(queueRowVariantRuleMatches({ work_view_id: ["wv-1"] }, { ...base, workViewId: "wv-1" })).toBe(true);
    });

    it("a shared variant matches any listed stage", () => {
        const shared = { stage_key: ["tour", "decision"] };
        expect(queueRowVariantRuleMatches(shared, { stageKey: "tour" })).toBe(true);
        expect(queueRowVariantRuleMatches(shared, { stageKey: "decision" })).toBe(true);
        expect(queueRowVariantRuleMatches(shared, { stageKey: "lead" })).toBe(false);
    });
});

describe("resolveQueueRowVariant", () => {
    const variants = [ENROLLING, WAITLIST, TOUR, DEFAULT];

    it("returns null when there are no variants (caller uses top-level Default columns)", () => {
        expect(resolveQueueRowVariant(undefined, { stageKey: "tour" })).toBeNull();
        expect(resolveQueueRowVariant([], { stageKey: "tour" })).toBeNull();
    });

    it("selects the matching variant by grain (waitlist)", () => {
        expect(resolveQueueRowVariant(variants, { grain: "candidate" })?.id).toBe("waitlist");
    });

    it("evaluates in priority order — first match wins", () => {
        // A tour-stage candidate matches TOUR (prio 10) before WAITLIST (prio 20).
        expect(resolveQueueRowVariant(variants, { stageKey: "tour", grain: "candidate" })?.id).toBe("tour");
    });

    it("falls through to the catch-all Default variant when nothing else matches", () => {
        expect(resolveQueueRowVariant(variants, { stageKey: "lead", grain: "case" })?.id).toBe("default");
    });

    it("requires all clauses for a multi-clause variant (enrolling)", () => {
        expect(resolveQueueRowVariant([ENROLLING], { stageKey: "enrolling", statusKey: "enrolling" })?.id).toBe("enrolling");
        expect(resolveQueueRowVariant([ENROLLING], { stageKey: "enrolling", statusKey: "open" })).toBeNull();
    });
});

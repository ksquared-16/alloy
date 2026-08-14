import { describe, expect, it } from "vitest";
import {
    queueRowVariantRuleMatches,
    resolveQueueRowVariant,
    sanitizeQueueRowVariantRule,
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

    it("ignores reserved conditions — they do not affect matching", () => {
        const withConditions = {
            stage_key: ["tour"],
            conditions: [{ type: "equals" as const, path: "row.missing", value: "yes" }],
        };
        expect(queueRowVariantRuleMatches(withConditions, base)).toBe(true);
    });
});

describe("sanitizeQueueRowVariantRule", () => {
    it("strips reserved conditions while preserving typed clauses", () => {
        const sanitized = sanitizeQueueRowVariantRule({
            stage_key: ["waitlist"],
            conditions: [{ type: "exists", path: "sibling.names" }],
        });
        expect(sanitized).toEqual({ stage_key: ["waitlist"] });
        expect(sanitizeQueueRowVariantRule(undefined)).toBeUndefined();
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

    it("does not let stage-only Waitlist (candidate subjectFocus) override family/case Default", () => {
        // Firefly footgun: Waitlist appliesWhen was only stage_key=waitlist + placement_candidate_child.
        // Family-grain All/Tours rows must keep published Default (Household name + Stage).
        const fireflyWaitlist = variant({
            id: "variant-32",
            priority: 10,
            subjectFocus: "placement_candidate_child",
            appliesWhen: { stage_key: ["waitlist"] },
            columns: [
                {
                    id: "col-1",
                    label: "",
                    width: "identity",
                    rowIndex: 0,
                    builderSlot: "identity",
                    scope: { type: "main_record" },
                    blocks: [
                        {
                            id: "b1",
                            type: "field_group",
                            layout: "stack",
                            fields: [{ id: "f1", label: "Child", display: "link", fieldKey: "child.name" }],
                        },
                    ],
                },
            ],
        });
        expect(
            resolveQueueRowVariant([fireflyWaitlist], {
                stageKey: "waitlist",
                grain: "case",
                workViewId: "new_work_view_6",
            }),
        ).toBeNull();
        expect(
            resolveQueueRowVariant([fireflyWaitlist], {
                stageKey: "waitlist",
                grain: "candidate",
                workViewId: "new_work_view_4",
            })?.id,
        ).toBe("variant-32");
    });

    it("allows candidate-primary variants on family grain only when grain clause is explicit", () => {
        const explicit = variant({
            id: "family-waitlist",
            priority: 10,
            subjectFocus: "placement_candidate_child",
            appliesWhen: { stage_key: ["waitlist"], grain: ["case"] },
        });
        expect(
            resolveQueueRowVariant([explicit], { stageKey: "waitlist", grain: "case" })?.id,
        ).toBe("family-waitlist");
    });
});

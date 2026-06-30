import { describe, expect, it } from "vitest";
import {
    createEmptyWorkViewDraft,
    normalizeWorkViewsDisplayOrder,
    parseWorkViewsV1,
    resolveWorkViewMatchV1,
    slugifyWorkViewId,
    workViewsV1Equal,
} from "@/lib/lifecycle/workViewsConfigV1";
import { resolveProcessWorkViews } from "@/lib/lifecycle/workViewsCompatibility";

describe("work_views_v1 metadata", () => {
    it("parses process-level work view rows and normalizes legacy condition keys", () => {
        const parsed = parseWorkViewsV1([
            {
                id: "tours_today",
                label: "Tours today",
                mission: "Help tours arrive",
                filters_v1: [{ field_key: "status", operator: "equals", value: "Scheduled" }],
                sort_v1: { field_key: "tour_time", direction: "asc" },
                visible_in_runtime: true,
                display_order: 1,
            },
        ]);
        expect(parsed?.[0]?.label).toBe("Tours today");
        // Phase 5 — legacy generic `status` normalizes to canonical typed `opportunity_status` on load.
        expect(parsed?.[0]?.filters_v1?.[0]?.field_key).toBe("opportunity_status");
    });

    it("normalizes legacy stage / location keys to canonical typed keys", () => {
        const parsed = parseWorkViewsV1([
            {
                id: "legacy_view",
                label: "Legacy view",
                filters_v1: [
                    { field_key: "stage", operator: "equals", value: "Lead" },
                    { field_key: "location", operator: "equals", value: "site-1" },
                ],
            },
        ]);
        expect(parsed?.[0]?.filters_v1?.map((f) => f.field_key)).toEqual(["opportunity_stage", "site"]);
    });

    it("seeds from stage perspectives when process views absent", () => {
        const effective = resolveProcessWorkViews({
            process: {
                id: "p1",
                key: "enrollment",
                name: "Enrollment",
                primary_entity: "opportunity",
                sort_order: 0,
                is_active: true,
                stages: [
                    {
                        id: "s1",
                        key: "lead",
                        label: "Lead",
                        sort_order: 0,
                        is_active: true,
                        perspectives_v1: [
                            {
                                queue_key: "new_families",
                                label: "New families today",
                                mission: "Respond quickly",
                            },
                        ],
                    },
                ],
            },
            saved: null,
        });
        expect(effective[0]?.label).toBe("New families today");
        expect(effective[0]?.compat_queue_key).toBe("new_families");
    });

    it("normalizes display order", () => {
        const rows = normalizeWorkViewsDisplayOrder([
            { ...createEmptyWorkViewDraft("B"), id: slugifyWorkViewId("b"), display_order: 2 },
            { ...createEmptyWorkViewDraft("A"), id: slugifyWorkViewId("a"), display_order: 1 },
        ]);
        expect(rows[0]?.label).toBe("A");
    });

    it("detects equality", () => {
        const a = [createEmptyWorkViewDraft("Same")];
        const b = [createEmptyWorkViewDraft("Same")];
        a[0]!.id = b[0]!.id = "same";
        expect(workViewsV1Equal(a, b)).toBe(true);
    });

    it("V3 — parses match combinator, defaulting legacy/absent to AND", () => {
        // Explicit `any` (OR) persists.
        const orView = parseWorkViewsV1([
            { id: "or_view", label: "Any", match: "any", filters_v1: [{ field_key: "opportunity_status", operator: "equals", value: "open" }] },
        ]);
        expect(orView?.[0]?.match).toBe("any");

        // Legacy view with no `match` loads safely — undefined, resolving to AND.
        const legacy = parseWorkViewsV1([
            { id: "legacy", label: "Legacy", filters_v1: [{ field_key: "status", operator: "equals", value: "open" }] },
        ]);
        expect(legacy?.[0]?.match).toBeUndefined();
        expect(resolveWorkViewMatchV1(legacy?.[0]?.match)).toBe("all");

        // Garbage match value is not silently reinterpreted — falls back to AND.
        expect(resolveWorkViewMatchV1("sometimes")).toBe("all");
        expect(resolveWorkViewMatchV1("any")).toBe("any");
    });
});

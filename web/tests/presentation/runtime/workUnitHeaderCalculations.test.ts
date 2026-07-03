import { describe, expect, it } from "vitest";

import type { SurfaceDoc } from "@/lib/platform/surfaceBuilder/surfaceDefinition";
import { findOperationalCalculation } from "@/lib/analytics/calculations/registry";
import {
    fallbackWorkUnitHeaderCards,
    seedWorkUnitHeaderCards,
    workUnitHeaderCardsFromDoc,
    workUnitHeaderCalculationKeys,
} from "@/lib/presentation/runtime/workUnitHeaderCards";

/* ------------------------------------------------------------------------------------ */
/* Published-surface fixture: a builder SurfaceDoc as GET                                  */
/* /api/admin/analytics/surfaces/work_unit_header/doc returns it (single implicit          */
/* section; each card = { contentId, config: { rendererKey, visibility, title?, … } }).    */
/* ------------------------------------------------------------------------------------ */

function card(
    contentId: string | null,
    config: Record<string, unknown> = {},
): SurfaceDoc["sections"][number]["cards"][number] {
    return { instanceId: `i-${contentId ?? "null"}`, cardTypeKey: "kpi", contentId, config };
}

function doc(cards: SurfaceDoc["sections"][number]["cards"]): SurfaceDoc {
    return { sections: [{ sectionId: "__implicit__", title: "", cards }] };
}

describe("WU.HEADER_CALCULATIONS — published surface doc → header card VMs", () => {
    it("maps active cards in document order, deriving vizType from rendererKey", () => {
        const cards = workUnitHeaderCardsFromDoc(
            doc([
                card("ops.needs_attention_count", { rendererKey: "kpi_card", visibility: "on" }),
                card("ops.work_overdue_count", { rendererKey: "trend_card", visibility: "on" }),
            ]),
        );
        expect(cards.map((c) => c.sourceKey)).toEqual([
            "ops.needs_attention_count",
            "ops.work_overdue_count",
        ]);
        expect(cards.map((c) => c.vizType)).toEqual(["kpi", "trend"]);
        expect(cards.map((c) => c.sortOrder)).toEqual([0, 10]);
        // No-data contract at seed: values refine in place from the warm cache.
        expect(cards.every((c) => c.formattedValue === "—" && c.status === "unknown")).toBe(true);
    });

    it("excludes cards toggled off (visibility === 'off')", () => {
        const cards = workUnitHeaderCardsFromDoc(
            doc([
                card("ops.needs_attention_count", { rendererKey: "kpi_card", visibility: "on" }),
                card("ops.work_overdue_count", { rendererKey: "kpi_card", visibility: "off" }),
            ]),
        );
        expect(cards.map((c) => c.sourceKey)).toEqual(["ops.needs_attention_count"]);
    });

    it("configured config.title overrides the registry label", () => {
        const [c] = workUnitHeaderCardsFromDoc(
            doc([card("ops.needs_attention_count", { rendererKey: "kpi_card", title: "  Needs eyes  " })]),
        );
        expect(c?.label).toBe("Needs eyes");
    });

    it("falls back to the governed registry label when no title is configured", () => {
        const [c] = workUnitHeaderCardsFromDoc(
            doc([card("ops.needs_attention_count", { rendererKey: "kpi_card" })]),
        );
        expect(c?.label).toBe(findOperationalCalculation("ops.needs_attention_count")?.label);
    });

    it("carries builder accent, mapping 'auto' → null (derive from status at render)", () => {
        const cards = workUnitHeaderCardsFromDoc(
            doc([
                card("ops.needs_attention_count", { rendererKey: "kpi_card", accent: "amber" }),
                card("ops.work_overdue_count", { rendererKey: "kpi_card", accent: "auto" }),
            ]),
        );
        expect(cards[0]?.accent).toBe("amber");
        expect(cards[1]?.accent).toBeNull();
    });

    it("maps showHealthChip 'on' → true, anything else → false", () => {
        const cards = workUnitHeaderCardsFromDoc(
            doc([
                card("ops.needs_attention_count", { rendererKey: "kpi_card", showHealthChip: "on" }),
                card("ops.work_overdue_count", { rendererKey: "kpi_card", showHealthChip: "off" }),
            ]),
        );
        expect(cards[0]?.showHealthChip).toBe(true);
        expect(cards[1]?.showHealthChip).toBe(false);
    });

    it("filters unknown / stale calculation bindings (never crashes the strip)", () => {
        const cards = workUnitHeaderCardsFromDoc(
            doc([
                card("ops.needs_attention_count", { rendererKey: "kpi_card" }),
                card("not.a.real.metric", { rendererKey: "kpi_card" }),
                card(null, { rendererKey: "kpi_card" }),
            ]),
        );
        expect(cards.map((c) => c.sourceKey)).toEqual(["ops.needs_attention_count"]);
    });

    it("dedupes a repeated contentId (a metric appears at most once in a header)", () => {
        const cards = workUnitHeaderCardsFromDoc(
            doc([
                card("ops.needs_attention_count", { rendererKey: "kpi_card" }),
                card("ops.needs_attention_count", { rendererKey: "trend_card" }),
            ]),
        );
        expect(cards).toHaveLength(1);
        expect(cards[0]?.vizType).toBe("kpi");
    });

    it("returns [] for an empty / null / section-less doc", () => {
        expect(workUnitHeaderCardsFromDoc(doc([]))).toEqual([]);
        expect(workUnitHeaderCardsFromDoc(null)).toEqual([]);
        expect(workUnitHeaderCardsFromDoc(undefined)).toEqual([]);
        expect(workUnitHeaderCardsFromDoc({ sections: [] })).toEqual([]);
    });
});

describe("WU.HEADER_CALCULATIONS — seed / fallback (unpublished orgs)", () => {
    it("seeds from the published doc when it has cards (fallback stays out)", () => {
        const cards = seedWorkUnitHeaderCards(
            doc([card("ops.needs_attention_count", { rendererKey: "kpi_card" })]),
        );
        expect(cards.map((c) => c.sourceKey)).toEqual(["ops.needs_attention_count"]);
    });

    it("falls back to the code-owned default keys ONLY when the doc has no cards", () => {
        for (const empty of [null, undefined, doc([])] as const) {
            const cards = seedWorkUnitHeaderCards(empty);
            expect(cards.length).toBeGreaterThan(0);
            for (const c of cards) {
                expect(c.formattedValue).toBe("—");
                expect(c.status).toBe("unknown");
                const registryLabel = findOperationalCalculation(c.sourceKey)?.label;
                if (registryLabel) expect(c.label).toBe(registryLabel);
            }
        }
    });

    it("fallbackWorkUnitHeaderCards derives labels from the registry (no hardcoded strings)", () => {
        const cards = fallbackWorkUnitHeaderCards();
        expect(cards.length).toBeGreaterThan(0);
        for (const c of cards) {
            const registryLabel = findOperationalCalculation(c.sourceKey)?.label;
            if (registryLabel) expect(c.label).toBe(registryLabel);
        }
    });
});

describe("WU.HEADER_CALCULATIONS — refinement key extraction", () => {
    it("exposes only governed OIP keys for refinement, deduped", () => {
        const cards = workUnitHeaderCardsFromDoc(
            doc([
                card("ops.needs_attention_count", { rendererKey: "kpi_card" }),
                card("ops.work_overdue_count", { rendererKey: "kpi_card" }),
            ]),
        );
        expect(workUnitHeaderCalculationKeys(cards)).toEqual([
            "ops.needs_attention_count",
            "ops.work_overdue_count",
        ]);
    });
});

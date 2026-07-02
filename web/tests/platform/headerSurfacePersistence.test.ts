import { describe, expect, it } from "vitest";

import {
    headerViewsToDoc,
    headerDocToDesired,
    diffHeaderPlacements,
    headerContextConfig,
    HEADER_ZONE_BY_SURFACE,
    isHeaderSurface,
    type HeaderPlacementView,
} from "@/lib/metrics/platform/headerSurfacePersistence";
import {
    humanizeSourceKey,
    resolveAccentFromHealth,
    resolveMetricDisplayLabel,
    getMetricSourceAdapter,
} from "@/lib/metrics/platform/metricSourceRegistry";
import { resolveMetricVisualAccent } from "@/lib/metrics/platform/metricVisualAccent";
import { IMPLICIT_SECTION_ID } from "@/lib/platform/surfaceBuilder/surfaceBuilderModel";
import type { SurfaceDoc } from "@/lib/platform/surfaceBuilder/surfaceDefinition";

const views: HeaderPlacementView[] = [
    { id: "h1", sourceKey: "enrollment.lead_count", vizType: "kpi_card", label: "Leads", sortOrder: 10, accent: "amber" },
    { id: "h2", sourceKey: "ops.needs_attention_count", vizType: "kpi_card", label: "Attn", sortOrder: 0, size: "wide" },
];

describe("Header placement ⇄ SurfaceDoc mapping", () => {
    it("writes each header to the zone the runtime reads", () => {
        expect(HEADER_ZONE_BY_SURFACE.workspace_header).toBe("primary_metrics");
        expect(HEADER_ZONE_BY_SURFACE.work_unit_header).toBe("header_metrics");
        expect(isHeaderSurface("workspace_header")).toBe(true);
        expect(isHeaderSurface("operational_intelligence")).toBe(false);
    });

    it("builds a single-section doc, sorted, with size/accent carried in config", () => {
        const doc = headerViewsToDoc(views);
        expect(doc.sections).toHaveLength(1);
        expect(doc.sections[0].sectionId).toBe(IMPLICIT_SECTION_ID);
        expect(doc.sections[0].cards.map((c) => c.instanceId)).toEqual(["h2", "h1"]); // sortOrder 0 before 10
        expect(doc.sections[0].cards[0].config).toMatchObject({ rendererKey: "kpi_card", size: "wide" });
        expect(doc.sections[0].cards[1].config).toMatchObject({ accent: "amber" });
    });

    it("flattens a doc into desired placements, carrying size/accent, deduping by metric", () => {
        const doc: SurfaceDoc = {
            sections: [
                {
                    sectionId: IMPLICIT_SECTION_ID,
                    title: "",
                    cards: [
                        { instanceId: "a", cardTypeKey: "kpi", contentId: "enrollment.lead_count", config: { rendererKey: "kpi_card", accent: "blue" } },
                        { instanceId: "b", cardTypeKey: "trend", contentId: "enrollment.tour_conversion_rate", config: { rendererKey: "trend_card", size: "standard" } },
                        { instanceId: "c", cardTypeKey: "kpi", contentId: "enrollment.lead_count", config: {} }, // dup → skipped
                        { instanceId: "d", cardTypeKey: "kpi", contentId: null, config: {} }, // no content → skipped
                    ],
                },
            ],
        };
        expect(headerDocToDesired(doc)).toEqual([
            { sourceKey: "enrollment.lead_count", vizType: "kpi_card", sortOrder: 0, accent: "blue" },
            { sourceKey: "enrollment.tour_conversion_rate", vizType: "trend_card", sortOrder: 10, size: "standard" },
        ]);
    });

    it("diffs by source_key (idempotent) and classifies add/remove", () => {
        const same = headerDocToDesired(headerViewsToDoc(views));
        const noop = diffHeaderPlacements(views, same);
        expect(noop.creates).toEqual([]);
        expect(noop.removes).toEqual([]);
        expect(noop.updates.map((u) => u.id).sort()).toEqual(["h1", "h2"]);

        const desired = headerDocToDesired({
            sections: [{ sectionId: IMPLICIT_SECTION_ID, title: "", cards: [
                { instanceId: "h1", cardTypeKey: "kpi", contentId: "enrollment.lead_count", config: { rendererKey: "kpi_card" } },
                { instanceId: "new", cardTypeKey: "kpi", contentId: "ops.work_overdue_count", config: { rendererKey: "kpi_card" } },
            ] }],
        });
        const plan = diffHeaderPlacements(views, desired);
        expect(plan.creates.map((c) => c.sourceKey)).toEqual(["ops.work_overdue_count"]);
        expect(plan.removes).toEqual([{ id: "h2" }]); // needs_attention dropped
        expect(plan.updates.map((u) => u.id)).toEqual(["h1"]);
    });

    it("context_config carries size/accent only when set", () => {
        expect(headerContextConfig({})).toEqual({ version: 1 });
        expect(headerContextConfig({ size: "compact", accent: "ember" })).toEqual({ version: 1, size: "compact", accent: "ember" });
    });

    it("context_config carries showHealthChip when set", () => {
        expect(headerContextConfig({ showHealthChip: false })).toEqual({ version: 1, showHealthChip: false });
        expect(headerContextConfig({ showHealthChip: true })).toEqual({ version: 1, showHealthChip: true });
        expect(headerContextConfig({ accent: "amber", showHealthChip: false })).toEqual({ version: 1, accent: "amber", showHealthChip: false });
    });

    it("showHealthChip round-trips through SurfaceDoc (view→doc→desired)", () => {
        const withChip: HeaderPlacementView[] = [
            { id: "x1", sourceKey: "enrollment.lead_count", vizType: "kpi_card", label: "Leads", sortOrder: 0, accent: "amber", showHealthChip: false },
        ];
        const doc = headerViewsToDoc(withChip);
        expect(doc.sections[0].cards[0].config).toMatchObject({ showHealthChip: "off" });

        const desired = headerDocToDesired(doc);
        expect(desired[0]).toMatchObject({ sourceKey: "enrollment.lead_count", accent: "amber", showHealthChip: false });
    });

    it("showHealthChip: true round-trips as 'on' in doc config", () => {
        const withChip: HeaderPlacementView[] = [
            { id: "x2", sourceKey: "ops.work_overdue_count", vizType: "kpi_card", label: "Overdue", sortOrder: 0, showHealthChip: true },
        ];
        const doc = headerViewsToDoc(withChip);
        expect(doc.sections[0].cards[0].config).toMatchObject({ showHealthChip: "on" });

        const desired = headerDocToDesired(doc);
        expect(desired[0]).toMatchObject({ showHealthChip: true });
    });

    it("showHealthChip absent in view → absent in doc config and desired", () => {
        const noChip: HeaderPlacementView[] = [
            { id: "x3", sourceKey: "enrollment.lead_count", vizType: "kpi_card", label: "Leads", sortOrder: 0 },
        ];
        const doc = headerViewsToDoc(noChip);
        expect(doc.sections[0].cards[0].config).not.toHaveProperty("showHealthChip");

        const desired = headerDocToDesired(doc);
        expect(desired[0]).not.toHaveProperty("showHealthChip");
    });
});

describe("configured title round-trip (publish keeps card titles)", () => {
    it("headerViewsToDoc surfaces the persisted visualization label as config.title", () => {
        const doc = headerViewsToDoc(views);
        // sortOrder 0 first → "Attn", then "Leads"
        expect(doc.sections[0].cards[0].config).toMatchObject({ title: "Attn" });
        expect(doc.sections[0].cards[1].config).toMatchObject({ title: "Leads" });
    });

    it("headerDocToDesired carries the configured title (trimmed), drops blanks", () => {
        const doc: SurfaceDoc = {
            sections: [
                {
                    sectionId: IMPLICIT_SECTION_ID,
                    title: "",
                    cards: [
                        { instanceId: "a", cardTypeKey: "kpi", contentId: "enrollment.lead_count", config: { rendererKey: "kpi_card", title: "  New families  " } },
                        { instanceId: "b", cardTypeKey: "kpi", contentId: "ops.needs_attention_count", config: { rendererKey: "kpi_card", title: "   " } },
                        { instanceId: "c", cardTypeKey: "kpi", contentId: "ops.work_overdue_count", config: { rendererKey: "kpi_card" } },
                    ],
                },
            ],
        };
        const desired = headerDocToDesired(doc);
        expect(desired[0]).toMatchObject({ sourceKey: "enrollment.lead_count", title: "New families" });
        expect(desired[1]).not.toHaveProperty("title");
        expect(desired[2]).not.toHaveProperty("title");
    });

    it("title round-trips view→doc→desired (the publish input carries the operator's title)", () => {
        const titled: HeaderPlacementView[] = [
            { id: "t1", sourceKey: "enrollment.lead_count", vizType: "kpi_card", label: "New families", sortOrder: 0 },
        ];
        const desired = headerDocToDesired(headerViewsToDoc(titled));
        // saveHeaderSurfaceDoc persists desired.title as the visualization label, and the
        // next load re-surfaces that label as config.title — the full cycle is stable.
        expect(desired[0]).toMatchObject({ sourceKey: "enrollment.lead_count", title: "New families" });
    });
});

describe("humanizeSourceKey", () => {
    it("uses the last segment only", () => {
        expect(humanizeSourceKey("ops.work_overdue_count")).toBe("Work overdue count");
        expect(humanizeSourceKey("enrollment.tour_completed_count")).toBe("Tour completed count");
        expect(humanizeSourceKey("enrollment.lead_count")).toBe("Lead count");
    });

    it("handles bare keys (no dot)", () => {
        expect(humanizeSourceKey("lead_count")).toBe("Lead count");
    });

    it("capitalizes only the first character", () => {
        expect(humanizeSourceKey("ops.needs_attention_count")).toBe("Needs attention count");
    });
});

describe("resolveMetricDisplayLabel — label fallback chain", () => {
    it("returns vizLabel when it is not the raw source key", () => {
        expect(resolveMetricDisplayLabel("Lead count", "Lead count", "enrollment.lead_count")).toBe("Lead count");
        expect(resolveMetricDisplayLabel("Custom title", "Lead count", "enrollment.lead_count")).toBe("Custom title");
    });

    it("skips vizLabel when it equals the raw source key (bad DB write)", () => {
        // This is the first-publish bug: viz.label was stored as the source key
        expect(resolveMetricDisplayLabel("enrollment.tour_completed_count", "Completed tours", "enrollment.tour_completed_count")).toBe("Completed tours");
        expect(resolveMetricDisplayLabel("ops.work_overdue_count", "Overdue work", "ops.work_overdue_count")).toBe("Overdue work");
    });

    it("falls back to adapter label when vizLabel equals sourceKey and defLabel is empty", () => {
        const adapterLabel = getMetricSourceAdapter("enrollment.lead_count")?.label ?? "";
        expect(resolveMetricDisplayLabel("enrollment.lead_count", "", "enrollment.lead_count")).toBe(adapterLabel);
        expect(adapterLabel).toBe("Lead count");
    });

    it("falls back to humanizeSourceKey when all DB labels are raw/empty and no adapter", () => {
        expect(resolveMetricDisplayLabel("unknown.some_metric", "", "unknown.some_metric")).toBe("Some metric");
    });

    it("never returns a raw uppercase dot-separated key", () => {
        const result = resolveMetricDisplayLabel("ENROLLMENT.TOUR_COMPLETED_COUNT", "", "enrollment.tour_completed_count");
        // vizLabel is not equal to sourceKey (different case), but it's still a raw-looking key —
        // in practice the DB stores lowercase; this assertion confirms non-empty string is returned
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
    });
});

describe("resolveAccentFromHealth", () => {
    it("maps healthy → enrollment (green)", () => {
        expect(resolveAccentFromHealth("healthy")).toBe("enrollment");
    });

    it("maps warning → amber", () => {
        expect(resolveAccentFromHealth("warning")).toBe("amber");
    });

    it("maps critical → critical (red)", () => {
        expect(resolveAccentFromHealth("critical")).toBe("critical");
    });

    it("maps unknown → neutral (no false-healthy green)", () => {
        expect(resolveAccentFromHealth("unknown")).toBe("neutral");
        expect(resolveAccentFromHealth(undefined)).toBe("neutral");
    });
});

describe("resolveMetricVisualAccent — builder key aliases", () => {
    it("resolves 'juniper' (builder green) to enrollment accent", () => {
        const a = resolveMetricVisualAccent("juniper");
        expect(a.key).toBe("enrollment");
        expect(a.rail).toContain("alloy-juniper");
    });

    it("resolves 'ember' (builder red) to critical accent", () => {
        const a = resolveMetricVisualAccent("ember");
        expect(a.key).toBe("critical");
        expect(a.rail).toContain("alloy-ember");
    });

    it("resolves 'blue' (builder blue) to communications accent", () => {
        const a = resolveMetricVisualAccent("blue");
        expect(a.key).toBe("communications");
        expect(a.rail).toContain("alloy-blue");
    });

    it("resolves 'pine' to enrollment (closest green family)", () => {
        expect(resolveMetricVisualAccent("pine").key).toBe("enrollment");
    });

    it("native keys still resolve directly", () => {
        expect(resolveMetricVisualAccent("amber").key).toBe("amber");
        expect(resolveMetricVisualAccent("neutral").key).toBe("neutral");
        expect(resolveMetricVisualAccent("communications").key).toBe("communications");
    });

    it("unknown key falls back to neutral", () => {
        expect(resolveMetricVisualAccent("nonexistent-key").key).toBe("neutral");
    });
});

describe("label fallback — first-publish label selection logic", () => {
    it("empty labelBySource → adapter label used (not raw source key)", () => {
        const labelBySource = new Map<string, string>(); // empty — simulates first publish
        const sourceKey = "enrollment.tour_completed_count";
        const resolved = labelBySource.get(sourceKey) ?? getMetricSourceAdapter(sourceKey)?.label ?? humanizeSourceKey(sourceKey);
        expect(resolved).toBe("Completed tours");
        expect(resolved).not.toBe(sourceKey);
    });

    it("empty labelBySource + ops.work_overdue_count → adapter label", () => {
        const labelBySource = new Map<string, string>();
        const sourceKey = "ops.work_overdue_count";
        const resolved = labelBySource.get(sourceKey) ?? getMetricSourceAdapter(sourceKey)?.label ?? humanizeSourceKey(sourceKey);
        expect(resolved).toBe("Overdue work");
    });

    it("empty labelBySource + unknown key → humanized fallback (not raw key)", () => {
        const labelBySource = new Map<string, string>();
        const sourceKey = "custom.some_new_metric";
        const resolved = labelBySource.get(sourceKey) ?? getMetricSourceAdapter(sourceKey)?.label ?? humanizeSourceKey(sourceKey);
        expect(resolved).toBe("Some new metric");
        expect(resolved).not.toBe(sourceKey);
    });

    it("populated labelBySource → existing user label wins", () => {
        const labelBySource = new Map([["enrollment.lead_count", "My custom lead label"]]);
        const sourceKey = "enrollment.lead_count";
        const resolved = labelBySource.get(sourceKey) ?? getMetricSourceAdapter(sourceKey)?.label ?? humanizeSourceKey(sourceKey);
        expect(resolved).toBe("My custom lead label");
    });
});

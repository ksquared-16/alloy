import { describe, expect, it } from "vitest";
import {
    classifySemanticOverviewNoop,
    semanticOverviewNoopHeadline,
    shouldBlockSemanticNoopApply,
} from "@/lib/admin/agentLab/semanticOverviewNoopSummary";
import { planJobOverviewLayoutRequest } from "@/lib/agent/planner/planJobOverviewLayoutRequest";
import { getDefaultOverviewLayoutConfig } from "@/lib/rrs/overview/overviewLayoutV0";
import {
    parseOverviewLayoutConfig,
    type OverviewLayoutConfigV0,
} from "@/lib/rrs/overview/overviewLayoutConfigModel";

function storedOverview(version: number, layout: OverviewLayoutConfigV0 = getDefaultOverviewLayoutConfig()) {
    return {
        version,
        header_keys: layout.header_keys,
        bands: layout.bands.map((b) => ({
            band_key: b.band_key,
            enabled: b.enabled,
            items: b.items.map((it) => ({ kind: it.kind, key: it.key })),
        })),
        ...(layout.relationship_group_keys?.length
            ? { relationship_group_keys: layout.relationship_group_keys }
            : {}),
    };
}

describe("semanticOverviewNoopSummary", () => {
    it("classifies unresolved-only no-op (phone/email)", () => {
        const r = planJobOverviewLayoutRequest("please show phone and email", storedOverview(3));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.effective_layout_change).toBe(false);
        expect(classifySemanticOverviewNoop(r)).toBe("noop_unresolved_only");
        expect(semanticOverviewNoopHeadline("noop_unresolved_only")).toMatch(/unsupported overview targets/i);
    });

    it("classifies already-satisfied no-op (customer-focused second pass)", () => {
        const first = planJobOverviewLayoutRequest(
            "Make the overview more customer-focused",
            storedOverview(1)
        );
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        const layout = parseOverviewLayoutConfig(first.config);
        const second = planJobOverviewLayoutRequest(
            "Make the overview more customer-focused",
            storedOverview(first.expected_config_version, layout)
        );
        expect(second.ok).toBe(true);
        if (!second.ok) return;
        expect(second.effective_layout_change).toBe(false);
        expect(second.resolution.unresolved_targets.length).toBe(0);
        expect(classifySemanticOverviewNoop(second)).toBe("noop_already_satisfied");
        expect(semanticOverviewNoopHeadline("noop_already_satisfied")).toMatch(/already satisfied/i);
    });

    it("classifies normal change", () => {
        const r = planJobOverviewLayoutRequest("Hide the financial band", storedOverview(2));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.effective_layout_change).toBe(true);
        expect(classifySemanticOverviewNoop(r)).toBe("change");
        expect(semanticOverviewNoopHeadline("change")).toBeNull();
    });

    it("shouldBlockSemanticNoopApply: blocks v1 semantic no-op unless override", () => {
        const r = planJobOverviewLayoutRequest("please show phone and email", storedOverview(3));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(
            shouldBlockSemanticNoopApply({
                previewRoute: "v1",
                semanticPlanner: r,
                applySemanticNoopAnyway: false,
            })
        ).toBe(true);
        expect(
            shouldBlockSemanticNoopApply({
                previewRoute: "v1",
                semanticPlanner: r,
                applySemanticNoopAnyway: true,
            })
        ).toBe(false);
    });

    it("shouldBlockSemanticNoopApply: never blocks when layout changed", () => {
        const r = planJobOverviewLayoutRequest("Hide the financial band", storedOverview(2));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(
            shouldBlockSemanticNoopApply({
                previewRoute: "v1",
                semanticPlanner: r,
                applySemanticNoopAnyway: false,
            })
        ).toBe(false);
    });

    it("shouldBlockSemanticNoopApply: v1 without semantic snapshot (e.g. financial shortcut) is not blocked", () => {
        expect(
            shouldBlockSemanticNoopApply({
                previewRoute: "v1",
                semanticPlanner: null,
                applySemanticNoopAnyway: false,
            })
        ).toBe(false);
    });
});

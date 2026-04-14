import { describe, expect, it } from "vitest";
import { planJobOverviewLayoutRequest } from "@/lib/agent/planner/planJobOverviewLayoutRequest";
import { getDefaultOverviewLayoutConfig } from "@/lib/rrs/overview/overviewLayoutV0";
import { parseOverviewLayoutConfig } from "@/lib/rrs/overview/overviewLayoutConfigModel";
import {
    badgeLabel,
    headlineForPreview,
    statusFromPlanner,
} from "@/lib/adminV2/aiCommandSurface/aiCommandSurfaceModel";

function storedOverview(version: number, layout = getDefaultOverviewLayoutConfig()) {
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

describe("AdminV2 AI command surface model helpers", () => {
    it("badgeLabel is stable and user-facing", () => {
        expect(badgeLabel("ready")).toBe("Ready to apply");
        expect(badgeLabel("partial")).toBe("Partial — review gaps");
        expect(badgeLabel("up_to_date")).toBe("Already up to date");
        expect(badgeLabel("gaps_only")).toBe("Unsupported items only");
        expect(badgeLabel("in_progress")).toBe("Working…");
        expect(badgeLabel("applied")).toBe("Applied");
        expect(badgeLabel("error")).toBe("Couldn’t complete");
    });

    it("preview with diff => action preview headline + ready status", () => {
        const r = planJobOverviewLayoutRequest("Hide the financial band", storedOverview(2));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.effective_layout_change).toBe(true);
        expect(statusFromPlanner(r)).toBe("ready");
        const h = headlineForPreview(r);
        expect(h.kind).toBe("action_preview");
        expect(h.headline).toMatch(/Review changes/i);
    });

    it("mixed diff + unresolved => partial", () => {
        const r = planJobOverviewLayoutRequest(
            "Show the main contact, their phone, email, and next service date",
            storedOverview(2)
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.effective_layout_change).toBe(true);
        expect(r.resolution.unresolved_targets.length).toBeGreaterThan(0);
        expect(statusFromPlanner(r)).toBe("partial");
    });

    it("unresolved-only => unresolved-only headline + gaps_only status", () => {
        const r = planJobOverviewLayoutRequest("please show phone and email", storedOverview(3));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.effective_layout_change).toBe(false);
        expect(statusFromPlanner(r)).toBe("gaps_only");
        const h = headlineForPreview(r);
        expect(h.kind).toBe("unresolved_only");
        expect(h.headline).toMatch(/unsupported|no layout change|no changes/i);
    });

    it("already satisfied => no-op headline + up_to_date status", () => {
        const first = planJobOverviewLayoutRequest("Make the overview more customer-focused", storedOverview(1));
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
        expect(statusFromPlanner(second)).toBe("up_to_date");
        const h = headlineForPreview(second);
        expect(h.kind).toBe("no_op");
        expect(h.headline).toMatch(/already satisfied|already matches|No changes/i);
    });
});

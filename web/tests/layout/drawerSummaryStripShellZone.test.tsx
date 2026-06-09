/**
 * Summary strip shell zone — compact presentation and body partition markers.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DrawerLayoutRuntimeShellZoneView from "@/components/admin/vmDrawer/DrawerLayoutRuntimeShellZoneView";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { splitDrawerLayoutDocShellZones } from "@/lib/layout/runtime/splitDrawerLayoutDocShellZones";
import { LAYOUT_DRAWER_PREVIEW_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";

describe("drawer summary strip shell zone", () => {
    it("uses compact section presentation without Lead Summary chrome", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const split = splitDrawerLayoutDocShellZones(doc, "opportunity");
        const html = renderToStaticMarkup(
            <DrawerLayoutRuntimeShellZoneView
                zone="summary_strip"
                doc={split.summaryDoc}
                record={LAYOUT_DRAWER_PREVIEW_RECORD}
                entityId="opp-preview"
            />,
        );
        expect(html).toContain('data-drawer-layout-runtime-shell-zone="summary_strip"');
        expect(html).toContain('data-drawer-layout-runtime-shell-zone-sections="lead_summary"');
        expect(html).toContain('data-layout-runtime-section-presentation="summary_strip"');
        expect(html).not.toContain("Lead Summary");
        expect(html).toContain("Attention");
        expect(html).toContain("Tour / Event");
    });

    it("body zone doc excludes lead_summary section key", () => {
        const split = splitDrawerLayoutDocShellZones(buildLeadDrawerDefaultDoc(), "opportunity");
        expect(split.bodyDoc.sections.map((s) => s.key)).not.toContain("lead_summary");
        expect(split.bodyDoc.sections[0]?.key).toBe("children_enrollment");
    });
});

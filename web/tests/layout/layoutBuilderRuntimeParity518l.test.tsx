/**
 * Sprint 5.18L — drawer visual quality + location save.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DrawerOverviewPanelShell from "@/components/layout/DrawerOverviewPanelShell";
import {
    isLayoutRuntimeEditableRefKeySupported,
    resolveLayoutRuntimeEditableRefKey,
} from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import {
    buildLayoutRuntimeOpportunityNativePatch,
    syncOpportunityLocationDisplayLabel,
} from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";
import { resolveLayoutSectionWidgetTone } from "@/lib/layout/layoutEditorWidgetStyle";
import { writeLayoutEditorWidgetStyle } from "@/lib/layout/layoutEditorWidgetStyle";
import type { LayoutSection } from "@/lib/layout/layoutV2";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";

describe("layoutBuilderRuntimeParity 5.18L", () => {
    it("maps opportunity.location display ref to editable location_id", () => {
        expect(resolveLayoutRuntimeEditableRefKey("opportunity.location")).toBe("opportunity.location_id");
        expect(isLayoutRuntimeEditableRefKeySupported("opportunity.location")).toBe(true);
    });

    it("default lead household card uses opportunity.location_id", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const household = doc.sections.find((s) => s.key === "household_contact");
        const refKeys = household?.rows.flatMap((row) => row.columns.flatMap((col) => col.items.map((item) => item.refKey))) ?? [];
        expect(refKeys).toContain("opportunity.location_id");
        expect(refKeys).not.toContain("opportunity.location");
    });

    it("syncs opportunity location display label after save draft", () => {
        const next = syncOpportunityLocationDisplayLabel(
            { id: "opp-1", "opportunity.location": "Old Site" },
            "site-north",
            "North Campus",
        );
        expect(next["opportunity.location_id"]).toBe("site-north");
        expect(next["opportunity.location"]).toBe("North Campus");
    });

    it("builds native PATCH for location_id", () => {
        const patch = buildLayoutRuntimeOpportunityNativePatch(
            { "opportunity.location_id": "" },
            { "opportunity.location_id": "11111111-1111-4111-8111-111111111111" },
        );
        expect(patch).toEqual({ location_id: "11111111-1111-4111-8111-111111111111" });
    });

    it("renders activity section tone on drawer overview panel shell", () => {
        const section: LayoutSection = {
            id: "activity",
            key: "activity",
            title: "Activity",
            rows: [
                {
                    id: "r0",
                    columns: [
                        {
                            id: "c0",
                            width: 12,
                            items: [
                                {
                                    id: "w0",
                                    kind: "widget_placeholder",
                                    refKey: "activity",
                                    label: "Activity",
                                    metadata: writeLayoutEditorWidgetStyle({}, { tone: "blue" }),
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        expect(resolveLayoutSectionWidgetTone(section)).toBe("blue");
        const html = renderToStaticMarkup(
            <DrawerOverviewPanelShell sectionKey="activity" title="Activity" tone="blue">
                <p>Preview</p>
            </DrawerOverviewPanelShell>,
        );
        expect(html).toContain('data-layout-runtime-widget-tone="blue"');
        expect(html).toContain("border-l-alloy-blue/70");
    });

});

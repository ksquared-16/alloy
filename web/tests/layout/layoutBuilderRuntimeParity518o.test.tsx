/**
 * Sprint 5.18O — finish opportunity drawer experience builder parity.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LeadDrawerCommandHeader from "@/components/layout/lead/LeadDrawerCommandHeader";
import {
    resolveLayoutCollectionColumnLinkAdornment,
    resolveLayoutCollectionColumnShowIcon,
} from "@/lib/layout/layoutEditorDisplayConfig";
import { buildOpportunityLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildOpportunityLayoutRuntimeRecordFromVm";
import { resolveLayoutRuntimeEditableFieldFallback } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import { resolveChildRowTemplateRowLayout } from "@/lib/layout/runtime/resolveChildRowTemplateRowLayout";
import { resolveLeadDrawerCommandHeaderMeta } from "@/lib/layout/runtime/resolveLeadDrawerHeaderContext";
import {
    formatOpportunityDisplayMultipleLocationsLabel,
    opportunityDisplayLocationLabel,
    OPPORTUNITY_DISPLAY_NO_LOCATION_LABEL,
} from "@/lib/opportunities/resolveOpportunityDisplayLocation";
import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";

describe("layoutBuilderRuntimeParity 5.18O", () => {
    it("maps household name onto customer.name for drawer field cards", () => {
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            vmRecord: {
                id: "opp-1",
                _customer_name: "Lyons Family",
                "person.primary_contact_name": "Alex Lyons",
            },
            opportunityId: "opp-1",
        });
        expect(record["customer.name"]).toBe("Lyons Family");
        expect(record.name).toBe("Lyons Family");
    });

    it("location select fallback uses stored location_id not display label", () => {
        const siteId = "11111111-1111-4111-8111-111111111111";
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            vmRecord: {
                id: "opp-1",
                location_id: siteId,
                _location_label: "North Campus",
            },
            opportunityId: "opp-1",
        });
        expect(
            resolveLayoutRuntimeEditableFieldFallback(record, "opportunity.location_id", "North Campus"),
        ).toBe(siteId);
    });

    it("related-list link adornment derives open_drawer action from display metadata", () => {
        const col: LayoutCollectionColumn = {
            refKey: "child.full_name",
            label: "Full name",
            metadata: {
                layoutEditorDisplay: {
                    showIcon: true,
                    linkBehavior: "open_drawer",
                },
            },
        };
        expect(resolveLayoutCollectionColumnShowIcon(col)).toBe(true);
        const adornment = resolveLayoutCollectionColumnLinkAdornment(col);
        expect(adornment?.action?.type).toBe("open_drawer");
        expect(adornment?.action?.entity).toBe("child");
    });

    it("child row template renders all configured column indices per row", () => {
        const item: LayoutItem = {
            id: "list-1",
            kind: "related_list",
            refKey: "children",
            columns: [
                { refKey: "child.full_name", label: "Name" },
                { refKey: "child.dob_age", label: "Age" },
                { refKey: "child.program", label: "Program" },
            ],
            metadata: {
                layoutEditorBlockConfig: {
                    childRowGroups: [{ columnIndices: [0, 1, 2], columnCount: 1 }],
                },
            },
        };
        const layout = resolveChildRowTemplateRowLayout(item);
        expect(layout?.[0]?.columnCount).toBe(3);
        expect(layout?.[0]?.slots.filter(Boolean)).toHaveLength(3);
    });

    it("header meta suppresses duplicate household label when it matches title", () => {
        const meta = resolveLeadDrawerCommandHeaderMeta(
            {
                "person.primary_contact_name": "Alex Lyons",
                "person.primary_email": "alex@example.com",
                "person.primary_phone": "(555) 111-2222",
                _customer_name: "Lyons Family",
            },
            { title: "Lyons Family", locationLabel: "North Campus" },
        );
        expect(meta.metaRow).toContain("Alex Lyons");
        expect(meta.metaRow).toContain("alex@example.com");
        expect(meta.metaRow).toContain("North Campus");
        expect(meta.metaRow?.match(/Lyons Family/g)?.length ?? 0).toBeLessThanOrEqual(1);
    });

    it("location label uses native lead location before child aggregate and shows none copy", () => {
        expect(
            opportunityDisplayLocationLabel({
                location_id: "11111111-1111-4111-8111-111111111111",
                _location_label: "North Campus",
                _inquiry_children: [{ location_id: "22222222-2222-4222-8222-222222222222", location_label: "South" }],
            }),
        ).toBe("North Campus");
        expect(opportunityDisplayLocationLabel({})).toBe(OPPORTUNITY_DISPLAY_NO_LOCATION_LABEL);
        expect(formatOpportunityDisplayMultipleLocationsLabel(2)).toBe("2 locations");
    });

    it("LeadDrawerCommandHeader renders pine treatment shell", () => {
        const html = renderToStaticMarkup(
            <LeadDrawerCommandHeader
                title="Lyons Family"
                record={{
                    "person.primary_contact_name": "Alex Lyons",
                    "person.primary_email": "alex@example.com",
                }}
                locationLabel="North Campus"
                tabs={[{ key: "overview", label: "Overview" }]}
                activeTab="overview"
                onTabSelect={() => {}}
                actionsControl={<span>Actions</span>}
                closeButton={<button type="button">Close</button>}
            />,
        );
        expect(html).toContain('data-lead-drawer-command-header="true"');
        expect(html).toContain("Alex Lyons");
        expect(html).toContain("alex@example.com");
    });
});

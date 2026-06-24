/**
 * Regression: when a Person drawer layout has no right-rail section (e.g. a custom
 * layout with Contact Summary / Address & Employment / Children all in the main
 * zone), the main zone must be the sole child of the overview shell grid so it can
 * claim the full width (`.adminv2-drawer-overview-main-zone-flow:only-child`).
 * Otherwise the empty 3-of-12 rail column leaves the last ~1/4 blank on the right.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import PersonOverviewRuntimeComposition from "@/components/layout/person/PersonOverviewRuntimeComposition";
import { partitionDrawerSectionsByZone } from "@/lib/layout/drawerLayoutEditorModel";
import { buildProofPersonRecord } from "@/lib/layout/runtime/buildProofPersonRecord";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";

function mainZoneSection(key: string, title: string, refKey: string): LayoutSection {
    return {
        id: `sec_${key}`,
        key,
        title,
        defaultExpanded: true,
        rows: [
            {
                id: `row_${key}`,
                columns: [
                    {
                        id: `col_${key}`,
                        width: 12,
                        items: [{ id: `it_${key}`, kind: "field", refKey, label: title }],
                    },
                ],
            },
        ],
        // No rail slot metadata → main zone.
        metadata: {},
    };
}

/** Custom person layout with no right-rail section — all content in the main zone. */
function noRailPersonDoc(): LayoutDoc {
    return {
        id: "custom-no-rail",
        version: 2,
        surface: "person_drawer",
        sections: [
            mainZoneSection("contact_summary", "Contact Summary", "person.primary_contact_name"),
            mainZoneSection("address_employment", "Address & Employment", "person.address"),
        ],
    } as unknown as LayoutDoc;
}

describe("person drawer — main zone owns full width when no right rail", () => {
    it("custom no-rail layout renders main zone as the sole shell-grid child", () => {
        const doc = noRailPersonDoc();
        const zones = partitionDrawerSectionsByZone(doc, "person_drawer");
        expect(zones.right_rail.length).toBe(0);

        const html = renderToStaticMarkup(
            React.createElement(PersonOverviewRuntimeComposition, {
                doc,
                record: buildProofPersonRecord({
                    id: "parent-1",
                    customer_id: "cust-1",
                    "person.id": "parent-1",
                    "person.primary_contact_name": "Justin Wright",
                }),
                entityId: "parent-1",
            }),
        );

        // Main zone present, right rail slot absent → CSS `:only-child` => full width.
        expect(html).toContain('data-person-overview-main-zone-flow="true"');
        expect(html).not.toContain('data-person-overview-slot="right_rail"');
    });
});

/**
 * Sprint 5.18H — runtime drawer parity + related field controls.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { applyPeerCardWidth } from "@/lib/layout/layoutBuilderPeerCardRows";
import { segmentSectionsForRowLayout } from "@/lib/layout/layoutEditorSectionLayout";
import { patchLayoutEditorFieldDisplay } from "@/lib/layout/layoutEditorCompositionModel";
import { readLayoutEditorDisplayConfig } from "@/lib/layout/layoutEditorDisplayConfig";
import {
    findRelatedListItemInSection,
    patchLayoutEditorRelatedListConfig,
    syncRelatedListSectionToItem,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import { buildOpportunityLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildOpportunityLayoutRuntimeRecordFromVm";
import { isAllowedOpportunityDrawerFieldRefKey } from "@/lib/layout/surfaceLayoutRegistry";
import { leadOverviewCompositionHints } from "@/lib/layout/runtime/leadOverviewComposition";

describe("layoutBuilderRuntimeParity 5.18H", () => {
    it("packs peer cards into row segments for main zone sections", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = applyPeerCardWidth(doc, "household_contact", "third");
        doc = applyPeerCardWidth(doc, "children_enrollment", "two_thirds");
        const segments = segmentSectionsForRowLayout(
            doc.sections.filter((s) => s.key === "household_contact" || s.key === "children_enrollment"),
        );
        expect(segments.some((s) => s.kind === "row" && s.sections.length === 2)).toBe(true);
    });

    it("maps secondary contact fields separately from primary on runtime record", () => {
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            vmRecord: {
                id: "opp-1",
                "person.primary_contact_name": "Alex Primary",
                "person.primary_phone": "555-111-1111",
                "person.primary_email": "primary@example.com",
                "person.secondary_contact_name": "Sam Secondary",
                "person.secondary_phone": "555-222-2222",
                "person.secondary_email": "secondary@example.com",
                _opportunity_persons: [
                    { person_id: "p-primary", role_type: "primary_contact", name: "Alex Primary", phone: "555-111-1111", email: "primary@example.com" },
                    { person_id: "p-secondary", role_type: "secondary_contact", name: "Sam Secondary", phone: "555-222-2222", email: "secondary@example.com" },
                ],
            },
            opportunityId: "opp-1",
        });
        expect(record["person.secondary_email"]).toBe("secondary@example.com");
        expect(record["person.secondary_phone"]).toBe("555-222-2222");
        expect(record["person.email"]).toBe("primary@example.com");
        expect(record["person.phone"]).toBe("555-111-1111");
        expect(record._relations?.secondary_contact?.fields?.email).toBe("secondary@example.com");
    });

    it("preserves related-list column display metadata across config sync", () => {
        let doc = buildLeadDrawerDefaultDoc();
        const sectionKey = "children_enrollment";
        doc = syncRelatedListSectionToItem(doc, sectionKey);
        const located = findRelatedListItemInSection(doc.sections.find((s) => s.key === sectionKey)!);
        expect(located?.item.columns?.length).toBeGreaterThan(0);
        const colIdx = 0;
        const blockItemId = located!.item.id;
        doc = patchLayoutEditorFieldDisplay(
            doc,
            { kind: "column", sectionKey, blockItemId, colIdx },
            { showLabel: false, typographyIntent: "emphasis" },
            "Custom label",
        );
        doc = patchLayoutEditorRelatedListConfig(doc, sectionKey, {
            primaryRow: { fields: located!.item.columns!.map((c) => c.refKey) },
        });
        const after = findRelatedListItemInSection(doc.sections.find((s) => s.key === sectionKey)!);
        const col = after?.item.columns?.[colIdx];
        expect(col).toBeTruthy();
        if (!col) return;
        expect(col.label).toBe("Custom label");
        expect(readLayoutEditorDisplayConfig(col).showLabel).toBe(false);
        expect(readLayoutEditorDisplayConfig(col).typographyIntent).toBe("emphasis");
    });

    it("allows secondary and emergency contact ref keys in picker registry", () => {
        expect(isAllowedOpportunityDrawerFieldRefKey("person.secondary_email")).toBe(true);
        expect(isAllowedOpportunityDrawerFieldRefKey("person.emergency_contact_phone")).toBe(true);
        expect(isAllowedOpportunityDrawerFieldRefKey("person.billing_contact_email")).toBe(true);
    });

    it("enables related-list header suppression in live composition hints", () => {
        expect(leadOverviewCompositionHints().suppressRelatedListPanelHeader).toBe(true);
        expect(leadOverviewCompositionHints().compositionSectionSurface).toBe(true);
    });
});

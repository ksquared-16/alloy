/**
 * Sprint 5.18G — runtime parity and final QA tests.
 */

import { describe, expect, it } from "vitest";
import { layoutDocFromRegistry } from "@/lib/layout/migrateFromRegistry";
import { resolveLayout } from "@/lib/layout/layoutResolver";
import { isAllowedOpportunityDrawerFieldRefKey } from "@/lib/layout/surfaceLayoutRegistry";
import { validateOpportunityDrawerLayoutDoc } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { addSectionFieldItem } from "@/lib/layout/layoutEditorSectionComposition";
import { createExperienceBuilderCard } from "@/lib/layout/layoutBuilderCardAuthoring";
import { buildOpportunityDrawerEditorFieldPickerGroups } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import {
    filterLayoutBuilderPreviewSearchHits,
    layoutBuilderPreviewSelectionFromHit,
    resolvePreviewOpportunityIdFromSearchHit,
} from "@/lib/layout/layoutBuilderPreviewRecordSearch";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import type { GlobalRecordSearchHit } from "@/lib/admin/globalSearch/globalRecordSearchTypes";

function mkRecord(layoutKey: string, version: number, status: "published" | "draft" = "published"): EntityLayoutRecord {
    const base = buildLeadDrawerDefaultDoc();
    return {
        id: `${layoutKey}-v${version}`,
        orgId: "org1",
        industryKey: null,
        entityType: "opportunities",
        surface: "drawer",
        layoutKey,
        name: layoutKey,
        version,
        status,
        isSystemDefault: false,
        doc: base,
        metadata: null,
        createdBy: null,
        createdAt: "2026-01-01",
        updatedAt: null,
        publishedAt: status === "published" ? "2026-01-01" : null,
    };
}

describe("layoutBuilderRuntimeParity 5.18G", () => {
    it("resolves opportunity drawer published layout by layout_key default, not global max version", () => {
        const custom = mkRecord("legacy_strip", 99, "published");
        const current = mkRecord("default", 3, "published");
        const r = resolveLayout({
            entityType: "opportunities",
            surface: "drawer",
            orgRecords: [custom, current],
        });
        expect(r.source).toBe("org");
        expect(r.layoutKey).toBe("default");
        expect(r.record?.version).toBe(3);
    });

    it("allows opportunity.created_at in picker and layout validation", () => {
        expect(isAllowedOpportunityDrawerFieldRefKey("opportunity.created_at")).toBe(true);
        const created = createExperienceBuilderCard(buildLeadDrawerDefaultDoc(), {
            title: "Lead meta",
            widthKey: "full",
            cardType: "fields",
        });
        const field = buildOpportunityDrawerEditorFieldPickerGroups()
            .flatMap((g) => g.fields)
            .find((f) => f.refKey === "opportunity.created_at");
        expect(field).toBeTruthy();
        const added = addSectionFieldItem(created.doc, created.sectionKey, 0, 0, field!);
        expect(added.ok).toBe(true);
        if (!added.ok) return;
        const validation = validateOpportunityDrawerLayoutDoc(added.doc);
        expect(validation.ok).toBe(true);
    });

    it("resolves preview opportunity id from lead search hits", () => {
        const hit: GlobalRecordSearchHit = {
            entity_type: "opportunities",
            entity_id: "opp-123",
            group: "leads",
            name: "Nguyen Household",
            type_label: "Lead",
            household_name: "Nguyen Household",
            opportunity_name: "Nguyen Household",
            lead_short_label: "Nguyen",
            status_label: "Qualified",
            location_label: "North Campus",
            opportunity_id: "opp-123",
        };
        expect(resolvePreviewOpportunityIdFromSearchHit(hit)).toBe("opp-123");
        const selection = layoutBuilderPreviewSelectionFromHit(hit);
        expect(selection?.opportunityId).toBe("opp-123");
        expect(selection?.label).toContain("Nguyen");
        expect(filterLayoutBuilderPreviewSearchHits([hit])).toHaveLength(1);
    });

    it("filters out location-only global search hits from preview picker", () => {
        const locationHit: GlobalRecordSearchHit = {
            entity_type: "locations",
            entity_id: "loc-1",
            group: "locations",
            name: "North Campus",
            type_label: "Campus",
            household_name: null,
            opportunity_name: null,
            lead_short_label: null,
            status_label: null,
            location_label: null,
        };
        expect(filterLayoutBuilderPreviewSearchHits([locationHit])).toHaveLength(0);
    });

    it("registry fallback still works when no published records exist", () => {
        const r = resolveLayout({ entityType: "opportunities", surface: "drawer" });
        expect(r.source).toBe("registry");
        expect(r.doc).toEqual(layoutDocFromRegistry("opportunities", "drawer"));
    });
});

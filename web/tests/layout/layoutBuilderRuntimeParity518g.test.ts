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
    filterLayoutBuilderPreviewSelections,
    layoutBuilderPreviewSelectionFrom,
    resolvePreviewOpportunityIdFromSelection,
} from "@/lib/layout/layoutBuilderPreviewRecordSearch";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import type { SearchResult } from "@/lib/search/searchContracts";
import { searchSelectionFromResult } from "@/lib/search/searchSelectionAdapter";

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

    it("resolves preview opportunity id from a lead SUBJECT result", () => {
        // Search V2 returns subjects; the preview picker reads the opportunity
        // behind the subject via the platform selection projection.
        const result: SearchResult = {
            subject: { kind: "household", id: "cust-1", display_name: "Nguyen Household", household_id: "cust-1" },
            recognition: { type_label: "Lead", location_label: "North Campus" },
            contexts: [],
            destinations: [
                {
                    key: "subject",
                    label: "Open Nguyen Household",
                    target: "open_drawer",
                    entity_type: "opportunities",
                    entity_id: "opp-123",
                    primary: true,
                },
            ],
            ranking: { score: 1, reasons: [] },
        };
        const selection = searchSelectionFromResult(result)!;
        expect(resolvePreviewOpportunityIdFromSelection(selection)).toBe("opp-123");
        const preview = layoutBuilderPreviewSelectionFrom(selection);
        expect(preview?.opportunityId).toBe("opp-123");
        expect(preview?.label).toContain("Nguyen");
        expect(filterLayoutBuilderPreviewSelections([result])).toHaveLength(1);
    });

    it("resolves the opportunity behind a CHILD subject participating in a process", () => {
        // A child opens as a person but participates in an opportunity — the
        // preview must still find that opportunity.
        const result: SearchResult = {
            subject: { kind: "child", id: "cm-1", display_name: "Joe Smith", person_id: "p-1", household_id: "cust-1" },
            recognition: { type_label: "Child" },
            contexts: [],
            destinations: [
                { key: "subject", label: "Open Joe", target: "open_drawer", entity_type: "persons", entity_id: "p-1", primary: true },
                { key: "process:enrollment", label: "Enrollment", target: "open_drawer", entity_type: "opportunities", entity_id: "opp-9" },
            ],
            ranking: { score: 1, reasons: [] },
        };
        const selection = searchSelectionFromResult(result)!;
        expect(selection.entity_type).toBe("persons");
        expect(resolvePreviewOpportunityIdFromSelection(selection)).toBe("opp-9");
    });

    it("filters out campus subjects from the preview picker", () => {
        const locationResult: SearchResult = {
            subject: { kind: "location", id: "loc-1", display_name: "North Campus" },
            recognition: { type_label: "Campus" },
            contexts: [],
            destinations: [
                { key: "subject", label: "Open North Campus", target: "route", href: "/organization/locations?locationId=loc-1", primary: true },
            ],
            ranking: { score: 1, reasons: [] },
        };
        expect(filterLayoutBuilderPreviewSelections([locationResult])).toHaveLength(0);
    });

    it("registry fallback still works when no published records exist", () => {
        const r = resolveLayout({ entityType: "opportunities", surface: "drawer" });
        expect(r.source).toBe("registry");
        expect(r.doc).toEqual(layoutDocFromRegistry("opportunities", "drawer"));
    });
});

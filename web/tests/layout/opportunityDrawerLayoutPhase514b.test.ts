/**
 * Visual Layout Configuration Builder — Phase 5.14B MVP blocker pass.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { addSectionActionButtonItem } from "@/lib/layout/layoutEditorSectionComposition";
import {
    DEFAULT_CONTACTS_RELATED_LIST_CONFIG,
    patchLayoutEditorRelatedListConfig,
    syncRelatedListSectionToItem,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import {
    applyOpportunityDrawerStarterTemplate,
    buildCertificationLayoutDoc,
    OPPORTUNITY_DRAWER_STARTER_TEMPLATE_KEYS,
} from "@/lib/layout/layoutEditorOpportunityDrawerStarterTemplates";
import { validateOpportunityDrawerLayoutPublishGuards } from "@/lib/layout/layoutEditorPublishGuards";
import {
    addRelatedListOpportunityDrawerSection,
    canDeleteOpportunityDrawerSection,
} from "@/lib/layout/layoutEditorSectionLayout";
import { readLayoutRuntimeContactRepeaterRows } from "@/lib/layout/runtime/mapLayoutRuntimeContactRepeaterRows";
import { LAYOUT_DRAWER_PREVIEW_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { validateOpportunityDrawerLayoutDoc } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { layoutRuntimeRepeaterFieldDisplay } from "@/lib/layout/runtime/resolveLayoutRuntimeRepeaterFieldValue";

describe("contact related list runtime", () => {
    it("maps household contacts to repeater rows with person fields", () => {
        let doc = addRelatedListOpportunityDrawerSection(buildLeadDrawerDefaultDoc(), { title: "Contacts" });
        const sectionKey = doc.sections[doc.sections.length - 1]!.key;
        doc = patchLayoutEditorRelatedListConfig(doc, sectionKey, DEFAULT_CONTACTS_RELATED_LIST_CONFIG);
        const item = doc.sections.find((s) => s.key === sectionKey)!.rows[0]!.columns[0]!.items[0]!;
        expect(item.refKey).toBe("contacts");

        const rows = readLayoutRuntimeContactRepeaterRows(LAYOUT_DRAWER_PREVIEW_RECORD, item);
        expect(rows.length).toBeGreaterThan(0);
        expect(String(rows[0]!["person.primary_contact_name"] ?? "")).toBeTruthy();

        const roleDisplay = layoutRuntimeRepeaterFieldDisplay(rows[0]!, "person.role");
        expect(roleDisplay.placeholder).toBe(false);
    });

    it("validates contacts related list config on surface parse", () => {
        let doc = addRelatedListOpportunityDrawerSection(buildLeadDrawerDefaultDoc());
        const sectionKey = doc.sections[doc.sections.length - 1]!.key;
        doc = syncRelatedListSectionToItem(doc, sectionKey);
        const parsed = parseLayoutDoc(doc, { inferSurfaceKey: true });
        expect(parsed.ok, parsed.errors.join("; ")).toBe(true);
    });
});

describe("publish guards", () => {
    it("blocks publish when layout contains preview-only action buttons", () => {
        const sectionKey = "household_contact";
        const result = addSectionActionButtonItem(buildLeadDrawerDefaultDoc(), sectionKey, 0, 0, {
            label: "Open child",
            actionKey: "open_child_drawer",
            styleIntent: "secondary",
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const guardErrors = validateOpportunityDrawerLayoutPublishGuards(result.doc);
        expect(guardErrors.some((e) => e.includes("action buttons are preview-only"))).toBe(true);

        const validated = validateOpportunityDrawerLayoutDoc(result.doc);
        expect(validated.ok).toBe(false);
    });
});

describe("fixed platform composition slots", () => {
    it("prevents deleting household_contact and children_enrollment", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const household = doc.sections.find((s) => s.key === "household_contact")!;
        const enrollment = doc.sections.find((s) => s.key === "children_enrollment")!;
        expect(canDeleteOpportunityDrawerSection(household).ok).toBe(false);
        expect(canDeleteOpportunityDrawerSection(enrollment).ok).toBe(false);
    });
});

describe("starter templates", () => {
    it("applies each starter without surface validation errors", () => {
        for (const key of OPPORTUNITY_DRAWER_STARTER_TEMPLATE_KEYS) {
            const doc = applyOpportunityDrawerStarterTemplate(buildLeadDrawerDefaultDoc(), key);
            const validated = validateOpportunityDrawerLayoutDoc(doc);
            expect(validated.ok, `${key}: ${validated.errors.join("; ")}`).toBe(true);
        }
    });
});

describe("certification layouts", () => {
    const certificationKeys = [
        "relationship_list",
        "children_enrollment_list",
        "kpi_strip",
        "minimal_lead_overview",
        "notes_activity",
    ] as const;

    it("builds certification layouts that pass validation", () => {
        for (const key of certificationKeys) {
            const doc = buildCertificationLayoutDoc(key);
            const validated = validateOpportunityDrawerLayoutDoc(doc);
            expect(validated.ok, `${key}: ${validated.errors.join("; ")}`).toBe(true);
        }
    });

    it("relationship list uses contacts defaults", () => {
        const doc = buildCertificationLayoutDoc("relationship_list");
        const section = doc.sections.find((s) => s.metadata?.layoutEditorSectionType === "related_list");
        expect(section?.metadata?.layoutEditorRelatedListConfig).toMatchObject({
            entityType: "contacts",
            primaryRow: DEFAULT_CONTACTS_RELATED_LIST_CONFIG.primaryRow,
        });
    });
});

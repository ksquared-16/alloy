/**
 * Visual Layout Configuration Builder — Phase 5.15 go-live certification.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { addLayoutBlockToSection } from "@/lib/layout/layoutEditorBlockRegistry";
import { addCustomOpportunityDrawerSection } from "@/lib/layout/layoutEditorGeneratedKeys";
import {
    buildCertificationLayoutByKey,
    CERTIFICATION_LAYOUT_KEYS,
} from "@/lib/layout/layoutEditorOpportunityDrawerCertificationLayouts";
import { addSectionActionButtonItem } from "@/lib/layout/layoutEditorSectionComposition";
import {
    DEFAULT_CHILDREN_RELATED_LIST_CONFIG,
    DEFAULT_CONTACTS_RELATED_LIST_CONFIG,
    patchLayoutEditorRelatedListConfig,
    syncRelatedListSectionToItem,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import { readLayoutEditorWidgetStyle } from "@/lib/layout/layoutEditorWidgetStyle";
import { validateOpportunityDrawerLayoutPublishGuards } from "@/lib/layout/layoutEditorPublishGuards";
import {
    addRelatedListOpportunityDrawerSection,
    applySectionRowLayout,
    canDeleteOpportunityDrawerSection,
    deleteOpportunityDrawerSection,
    readSectionRowGroup,
} from "@/lib/layout/layoutEditorSectionLayout";
import {
    ensureOpportunityDrawerLayoutDocSaveReady,
    formatLayoutValidationErrors,
    repairOpportunityDrawerLayoutGeneratedKeys,
    validateOpportunityDrawerLayoutDoc,
} from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { LAYOUT_DRAWER_PREVIEW_RECORD, LAYOUT_DRAWER_SPARSE_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";
import { readLayoutRuntimeContactRepeaterRows } from "@/lib/layout/runtime/mapLayoutRuntimeContactRepeaterRows";
import { readLayoutRuntimeRepeaterRows } from "@/lib/layout/runtime/readLayoutRuntimeRepeaterRows";
import { layoutRuntimeRepeaterFieldDisplay } from "@/lib/layout/runtime/resolveLayoutRuntimeRepeaterFieldValue";

function expectPublishReady(doc: ReturnType<typeof buildLeadDrawerDefaultDoc>, label: string) {
    const validated = validateOpportunityDrawerLayoutDoc(doc);
    expect(validated.ok, `${label}: ${validated.errors.join("; ")}`).toBe(true);
    expect(validateOpportunityDrawerLayoutPublishGuards(doc), `${label} publish guards`).toEqual([]);
}

describe("certification layouts A–E and production recreation", () => {
    it.each(CERTIFICATION_LAYOUT_KEYS)("layout %s validates and passes publish guards", (key) => {
        const doc = buildCertificationLayoutByKey(key);
        expectPublishReady(doc, key);
    });

    it("production recreation includes core drawer sections", () => {
        const doc = buildCertificationLayoutByKey("production_recreation");
        const keys = new Set(doc.sections.map((s) => s.key));
        expect(keys.has("lead_summary")).toBe(true);
        expect(keys.has("household_contact")).toBe(true);
        expect(keys.has("children_enrollment")).toBe(true);
        expect(keys.has("lead_source")).toBe(true);
    });
});

describe("publish guard certification", () => {
    it("blocks opportunities related-list entity before publish", () => {
        let doc = addRelatedListOpportunityDrawerSection(buildLeadDrawerDefaultDoc(), { title: "Other opportunities" });
        const sectionKey = doc.sections[doc.sections.length - 1]!.key;
        doc = patchLayoutEditorRelatedListConfig(doc, sectionKey, {
            entityType: "opportunities",
            primaryRow: { fields: ["opportunity.name"] },
        });
        doc = syncRelatedListSectionToItem(doc, sectionKey);

        const guardErrors = validateOpportunityDrawerLayoutPublishGuards(doc);
        expect(guardErrors.some((e) => e.includes("Opportunities") && e.includes("preview-only"))).toBe(true);

        const validated = validateOpportunityDrawerLayoutDoc(doc);
        expect(validated.ok).toBe(false);

        const formatted = formatLayoutValidationErrors(validated.errors);
        expect(formatted.some((e) => e.includes("preview-only"))).toBe(true);
    });

    it("blocks preview-only block templates", () => {
        const result = addLayoutBlockToSection(buildLeadDrawerDefaultDoc(), "household_contact", "address_card");
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const guardErrors = validateOpportunityDrawerLayoutPublishGuards(result.doc);
        expect(guardErrors.some((e) => e.includes("preview-only"))).toBe(true);
    });

    it("blocks layout action buttons", () => {
        const result = addSectionActionButtonItem(buildLeadDrawerDefaultDoc(), "household_contact", 0, 0, {
            label: "Open child",
            actionKey: "open_child_drawer",
            styleIntent: "secondary",
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const guardErrors = validateOpportunityDrawerLayoutPublishGuards(result.doc);
        expect(guardErrors.some((e) => e.includes("action buttons are preview-only"))).toBe(true);
    });

    it("blocks invalid field refs on publish validation", () => {
        const doc = structuredClone(buildLeadDrawerDefaultDoc());
        const fieldItem = doc.sections
            .flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.items)))
            .find((item) => item.kind === "field");
        expect(fieldItem).toBeTruthy();
        if (!fieldItem) return;
        fieldItem.refKey = "not.a.real.field";

        const validated = validateOpportunityDrawerLayoutDoc(doc);
        expect(validated.ok).toBe(false);
        expect(validated.errors.some((e) => e.includes("not.a.real.field"))).toBe(true);
    });

    it("blocks invalid widget refs on publish validation", () => {
        const doc = structuredClone(buildLeadDrawerDefaultDoc());
        doc.sections[0]!.rows[0]!.columns[0]!.items.push({
            id: "bad-widget",
            kind: "widget_placeholder",
            refKey: "not_a_widget",
        });
        const validated = validateOpportunityDrawerLayoutDoc(doc);
        expect(validated.ok).toBe(false);
        expect(validated.errors.some((e) => e.includes("not_a_widget"))).toBe(true);
    });

    it("protects platform composition slots and lead summary from delete", () => {
        const doc = buildLeadDrawerDefaultDoc();
        for (const key of ["lead_summary", "household_contact", "children_enrollment"] as const) {
            const section = doc.sections.find((s) => s.key === key)!;
            expect(canDeleteOpportunityDrawerSection(section).ok).toBe(false);
            const afterDelete = deleteOpportunityDrawerSection(doc, key);
            expect(afterDelete.sections.some((s) => s.key === key)).toBe(true);
        }
    });
});

describe("save/publish stress helpers", () => {
    it("cleans orphaned row-group metadata when a grouped section is deleted", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addCustomOpportunityDrawerSection(doc, { title: "Row A", zone: "main" });
        doc = addCustomOpportunityDrawerSection(doc, { title: "Row B", zone: "main" });
        const rowKeys = doc.sections.slice(-2).map((s) => s.key);
        doc = applySectionRowLayout(doc, rowKeys[0]!, "50_50");

        const deletableKey = rowKeys[1]!;
        const deletable = doc.sections.find((s) => s.key === deletableKey)!;
        expect(canDeleteOpportunityDrawerSection(deletable).ok).toBe(true);

        const groupId = readSectionRowGroup(deletable);
        expect(groupId).toBeTruthy();

        doc = deleteOpportunityDrawerSection(doc, deletableKey);
        const survivors = doc.sections.filter((s) => readSectionRowGroup(s) === groupId);
        expect(survivors.length).toBeLessThanOrEqual(1);
        if (survivors.length === 1) {
            expect(readSectionRowGroup(survivors[0]!)).toBeNull();
        }
        expectPublishReady(doc, "after section delete");
    });

    it("repairs legacy generated keys before save", () => {
        const doc = structuredClone(buildLeadDrawerDefaultDoc()) as typeof buildLeadDrawerDefaultDoc extends () => infer R ? R : never;
        const custom = doc.sections.find((s) => s.key === "household_contact")!;
        custom.key = "section_3";
        custom.metadata = { ...(custom.metadata ?? {}), layoutEditorGeneratedKey: "section_3" };

        const saveReady = ensureOpportunityDrawerLayoutDocSaveReady(doc);
        expect(saveReady.repaired).toBe(true);
        const repaired = repairOpportunityDrawerLayoutGeneratedKeys(saveReady.doc);
        expect(repaired.doc.sections.some((s) => s.key === "section_3")).toBe(false);
    });

    it("survives edit → add row group → delete → validate cycle", () => {
        let doc = buildCertificationLayoutByKey("minimal");
        doc = applySectionRowLayout(doc, "household_contact", "50_50");
        const custom = doc.sections.find((s) => s.key !== "lead_summary" && s.key !== "household_contact" && s.key !== "children_enrollment");
        if (custom && canDeleteOpportunityDrawerSection(custom).ok) {
            doc = deleteOpportunityDrawerSection(doc, custom.key);
        }
        expectPublishReady(doc, "stress cycle");
    });
});

describe("empty state certification", () => {
    it("renders sparse contact repeater without throwing raw values", () => {
        let doc = addRelatedListOpportunityDrawerSection(buildLeadDrawerDefaultDoc(), { title: "Contacts" });
        const sectionKey = doc.sections[doc.sections.length - 1]!.key;
        doc = patchLayoutEditorRelatedListConfig(doc, sectionKey, DEFAULT_CONTACTS_RELATED_LIST_CONFIG);
        doc = syncRelatedListSectionToItem(doc, sectionKey);
        const item = doc.sections.find((s) => s.key === sectionKey)!.rows[0]!.columns[0]!.items[0]!;

        const rows = readLayoutRuntimeContactRepeaterRows(LAYOUT_DRAWER_SPARSE_RECORD, item);
        expect(rows).toEqual([]);

        const richRows = readLayoutRuntimeContactRepeaterRows(LAYOUT_DRAWER_PREVIEW_RECORD, item);
        expect(richRows.length).toBeGreaterThan(0);
        for (const row of richRows) {
            const email = layoutRuntimeRepeaterFieldDisplay(row, "person.primary_email");
            expect(email.text).not.toMatch(/undefined|null/i);
        }
    });

    it("renders sparse and multi-child repeater rows", () => {
        let doc = addRelatedListOpportunityDrawerSection(buildLeadDrawerDefaultDoc(), { title: "Children" });
        const sectionKey = doc.sections[doc.sections.length - 1]!.key;
        doc = patchLayoutEditorRelatedListConfig(doc, sectionKey, DEFAULT_CHILDREN_RELATED_LIST_CONFIG);
        doc = syncRelatedListSectionToItem(doc, sectionKey);
        const item = doc.sections.find((s) => s.key === sectionKey)!.rows[0]!.columns[0]!.items[0]!;

        expect(readLayoutRuntimeRepeaterRows(LAYOUT_DRAWER_SPARSE_RECORD, item)).toEqual([]);

        const multiChildRecord = {
            ...LAYOUT_DRAWER_PREVIEW_RECORD,
            children: Array.from({ length: 5 }, (_, i) => ({
                id: `c${i}`,
                "child.name": `Child ${i}`,
                "child.dob_age": "",
                "child.program": "",
                "child.room": "",
                "child.schedule": "",
                "child.status": "",
            })),
        };
        const rows = readLayoutRuntimeRepeaterRows(multiChildRecord, item);
        expect(rows.length).toBe(5);
        for (const row of rows) {
            const name = layoutRuntimeRepeaterFieldDisplay(row, "child.name");
            expect(name.text).toBeTruthy();
            expect(name.text).not.toMatch(/undefined|null/i);
        }
    });
});

describe("runtime parity metadata", () => {
    it("preserves widget tone and description on KPI-heavy layout", () => {
        const doc = buildCertificationLayoutByKey("kpi_heavy");
        const widgetSection = doc.sections.find((s) => s.metadata?.layoutEditorSectionType === "widget");
        expect(widgetSection).toBeTruthy();
        if (!widgetSection) return;

        const widget = widgetSection.rows.flatMap((r) => r.columns.flatMap((c) => c.items)).find((it) => it.kind === "widget_placeholder");
        expect(widget).toBeTruthy();
        if (!widget) return;

        const style = readLayoutEditorWidgetStyle(widget.metadata);
        expect(style.tone).toBe("attention");
        expect(style.description).toBe("Needs review today");
    });
});

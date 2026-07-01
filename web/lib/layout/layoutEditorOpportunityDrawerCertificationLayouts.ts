/**
 * Go-live certification layout fixtures (Phase 5.15).
 *
 * Programmatic builders for certification layouts A–E and production recreation.
 * Used by tests and staging QA checklists — not runtime behavior changes.
 */

import { addSectionWidgetItem } from "@/lib/layout/layoutEditorSectionComposition";
import { addLayoutBlockToSection } from "@/lib/layout/layoutEditorBlockRegistry";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    DEFAULT_CHILDREN_RELATED_LIST_CONFIG,
    DEFAULT_HOUSEHOLD_MEMBERS_RELATED_LIST_CONFIG,
    patchLayoutEditorRelatedListConfig,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import {
    addRelatedListOpportunityDrawerSection,
    addWidgetOpportunityDrawerSection,
    applySectionRowLayout,
} from "@/lib/layout/layoutEditorSectionLayout";
import { writeLayoutEditorWidgetStyle } from "@/lib/layout/layoutEditorWidgetStyle";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { applyOpportunityDrawerStarterTemplate } from "@/lib/layout/layoutEditorOpportunityDrawerStarterTemplates";

export const CERTIFICATION_LAYOUT_KEYS = [
    "contact_heavy",
    "child_heavy",
    "kpi_heavy",
    "minimal",
    "operational",
    "production_recreation",
] as const;

export type CertificationLayoutKey = (typeof CERTIFICATION_LAYOUT_KEYS)[number];

function emptyOpportunityDrawerDoc(): LayoutDoc {
    return {
        formatVersion: 1,
        surface: "drawer",
        entityType: "opportunities",
        metadata: { template: "lead_drawer_v2" },
        sections: [],
    };
}

function addRegisteredSection(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    const template = buildLeadDrawerDefaultDoc().sections.find((s) => s.key === sectionKey);
    if (!template || doc.sections.some((s) => s.key === sectionKey)) return doc;
    return { ...doc, sections: [...doc.sections, JSON.parse(JSON.stringify(template))] };
}

/** Layout A — Contact-heavy household and relationship surfaces. */
export function buildContactHeavyCertificationLayout(): LayoutDoc {
    let doc = buildLeadDrawerDefaultDoc();
    doc = addRegisteredSection(doc, "household_contact");
    const householdKey = "household_contact";
    for (const template of ["contact_primary", "contact_secondary", "contact_billing", "contact_emergency"] as const) {
        const result = addLayoutBlockToSection(doc, householdKey, template);
        if (result.ok) doc = result.doc;
    }
    doc = applyOpportunityDrawerStarterTemplate(doc, "relationship_list");
    let next = addRelatedListOpportunityDrawerSection(doc, { title: "Household members", zone: "right_rail" });
    const membersKey = next.sections[next.sections.length - 1]!.key;
    next = patchLayoutEditorRelatedListConfig(next, membersKey, DEFAULT_HOUSEHOLD_MEMBERS_RELATED_LIST_CONFIG);
    return next;
}

/** Layout B — Child-heavy enrollment and related-list rows. */
export function buildChildHeavyCertificationLayout(): LayoutDoc {
    let doc = buildLeadDrawerDefaultDoc();
    doc = applyOpportunityDrawerStarterTemplate(doc, "children_enrollment_list");
    const sectionKey = doc.sections[doc.sections.length - 1]!.key;
    return patchLayoutEditorRelatedListConfig(doc, sectionKey, {
        ...DEFAULT_CHILDREN_RELATED_LIST_CONFIG,
        tertiaryRow: { fields: ["child.schedule", "child.status"] },
    });
}

/** Layout C — KPI-heavy summary strip with tones and row groups. */
export function buildKpiHeavyCertificationLayout(): LayoutDoc {
    let doc = addRegisteredSection(emptyOpportunityDrawerDoc(), "lead_summary");
    doc = applyOpportunityDrawerStarterTemplate(doc, "kpi_strip");

    const kpiSection = doc.sections.find((s) => s.metadata?.layoutEditorSectionType === "widget");
    if (!kpiSection) return doc;
    const kpiKey = kpiSection.key;

    let withAttention = addSectionWidgetItem(doc, kpiKey, 0, 0, "attention");
    if (withAttention.ok) doc = withAttention.doc;
    let withTasks = addSectionWidgetItem(doc, kpiKey, 0, 0, "tasks");
    if (withTasks.ok) doc = withTasks.doc;

    const kpiIdx = doc.sections.findIndex((s) => s.key === kpiKey);
    if (kpiIdx >= 0) {
        const firstWidget = doc.sections[kpiIdx]!.rows[0]?.columns[0]?.items[0];
        if (firstWidget) {
            firstWidget.metadata = writeLayoutEditorWidgetStyle(firstWidget.metadata, {
                tone: "attention",
                description: "Needs review today",
            });
        }
    }

    doc = addWidgetOpportunityDrawerSection(doc, { title: "Work lane", zone: "summary_strip" });
    const workKey = doc.sections[doc.sections.length - 1]!.key;
    let withWork = addSectionWidgetItem(doc, workKey, 0, 0, "current_work");
    if (withWork.ok) doc = withWork.doc;

    const widgetSections = doc.sections.filter((s) => s.metadata?.layoutEditorSectionType === "widget");
    if (widgetSections.length >= 2) {
        doc = applySectionRowLayout(doc, widgetSections[0]!.key, "50_50");
    }
    return doc;
}

/** Layout D — Minimal lead overview. */
export function buildMinimalCertificationLayout(): LayoutDoc {
    return applyOpportunityDrawerStarterTemplate(emptyOpportunityDrawerDoc(), "minimal_lead_overview");
}

/** Layout E — Operational right-rail content without blocked placements. */
export function buildOperationalCertificationLayout(): LayoutDoc {
    let doc = buildLeadDrawerDefaultDoc();
    doc = applyOpportunityDrawerStarterTemplate(doc, "notes_activity");
    return doc;
}

/**
 * Layout recreation — approximate current production drawer using builder starters only.
 * Excludes copying the full default doc wholesale.
 */
export function buildProductionDrawerRecreationLayout(): LayoutDoc {
    let doc = emptyOpportunityDrawerDoc();
    doc = addRegisteredSection(doc, "lead_summary");
    doc = applyOpportunityDrawerStarterTemplate(doc, "household_contact_cluster");
    doc = addRegisteredSection(doc, "children_enrollment");
    doc = applyOpportunityDrawerStarterTemplate(doc, "lead_source");
    doc = applyOpportunityDrawerStarterTemplate(doc, "kpi_strip");
    doc = applyOpportunityDrawerStarterTemplate(doc, "notes_activity");
    doc = applyOpportunityDrawerStarterTemplate(doc, "relationship_list");
    return doc;
}

export function buildCertificationLayoutByKey(key: CertificationLayoutKey): LayoutDoc {
    switch (key) {
        case "contact_heavy":
            return buildContactHeavyCertificationLayout();
        case "child_heavy":
            return buildChildHeavyCertificationLayout();
        case "kpi_heavy":
            return buildKpiHeavyCertificationLayout();
        case "minimal":
            return buildMinimalCertificationLayout();
        case "operational":
            return buildOperationalCertificationLayout();
        case "production_recreation":
            return buildProductionDrawerRecreationLayout();
        default:
            return buildLeadDrawerDefaultDoc();
    }
}

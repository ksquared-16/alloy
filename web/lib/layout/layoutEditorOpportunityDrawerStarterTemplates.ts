/**
 * Opportunity drawer layout starter templates (Phase 5.14B).
 *
 * Each template appends configured sections using canonical 5.14A primitives.
 */

import { patchSection } from "@/lib/layout/builderOps";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { addLayoutBlockToSection } from "@/lib/layout/layoutEditorBlockRegistry";
import { addCustomOpportunityDrawerSection } from "@/lib/layout/layoutEditorGeneratedKeys";
import { addSectionWidgetItem } from "@/lib/layout/layoutEditorSectionComposition";
import {
    DEFAULT_CHILDREN_RELATED_LIST_CONFIG,
    DEFAULT_CONTACTS_RELATED_LIST_CONFIG,
    syncRelatedListSectionToItem,
    writeLayoutEditorRelatedListConfig,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import {
    addRelatedListOpportunityDrawerSection,
    addWidgetOpportunityDrawerSection,
    applySectionRowLayout,
} from "@/lib/layout/layoutEditorSectionLayout";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

export const OPPORTUNITY_DRAWER_STARTER_TEMPLATE_KEYS = [
    "contact_summary",
    "household_contact_cluster",
    "children_enrollment_list",
    "lead_source",
    "kpi_strip",
    "notes_activity",
    "relationship_list",
    "minimal_lead_overview",
] as const;

export type OpportunityDrawerStarterTemplateKey = (typeof OPPORTUNITY_DRAWER_STARTER_TEMPLATE_KEYS)[number];

export type OpportunityDrawerStarterTemplate = {
    key: OpportunityDrawerStarterTemplateKey;
    label: string;
    description: string;
};

export const OPPORTUNITY_DRAWER_STARTER_TEMPLATES: OpportunityDrawerStarterTemplate[] = [
    {
        key: "contact_summary",
        label: "Contact summary",
        description: "Primary contact fields in a compact content section.",
    },
    {
        key: "household_contact_cluster",
        label: "Household contact cluster",
        description: "Primary + secondary contact cards for household_contact-style layouts.",
    },
    {
        key: "children_enrollment_list",
        label: "Children & enrollment",
        description: "Related list with primary/secondary/tertiary child rows.",
    },
    {
        key: "lead_source",
        label: "Lead source",
        description: "Lead source and attribution fields.",
    },
    {
        key: "kpi_strip",
        label: "KPI strip",
        description: "Widget row with tour summary and follow-ups.",
    },
    {
        key: "notes_activity",
        label: "Notes / activity",
        description: "Communication notes and activity widgets for the right rail.",
    },
    {
        key: "relationship_list",
        label: "Relationship list",
        description: "Contacts related list with role, email, and phone rows.",
    },
    {
        key: "minimal_lead_overview",
        label: "Minimal lead overview",
        description: "Summary strip + one contact section + one child section.",
    },
];

function addRegisteredSectionFromDefault(doc: LayoutDoc, sectionKey: string): LayoutDoc {
    const template = buildLeadDrawerDefaultDoc().sections.find((s) => s.key === sectionKey);
    if (!template || doc.sections.some((s) => s.key === sectionKey)) return doc;
    return { ...doc, sections: [...doc.sections, JSON.parse(JSON.stringify(template))] };
}

export function applyOpportunityDrawerStarterTemplate(
    doc: LayoutDoc,
    templateKey: OpportunityDrawerStarterTemplateKey,
): LayoutDoc {
    switch (templateKey) {
        case "contact_summary": {
            let next = addCustomOpportunityDrawerSection(doc, { title: "Contact summary", zone: "main" });
            const sectionKey = next.sections[next.sections.length - 1]!.key;
            const withPrimary = addLayoutBlockToSection(next, sectionKey, "contact_primary");
            if (withPrimary.ok) next = withPrimary.doc;
            return next;
        }
        case "household_contact_cluster": {
            if (doc.sections.some((s) => s.key === "household_contact")) {
                return doc;
            }
            return addRegisteredSectionFromDefault(doc, "household_contact");
        }
        case "children_enrollment_list": {
            let next = addRelatedListOpportunityDrawerSection(doc, { title: "Children & enrollment", zone: "main" });
            const sectionKey = next.sections[next.sections.length - 1]!.key;
            const sIdx = next.sections.findIndex((s) => s.key === sectionKey);
            if (sIdx >= 0) {
                next = patchSection(next, sIdx, {
                    metadata: writeLayoutEditorRelatedListConfig(next.sections[sIdx]!.metadata, DEFAULT_CHILDREN_RELATED_LIST_CONFIG),
                });
                next = syncRelatedListSectionToItem(next, sectionKey);
            }
            return next;
        }
        case "lead_source":
            return addRegisteredSectionFromDefault(doc, "lead_source");
        case "kpi_strip": {
            let next = addWidgetOpportunityDrawerSection(doc, { title: "KPI strip", zone: "summary_strip" });
            const sectionKey = next.sections[next.sections.length - 1]!.key;
            let withTour = addSectionWidgetItem(next, sectionKey, 0, 0, "tour_summary");
            if (withTour.ok) next = withTour.doc;
            const withFollowUps = addSectionWidgetItem(next, sectionKey, 0, 0, "follow_ups");
            if (withFollowUps.ok) next = withFollowUps.doc;
            return next;
        }
        case "notes_activity": {
            let next = addRegisteredSectionFromDefault(doc, "notes_communication");
            next = addRegisteredSectionFromDefault(next, "activity");
            return next;
        }
        case "relationship_list": {
            let next = addRelatedListOpportunityDrawerSection(doc, { title: "Contacts", zone: "right_rail" });
            const sectionKey = next.sections[next.sections.length - 1]!.key;
            const sIdx = next.sections.findIndex((s) => s.key === sectionKey);
            if (sIdx >= 0) {
                next = patchSection(next, sIdx, {
                    metadata: writeLayoutEditorRelatedListConfig(next.sections[sIdx]!.metadata, DEFAULT_CONTACTS_RELATED_LIST_CONFIG),
                });
                next = syncRelatedListSectionToItem(next, sectionKey);
            }
            return next;
        }
        case "minimal_lead_overview": {
            let next = doc;
            if (!next.sections.some((s) => s.key === "lead_summary")) {
                const summary = buildLeadDrawerDefaultDoc().sections.find((s) => s.key === "lead_summary");
                if (summary) next = { ...next, sections: [summary, ...next.sections] };
            }
            next = addRegisteredSectionFromDefault(next, "household_contact");
            next = applyOpportunityDrawerStarterTemplate(next, "children_enrollment_list");
            return next;
        }
        default:
            return doc;
    }
}

export function buildCertificationLayoutDoc(templateKey: OpportunityDrawerStarterTemplateKey): LayoutDoc {
    let doc = buildLeadDrawerDefaultDoc();
    doc = applyOpportunityDrawerStarterTemplate(doc, templateKey);
    if (templateKey === "kpi_strip") {
        const keys = doc.sections.filter((s) => s.metadata?.layoutEditorSectionType === "widget").map((s) => s.key);
        if (keys.length >= 2) {
            doc = applySectionRowLayout(doc, keys[0]!, "50_50");
        }
    }
    return doc;
}

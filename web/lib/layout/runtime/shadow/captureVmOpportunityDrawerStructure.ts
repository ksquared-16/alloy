/**
 * Capture VM opportunity drawer structure for shadow parity (Phase 3).
 */

import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";
import { OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP } from "@/lib/adminV2/shellContracts/opportunityInquiryWorkflowTabs";
import type { DrawerStructureNode, DrawerStructureSnapshot } from "./drawerStructureSnapshot";

function pushNode(nodes: DrawerStructureNode[], node: DrawerStructureNode): void {
    nodes.push(node);
}

function captureSectionFields(
    nodes: DrawerStructureNode[],
    section: EntityDrawerSectionConfig,
    basePath: string,
): void {
    const secPath = `${basePath}.${section.key}`;
    pushNode(nodes, {
        kind: "section",
        key: section.key,
        label: section.title,
        path: secPath,
    });

    for (const field of section.fields ?? []) {
        pushNode(nodes, {
            kind: "field",
            key: field.key,
            refKey: field.key,
            label: field.label,
            path: `${secPath}.${field.key}`,
        });
    }

    for (const sub of section.subsections ?? []) {
        const subKey = "key" in sub && typeof sub.key === "string" ? sub.key : "sub";
        for (const field of sub.fields ?? []) {
            pushNode(nodes, {
                kind: "field",
                key: field.key,
                refKey: field.key,
                label: field.label,
                path: `${secPath}.${subKey}.${field.key}`,
            });
        }
    }
}

function captureInquirySummaryVirtual(nodes: DrawerStructureNode[], vm: OpportunityDrawerViewModel): void {
    const summary = vm.above_fold.render_model.inquiry_summary;
    if (!summary) return;

    const base = "overview.inquiry_summary";
    pushNode(nodes, {
        kind: "relationship_section",
        key: "family_contacts",
        label: "Family contacts",
        path: `${base}.family_contacts`,
    });

    pushNode(nodes, {
        kind: "section",
        key: "what_matters",
        label: "What matters",
        path: `${base}.what_matters`,
    });

    if (summary.show_right_column) {
        if (summary.right_column.tasks.visible) {
            pushNode(nodes, {
                kind: "widget",
                key: "tasks",
                label: "Tasks",
                path: `${base}.tasks`,
            });
        }
        if (summary.right_column.reminders.visible) {
            pushNode(nodes, {
                kind: "widget",
                key: "reminders",
                label: "Reminders",
                path: `${base}.reminders`,
            });
        }
    }

    if (summary.what_matters.tour_from_metadata || summary.what_matters.show_tour_bookings_enrichment) {
        pushNode(nodes, {
            kind: "section",
            key: "tour_slot",
            label: "Tour",
            path: `${base}.tour_slot`,
        });
    }
}

/** Capture comparable structure from a settled opportunity drawer VM. */
export function captureVmOpportunityDrawerStructure(vm: OpportunityDrawerViewModel): DrawerStructureSnapshot {
    const nodes: DrawerStructureNode[] = [];
    const tabs = vm.layout.tabs.length ? vm.layout.tabs : [...OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP];

    for (const tab of tabs) {
        pushNode(nodes, { kind: "tab", key: tab, path: `tabs.${tab}` });
    }

    const shell = vm.layout.shell;
    for (const section of shell.overview_sections ?? []) {
        captureSectionFields(nodes, section, "overview");
    }

    for (const renderSection of vm.above_fold.render_model.sections ?? []) {
        if (!nodes.some((n) => n.kind === "section" && n.key === renderSection.section_key)) {
            pushNode(nodes, {
                kind: "section",
                key: renderSection.section_key,
                path: `overview.${renderSection.section_key}`,
            });
        }
        if (renderSection.section_key === "inquiry_children") {
            pushNode(nodes, {
                kind: "repeater",
                key: "inquiry_children",
                label: "Inquiry children",
                path: "overview.inquiry_children",
            });
        }
    }

    captureInquirySummaryVirtual(nodes, vm);

    return {
        source: "vm",
        entityType: "opportunities",
        recordId: vm.entity.id,
        tabs,
        defaultTab: vm.layout.default_tab,
        nodes,
        scopeNote: "VM workflow drawer including tabs and inquiry_summary virtual blocks.",
    };
}

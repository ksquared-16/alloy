/**
 * Opportunity drawer shadow parity — Phase 3 tests.
 */

import { describe, expect, it } from "vitest";
import { compileOpportunityRecordDrawerShell } from "@/lib/adminV2/shellContracts/compileOpportunityRecordDrawerShell";
import {
    buildOpportunityDrawerViewModelAboveFold,
    compileOpportunityDrawerViewModelShell,
} from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelAboveFold";
import { OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP } from "@/lib/adminV2/shellContracts/opportunityInquiryWorkflowTabs";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    buildOpportunityDrawerShadowParityReport,
    captureLayoutRuntimeDrawerStructure,
    captureVmOpportunityDrawerStructure,
    compareOpportunityDrawerShadowParity,
    normalizeFieldRefKeyForParity,
} from "@/lib/layout/runtime";
import { isLayoutRuntimeShadowEnabledServer } from "@/lib/layout/featureFlag";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";

const WORKFLOW_V1_CFG = {
    inquiry_drawer_mode: "workflow_v1" as const,
    inquiry_workflow_sections: [
        { key: "inq_identity", title: "Identity", field_keys: ["name"], default_expanded: true },
    ],
    overview_section_order: ["inq_identity", "inquiry_children", "inquiry_tuition", "details"],
};

const FIELD_DEFS = [
    {
        field_key: "name",
        field_type: "text",
        label: "Name",
        section_key: "details",
        sort_order: 0,
        is_visible_in_drawer: true,
    },
];

function buildTestVm(recordId = "opp-shadow-1"): OpportunityDrawerViewModel {
    const shellCompiled = compileOpportunityRecordDrawerShell({
        config_json: WORKFLOW_V1_CFG,
        field_definitions: FIELD_DEFS,
        field_section_labels: { details: "Details" },
    })!;
    const record = { id: recordId, name: "Parity Test", status_key: "qualified" };
    const shell = compileOpportunityDrawerViewModelShell({ layoutConfig: WORKFLOW_V1_CFG, record })!;
    const aboveFold = buildOpportunityDrawerViewModelAboveFold({
        shell,
        record,
        reminders: { state: "empty", next_follow_up_iso: null, scheduled_send_count: 0, scheduled_sends: [] },
        task_assist_enabled: true,
        tour_display_source: "none",
    });

    return {
        generation: "test",
        structureSettled: true,
        compose_version: "1",
        entity: { type: "opportunity", id: recordId },
        workspace: { department_id: null, work_unit_id: null, queue_definition: null, lifecycle_rail: null, stage_context: null, work_intent_runtime: null, stage_work_runtime: null },
        first_paint: {
            settled: true,
            viewport_slots: [],
            dependencies: [],
            data: { tour_bookings: [], tasks_preview: null, scheduled_sends: null },
            deferred: [],
            background: [],
        },
        header: {
            title: "Parity Test",
            subtitle: null,
            status: { renderAs: "readonly_pill", label: "Qualified" },
            status_can_mutate: false,
            oper_trust_preview: null,
        },
        actions: { header: [], header_menu: [], manage_menu: [], record_header: null },
        layout: {
            mode: "workflow_v1",
            tabs: [...OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP] as DrawerTabKey[],
            default_tab: "overview",
            shell: {
                ...shell,
                overview_sections: shellCompiled.overview_sections,
                section_slots: shellCompiled.section_slots.map((s) => ({
                    section_key: s.section_key,
                    lifecycle: s.lifecycle,
                    shell_min_height_class: s.shell_min_height_class,
                })),
            },
        },
        activity: {
            communicationsPreviewVm: null,
        },
        above_fold: { render_model: aboveFold, record },
        summaries: {
            tasks: { state: "loaded", open_count: 0, open_tasks: [] },
            active_tour_bookings: [], operator_relevant_tour_booking: null,
            reminders: { state: "empty", next_follow_up_iso: null, scheduled_send_count: 0, scheduled_sends: [] },
            bos: null,
            attention: null,
        },
        background_refresh: { allowed: [] },
        timing: { compose_ms: 0, phases_ms: {} },
    };
}

describe("opportunityDrawerShadowParity — capture", () => {
    it("captures VM tabs, sections, widgets, and repeater", () => {
        const vm = buildTestVm();
        const snap = captureVmOpportunityDrawerStructure(vm);
        expect(snap.source).toBe("vm");
        expect(snap.tabs).toEqual(OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP);
        expect(snap.nodes.some((n) => n.kind === "widget" && n.key === "tasks")).toBe(true);
        expect(snap.nodes.some((n) => n.kind === "repeater" && n.key === "inquiry_children")).toBe(true);
        expect(snap.nodes.some((n) => n.kind === "relationship_section" && n.key === "family_contacts")).toBe(true);
    });

    it("captures layout runtime sections, fields, widgets, repeaters", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const snap = captureLayoutRuntimeDrawerStructure({ doc });
        expect(snap.source).toBe("layout_runtime");
        expect(snap.nodes.some((n) => n.kind === "section" && n.key === "lead_summary")).toBe(true);
        expect(snap.nodes.some((n) => n.kind === "widget" && n.key === "tasks")).toBe(true);
        expect(snap.nodes.some((n) => n.kind === "repeater" && n.key === "children")).toBe(true);
        expect(snap.nodes.some((n) => n.refKey === "person.primary_contact_name")).toBe(true);
    });
});

describe("opportunityDrawerShadowParity — compare", () => {
    it("produces parity report with explicit mismatches for same record context", () => {
        const vm = buildTestVm();
        const doc = buildLeadDrawerDefaultDoc();
        const report = buildOpportunityDrawerShadowParityReport({ vm, doc });

        expect(report.recordId).toBe("opp-shadow-1");
        expect(report.matched.widgets).toContain("tasks");
        expect(report.matched.widgets).toContain("reminders");
        expect(report.mismatches.length).toBeGreaterThan(0);
        expect(report.missingCoverage.vmOnly.length).toBeGreaterThan(0);
        expect(report.summary).toContain("parity score");
    });

    it("surfaces tab mismatches when layout only models overview", () => {
        const vm = captureVmOpportunityDrawerStructure(buildTestVm());
        const layout = captureLayoutRuntimeDrawerStructure({ doc: buildLeadDrawerDefaultDoc() });
        const report = compareOpportunityDrawerShadowParity({ vm, layout });

        const tabMissing = report.mismatches.filter((m) => m.category === "tab_missing_in_layout");
        expect(tabMissing.some((m) => m.vmKey === "communications")).toBe(true);
        expect(tabMissing.some((m) => m.vmKey === "notes")).toBe(true);
    });

    it("matches inquiry_children repeater to layout children repeater", () => {
        const vm = captureVmOpportunityDrawerStructure(buildTestVm());
        const layout = captureLayoutRuntimeDrawerStructure({ doc: buildLeadDrawerDefaultDoc() });
        const report = compareOpportunityDrawerShadowParity({ vm, layout });
        expect(report.matched.repeaters).toContain("inquiry_children");
    });

    it("normalizes opportunity-prefixed refKeys for field parity", () => {
        expect(normalizeFieldRefKeyForParity("opportunity.source")).toBe("source");
        expect(normalizeFieldRefKeyForParity("person.primary_phone")).toBe("person.primary_phone");
    });
});

describe("opportunityDrawerShadowParity — flags", () => {
    it("shadow flag defaults off", () => {
        expect(isLayoutRuntimeShadowEnabledServer()).toBe(false);
    });
});

/**
 * Real opportunity record shadow validation — Phase 4 tests.
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
    buildRealRecordShadowValidationFromVm,
    enrichShadowParityReport,
    buildOpportunityDrawerShadowParityReport,
    captureLayoutRuntimeDrawerStructure,
    captureVmOpportunityDrawerStructure,
} from "@/lib/layout/runtime/shadow";
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

function buildRealisticVm(recordId: string): OpportunityDrawerViewModel {
    const shellCompiled = compileOpportunityRecordDrawerShell({
        config_json: WORKFLOW_V1_CFG,
        field_definitions: FIELD_DEFS,
        field_section_labels: { details: "Details" },
    })!;
    const record = { id: recordId, name: "Real Record Test", status_key: "qualified" };
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
            title: "Real Record Test",
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
            reminders: { state: "ready", next_follow_up_iso: null, scheduled_send_count: 0, scheduled_sends: [] },
            bos: null,
            attention: null,
        },
        background_refresh: { allowed: [] },
        timing: { compose_ms: 12, phases_ms: {} },
    };
}

describe("realOpportunityShadowValidation — enrich", () => {
    it("reports coverage percentages by category", () => {
        const vm = buildRealisticVm("opp-real-1");
        const doc = buildLeadDrawerDefaultDoc();
        const report = buildRealRecordShadowValidationFromVm(vm, doc, { layoutSource: "registry" });

        expect(report.opportunityId).toBe("opp-real-1");
        expect(report.coverage.overall).toBe(report.parityScore);
        expect(report.coverage.widgets.total).toBeGreaterThan(0);
        expect(report.coverage.widgets.percent).toBeGreaterThanOrEqual(0);
        expect(report.coverage.fields.total).toBeGreaterThanOrEqual(0);
        expect(typeof report.coverage.binding_classes.base_field?.percent).toBe("number");
    });

    it("identifies top convergence gaps and readiness level", () => {
        const vm = buildRealisticVm("opp-real-2");
        const doc = buildLeadDrawerDefaultDoc();
        const report = buildRealRecordShadowValidationFromVm(vm, doc);

        expect(report.topGaps.length).toBeGreaterThan(0);
        expect(report.topGaps.length).toBeLessThanOrEqual(10);
        expect(["not_ready", "partial", "approaching", "ready"]).toContain(report.readiness.level);
        expect(report.readiness.blockers.length).toBeGreaterThanOrEqual(0);
        expect(report.readiness.notes.some((n) => n.includes("Shadow-only"))).toBe(true);
    });

    it("lists missing, extra, and unsupported buckets", () => {
        const vm = buildRealisticVm("opp-real-3");
        const doc = buildLeadDrawerDefaultDoc();
        const base = buildOpportunityDrawerShadowParityReport({ vm, doc });
        const enriched = enrichShadowParityReport({
            base,
            vm: captureVmOpportunityDrawerStructure(vm),
            layout: captureLayoutRuntimeDrawerStructure({ doc, recordId: vm.entity.id }),
            opportunityId: vm.entity.id,
        });

        expect(Array.isArray(enriched.missingCoverage.vmOnly)).toBe(true);
        expect(Array.isArray(enriched.extra)).toBe(true);
        expect(Array.isArray(enriched.unmapped)).toBe(true);
        expect(Array.isArray(enriched.unsupported)).toBe(true);
    });

    it("measures binding classes on layout snapshot", () => {
        const vm = buildRealisticVm("opp-real-4");
        const doc = buildLeadDrawerDefaultDoc();
        const layout = captureLayoutRuntimeDrawerStructure({ doc, recordId: vm.entity.id });
        const bindingNodes = layout.nodes.filter((n) => n.bindingClass);
        expect(bindingNodes.length).toBeGreaterThan(0);

        const report = buildRealRecordShadowValidationFromVm(vm, doc);
        expect(Object.keys(report.coverage.binding_classes).length).toBeGreaterThan(0);
    });
});

describe("realOpportunityShadowValidation — real record path contract", () => {
    it("buildRealRecordShadowValidationFromVm uses opportunity entity id", () => {
        const vm = buildRealisticVm("00000000-0000-4000-8000-000000000001");
        const report = buildRealRecordShadowValidationFromVm(vm, buildLeadDrawerDefaultDoc());
        expect(report.recordId).toBe("00000000-0000-4000-8000-000000000001");
        expect(report.summary).toContain("Readiness:");
    });
});

import { describe, expect, it } from "vitest";
import { buildOpportunityDrawerPipelineState } from "@/lib/adminV2/drawerPipeline";
import type { DrawerShellContract } from "@/lib/adminV2/drawerPipeline/types";

function minimalOpportunityShell(overrides?: Partial<DrawerShellContract["geometry"]>): DrawerShellContract {
    return {
        entity_type: "opportunity",
        layout_version: "test-v1",
        tabs: ["overview"],
        overview_sections: [
            { key: "inquiry_children", title: "Children", defaultExpanded: true, collapsible: true, fields: [] },
        ],
        section_slots: [
            { section_key: "inquiry_children", lifecycle: "immediate" },
        ],
        geometry: {
            summary_right_column_reserved: true,
            family_contacts_in_summary: true,
            ...overrides,
        },
        layout_config_snapshot: { inquiry_drawer_mode: "workflow_v1" },
    };
}

describe("buildOpportunityDrawerPipelineState", () => {
    it("reserves two-column inquiry summary from shell geometry without full hydrate", () => {
        const state = buildOpportunityDrawerPipelineState({
            shell: minimalOpportunityShell(),
            record: { id: "opp-1", _record_surface: "drawer_primary" },
            drawer_id: "opp-1",
            background_full_failed: false,
            workflow_v1: true,
            above_fold_locked: true,
            first_paint_gates_active: true,
            enrichment_layout_ready: false,
            below_fold_enrichment_ready: false,
            task_assist_enabled: true,
        });
        expect(state.above_fold.inquiry_summary?.column_mode).toBe("two");
        expect(state.above_fold.inquiry_summary?.show_right_column).toBe(true);
        expect(state.above_fold.inquiry_summary?.family_contacts.use_full_panel).toBe(true);
    });

    it("does not surface relationship warnings while full is pending", () => {
        const state = buildOpportunityDrawerPipelineState({
            shell: minimalOpportunityShell({ summary_right_column_reserved: false }),
            record: { id: "opp-1", _record_surface: "drawer_primary" },
            drawer_id: "opp-1",
            background_full_failed: false,
            workflow_v1: true,
            above_fold_locked: false,
            first_paint_gates_active: false,
            enrichment_layout_ready: true,
            below_fold_enrichment_ready: true,
            task_assist_enabled: true,
        });
        const fc = state.above_fold.inquiry_summary?.family_contacts;
        expect(fc?.relationships_pending).toBe(true);
        expect(fc?.relationships_full_hydrate_failed).toBe(false);
    });

    it("shows orchestrator handoff strip on drawer_primary without full hydrate", () => {
        const state = buildOpportunityDrawerPipelineState({
            shell: minimalOpportunityShell(),
            record: { id: "opp-1", _record_surface: "drawer_primary" },
            drawer_id: "opp-1",
            background_full_failed: false,
            workflow_v1: true,
            above_fold_locked: true,
            first_paint_gates_active: true,
            enrichment_layout_ready: false,
            below_fold_enrichment_ready: false,
            task_assist_enabled: true,
        });
        expect(state.above_fold.inquiry_summary?.task_preview.show_operational_strip).toBe(true);
    });

    it("hides orchestrator handoff strip on drawer_visible (primary not loaded)", () => {
        const state = buildOpportunityDrawerPipelineState({
            shell: minimalOpportunityShell(),
            record: { id: "opp-1", _record_surface: "drawer_visible" },
            drawer_id: "opp-1",
            background_full_failed: false,
            workflow_v1: true,
            above_fold_locked: true,
            first_paint_gates_active: true,
            enrichment_layout_ready: false,
            below_fold_enrichment_ready: false,
            task_assist_enabled: true,
        });
        expect(state.above_fold.inquiry_summary?.task_preview.show_operational_strip).toBe(false);
    });

    it("exposes background full failure on family contacts slot only", () => {
        const state = buildOpportunityDrawerPipelineState({
            shell: minimalOpportunityShell(),
            record: { id: "opp-1", _record_surface: "full" },
            drawer_id: "opp-1",
            background_full_failed: true,
            workflow_v1: true,
            above_fold_locked: false,
            first_paint_gates_active: false,
            enrichment_layout_ready: true,
            below_fold_enrichment_ready: true,
            task_assist_enabled: true,
        });
        expect(state.above_fold.inquiry_summary?.family_contacts.relationships_full_hydrate_failed).toBe(
            true
        );
        expect(state.above_fold.inquiry_summary?.family_contacts.relationships_pending).toBe(false);
    });
});

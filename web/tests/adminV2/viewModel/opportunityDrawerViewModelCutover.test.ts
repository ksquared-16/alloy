import { describe, expect, it } from "vitest";

import { buildOpportunityDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import { buildOpportunityDrawerPipelineStateFromViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerPipelineStateFromViewModel";
import { aboveFoldSectionsStructureSettled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelContract";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";

function minimalSettledViewModel(): OpportunityDrawerViewModel {
    return {
        generation: "gen-test",
        structureSettled: true,
        compose_version: "1.0.0",
        entity: { type: "opportunity", id: "opp-1" },
        workspace: { department_id: "dept-1", work_unit_id: "wu-1" },
        header: {
            title: "Test Opp",
            subtitle: null,
            status: {
                renderAs: "dropdown",
                status_key: "new",
                label: "New",
                options: [{ status_key: "new", label: "New", sort_order: 0 }],
            },
            oper_trust_preview: null,
        },
        actions: {
            header: [
                {
                    key: "schedule_tour",
                    label: "Schedule tour",
                    description: null,
                    action_type: "workflow",
                    icon: null,
                    style: null,
                    display_style: "button",
                    payload: {},
                    workflow_id: null,
                },
            ],
        },
        layout: {
            mode: "workflow_v1",
            tabs: ["overview"],
            default_tab: "overview",
            shell: {
                entity_type: "opportunity",
                layout_version: "default",
                tabs: ["overview"],
                overview_sections: [],
                section_slots: [],
                geometry: { summary_right_column_reserved: true },
                layout_config_snapshot: { inquiry_drawer_mode: "workflow_v1", overview_section_order: [] },
            },
        },
        above_fold: {
            render_model: {
                sections: [
                    {
                        section_key: "inquiry_summary",
                        lifecycle: "immediate",
                        default_expanded: true,
                        collapsible: false,
                        value_phase: "value",
                    },
                ],
                inquiry_summary: {
                    column_mode: "two",
                    show_right_column: true,
                    family_contacts: {
                        use_full_panel: false,
                        reserved: true,
                        value_phase: "value",
                    },
                    right_column: {
                        tasks: {
                            visible: true,
                            state: "ready",
                            open_count: 1,
                            open_tasks: [
                                {
                                    id: "task-1",
                                    title: "Call family",
                                    due_at: null,
                                    urgency: "normal",
                                },
                            ],
                        },
                        reminders: {
                            visible: true,
                            state: "empty",
                            next_follow_up_iso: null,
                        },
                        orchestrator_handoff: { visible: false, state: "hidden" },
                    },
                    task_preview: {
                        confirmed: true,
                        open_count: 1,
                        open_tasks: [],
                        show_reminders_placeholder: false,
                        show_operational_strip: false,
                    },
                    what_matters: {
                        reserved: false,
                        tour_from_metadata: false,
                        show_tour_bookings_enrichment: false,
                    },
                },
            },
            record: {
                id: "opp-1",
                status_key: "new",
                _status_display: "New",
                _inquiry_summary_task_preview: {
                    open_count: 1,
                    open_tasks: [{ id: "task-1", title: "Call family", due_at: null, urgency: "normal" }],
                },
            },
        },
        summaries: {
            tasks: { state: "loaded", open_count: 1, open_tasks: [] },
            reminders: { state: "empty", next_follow_up_iso: null, scheduled_send_count: 0, scheduled_sends: [] },
            bos: null,
            attention: null,
        },
        background_refresh: { allowed: ["task_status"] },
        timing: { compose_ms: 40, phases_ms: {} },
    };
}

describe("buildOpportunityDrawerOpenPreloadFromViewModel", () => {
    it("maps settled VM to composed-open preload with header actions and full paint surface", () => {
        const vm = minimalSettledViewModel();
        const preload = buildOpportunityDrawerOpenPreloadFromViewModel(vm);

        expect(preload.openPath).toBe("view_model");
        expect(preload.opportunityId).toBe("opp-1");
        expect(preload.headerActions.header).toHaveLength(1);
        expect(preload.headerActions.header?.[0]?.key).toBe("schedule_tour");
        expect(preload.primaryEntity._record_surface).toBe("full");
        expect(preload.bootstrap.record_layout?.inquiry_drawer_mode).toBe("workflow_v1");
        expect(preload.enrichmentHeldUntilInteraction).toBe(false);
    });
});

describe("buildOpportunityDrawerPipelineStateFromViewModel", () => {
    it("pins settled above-fold with no skeleton/pending section phases", () => {
        const vm = minimalSettledViewModel();
        const pipeline = buildOpportunityDrawerPipelineStateFromViewModel(vm);

        expect(aboveFoldSectionsStructureSettled(pipeline.above_fold.sections)).toBe(true);
        expect(pipeline.above_fold.inquiry_summary?.right_column?.tasks.state).toBe("ready");
        expect(pipeline.above_fold.inquiry_summary?.right_column?.reminders.state).toBe("empty");
        expect(pipeline.enrichment.full_complete).toBe(true);
        expect(pipeline.enrichment.full_pending).toBe(false);
    });
});

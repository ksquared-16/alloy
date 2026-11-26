import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { OpportunityDrawerFirstPaintDependencyState } from "@/lib/adminV2/viewModel/drawer/types";

function baseFirstPaintDependencies(): OpportunityDrawerFirstPaintDependencyState[] {
    return [
        {
            key: "record_visible",
            disposition: "first_paint_required",
            status: "ready",
            satisfied_by: "record_metadata",
        },
        {
            key: "status_definitions",
            disposition: "first_paint_required",
            status: "ready",
            satisfied_by: "server_fetch",
        },
        {
            key: "header_actions",
            disposition: "first_paint_required",
            status: "ready",
            satisfied_by: "server_fetch",
        },
        {
            key: "tour_bookings",
            disposition: "first_paint_required",
            status: "empty",
            satisfied_by: "server_fetch",
        },
        {
            key: "tasks_preview",
            disposition: "first_paint_required",
            status: "ready",
            satisfied_by: "record_metadata",
        },
        {
            key: "scheduled_sends",
            disposition: "first_paint_required",
            status: "empty",
            satisfied_by: "server_fetch",
        },
    ];
}

/** Shared settled VM fixture for cutover / preload / load tests. */
export function minimalSettledOpportunityDrawerViewModel(
    overrides: Partial<OpportunityDrawerViewModel> = {}
): OpportunityDrawerViewModel {
    const dependencies = baseFirstPaintDependencies();
    const base: OpportunityDrawerViewModel = {
        generation: "gen-test",
        structureSettled: true,
        compose_version: "1.2.0",
        entity: { type: "opportunity", id: "opp-1" },
        workspace: {
            department_id: "dept-1",
            work_unit_id: "wu-1",
            queue_definition: null,
            lifecycle_rail: null,
            stage_context: null,
            work_intent_runtime: null,
            stage_work_runtime: null,
        },
        first_paint: {
            settled: true,
            viewport_slots: [
                "header",
                "status",
                "location",
                "actions",
                "tabs",
                "lead_summary",
                "tour_slot",
                "tasks_summary",
                "reminders_summary",
            ],
            dependencies,
            data: {
                tour_bookings: [],
                tasks_preview: {
                    state: "loaded",
                    open_count: 1,
                    open_tasks: [
                        {
                            id: "task-1",
                            title: "Call family",
                            due_at: "2026-06-04T12:00:00.000Z",
                            status: "open",
                            source: "task_assist",
                        },
                    ],
                },
                scheduled_sends: {
                    state: "empty",
                    next_follow_up_iso: null,
                    scheduled_send_count: 0,
                    scheduled_sends: [],
                },
            },
            deferred: [],
            background: [],
        },
        header: {
            title: "Test Opp",
            subtitle: null,
            status: {
                renderAs: "dropdown",
                status_key: "new",
                label: "New",
                options: [{ status_key: "new", label: "New", sort_order: 0 }],
            },
            status_can_mutate: true,
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
            header_menu: [
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
            manage_menu: [
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
            record_header: null,
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
        activity: {
            communicationsPreviewVm: null,
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
                        shell_reserved_additional_count: 0,
                        relationships_full_hydrate_failed: false,
                        relationships_pending: false,
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
                                    due_at: "2026-06-01T12:00:00.000Z",
                                    status: "open",
                                    source: "task_assist",
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
                        reserved: true,
                        tour_from_metadata: false,
                        show_tour_bookings_enrichment: false,
                    },
                },
            },
            record: {
                id: "opp-1",
                status_key: "new",
                _status_display: "New",
                _identity: {
                    household: { id: "cust-1", label: "Smith" },
                    primary_person: { id: "p-1", label: "Parent" },
                    primary_contact: null,
                    primary_child: null,
                    inquiry: { title: "Test Opp", lines: [], section_key: "quote" },
                },
                _inquiry_children: [],
                _inquiry_summary_tasks: {
                    state: "loaded",
                    open_count: 1,
                    open_tasks: [
                        {
                            id: "task-1",
                            title: "Call family",
                            due_at: "2026-06-04T12:00:00.000Z",
                            status: "open",
                            source: "task_assist",
                        },
                    ],
                },
            },
        },
        summaries: {
            active_tour_bookings: [],
            operator_relevant_tour_booking: null,
            tasks: {
                state: "loaded",
                open_count: 1,
                open_tasks: [
                    {
                        id: "task-1",
                        title: "Call family",
                        due_at: "2026-06-04T12:00:00.000Z",
                        status: "open",
                        source: "task_assist",
                    },
                ],
            },
            reminders: {
                state: "empty",
                next_follow_up_iso: null,
                scheduled_send_count: 0,
                scheduled_sends: [],
            },
            bos: null,
            attention: null,
        },
        background_refresh: { allowed: ["task_status", "scheduled_send_status", "readiness_values"] },
        timing: { compose_ms: 40, phases_ms: {} },
    };
    return { ...base, ...overrides };
}

import type {
    OpportunityDrawerFirstPaintDependencyState,
    OpportunityDrawerViewModel,
} from "@/lib/adminV2/viewModel/drawer/types";

import { enrichDemoViewModelForCurrentWorkPreview } from "./focusPanelCurrentWorkPreviewSeed";

/**
 * Demo data for the Surfaces editor replica of the Enrollment Focus Panel Summary.
 *
 * The /settings/surfaces editor renders the real runtime presentation components
 * (`OpportunityFocusPanelModeGrid` → `FocusPanelCardRenderer` → `UniversalCard`)
 * so the editable surface is an exact replica of the published runtime. Because
 * the editor is not opened against a live record, it needs a representative,
 * fully-settled view model. This mirrors the proven minimal settled VM fixture.
 */
function demoFirstPaintDependencies(): OpportunityDrawerFirstPaintDependencyState[] {
    return [
        { key: "record_visible", disposition: "first_paint_required", status: "ready", satisfied_by: "record_metadata" },
        { key: "status_definitions", disposition: "first_paint_required", status: "ready", satisfied_by: "server_fetch" },
        { key: "header_actions", disposition: "first_paint_required", status: "ready", satisfied_by: "server_fetch" },
        { key: "tour_bookings", disposition: "first_paint_required", status: "empty", satisfied_by: "server_fetch" },
        { key: "tasks_preview", disposition: "first_paint_required", status: "ready", satisfied_by: "record_metadata" },
        { key: "scheduled_sends", disposition: "first_paint_required", status: "empty", satisfied_by: "server_fetch" },
    ];
}

export function buildDemoFocusPanelSummaryViewModel(): {
    vm: OpportunityDrawerViewModel;
    record: Record<string, unknown>;
} {
    const dependencies = demoFirstPaintDependencies();
    const vm: OpportunityDrawerViewModel = {
        generation: "surface-editor-demo",
        structureSettled: true,
        compose_version: "1.2.0",
        entity: { type: "opportunity", id: "demo-opp-1" },
        workspace: {
            department_id: "demo-dept-1",
            work_unit_id: "demo-wu-1",
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
                            id: "demo-task-1",
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
            title: "Avery Johnson — Enrollment",
            subtitle: null,
            status: {
                renderAs: "dropdown",
                status_key: "tour_scheduled",
                label: "Tour scheduled",
                options: [
                    { status_key: "new", label: "New", sort_order: 0 },
                    { status_key: "tour_scheduled", label: "Tour scheduled", sort_order: 1 },
                ],
            },
            status_can_mutate: false,
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
                                    id: "demo-task-1",
                                    title: "Call family",
                                    due_at: "2026-06-01T12:00:00.000Z",
                                    status: "open",
                                    source: "task_assist",
                                },
                            ],
                        },
                        reminders: { visible: true, state: "empty", next_follow_up_iso: null },
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
                id: "demo-opp-1",
                status_key: "tour_scheduled",
                _status_display: "Tour scheduled",
                _identity: {
                    household: { id: "demo-cust-1", label: "Johnson Family" },
                    primary_person: { id: "demo-p-1", label: "Jordan Johnson" },
                    primary_contact: { id: "demo-p-1", label: "Jordan Johnson" },
                    primary_child: { id: "demo-c-1", label: "Avery Johnson" },
                    inquiry: { title: "Avery Johnson — Enrollment", lines: [], section_key: "quote" },
                },
                // Household collection — primary + secondary contacts (related list, not flattened).
                "person.primary_contact_name": "Jordan Johnson",
                "person.primary_phone": "(555) 012-3456",
                "person.primary_email": "jordan.johnson@example.com",
                "person.secondary_contact_name": "Taylor Johnson",
                "person.secondary_phone": "(555) 987-6543",
                "person.secondary_email": "taylor.johnson@example.com",
                primary_person_id: "demo-p-1",
                _opportunity_persons: [
                    {
                        person_id: "demo-p-2",
                        role_type: "parent",
                        name: "Taylor Johnson",
                        phone: "(555) 987-6543",
                        email: "taylor.johnson@example.com",
                    },
                    {
                        person_id: "demo-p-emergency",
                        role_type: "emergency_contact",
                        name: "Sam Rivera",
                        phone: "(555) 444-0199",
                        email: "sam.rivera@example.com",
                    },
                ],
                // Children collection — multiple siblings (related list, not flattened).
                _inquiry_children: [
                    {
                        id: "demo-c-1",
                        customer_member_id: "cm-1",
                        person_id: "demo-p-c1",
                        display_name: "Avery Johnson",
                        age: "3",
                        outcome_status_key: "enrolling",
                        outcome_status_label: "Enrolling",
                        linked_on_inquiry: true,
                    },
                    {
                        id: "demo-c-2",
                        customer_member_id: "cm-2",
                        person_id: "demo-p-c2",
                        display_name: "Riley Johnson",
                        age: "5",
                        outcome_status_key: "tour_scheduled",
                        outcome_status_label: "Tour scheduled",
                        linked_on_inquiry: true,
                    },
                ],
                _inquiry_summary_tasks: {
                    state: "loaded",
                    open_count: 1,
                    open_tasks: [
                        {
                            id: "demo-task-1",
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
                        id: "demo-task-1",
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
        timing: { compose_ms: 0, phases_ms: {} },
    };

    enrichDemoViewModelForCurrentWorkPreview(vm);

    return { vm, record: vm.above_fold.record as unknown as Record<string, unknown> };
}

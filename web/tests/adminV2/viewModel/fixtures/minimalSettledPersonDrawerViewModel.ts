import type { PersonDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/person/types";

export function minimalSettledPersonDrawerViewModel(
    overrides: Partial<PersonDrawerViewModel> = {}
): PersonDrawerViewModel {
    const base: PersonDrawerViewModel = {
        generation: "gen-person-test",
        structureSettled: true,
        compose_version: "1.0.0",
        entity: { type: "person", id: "person-1" },
        surface: "parent",
        first_paint: {
            settled: true,
            viewport_slots: ["header", "status", "title", "lifecycle_rail", "summary"],
            dependencies: [
                { key: "record_full", disposition: "first_paint_required", status: "ready", satisfied_by: "server_fetch" },
                { key: "status_definitions", disposition: "first_paint_required", status: "ready", satisfied_by: "server_fetch" },
                { key: "composed_sections", disposition: "first_paint_required", status: "ready", satisfied_by: "server_fetch" },
            ],
            data: {},
            deferred: [],
            background: [],
        },
        header: {
            title: "Jane Doe",
            subtitle: null,
            status_label: "Active",
            status: {
                renderAs: "dropdown",
                status_key: "active",
                label: "Active",
                options: [
                    { status_key: "active", label: "Active", sort_order: 0 },
                    { status_key: "inactive", label: "Inactive", sort_order: 1 },
                ],
            },
        },
        record: { id: "person-1", first_name: "Jane", last_name: "Doe" },
        layout: { variant_key: "parent", operating_sections: ["parent_summary", "household"] },
        background_refresh: { allowed: ["record_visibility"] },
        timing: { compose_ms: 35, phases_ms: {} },
    };
    return { ...base, ...overrides };
}

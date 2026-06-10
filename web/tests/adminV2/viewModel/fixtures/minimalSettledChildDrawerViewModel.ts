import type { ChildDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/child/types";

export function minimalSettledChildDrawerViewModel(
    overrides: Partial<ChildDrawerViewModel> = {}
): ChildDrawerViewModel {
    const base: ChildDrawerViewModel = {
        generation: "gen-child-test",
        structureSettled: true,
        compose_version: "1.0.0",
        entity: { type: "person", id: "child-1" },
        surface: "child",
        first_paint: {
            settled: true,
            viewport_slots: ["header", "title", "lifecycle_rail", "child_summary"],
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
            title: "Sam Smith",
            subtitle: null,
            status_label: "Enrolled",
            status: {
                renderAs: "dropdown",
                status_key: "active",
                label: "Active",
                options: [
                    { status_key: "active", label: "Active", sort_order: 0 },
                    { status_key: "future_start", label: "Future start", sort_order: 1 },
                ],
            },
        },
        record: { id: "child-1", first_name: "Sam", last_name: "Smith" },
        layout: { variant_key: "child", operating_sections: ["child_summary", "household"] },
        background_refresh: { allowed: ["record_visibility"] },
        timing: { compose_ms: 30, phases_ms: {} },
    };
    return { ...base, ...overrides };
}

/**
 * Layout composition mutation classes — Settings control plane only.
 * @see docs/sprints/05_2026/record_experience_builder_phase_1.md §7
 */

export const LAYOUT_MUTATION_CLASS = {
    A_DRAWER_CHROME: "A_drawer_chrome",
    B_FIELD_PLACEMENT: "B_field_placement",
    C_CATALOG_SECTION: "C_catalog_section",
    D_ACTIONS_READ_ONLY: "D_actions_read_only",
} as const;

export type LayoutMutationClass = (typeof LAYOUT_MUTATION_CLASS)[keyof typeof LAYOUT_MUTATION_CLASS];

export const LAYOUT_MUTATION_CLASS_LABELS: Record<LayoutMutationClass, string> = {
    A_drawer_chrome: "Drawer section order, visibility, workflow titles (record_drawer_layouts.config_json)",
    B_field_placement: "Field section_key and sort_order (field_definitions)",
    C_catalog_section: "Catalog section labels and archive (field_section_definitions)",
    D_actions_read_only: "Action placements preview only (action_placements)",
};

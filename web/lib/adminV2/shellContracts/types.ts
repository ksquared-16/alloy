import type { DrawerTabKey } from "@/lib/entityPresentation";
import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

/** How a drawer section participates in first paint vs deferred hydrate. */
export type ShellSectionLifecycle =
    | "immediate"
    | "reserved_placeholder"
    | "below_fold_deferred"
    | "hidden";

export type ShellSectionSlot = {
    section_key: string;
    lifecycle: ShellSectionLifecycle;
    /** Tailwind min-height class reserved at shell paint (geometry contract). */
    shell_min_height_class?: string;
};

export type RecordDrawerShellGeometry = {
    header_actions_rail_min_h_class: string;
    inquiry_children_min_h_class: string;
    /** Two-column inquiry summary reserves right rail even before task/comms hydrate. */
    summary_right_column_reserved: boolean;
    family_contacts_in_summary: boolean;
    oper_strip_slot: boolean;
    communications_tab: boolean;
};

/** Frozen structure for opportunity drawer — values hydrate inside slots only. */
export type RecordDrawerShellContract = {
    entity_type: "opportunity";
    inquiry_drawer_mode: "workflow_v1" | "classic";
    layout_version: string;
    tabs: DrawerTabKey[];
    overview_sections: EntityDrawerSectionConfig[];
    section_slots: ShellSectionSlot[];
    geometry: RecordDrawerShellGeometry;
    /** Source config snapshot hash inputs (not full JSON). */
    layout_config: Pick<
        RecordLayoutConfigJson,
        "inquiry_drawer_mode" | "overview_section_order" | "overview_hidden_sections"
    >;
};

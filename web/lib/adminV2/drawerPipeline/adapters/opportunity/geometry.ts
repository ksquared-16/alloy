import type { DrawerShellContract } from "@/lib/adminV2/drawerPipeline/types";

export type OpportunityDrawerGeometry = {
    header_actions_rail_min_h_class: string;
    inquiry_children_min_h_class: string;
    summary_right_column_reserved: boolean;
    family_contacts_in_summary: boolean;
    oper_strip_slot: boolean;
    communications_tab: boolean;
};

export function readOpportunityDrawerGeometry(shell: DrawerShellContract): OpportunityDrawerGeometry {
    const g = shell.geometry;
    return {
        header_actions_rail_min_h_class: String(g.header_actions_rail_min_h_class ?? "min-h-[2.75rem]"),
        inquiry_children_min_h_class: String(g.inquiry_children_min_h_class ?? "min-h-[2.75rem]"),
        summary_right_column_reserved: g.summary_right_column_reserved === true,
        family_contacts_in_summary: g.family_contacts_in_summary === true,
        oper_strip_slot: g.oper_strip_slot === true,
        communications_tab: g.communications_tab === true,
    };
}

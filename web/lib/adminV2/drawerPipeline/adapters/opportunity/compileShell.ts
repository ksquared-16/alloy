import {
    compileOpportunityRecordDrawerShell,
    compileOpportunityRecordDrawerShellFromEntity,
    type CompileOpportunityRecordDrawerShellInput,
} from "@/lib/adminV2/shellContracts/compileOpportunityRecordDrawerShell";
import type { RecordDrawerShellContract } from "@/lib/adminV2/shellContracts/types";
import type { DrawerShellContract } from "@/lib/adminV2/drawerPipeline/types";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

/** Map frozen opportunity shell contract → generic drawer pipeline contract. */
export function opportunityShellToDrawerShellContract(opp: RecordDrawerShellContract): DrawerShellContract {
    return {
        entity_type: "opportunity",
        layout_version: opp.layout_version,
        tabs: opp.tabs,
        overview_sections: opp.overview_sections,
        section_slots: opp.section_slots.map((s) => ({
            section_key: s.section_key,
            lifecycle: s.lifecycle,
            shell_min_height_class: s.shell_min_height_class,
        })),
        geometry: { ...opp.geometry },
        layout_config_snapshot: { ...opp.layout_config },
    };
}

export function compileOpportunityDrawerShell(
    input: CompileOpportunityRecordDrawerShellInput
): DrawerShellContract | null {
    const opp = compileOpportunityRecordDrawerShell(input);
    return opp ? opportunityShellToDrawerShellContract(opp) : null;
}

export function compileOpportunityDrawerShellFromEntity(
    layoutConfig: RecordLayoutConfigJson | null,
    entity: Record<string, unknown>
): DrawerShellContract | null {
    const opp = compileOpportunityRecordDrawerShellFromEntity(layoutConfig, entity);
    return opp ? opportunityShellToDrawerShellContract(opp) : null;
}

export function drawerShellToOpportunityRecordContract(shell: DrawerShellContract): RecordDrawerShellContract | null {
    if (shell.entity_type !== "opportunity") return null;
    const g = shell.geometry;
    return {
        entity_type: "opportunity",
        inquiry_drawer_mode:
            (shell.layout_config_snapshot.inquiry_drawer_mode as "workflow_v1" | "classic") ?? "classic",
        layout_version: shell.layout_version,
        tabs: shell.tabs,
        overview_sections: shell.overview_sections,
        section_slots: shell.section_slots.map((s) => ({
            section_key: s.section_key,
            lifecycle: s.lifecycle,
            shell_min_height_class: s.shell_min_height_class,
        })),
        geometry: {
            header_actions_rail_min_h_class: String(g.header_actions_rail_min_h_class ?? ""),
            inquiry_children_min_h_class: String(g.inquiry_children_min_h_class ?? ""),
            summary_right_column_reserved: g.summary_right_column_reserved === true,
            family_contacts_in_summary: g.family_contacts_in_summary === true,
            oper_strip_slot: g.oper_strip_slot === true,
            communications_tab: g.communications_tab === true,
        },
        layout_config: shell.layout_config_snapshot as RecordDrawerShellContract["layout_config"],
    };
}

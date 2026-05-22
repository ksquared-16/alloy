import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import { OPPORTUNITY_ENRICHMENT_DEFERRED_OVERVIEW_SECTION_KEYS } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { OPPORTUNITY_DRAWER_HEADER_ACTIONS_RAIL_MIN_H_CLASS } from "@/lib/admin/drawer/opportunityDrawerLayoutStability";
import { OPPORTUNITY_INQUIRY_CHILDREN_COLLAPSED_SHELL_CLASS } from "@/lib/admin/drawer/opportunityDrawerLayoutStability";
import {
    computeOpportunityOverviewSectionsLikeDrawer,
    type PreviewFieldDef,
} from "@/lib/recordChrome/effectiveDrawerLayoutPreview";
import {
    recordOpportunityDrawerLayoutIncludesSection,
    type RecordLayoutConfigJson,
} from "@/lib/recordChrome/types";
import { OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP } from "@/lib/adminV2/shellContracts/opportunityInquiryWorkflowTabs";
import type { RecordDrawerShellContract, ShellSectionLifecycle, ShellSectionSlot } from "@/lib/adminV2/shellContracts/types";

export function opportunityDrawerLayoutVersion(cfg: RecordLayoutConfigJson | null | undefined): string {
    if (!cfg) return "none";
    const wf = (cfg.inquiry_workflow_sections ?? []).map((w) => w.key).join(",");
    const order = (cfg.overview_section_order ?? []).join(",");
    const hidden = (cfg.overview_hidden_sections ?? []).join(",");
    return [cfg.inquiry_drawer_mode ?? "classic", order, hidden, wf].join("|");
}

function cloneSection(s: EntityDrawerSectionConfig): EntityDrawerSectionConfig {
    return {
        ...s,
        fields: (s.fields ?? []).map((f) => ({
            ...f,
            ...(f.linkTarget ? { linkTarget: { ...f.linkTarget } } : {}),
        })),
        subsections: s.subsections?.map((sub) => ({
            ...sub,
            fields: sub.fields.map((f) => ({
                ...f,
                ...(f.linkTarget ? { linkTarget: { ...f.linkTarget } } : {}),
            })),
        })),
    };
}

function postFilterOpportunityDrawerSections(sections: EntityDrawerSectionConfig[]): EntityDrawerSectionConfig[] {
    return sections
        .filter((s) => s.key !== "operational_attention")
        .filter((s) => s.key !== "operational_tasks_followups")
        .filter((s) => s.key !== "tour_scheduling");
}

function sectionLifecycleForKey(sectionKey: string, workflowV1: boolean): ShellSectionLifecycle {
    if (OPPORTUNITY_ENRICHMENT_DEFERRED_OVERVIEW_SECTION_KEYS.has(sectionKey)) {
        return sectionKey === "inquiry_children" ? "reserved_placeholder" : "below_fold_deferred";
    }
    if (workflowV1 && sectionKey === "inquiry_children") {
        return "reserved_placeholder";
    }
    return "immediate";
}

function buildSectionSlots(sections: EntityDrawerSectionConfig[], workflowV1: boolean): ShellSectionSlot[] {
    return sections.map((s) => {
        const lifecycle = sectionLifecycleForKey(s.key, workflowV1);
        const shell_min_height_class =
            s.key === "inquiry_children" ? OPPORTUNITY_INQUIRY_CHILDREN_COLLAPSED_SHELL_CLASS : undefined;
        return { section_key: s.key, lifecycle, shell_min_height_class };
    });
}

function workflowTabs(cfg: RecordLayoutConfigJson | null): DrawerTabKey[] {
    if (cfg?.inquiry_drawer_mode === "workflow_v1") {
        return [...OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP];
    }
    return ["overview", "related", "activity"];
}

export type CompileOpportunityRecordDrawerShellInput = {
    config_json: RecordLayoutConfigJson | null;
    field_definitions: PreviewFieldDef[];
    field_section_labels: Record<string, string>;
};

/**
 * P1-1: Compile shell map from validated layout + field registry (bootstrap authority).
 * Does not require entity values — structure only.
 */
export function compileOpportunityRecordDrawerShell(
    input: CompileOpportunityRecordDrawerShellInput
): RecordDrawerShellContract | null {
    const cfg = input.config_json;
    if (!cfg) return null;

    const workflowV1 = cfg.inquiry_drawer_mode === "workflow_v1";
    let overview_sections = postFilterOpportunityDrawerSections(
        computeOpportunityOverviewSectionsLikeDrawer(cfg, input.field_definitions, input.field_section_labels, {
            applyHiddenFilter: true,
        })
    ).map(cloneSection);

    if (workflowV1) {
        overview_sections = overview_sections.map((s) => {
            if (s.key === "inquiry_children") {
                return { ...s, defaultExpanded: true, collapsible: true };
            }
            if (OPPORTUNITY_ENRICHMENT_DEFERRED_OVERVIEW_SECTION_KEYS.has(s.key)) {
                return { ...s, defaultExpanded: false, collapsible: true };
            }
            return s;
        });
        const icIdx = overview_sections.findIndex((s) => s.key === "inquiry_children");
        if (icIdx >= 0 && !cfg.overview_section_order?.length) {
            const ic = overview_sections[icIdx]!;
            overview_sections = [
                ...overview_sections.slice(0, icIdx),
                ...overview_sections.slice(icIdx + 1),
                ic,
            ];
        }
    }

    const inquiry_drawer_mode = workflowV1 ? "workflow_v1" : "classic";

    return {
        entity_type: "opportunity",
        inquiry_drawer_mode,
        layout_version: opportunityDrawerLayoutVersion(cfg),
        tabs: workflowTabs(cfg),
        overview_sections,
        section_slots: buildSectionSlots(overview_sections, workflowV1),
        geometry: {
            header_actions_rail_min_h_class: OPPORTUNITY_DRAWER_HEADER_ACTIONS_RAIL_MIN_H_CLASS,
            inquiry_children_min_h_class: OPPORTUNITY_INQUIRY_CHILDREN_COLLAPSED_SHELL_CLASS,
            summary_right_column_reserved: workflowV1,
            family_contacts_in_summary: recordOpportunityDrawerLayoutIncludesSection(cfg, "family_contacts"),
            oper_strip_slot: workflowV1,
            communications_tab: workflowV1,
        },
        layout_config: {
            inquiry_drawer_mode: cfg.inquiry_drawer_mode,
            overview_section_order: cfg.overview_section_order,
            overview_hidden_sections: cfg.overview_hidden_sections,
        },
    };
}

export function fieldSectionLabelsFromEntity(entity: Record<string, unknown>): Record<string, string> {
    const rows =
        (entity._field_sections as { section_key: string; label: string }[] | undefined) ?? [];
    const out: Record<string, string> = {};
    for (const r of rows) {
        const k = String(r.section_key ?? "").trim();
        if (!k) continue;
        out[k] = String(r.label ?? "").trim() || k;
    }
    return out;
}

export function previewFieldDefsFromEntity(entity: Record<string, unknown>): PreviewFieldDef[] {
    const defs =
        (entity._field_definitions as PreviewFieldDef[] | undefined) ?? [];
    return defs.map((d) => ({
        field_key: String(d.field_key ?? ""),
        field_type: String(d.field_type ?? "text"),
        label: d.label ?? null,
        section_key: d.section_key ?? "details",
        sort_order: typeof d.sort_order === "number" ? d.sort_order : 0,
        is_visible_in_drawer: d.is_visible_in_drawer !== false,
    }));
}

export function compileOpportunityRecordDrawerShellFromEntity(
    config_json: RecordLayoutConfigJson | null,
    entity: Record<string, unknown>
): RecordDrawerShellContract | null {
    return compileOpportunityRecordDrawerShell({
        config_json,
        field_definitions: previewFieldDefsFromEntity(entity),
        field_section_labels: fieldSectionLabelsFromEntity(entity),
    });
}

import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";
import { mergeOpportunityWorkflowV1OrderIntoConfigJson } from "@/lib/admin/opportunityWorkflowV1DrawerOrder";

export const WORKFLOW_SECTION_TITLE_MAX_LEN = 80;

export type WorkflowSectionVisibilityPatch = {
    section_key: string;
    visible: boolean;
};

export type WorkflowSectionTitlePatch = {
    section_key: string;
    title: string;
};

export function isDrawerSectionHidden(cfg: RecordLayoutConfigJson, sectionKey: string): boolean {
    return (cfg.overview_hidden_sections ?? []).includes(sectionKey);
}

/** Toggle drawer visibility via overview_hidden_sections (all section kinds after assembly). */
export function setDrawerSectionVisibility(
    cfg: RecordLayoutConfigJson,
    sectionKey: string,
    visible: boolean
): RecordLayoutConfigJson {
    const hidden = new Set(cfg.overview_hidden_sections ?? []);
    if (visible) hidden.delete(sectionKey);
    else hidden.add(sectionKey);
    const nextHidden = [...hidden].sort();
    return {
        ...cfg,
        overview_hidden_sections: nextHidden.length ? nextHidden : undefined,
    };
}

export function renameInquiryWorkflowSectionTitle(
    cfg: RecordLayoutConfigJson,
    sectionKey: string,
    title: string
): { ok: true; config: RecordLayoutConfigJson } | { ok: false; error: string } {
    const trimmed = title.trim();
    if (!trimmed) return { ok: false, error: "Section title is required" };
    if (trimmed.length > WORKFLOW_SECTION_TITLE_MAX_LEN) {
        return { ok: false, error: `Section title must be at most ${WORKFLOW_SECTION_TITLE_MAX_LEN} characters` };
    }
    const wf = cfg.inquiry_workflow_sections;
    if (!Array.isArray(wf) || !wf.some((w) => w.key === sectionKey)) {
        return {
            ok: false,
            error: "Only workflow drawer sections can be renamed here. Field-group labels are on Field grouping.",
        };
    }
    return {
        ok: true,
        config: {
            ...cfg,
            inquiry_workflow_sections: wf.map((w) => (w.key === sectionKey ? { ...w, title: trimmed } : w)),
        },
    };
}

export function applyOpportunityWorkflowV1SectionPatches(
    cfg: RecordLayoutConfigJson,
    params: {
        overview_section_order?: string[];
        section_visibility?: WorkflowSectionVisibilityPatch[];
        workflow_section_titles?: WorkflowSectionTitlePatch[];
    }
): { ok: true; config: RecordLayoutConfigJson } | { ok: false; error: string } {
    let next = { ...cfg };

    if (params.section_visibility?.length) {
        for (const patch of params.section_visibility) {
            const key = patch.section_key.trim();
            if (!key) return { ok: false, error: "section_key is required for visibility" };
            next = setDrawerSectionVisibility(next, key, patch.visible);
        }
    }

    if (params.workflow_section_titles?.length) {
        for (const patch of params.workflow_section_titles) {
            const renamed = renameInquiryWorkflowSectionTitle(next, patch.section_key, patch.title);
            if (!renamed.ok) return renamed;
            next = renamed.config;
        }
    }

    if (params.overview_section_order?.length) {
        next = mergeOpportunityWorkflowV1OrderIntoConfigJson(next, params.overview_section_order);
    }

    return { ok: true, config: next };
}

/** Section keys currently hidden but valid to show again. */
export function listHiddenDrawerSectionKeys(cfg: RecordLayoutConfigJson, canonicalKeys: string[]): string[] {
    const hidden = new Set(cfg.overview_hidden_sections ?? []);
    return canonicalKeys.filter((k) => hidden.has(k));
}

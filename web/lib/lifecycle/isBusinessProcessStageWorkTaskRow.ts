/**
 * True when an operational_tasks row is BP stage operating-plan work (not manual follow-up).
 */

type TaskRowLike = {
    metadata?: Record<string, unknown> | null;
    source?: string | null;
    department_id?: string | null;
    lifecycle_stage_key?: string | null;
    lifecycle_provenance?: string | null;
    work_definition_key?: string | null;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

export function isBusinessProcessStageWorkTaskRow(row: TaskRowLike): boolean {
    const md = row.metadata ?? {};
    const provenance = trimOrNull(md.lifecycle_provenance) ?? trimOrNull(row.lifecycle_provenance);
    if (provenance === "lifecycle_template") return true;
    if (provenance === "stage_reconciliation_carry_forward") return false;
    if (md.operating_plan_template === true) return true;
    const source = trimOrNull(row.source);
    if (source === "lifecycle_stage_work") return true;
    const templateKey =
        trimOrNull(md.operating_plan_template_key)
        ?? trimOrNull(md.work_intent_key)
        ?? trimOrNull(row.work_definition_key);
    const stageKey = trimOrNull(md.lifecycle_stage_key) ?? trimOrNull(row.lifecycle_stage_key);
    const departmentId = trimOrNull(md.department_id) ?? trimOrNull(row.department_id);
    return Boolean((templateKey && stageKey) || (departmentId && stageKey && provenance));
}

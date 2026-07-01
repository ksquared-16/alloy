import { validateQueueDefinition } from "@/lib/config/queueDefinitionSchema";

export type DeptNeedsAttentionWorkUnitRow = {
    id: string;
    key?: string | null;
    metadata?: unknown;
    department_id?: string | null;
    queue_definition?: unknown;
};

export type DeptNeedsAttentionWorkUnitResolution = {
    id: string;
    key: string | null;
    metadata: unknown | null;
    department_id: string | null;
    mode: "standalone_work_unit" | "pipeline_work_unit";
};

function normKey(raw: string | null | undefined): string {
    return String(raw ?? "").trim().toLowerCase();
}

function workUnitBelongsToDepartment(row: DeptNeedsAttentionWorkUnitRow, departmentId: string): boolean {
    const wuDept = String(row.department_id ?? "").trim();
    return wuDept === "" || wuDept === departmentId;
}

/** True when validated queue_definition includes a `needs_attention` queue lane. */
export function workUnitDefinesNeedsAttentionQueue(queueDefinition: unknown): boolean {
    try {
        const def = validateQueueDefinition(queueDefinition);
        return def.queues.some((q) => normKey(q.key) === "needs_attention");
    } catch {
        return false;
    }
}

function toResolution(
    row: DeptNeedsAttentionWorkUnitRow,
    mode: DeptNeedsAttentionWorkUnitResolution["mode"]
): DeptNeedsAttentionWorkUnitResolution {
    return {
        id: String(row.id),
        key: row.key ?? null,
        metadata: row.metadata ?? null,
        department_id: row.department_id ?? null,
        mode,
    };
}

/**
 * Resolve the work unit that executes dept Needs Attention counts.
 *
 * 1. Explicit `work_unit_id` when it is a standalone `needs_attention` WU or a pipeline WU with that queue.
 * 2. Standalone work unit `key === needs_attention` in the department.
 * 3. Pipeline work unit (prefers `enrollment_pipeline`) whose queue_definition defines `needs_attention`.
 */
export function resolveDeptNeedsAttentionWorkUnit(
    rows: readonly DeptNeedsAttentionWorkUnitRow[],
    departmentId: string,
    explicitWorkUnitId?: string | null
): DeptNeedsAttentionWorkUnitResolution | null {
    const inDept = rows.filter((w) => workUnitBelongsToDepartment(w, departmentId));

    const explicitId = (explicitWorkUnitId ?? "").trim();
    if (explicitId) {
        const hit = inDept.find((w) => String(w.id) === explicitId);
        if (hit) {
            if (normKey(hit.key) === "needs_attention") {
                return toResolution(hit, "standalone_work_unit");
            }
            if (workUnitDefinesNeedsAttentionQueue(hit.queue_definition)) {
                return toResolution(hit, "pipeline_work_unit");
            }
        }
    }

    const standalone = inDept.find((w) => normKey(w.key) === "needs_attention");
    if (standalone) {
        return toResolution(standalone, "standalone_work_unit");
    }

    const ordered = [...inDept].sort((a, b) => {
        const ak = normKey(a.key);
        const bk = normKey(b.key);
        if (ak === "enrollment_pipeline") return -1;
        if (bk === "enrollment_pipeline") return 1;
        return 0;
    });

    for (const w of ordered) {
        if (normKey(w.key) === "needs_attention") continue;
        if (!workUnitDefinesNeedsAttentionQueue(w.queue_definition)) continue;
        return toResolution(w, "pipeline_work_unit");
    }

    return null;
}

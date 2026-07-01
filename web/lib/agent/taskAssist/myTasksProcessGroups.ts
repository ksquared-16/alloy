/**
 * Work Items process grouping — the Business Process -> Work View -> Item doctrine seam.
 *
 * Doctrine target: Work Items organizes operational work by its real Business Process,
 * then Stage, then Item, with a path back to the Focus Panel / record. This resolver
 * derives that structure from the Business Process metadata now surfaced on task rows
 * (`department_id`, `lifecycle_stage_key`, `lifecycle_provenance`; see
 * `extractOperationalTaskBpDimensions`):
 *
 * - A task with a `department_id` is attributed to that Business Process; its
 *   `lifecycle_stage_key` (when present) becomes a Stage subgroup.
 * - A task without Business Process metadata (manual, Task Assist, or any row lacking a
 *   `department_id`) falls into **General / Cross-process**.
 *
 * Honesty rules: group only by explicit metadata. We do **not** fabricate a process from
 * `entity_type` alone, and we do not backfill or aggressively infer. Process groups appear
 * only when they actually contain work, so the rail never shows empty/fake buckets.
 *
 * Label gap (Phase 2): the client has no Business Process / department name or Stage label
 * source yet, so process labels fall back to a generic label and Stage labels are humanized
 * from the stage key. Pass `processLabels` / `stageLabels` once those are surfaced.
 */

export const WORK_ITEMS_ALL_GROUP_KEY = "all";
export const WORK_ITEMS_GENERAL_GROUP_KEY = "general";

/**
 * Selection key for the process rail. One of:
 * - `"all"` — every visible task
 * - `"general"` — tasks without Business Process metadata
 * - a Business Process id (`department_id`) — one process
 * - `"<department_id>::<stage_key>"` — a Stage within a process
 */
export type WorkItemsProcessGroupKey = string;

/** Minimal task shape this resolver reads. Extra fields (e.g. presentation labels) are ignored. */
export type WorkItemsProcessGroupTask = {
    entity_type?: string | null;
    department_id?: string | null;
    lifecycle_stage_key?: string | null;
    work_definition_key?: string | null;
    lifecycle_provenance?: string | null;
};

export type WorkItemsStageGroup = {
    /** Selection key: `<department_id>::<stage_key>`. */
    key: WorkItemsProcessGroupKey;
    stageKey: string;
    label: string;
    count: number;
};

export type WorkItemsProcessGroup = {
    /** `"all"`, `"general"`, or a `department_id`. */
    key: WorkItemsProcessGroupKey;
    label: string;
    count: number;
    isGeneral: boolean;
    /** Stage subgroups (only for real Business Process groups). */
    stages: WorkItemsStageGroup[];
};

export type DeriveWorkItemsProcessGroupsOptions = {
    /** department_id -> Business Process label (when a name source is available). */
    processLabels?: Record<string, string>;
    /** lifecycle_stage_key -> Stage label (when a label source is available). */
    stageLabels?: Record<string, string>;
    allLabel?: string;
    generalLabel?: string;
    /** Fallback Business Process label when no name is available for a department_id. */
    fallbackProcessLabel?: string;
};

const STAGE_SELECTION_SEPARATOR = "::";

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function humanizeKey(key: string): string {
    const cleaned = key.replace(/[_-]+/g, " ").trim();
    if (!cleaned) return key;
    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The Business Process group key for a task: its `department_id`, or the General group when
 * no Business Process metadata is present. Explicit metadata only — `entity_type` is never
 * used to fabricate a process.
 */
export function workItemsProcessKeyForTask(task: WorkItemsProcessGroupTask): WorkItemsProcessGroupKey {
    return trimOrNull(task.department_id) ?? WORK_ITEMS_GENERAL_GROUP_KEY;
}

/** True when the task carries explicit Business Process metadata (vs. a General/cross-process item). */
export function taskHasBusinessProcessContext(task: WorkItemsProcessGroupTask): boolean {
    return (
        trimOrNull(task.department_id) != null ||
        trimOrNull(task.lifecycle_stage_key) != null ||
        trimOrNull(task.lifecycle_provenance) === "lifecycle_template"
    );
}

/**
 * Build the process rail groups for the current task set. "All work" is always present;
 * Business Process groups (with Stage subgroups) and "General / Cross-process" appear only
 * when they actually contain work.
 */
export function deriveWorkItemsProcessGroups(
    tasks: WorkItemsProcessGroupTask[],
    options?: DeriveWorkItemsProcessGroupsOptions,
): WorkItemsProcessGroup[] {
    const allLabel = options?.allLabel ?? "All work";
    const generalLabel = options?.generalLabel ?? "General / Cross-process";
    const fallbackProcessLabel = options?.fallbackProcessLabel ?? "Business process";

    const processOrder: string[] = [];
    const byProcess = new Map<string, { count: number; stageOrder: string[]; stageCounts: Map<string, number> }>();
    let generalCount = 0;

    for (const task of tasks) {
        const processKey = workItemsProcessKeyForTask(task);
        if (processKey === WORK_ITEMS_GENERAL_GROUP_KEY) {
            generalCount += 1;
            continue;
        }
        let entry = byProcess.get(processKey);
        if (!entry) {
            entry = { count: 0, stageOrder: [], stageCounts: new Map() };
            byProcess.set(processKey, entry);
            processOrder.push(processKey);
        }
        entry.count += 1;
        const stageKey = trimOrNull(task.lifecycle_stage_key);
        if (stageKey) {
            if (!entry.stageCounts.has(stageKey)) entry.stageOrder.push(stageKey);
            entry.stageCounts.set(stageKey, (entry.stageCounts.get(stageKey) ?? 0) + 1);
        }
    }

    const groups: WorkItemsProcessGroup[] = [
        { key: WORK_ITEMS_ALL_GROUP_KEY, label: allLabel, count: tasks.length, isGeneral: false, stages: [] },
    ];

    for (const processKey of processOrder) {
        const entry = byProcess.get(processKey)!;
        const stages: WorkItemsStageGroup[] = entry.stageOrder.map((stageKey) => ({
            key: `${processKey}${STAGE_SELECTION_SEPARATOR}${stageKey}`,
            stageKey,
            label: options?.stageLabels?.[stageKey] ?? humanizeKey(stageKey),
            count: entry.stageCounts.get(stageKey) ?? 0,
        }));
        groups.push({
            key: processKey,
            label: options?.processLabels?.[processKey] ?? fallbackProcessLabel,
            count: entry.count,
            isGeneral: false,
            stages,
        });
    }

    if (generalCount > 0) {
        groups.push({
            key: WORK_ITEMS_GENERAL_GROUP_KEY,
            label: generalLabel,
            count: generalCount,
            isGeneral: true,
            stages: [],
        });
    }

    return groups;
}

/**
 * Filter a task list to the selected rail key. "all" passes through; "general" returns
 * tasks without Business Process metadata; a `department_id` returns that process; a
 * `<department_id>::<stage_key>` key returns that Stage within the process.
 */
export function filterTasksByProcessGroup<T extends WorkItemsProcessGroupTask>(
    tasks: T[],
    selectionKey: WorkItemsProcessGroupKey,
): T[] {
    if (!selectionKey || selectionKey === WORK_ITEMS_ALL_GROUP_KEY) return tasks;
    if (selectionKey === WORK_ITEMS_GENERAL_GROUP_KEY) {
        return tasks.filter((t) => workItemsProcessKeyForTask(t) === WORK_ITEMS_GENERAL_GROUP_KEY);
    }
    const sep = selectionKey.indexOf(STAGE_SELECTION_SEPARATOR);
    if (sep >= 0) {
        const processKey = selectionKey.slice(0, sep);
        const stageKey = selectionKey.slice(sep + STAGE_SELECTION_SEPARATOR.length);
        return tasks.filter(
            (t) => workItemsProcessKeyForTask(t) === processKey && trimOrNull(t.lifecycle_stage_key) === stageKey,
        );
    }
    return tasks.filter((t) => workItemsProcessKeyForTask(t) === selectionKey);
}

/** True when a rail selection key is a Stage (`<department_id>::<stage_key>`). */
export function isStageSelectionKey(selectionKey: WorkItemsProcessGroupKey): boolean {
    return (
        selectionKey !== WORK_ITEMS_ALL_GROUP_KEY &&
        selectionKey !== WORK_ITEMS_GENERAL_GROUP_KEY &&
        selectionKey.includes(STAGE_SELECTION_SEPARATOR)
    );
}

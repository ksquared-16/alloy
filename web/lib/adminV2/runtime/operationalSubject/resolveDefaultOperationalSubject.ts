/**
 * Default Operational Subject resolution (System 5B / Operational Mode Phase C).
 * @see docs/platform/operator/operational-mode-default-state-doctrine.md
 */

export const DEFAULT_OPERATIONAL_SUBJECT_STRATEGIES = [
    "highest_priority",
    "earliest_due",
    "assigned_to_me",
    "highest_sort_order",
    "first_row",
] as const;

export type DefaultOperationalSubjectStrategy = (typeof DEFAULT_OPERATIONAL_SUBJECT_STRATEGIES)[number];

/**
 * `child` is a CHILD PARTICIPATION row (`process_instances`), added when the child grain got its own
 * Runtime surface. This resolver is grain-agnostic — it orders rows and picks one, and never reads
 * this field — so widening the union changes no selection behaviour. It only stops a child row from
 * having to call itself an opportunity in order to be selectable at all.
 */
export type OperationalSubjectEntityType = "opportunity" | "job" | "schedule" | "child";

export type OperationalSubjectQueueRow = {
    /** Queue list row id (may differ from entity id for grain/candidate rows). */
    id: string;
    entityId: string;
    entityType: OperationalSubjectEntityType;
    /** Stable queue presentation order (0 = first visible row). */
    sortIndex: number;
    priorityScore?: number | null;
    dueAtIso?: string | null;
    assignedToUserId?: string | null;
    needsOperationalAttention?: boolean;
};

export type ResolveDefaultOperationalSubjectContext = {
    currentUserId?: string | null;
};

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function parseDueIso(value: unknown): string | null {
    const text = trimOrNull(value);
    if (!text) return null;
    const ms = Date.parse(text);
    return Number.isFinite(ms) ? text : null;
}

function hasPrioritySignal(row: OperationalSubjectQueueRow): boolean {
    return (row.priorityScore ?? 0) > 0 || Boolean(row.needsOperationalAttention);
}

function hasDueSignal(row: OperationalSubjectQueueRow): boolean {
    return Boolean(row.dueAtIso);
}

function compareSortIndex(a: OperationalSubjectQueueRow, b: OperationalSubjectQueueRow): number {
    return a.sortIndex - b.sortIndex;
}

function pickHighestPriority(rows: OperationalSubjectQueueRow[]): OperationalSubjectQueueRow | null {
    if (!rows.length) return null;
    return [...rows].sort((a, b) => {
        const scoreDelta = (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
        if (scoreDelta !== 0) return scoreDelta;
        if (Boolean(b.needsOperationalAttention) !== Boolean(a.needsOperationalAttention)) {
            return Number(b.needsOperationalAttention) - Number(a.needsOperationalAttention);
        }
        return compareSortIndex(a, b);
    })[0]!;
}

function pickEarliestDue(rows: OperationalSubjectQueueRow[]): OperationalSubjectQueueRow | null {
    const withDue = rows.filter((row) => row.dueAtIso);
    if (!withDue.length) return null;
    return [...withDue].sort((a, b) => {
        const aMs = Date.parse(a.dueAtIso!);
        const bMs = Date.parse(b.dueAtIso!);
        if (aMs !== bMs) return aMs - bMs;
        return compareSortIndex(a, b);
    })[0]!;
}

function pickAssignedToMe(
    rows: OperationalSubjectQueueRow[],
    currentUserId: string | null | undefined,
): OperationalSubjectQueueRow | null {
    const uid = trimOrNull(currentUserId);
    if (!uid) return null;
    const matches = rows.filter((row) => trimOrNull(row.assignedToUserId) === uid);
    if (!matches.length) return null;
    return [...matches].sort(compareSortIndex)[0]!;
}

function pickHighestSortOrder(rows: OperationalSubjectQueueRow[]): OperationalSubjectQueueRow | null {
    if (!rows.length) return null;
    return [...rows].sort(compareSortIndex)[0]!;
}

function pickFirstRow(rows: OperationalSubjectQueueRow[]): OperationalSubjectQueueRow | null {
    return pickHighestSortOrder(rows);
}

/**
 * Platform fallback chain when metadata is sparse:
 * priority → due → queue order → first row.
 */
export function resolveDefaultOperationalSubjectWithFallbackChain(
    rows: OperationalSubjectQueueRow[],
    context?: ResolveDefaultOperationalSubjectContext,
): OperationalSubjectQueueRow | null {
    if (!rows.length) return null;

    const byPriority = pickHighestPriority(rows);
    if (byPriority && hasPrioritySignal(byPriority)) return byPriority;

    const byDue = pickEarliestDue(rows);
    if (byDue && hasDueSignal(byDue)) return byDue;

    const assigned = pickAssignedToMe(rows, context?.currentUserId);
    if (assigned) return assigned;

    return pickHighestSortOrder(rows) ?? pickFirstRow(rows);
}

export function resolveDefaultOperationalSubject(
    rows: OperationalSubjectQueueRow[],
    strategy: DefaultOperationalSubjectStrategy,
    context?: ResolveDefaultOperationalSubjectContext,
): OperationalSubjectQueueRow | null {
    if (!rows.length) return null;

    switch (strategy) {
        case "highest_priority":
            return pickHighestPriority(rows);
        case "earliest_due":
            return pickEarliestDue(rows) ?? pickFirstRow(rows);
        case "assigned_to_me":
            return pickAssignedToMe(rows, context?.currentUserId) ?? pickFirstRow(rows);
        case "highest_sort_order":
            return resolveDefaultOperationalSubjectWithFallbackChain(rows, context);
        case "first_row":
            return pickFirstRow(rows);
        default:
            return pickFirstRow(rows);
    }
}

/** Platform default until Work Unit config exists — enrollment uses queue order + fallback chain. */
export function resolveDefaultOperationalSubjectStrategyForWorkUnit(
    _workUnitKey?: string | null,
): DefaultOperationalSubjectStrategy {
    return "highest_sort_order";
}

export function operationalSubjectRowFromQueueRecord(input: {
    listRow: Record<string, unknown>;
    sortIndex: number;
    entityType?: OperationalSubjectEntityType;
    opportunityId?: string | null;
}): OperationalSubjectQueueRow {
    const listRow = input.listRow;
    const listRowId = trimOrNull(listRow.id) ?? `row-${input.sortIndex}`;
    const opportunityId =
        trimOrNull(input.opportunityId) ??
        trimOrNull(listRow.opportunity_id) ??
        trimOrNull(listRow.entity_id) ??
        listRowId;
    const entityType = input.entityType ?? "opportunity";

    const priorityScoreRaw = listRow._attention_priority_score;
    const priorityScore =
        typeof priorityScoreRaw === "number" && Number.isFinite(priorityScoreRaw) ? priorityScoreRaw : null;

    const dueAtIso =
        parseDueIso(listRow.follow_up_due_at) ??
        parseDueIso(listRow.due_at) ??
        parseDueIso(listRow.next_follow_up_at) ??
        parseDueIso(listRow.job_date);

    const assignedToUserId =
        trimOrNull(listRow.assigned_to) ??
        trimOrNull(listRow.assigned_user_id) ??
        trimOrNull(listRow.owner_user_id);

    const needsOperationalAttention =
        listRow._attention_reason != null ||
        listRow._attention_reason_label != null ||
        (typeof priorityScore === "number" && priorityScore > 0);

    return {
        id: listRowId,
        entityId: opportunityId,
        entityType,
        sortIndex: input.sortIndex,
        priorityScore,
        dueAtIso,
        assignedToUserId,
        needsOperationalAttention,
    };
}

export function operationalSubjectRowFromPreviewItem(
    item: {
        id: string;
        opportunityId?: string;
        needsOperationalAttention?: boolean;
        urgencyTier?: "critical" | "warning" | "standard";
    },
    sortIndex: number,
    rawRow?: Record<string, unknown> | null,
    entityType: OperationalSubjectEntityType = "opportunity",
): OperationalSubjectQueueRow {
    if (rawRow) {
        return operationalSubjectRowFromQueueRecord({
            listRow: rawRow,
            sortIndex,
            entityType,
            opportunityId: item.opportunityId ?? null,
        });
    }

    const priorityScore =
        item.needsOperationalAttention ?
            item.urgencyTier === "critical" ? 80
            : item.urgencyTier === "warning" ? 40
            : 20
        :   item.urgencyTier === "critical" ? 60
        : item.urgencyTier === "warning" ? 30
        : 0;

    return {
        id: item.id,
        entityId: trimOrNull(item.opportunityId) ?? item.id,
        entityType,
        sortIndex,
        priorityScore,
        needsOperationalAttention: item.needsOperationalAttention,
    };
}

export function buildOperationalSubjectRowsFromPreview(
    items: Array<{
        id: string;
        opportunityId?: string;
        needsOperationalAttention?: boolean;
        urgencyTier?: "critical" | "warning" | "standard";
    }>,
    rawRows?: Array<Record<string, unknown>> | null,
    entityType: OperationalSubjectEntityType = "opportunity",
): OperationalSubjectQueueRow[] {
    const rawById = new Map<string, Record<string, unknown>>();
    for (const raw of rawRows ?? []) {
        const id = trimOrNull(raw.id);
        if (id) rawById.set(id, raw);
    }
    return items.map((item, index) =>
        operationalSubjectRowFromPreviewItem(
            item,
            index,
            rawById.get(item.id) ?? rawRows?.[index] ?? null,
            entityType,
        ),
    );
}

export function findOperationalSubjectRowByEntityId(
    rows: OperationalSubjectQueueRow[],
    entityId: string,
): OperationalSubjectQueueRow | null {
    const id = entityId.trim();
    if (!id) return null;
    return rows.find((row) => row.entityId === id || row.id === id) ?? null;
}

/**
 * THE ORDER THE OPERATOR IS READING, READ THE WAY THE OPERATOR READ IT.
 *
 * A manual move means "put this row at position N of the list in front of me". That sentence is
 * only well defined against a specific list, so the writer has to obtain that exact list — not a
 * list it computed for itself from the same-ish inputs.
 *
 * The previous writer did the latter. It reasoned about pins directly, broke ties by `created_at`
 * where the renderer breaks them by natural rank, and silently rearranged four live director
 * adjustments. The lesson taken from that is not "be more careful with the tie-break"; it is that a
 * writer holding its own copy of the ordering rules will eventually disagree with the renderer, and
 * no amount of care prevents it.
 *
 * So this asks the QUEUE for the rows, through `getWorkUnitQueueItems` — the same entry point the
 * work-unit surface calls — and reads the positions the projection already stamped on them. There
 * is no ordering logic in this file. If the renderer changes how it ranks, this follows for free,
 * because it is not ranking anything.
 */
import { getWorkUnitQueueItems, loadWorkUnitQueueDefinitionWithMeta } from "@/lib/queues/QueueService";

export type WaitlistSectionOrder = {
    /** The org category section the candidate is ranked within. */
    sectionKey: string;
    /** The queue whose projection produced this order. */
    queueKey: string;
    /** Candidate ids, in the order the operator reads them. Position N is `finalOrder[N - 1]`. */
    finalOrder: string[];
    /** Candidate ids in this section that currently carry an active manual position. */
    pinnedIds: string[];
};

/** How many rows to ask for. A section is a room's waitlist, not a phone book. */
const SECTION_SCAN_LIMIT = 500;

type WaitlistRow = {
    placement_candidate_id?: unknown;
    runtime_position?: unknown;
    runtime_position_section_key?: unknown;
    row_projection?: unknown;
    placement_priority_v2?: { manual_pin_ordinal?: unknown; active_override_kinds?: unknown } | null;
};

function readWaitlistRow(item: unknown): WaitlistRow | null {
    if (item == null || typeof item !== "object") return null;
    const wr = (item as Record<string, unknown>)._placement_waitlist_row;
    if (wr == null || typeof wr !== "object" || Array.isArray(wr)) return null;
    const row = wr as WaitlistRow;
    return row.row_projection === "placement_candidate" ? row : null;
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

function hasActivePin(row: WaitlistRow): boolean {
    const kinds = row.placement_priority_v2?.active_override_kinds;
    return Array.isArray(kinds) && kinds.some((k) => k === "pin");
}

/**
 * The section order containing `placementCandidateId`, or null when it is not in this work unit.
 *
 * Null is a real answer and the caller must treat it as one: a move cannot be planned against a
 * list that was never found, and inventing a fallback list is how the writer would start forming
 * opinions again.
 */
export async function loadWaitlistSectionOrder(params: {
    orgId: string;
    workUnitId: string;
    placementCandidateId: string;
    /** When known, the queue the operator was reading. Otherwise every waitlist queue is tried. */
    queueKey?: string | null;
}): Promise<WaitlistSectionOrder | null> {
    const { normalized } = await loadWorkUnitQueueDefinitionWithMeta({
        orgId: params.orgId,
        workUnitId: params.workUnitId,
    });

    // The candidate-grain waitlist queues, most-likely first. A work unit usually has exactly one;
    // trying the named queue first keeps the common path to a single projection.
    const named = str(params.queueKey);
    const waitlistKeys = (normalized?.queues ?? [])
        .filter((q) => q.domain === "waitlist" && q.grain === "candidate")
        .map((q) => q.key);
    const keysToTry = [...new Set([...(named ? [named] : []), ...waitlistKeys])];

    for (const queueKey of keysToTry) {
        const page = (await getWorkUnitQueueItems({
            orgId: params.orgId,
            workUnitId: params.workUnitId,
            queueKey,
            limit: SECTION_SCAN_LIMIT,
            offset: 0,
            omitTotalCount: true,
        })) as { items?: unknown[] } | null;

        const rows: Array<{ candidateId: string; position: number; sectionKey: string; pinned: boolean }> = [];
        for (const item of page?.items ?? []) {
            const wr = readWaitlistRow(item);
            if (!wr) continue;
            const candidateId = str(wr.placement_candidate_id);
            const sectionKey = str(wr.runtime_position_section_key);
            const position = typeof wr.runtime_position === "number" ? wr.runtime_position : null;
            if (!candidateId || !sectionKey || position == null) continue;
            rows.push({ candidateId, position, sectionKey, pinned: hasActivePin(wr) });
        }

        const target = rows.find((r) => r.candidateId === params.placementCandidateId);
        if (!target) continue;

        // `runtime_position` is the number the operator is looking at, so sorting by it reproduces
        // the read order exactly rather than approximating it.
        const section = rows
            .filter((r) => r.sectionKey === target.sectionKey)
            .sort((a, b) => a.position - b.position);

        return {
            sectionKey: target.sectionKey,
            queueKey,
            finalOrder: section.map((r) => r.candidateId),
            pinnedIds: section.filter((r) => r.pinned).map((r) => r.candidateId),
        };
    }

    return null;
}

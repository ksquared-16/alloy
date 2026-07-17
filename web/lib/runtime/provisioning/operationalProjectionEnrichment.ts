/**
 * OPERATIONAL PROJECTION ENRICHMENT — U-O2's "each row carrying enough to recognise and select".
 *
 * Governing: runtime-implementation-authorization.md U-O2 (:121), U-P3 (:141) "Queue truth: the
 * active lens's rows … each row carrying enough to recognise and select".
 *
 * WHY THIS EXISTS. U-P7 resolves `CompactRowSlots` — subject · status · contact · attention · work ·
 * groupCount — which is *geometry for data*. D1's rows carried only {id, stageKey, statusKey,
 * updatedAt, title}, so the slots described how to lay out fields the answer never supplied. The two
 * halves of D1 were individually correct and mutually incoherent. This closes that: the answer now
 * carries the `QueueRowContext` the canonical compact row renders from.
 *
 * NOTHING IS EXTRACTED FROM QueueService HERE — and nothing needed to be.
 * The execution owner already exists as a shared, standalone module:
 *   `enrichOpportunityRowsWithCrmProjection` (lib/workspace/enrichOpportunityQueueProjection.ts)
 * QueueService is merely one of its callers, alongside `buildOpportunityAttentionQueueItems`. The
 * context builders (`attachPartialQueueRowContextToRows`, `buildPartialQueueRowContext`) likewise
 * already live in lib/workUnits/ and are pure. QueueService's `withOpportunityQueueRowContext` is a
 * seven-line wrapper that delegates to them.
 *
 * So this module is composition, not extraction:
 *     Operational Projection rows
 *       → enrichOpportunityRowsWithCrmProjection   (shared owner, one batched query set)
 *       → attachPartialQueueRowContextToRows       (shared owner, pure)
 *       → QueueRowContext
 * No QueueService import. No lane predicate. No membership re-evaluation — membership is already
 * decided upstream by the projection, and enrichment never adds or removes a row.
 *
 * BOUNDED BY CONSTRUCTION: enrichment runs over the ALREADY-PAGED rows (the ≤100-row page), never
 * the 500-row base set, and the attached context is passed through the canonical compact projection
 * so the payload carries what the compact row reads and nothing more. Enrichment cost scales with
 * what the operator can actually see.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichOpportunityRowsWithCrmProjection } from "@/lib/workspace/enrichOpportunityQueueProjection";
import {
    attachPartialQueueRowContextToRows,
    type PartialQueueRowContextQueueMeta,
} from "@/lib/workUnits/buildPartialQueueRowContext";
import { projectQueuePreviewRowContexts } from "@/lib/queues/queuePreviewRowContextProjection";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

/** The columns the enrichment + context builders read. D1's row select must carry these. */
export type EnrichableProjectionRow = Record<string, unknown> & {
    id: string;
    primary_person_id?: string | null;
    location_id?: string | null;
    metadata?: unknown;
};

/**
 * Attach `_queue_row_context` to an already-bounded, already-evaluated page of projection rows.
 *
 * Enrichment is ADDITIVE ONLY: it never filters, never re-orders, never re-evaluates membership.
 * The page in equals the page out, in the same canonical order.
 */
export async function enrichOperationalProjectionRows(args: {
    supabase: SupabaseClient;
    orgId: string;
    /** The bounded page — NOT the base row set. */
    rows: readonly EnrichableProjectionRow[];
    queue: PartialQueueRowContextQueueMeta;
}): Promise<Record<string, unknown>[]> {
    const rows = args.rows as unknown as Record<string, unknown>[];
    if (!rows.length) return [];

    // ONE batched enrichment pass for the whole page (person + location reads are batched by id
    // inside the shared owner — not a per-row query).
    let projectionById = new Map<string, Record<string, unknown>>();
    try {
        const crm = await enrichOpportunityRowsWithCrmProjection(
            args.supabase,
            args.orgId,
            args.rows.map((r) => ({
                id: r.id,
                primary_person_id: (r.primary_person_id as string | null) ?? null,
                location_id: (r.location_id as string | null) ?? null,
                metadata: r.metadata,
            })),
        );
        projectionById = crm as unknown as Map<string, Record<string, unknown>>;
    } catch {
        // Enrichment failure is NOT an operational error. The context builders degrade honestly —
        // an absent `_customer_name` falls back to title/name, an absent `_status_display` resolves
        // through the shared status-label pipeline. The operator gets a real row, not a placeholder,
        // and recognition never depends on a best-effort read succeeding.
        projectionById = new Map();
    }

    const merged = rows.map((r) => {
        const p = projectionById.get(String(r.id));
        return p ? { ...r, ...p } : r;
    });

    const withContext = attachPartialQueueRowContextToRows(merged, args.queue);

    // BOUNDED PAYLOAD. The full QueueRowContext is heavy — attaching it raw took the answer from
    // 19KB to 101KB (5.2x) for a 100-row page. `projectQueuePreviewRowContexts` is the canonical
    // compact projection: it keeps exactly the fields the compact row reads and drops the dead heavy
    // flat enrichment. Same shared owner the deployed queue path already uses, so the row the
    // operator sees is composed from the same fields either way — this trims the wire, not the truth.
    return projectQueuePreviewRowContexts(withContext);
}

/** Read the attached context back off an enriched row. */
export function queueRowContextOf(row: Record<string, unknown>): QueueRowContext | null {
    const ctx = row._queue_row_context;
    return ctx && typeof ctx === "object" ? (ctx as QueueRowContext) : null;
}

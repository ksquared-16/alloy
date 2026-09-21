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
 *       → enrichOpportunityRowsWithChildrenForCompactQueue (Secondary / related subjects)
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
import { enrichOpportunityRowsWithChildrenForCompactQueue } from "@/lib/runtime/provisioning/enrichOpportunityRowsWithChildrenForCompactQueue";
import {
    attachPartialQueueRowContextToRows,
    resolveQueueRowOccurrenceIdentity,
    type PartialQueueRowContextQueueMeta,
} from "@/lib/workUnits/buildPartialQueueRowContext";
import { projectQueuePreviewRowContexts } from "@/lib/queues/queuePreviewRowContextProjection";
import {
    loadAcknowledgedOccurrenceKeys,
    occurrenceKeyForAck,
    personalSeenFromOccurrence,
} from "@/lib/queues/operatorStageMembershipAck";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

/** The columns the enrichment + context builders read. D1's row select must carry these. */
export type EnrichableProjectionRow = Record<string, unknown> & {
    id: string;
    primary_person_id?: string | null;
    location_id?: string | null;
    customer_id?: string | null;
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
    /**
     * The operator this answer is FOR. Personal seen/unseen is per-operator, so without it the
     * answer cannot state it and the rows carry no `personal_seen` — the client then hydrates it
     * exactly as it always has. Absent is a degrade, never a claim.
     */
    currentUserId?: string | null;
    /**
     * Phase reporter for the composition DAG. `cohort_rows` was measured at 535ms of serial
     * composition wall with nothing named inside it, so the repair candidate could not be chosen:
     * a batched read, a pure transform and an N+1 all look identical from outside the join.
     * Durations only — the caller owns the offsets.
     */
    onPhase?: (name: string, ms: number) => void;
}): Promise<Record<string, unknown>[]> {
    const rows = args.rows as unknown as Record<string, unknown>[];
    if (!rows.length) return [];
    const phase = async <T,>(name: string, run: () => Promise<T> | T): Promise<T> => {
        const at = Date.now();
        try {
            return await run();
        } finally {
            args.onPhase?.(name, Date.now() - at);
        }
    };
    args.onPhase?.("enrich_rows", rows.length);

    /*
     * SERIAL ACQUISITION. The three reads are independent, and starting them together was tried,
     * deployed and REJECTED on the product metric.
     *
     * Measured: concurrency did what it was designed to do -- cohort_rows fell 526 -> 308ms, with
     * the wall becoming the slowest single read rather than the sum. But the adjacent producer
     * tail rose 310 -> 512ms, FIRST_ORDER_VISIBLE_COMPLETE moved 1,832 -> 1,938ms, and the tail
     * widened from 2,073 to 5,929ms. The saving reappeared almost exactly where it was lost
     * (-218 / +202), while the floor improved and the ceiling blew out -- the signature of three
     * simultaneous reads contending with the card producers that were already running.
     *
     * That comparison spanned two staging builds, so it was never promoted to a causal finding
     * and this comment does not claim one. Full concurrency simply failed the burden of proof
     * required to stay deployed: product P50 did not improve, the tail got materially worse, and
     * establishing causality would have needed experiment infrastructure that does not exist.
     *
     * So the reads are serial again. What was NOT reverted is everything that does not depend on
     * scheduling: the occurrence identity still resolves from RAW columns through the canonical
     * exported helper (one definition, no drift), each read keeps its own failure degrade, merge
     * precedence stays raw < CRM < children, and every phase span stays. This is the removal of
     * one scheduling mechanism, not a rollback of the slice.
     *
     * Do not reintroduce concurrency here without NEW evidence from another critical-path change.
     */
    const viewerId = args.currentUserId?.trim() || null;

    let projectionById = new Map<string, Record<string, unknown>>();
    try {
        const crm = await phase("enrich_crm_ms", () =>
            enrichOpportunityRowsWithCrmProjection(
                args.supabase,
                args.orgId,
                args.rows.map((r) => ({
                    id: r.id,
                    primary_person_id: (r.primary_person_id as string | null) ?? null,
                    location_id: (r.location_id as string | null) ?? null,
                    metadata: r.metadata,
                })),
            ),
        );
        projectionById = crm as unknown as Map<string, Record<string, unknown>>;
    } catch {
        // Enrichment failure is NOT an operational error: an absent `_customer_name` falls back to
        // title/name and recognition never depends on a best-effort read succeeding.
        projectionById = new Map();
    }

    try {
        const children = await phase("enrich_children_ms", () =>
            enrichOpportunityRowsWithChildrenForCompactQueue(
                args.supabase,
                args.orgId,
                args.rows.map((r) => ({
                    id: r.id,
                    customer_id: (r.customer_id as string | null) ?? null,
                    metadata: r.metadata,
                })),
            ),
        );
        // Children fold OVER the CRM map: precedence is raw < CRM < children.
        for (const [id, projection] of children) {
            const prior = projectionById.get(id) ?? {};
            projectionById.set(id, { ...prior, ...projection });
        }
    } catch {
        // Same honest degrade: Secondary absent is preferable to failing the page.
    }

    /*
     * The occurrence keys still come from the RAW page through the canonical derivation. That was
     * never the scheduling change -- it is what gives "which stage occurrence is this row in" a
     * single definition, and it holds regardless of when the read runs.
     */
    const keyByRowId = new Map<string, string>();
    if (viewerId) {
        for (const r of rows) {
            const identity = resolveQueueRowOccurrenceIdentity(r, args.queue);
            if (!identity?.enteredAtIso || !identity.stageKey) continue;
            keyByRowId.set(
                String(r.id),
                occurrenceKeyForAck({
                    orgId: args.orgId,
                    userId: viewerId,
                    subjectType: identity.subjectType,
                    subjectId: identity.subjectId,
                    stageKey: identity.stageKey,
                    stageEnteredAtIso: identity.enteredAtIso,
                }),
            );
        }
    }
    args.onPhase?.("enrich_personal_seen_keys", keyByRowId.size);

    let acknowledged: ReadonlySet<string> | null = null;
    if (viewerId && keyByRowId.size) {
        try {
            acknowledged = await phase("enrich_personal_seen_ms", () =>
                loadAcknowledgedOccurrenceKeys({
                    supabase: args.supabase,
                    orgId: args.orgId,
                    userId: viewerId,
                    occurrenceKeys: [...keyByRowId.values()],
                }),
            );
        } catch {
            /*
             * UNAVAILABLE IS NOT ACKNOWLEDGED. Leaving this null keeps `personal_seen` ABSENT so
             * the client hydrates over the network; writing a verdict here would turn "we could
             * not find out" into "you have seen this" and clear a dot the operator still needs.
             */
            acknowledged = null;
        }
    }

    const merged = rows.map((r) => {
        const p = projectionById.get(String(r.id));
        return p ? { ...r, ...p } : r;
    });

    const tCtx = Date.now();
    const withContext = attachPartialQueueRowContextToRows(merged, args.queue);
    args.onPhase?.("enrich_row_context_ms", Date.now() - tCtx);

    /*
     * FOLD THE ALREADY-RUNNING ACKNOWLEDGEMENT READ.
     *
     * Same canonical pair as before -- `loadAcknowledgedOccurrenceKeys` for the set and
     * `personalSeenFromOccurrence` for the per-row verdict -- so a key composed here still cannot
     * diverge from one composed by the endpoint or the POST path. Only the START moved.
     *
     * A null result means the read failed or there was no viewer: `personal_seen` stays ABSENT and
     * the client hydrates exactly as it always has.
     */
    if (acknowledged) {
        for (const row of withContext) {
            const ctx = queueRowContextOf(row);
            const key = keyByRowId.get(String(row.id));
            if (!ctx || !key) continue;
            ctx.personal_seen = personalSeenFromOccurrence({
                occurrenceKey: key,
                acknowledgedKeys: acknowledged,
            });
        }
    }

    const tProj = Date.now();
    const projected = projectQueuePreviewRowContexts(withContext);
    args.onPhase?.("enrich_projection_ms", Date.now() - tProj);
    return projected;
}

/** Read the attached context back off an enriched row. */
export function queueRowContextOf(row: Record<string, unknown>): QueueRowContext | null {
    const ctx = row._queue_row_context;
    return ctx && typeof ctx === "object" ? (ctx as QueueRowContext) : null;
}

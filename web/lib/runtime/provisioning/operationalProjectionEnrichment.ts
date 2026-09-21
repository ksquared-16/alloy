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
     * THREE INDEPENDENT READS, STARTED TOGETHER.
     *
     * Measured deployed (n=6): CRM 186ms, children 224ms, personal_seen 106ms -- and they SUMMED
     * to the 526ms cohort_rows wall, which is what proved they were serial. Nothing required that
     * order: CRM needs primary_person_id/location_id, children needs customer_id, and the
     * occurrence key needs id/org_id/stage_key/stage_entered_at/created_at. Every one of those is
     * a RAW column in PROCESS_POPULATION_SELECT, so no read consumes another's output.
     *
     * FAILURE ISOLATION IS PRESERVED DELIBERATELY. Each read keeps its own catch and its own
     * degrade, exactly as before: a CRM failure yields an empty projection and rows fall back to
     * title/name, a children failure leaves Secondary absent, and a personal_seen failure leaves
     * the verdict ABSENT so the client hydrates it. `Promise.all` would convert three independent
     * best-effort reads into one fail-together read, turning any single degrade into a blank page.
     * Starting them together is a scheduling change; it is not a contract change.
     *
     * MERGE PRECEDENCE IS UNCHANGED: raw < CRM < children. The children loop still folds over the
     * CRM map with `{...prior, ...projection}`, and the row merge is still `{...raw, ...projection}`.
     * Concurrency changes when the answers arrive, never which answer wins.
     */
    const viewerId = args.currentUserId?.trim() || null;

    const crmP = phase("enrich_crm_ms", () =>
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
    ).then(
        (v) => ({ ok: true as const, v }),
        () => ({ ok: false as const, v: null }),
    );

    const childrenP = phase("enrich_children_ms", () =>
        enrichOpportunityRowsWithChildrenForCompactQueue(
            args.supabase,
            args.orgId,
            args.rows.map((r) => ({
                id: r.id,
                customer_id: (r.customer_id as string | null) ?? null,
                metadata: r.metadata,
            })),
        ),
    ).then(
        (v) => ({ ok: true as const, v }),
        () => ({ ok: false as const, v: null }),
    );

    /*
     * The occurrence keys come from the RAW page via the canonical derivation, so this read no
     * longer waits for the enrichment merge it never depended on.
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
    const seenP: Promise<ReadonlySet<string> | null> =
        viewerId && keyByRowId.size
            ? phase("enrich_personal_seen_ms", () =>
                  loadAcknowledgedOccurrenceKeys({
                      supabase: args.supabase,
                      orgId: args.orgId,
                      userId: viewerId,
                      occurrenceKeys: [...keyByRowId.values()],
                  }),
              ).then(
                  (v) => v,
                  /*
                   * UNAVAILABLE IS NOT ACKNOWLEDGED. Null leaves `personal_seen` absent so the
                   * client hydrates over the network; writing a verdict here would turn "we could
                   * not find out" into "you have seen this" and clear a dot still owed.
                   */
                  () => null,
              )
            : Promise.resolve(null);
    args.onPhase?.("enrich_personal_seen_keys", keyByRowId.size);

    let projectionById = new Map<string, Record<string, unknown>>();
    const crm = await crmP;
    if (crm.ok && crm.v) projectionById = crm.v as unknown as Map<string, Record<string, unknown>>;

    const children = await childrenP;
    if (children.ok && children.v) {
        for (const [id, projection] of children.v) {
            const prior = projectionById.get(id) ?? {};
            projectionById.set(id, { ...prior, ...projection });
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
    const acknowledged = await seenP;
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

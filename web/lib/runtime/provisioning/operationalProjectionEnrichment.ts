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
}): Promise<Record<string, unknown>[]> {
    const rows = args.rows as unknown as Record<string, unknown>[];
    if (!rows.length) return [];

    // ONE batched enrichment pass for the whole page (person + location + children reads are
    // batched by id inside the shared owners — not a per-row query).
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

    // Secondary band (`children.names` / `children.count`) needs related_subjects_summary, which
    // is built from `_crm_compact_children` / `_household_children` / `_inquiry_children`. CRM
    // contact enrichment alone does not attach those — without this pass Secondary stays empty
    // live while Builder preview (seeded) looks correct.
    try {
        const children = await enrichOpportunityRowsWithChildrenForCompactQueue(
            args.supabase,
            args.orgId,
            args.rows.map((r) => ({
                id: r.id,
                customer_id: (r.customer_id as string | null) ?? null,
                metadata: r.metadata,
            })),
        );
        for (const [id, projection] of children) {
            const prior = projectionById.get(id) ?? {};
            projectionById.set(id, { ...prior, ...projection });
        }
    } catch {
        // Same honest degrade: Secondary absent is preferable to failing the page.
    }

    const merged = rows.map((r) => {
        const p = projectionById.get(String(r.id));
        return p ? { ...r, ...p } : r;
    });

    const withContext = attachPartialQueueRowContextToRows(merged, args.queue);

    /*
     * PERSONAL SEEN, RESOLVED HERE INSTEAD OF IN A SECOND ROUND TRIP.
     *
     * Measured on the canonical six-card baseline (n=11, SHA 786a96eb1): WU-05 owned completion in
     * 11 of 11, and its completion-setting mutation was the REMOVAL of an unread dot —
     * `aria-label "Not yet opened by you" -> null` — driven by a post-mount
     * GET /api/admin/queues/stage-membership-ack. That round trip measured 592ms (P50) and was the
     * dominant interval between the document landing and first-order finality.
     *
     * The document already asserts a value for this: with `personal_seen` absent, `resolveRowUnseen`
     * returns TRUE for every row ("treat as unseen until ack"). For rows the operator HAS opened
     * that assertion is FALSE, and the fetch exists to correct it. So this is not a duplicated
     * read — it is a false early claim plus a correction. Answering here removes both.
     *
     * NO SECOND OWNER: the acknowledged set comes from `loadAcknowledgedOccurrenceKeys` and the
     * per-row verdict from `personalSeenFromOccurrence` — the same canonical pair the endpoint
     * uses. The occurrence key is built by `occurrenceKeyForAck`, the same builder the client and
     * the POST path use, so a key composed here and a key composed there cannot diverge.
     *
     * The key already binds org, operator, subject, stage and stage-entry time, so a verdict cannot
     * be carried across navigations or re-used after a subject re-enters a stage: a new occurrence
     * is a different key and reads as unseen again.
     *
     * ONE query for the whole page, and it is the already-bounded page (<= 100 rows).
     */
    const viewerId = args.currentUserId?.trim() || null;
    if (viewerId) {
        const keyByRowId = new Map<string, string>();
        for (const row of withContext) {
            const ctx = queueRowContextOf(row);
            const stageKey = ctx?.operational_state?.stage_key?.trim();
            const enteredAt = ctx?.operational_state?.entered_at?.trim();
            const subjectType = ctx?.row_subject?.subject_type;
            const subjectId = ctx?.row_subject?.subject_id;
            if (!stageKey || !enteredAt || !subjectType || !subjectId) continue;
            keyByRowId.set(
                String(row.id),
                occurrenceKeyForAck({
                    orgId: args.orgId,
                    userId: viewerId,
                    subjectType,
                    subjectId,
                    stageKey,
                    stageEnteredAtIso: enteredAt,
                }),
            );
        }
        if (keyByRowId.size) {
            try {
                const acknowledged = await loadAcknowledgedOccurrenceKeys({
                    supabase: args.supabase,
                    orgId: args.orgId,
                    userId: viewerId,
                    occurrenceKeys: [...keyByRowId.values()],
                });
                for (const row of withContext) {
                    const ctx = queueRowContextOf(row);
                    const key = keyByRowId.get(String(row.id));
                    if (!ctx || !key) continue;
                    ctx.personal_seen = personalSeenFromOccurrence({
                        occurrenceKey: key,
                        acknowledgedKeys: acknowledged,
                    });
                }
            } catch {
                /*
                 * UNAVAILABLE IS NOT ACKNOWLEDGED. A failed read leaves `personal_seen` ABSENT, so
                 * the client keeps its existing behaviour and hydrates over the network. Writing a
                 * verdict here would turn "we could not find out" into "you have seen this" and
                 * silently clear a dot the operator still needs.
                 */
            }
        }
    }

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

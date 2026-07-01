/**
 * Canonical book-v2 / API path for updating `opportunities.status_key` with workflow parity:
 * persists the row patch, then emits `opportunity_status_changed` exactly when the trimmed key differs.
 *
 * Known other write sites (audit, May 2026):
 * - `web/app/api/admin/opportunities/[id]/route.ts` — PATCH (already uses `emitStatusChangedEvent`)
 * - `web/app/api/book-v2/confirm/route.ts` — routed through this helper
 * - `web/app/api/book-v2/quote-start/route.ts` — `needs_a_quote` on reuse update (follow-up)
 * - `web/app/api/book-v2/specialty-quote-start/route.ts` — `needs_a_quote` (follow-up)
 * - `web/lib/bookingLocations.ts` — location link patch (typically no status_key)
 * - `web/app/api/book-v2/opportunity-discount/route.ts`, `service-details`, specialty metadata patches — typically no status_key
 * - `web/scripts/seedRealisticChildcareDemoData.ts` — seed only
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";

export type UpdateOpportunityStatusWithEventParams = {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    /** New `status_key` (null clears to DB null — rare; callers usually pass concrete key). */
    newStatusKey: string | null;
    /**
     * When omitted, loads current `status_key` from DB for event diff + emission.
     * When provided (including `null`), skips that read.
     */
    /** Prefer omitting property so the helper loads `status_key` from DB. Set only when the caller already selected the row. */
    previousStatusKey?: string | null;
    /** Other columns merged into the same `.update(...)` payload as `status_key`. */
    additionalPatch?: Record<string, unknown>;
    /** Omit or null for anonymous/public flows (e.g. book-v2). */
    actorUserId?: string | null;
    /** Merged into `emitStatusChangedEvent` payload (include `source: "book-v2"` etc.). */
    eventMetadata?: Record<string, unknown>;
    /** Forwarded as `normalizeOpportunityWritePayload` context string. */
    normalizeContext: string;
};

/**
 * Applies one `opportunities` update containing `status_key`, then emits at most one
 * {@link emitStatusChangedEvent} for `entityType: opportunities`.
 * If trimmed old === new after update semantics, emitter no-ops (no duplicate workflow_events row).
 */
export async function updateOpportunityStatusWithEvent(
    params: UpdateOpportunityStatusWithEventParams
): Promise<{ error: { message: string } | null }> {
    const { supabase, orgId, opportunityId, newStatusKey, additionalPatch, normalizeContext } = params;

    const normalizeKey = (raw: unknown): string | null => {
        if (raw == null || raw === "") return null;
        const t = String(raw).trim();
        return t || null;
    };

    let previous: string | null;
    if (!Object.prototype.hasOwnProperty.call(params, "previousStatusKey")) {
        const { data, error } = await supabase
            .from("opportunities")
            .select("status_key")
            .eq("id", opportunityId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (error) return { error: { message: error.message } };
        previous = normalizeKey((data as { status_key?: unknown } | null)?.status_key);
    } else {
        previous = normalizeKey(params.previousStatusKey);
    }

    const patch: Record<string, unknown> = { ...(additionalPatch ?? {}), status_key: newStatusKey };

    await normalizeOpportunityWritePayload(supabase, patch, normalizeContext);

    const { data: updatedRows, error: upErr } = await supabase
        .from("opportunities")
        .update(patch)
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .select("id");
    if (upErr) return { error: { message: upErr.message } };
    if (!updatedRows?.length) {
        return { error: { message: "Opportunity update affected 0 rows (check id and org scope)." } };
    }

    await emitStatusChangedEvent({
        supabase,
        orgId,
        entityType: "opportunities",
        entityId: opportunityId,
        oldStatusKey: previous,
        newStatusKey,
        metadata: params.eventMetadata,
        actorUserId: params.actorUserId ?? undefined,
    });

    return { error: null };
}

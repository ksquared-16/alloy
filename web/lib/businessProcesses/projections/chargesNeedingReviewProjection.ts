/**
 * Billing · `charges_needing_review` — households holding a draft charge a person must decide.
 *
 * Read-only over the Financials work queue (`resolveFinancialWorkQueue`), the same reader the
 * Financials Workspace uses, with its own site-visibility rule. "Needs a decision" is not decided here
 * either: membership is `chargeIndexViewOf(row) === "attention"`, the charge index's own classification
 * (a configured review or a failed post — W7-F027). No amount, balance, due date or obligation is
 * computed; the row carries the household and the charge id, nothing derived from money.
 *
 * Capability: Financials data is gated by `fin.read`, enforced HERE because a Work View answer route
 * is not a Financials route — without this, workspace access alone would be a second door into it.
 *
 * Rows are per HOUSEHOLD (`customers`). A draft with no attributable household cannot open a record and
 * is not shown under another one. The representative source is the household's oldest such draft.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { resolveFinancialWorkQueue } from "@/lib/financials/workspace/resolveFinancialWorkQueue";
import { chargeIndexViewOf } from "@/lib/financials/workspace/chargeIndex";
import {
    effectiveProjectionSiteIds,
    type DomainProjectionContext,
    type DomainProjectionDefinition,
    type DomainProjectionRow,
} from "@/lib/businessProcesses/projections/domainProjectionTypes";

/** The work queue's own maximum for the drafts read. */
export const BILLING_DRAFT_READ_LIMIT = 500;

export async function loadChargesNeedingReview(
    supabase: SupabaseClient,
    ctx: DomainProjectionContext,
    deps: {
        assertRead?: typeof assertFinancialsReadAllowed;
        readQueue?: typeof resolveFinancialWorkQueue;
    } = {},
): Promise<
    | { ok: true; rows: DomainProjectionRow[]; truncated: boolean }
    | { ok: false; code: "projection_forbidden" | "projection_unavailable"; message: string }
> {
    const verdict = await (deps.assertRead ?? assertFinancialsReadAllowed)({
        supabase,
        orgId: ctx.orgId,
        userId: ctx.userId,
    });
    if (!verdict.ok) return { ok: false, code: "projection_forbidden", message: verdict.message };

    // BP V2 S3 — the `/workspace` site selection narrows through the Financials reader's own
    // `activeSiteLocationId`; a selection outside the actor's sites yields nothing, never more.
    const selected = ctx.scope.selectedSiteId?.trim() || null;
    if (selected && effectiveProjectionSiteIds(ctx.scope)?.length === 0) return { ok: true, rows: [], truncated: false };

    let queue;
    try {
        queue = await (deps.readQueue ?? resolveFinancialWorkQueue)(supabase, {
            orgId: ctx.orgId,
            siteScope: ctx.scope.siteScope,
            allowedSiteLocationIds: ctx.scope.allowedSiteLocationIds,
            activeSiteLocationId: selected,
            limit: BILLING_DRAFT_READ_LIMIT,
        });
    } catch (e) {
        return { ok: false, code: "projection_unavailable", message: e instanceof Error ? e.message : String(e) };
    }

    type Group = { customerId: string; name: string | null; items: typeof queue.rows };
    const groups = new Map<string, Group>();
    for (const row of queue.rows) {
        if (chargeIndexViewOf(row) !== "attention") continue;
        if (!row.customerId) continue;
        const g = groups.get(row.customerId) ?? { customerId: row.customerId, name: row.householdName, items: [] };
        g.items.push(row);
        groups.set(row.customerId, g);
    }

    const rows: DomainProjectionRow[] = [];
    for (const g of groups.values()) {
        const ordered = [...g.items].sort(
            (x, y) => String(x.serviceDate ?? "").localeCompare(String(y.serviceDate ?? "")) || x.chargeId.localeCompare(y.chargeId),
        );
        const rep = ordered[0]!;
        rows.push({
            subject: { type: "household", id: g.customerId },
            label: g.name?.trim() || "Household",
            source: {
                kind: "charge",
                id: rep.chargeId,
                count: ordered.length,
                statusLabel: rep.awaiting.label,
            },
            siteLocationId: rep.siteLocationId,
        });
    }
    return { ok: true, rows, truncated: queue.readLimitReached === true };
}

export const CHARGES_NEEDING_REVIEW_PROJECTION: DomainProjectionDefinition = {
    key: "charges_needing_review",
    domain: "billing",
    label: "Charges needing review",
    subjectTypes: ["household"],
    load: (supabase, ctx) => loadChargesNeedingReview(supabase, ctx),
};

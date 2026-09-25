import { NextRequest, NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { FINANCIALS_READ_PERMISSION_KEY, requireFinancialsCapability } from "@/lib/financials/financialsPermissions";
import { resolveFinancialPositionCohort } from "@/lib/financials/workspace/resolveFinancialPosition";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/position?site_location_id=…
 *
 * What posted childcare money is doing, across households in scope: outstanding, collectible
 * now, expected subsidy, suppression, and unresolved variance — every figure from
 * `computeCollectiblePosition`, the same arithmetic the account card renders.
 *
 * ── THE SCOPE IS THE SERVER'S, NOT THE CALLER'S ──
 *
 * `siteScope` and `allowedSiteLocationIds` come from the authenticated route gate.
 * `site_location_id` is a filter an operator may NARROW with; it can never widen, because the
 * projection intersects it with the rights the gate resolved.
 *
 * Reading financial position is `fin.read`. This route executes nothing.
 */
export async function GET(request: NextRequest) {
    /*
     * ── WHERE THE SECONDS GO ──────────────────────────────────────────────────────────────────
     *
     * This and `/api/admin/financials/subjects` are the pair that gates the Accounts account list:
     * neither the list nor the card that follows it can start until both land. Subjects publishes
     * its boundaries; this one did not, so the Accounts decomposition had a hole in exactly the
     * place a 52.9 KB response sits.
     *
     * Same instrument, same reason: a slice already guessed once at where this path spends its
     * time and was wrong, and the Financials card only became tractable when its `Server-Timing`
     * named the costly span. Deltas AND completion offsets, because overlapping spans make a delta
     * alone misattribute.
     */
    const t0 = performance.now();
    const marks: Array<[string, number]> = [];
    let last = t0;
    const mark = (name: string) => {
        const now = performance.now();
        marks.push([name, now - last]);
        marks.push([`${name}_at`, now - t0]);
        last = now;
    };
    const serverTiming = () =>
        marks
            .map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`)
            .concat(`total;dur=${(performance.now() - t0).toFixed(1)}`)
            .join(", ");

    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const ctx = gate.access;
    mark("auth");

    const supabase = createAdminClient();
    /*
     * THE CAPABILITY IS ALREADY IN THIS REQUEST'S CONTEXT.
     *
     * `assertFinancialsReadAllowed` re-reads `user_roles` then `role_permission_grants` to learn
     * `fin.read`. The route gate has already resolved exactly those two tables, with the same
     * predicates (org_id, role_key in the caller's roles, allowed = true), and hands them over as
     * `ctx.permissionKeys` — `resolveAdminAccessCore.fetchPermissionKeys` and
     * `resolveActorPermissionGrants` are the same fact from the same rows. Measured on deployed
     * staging that second read cost `perm;dur=` 248ms on subjects and 256ms on position, in parallel
     * requests that had both already paid for it.
     *
     * This is NOT a cache and NOT a reused verdict. Nothing is carried across requests and no
     * historical allow is replayed: the capability is evaluated at request time, against the keys
     * this request resolved, by the module that names the key. `requireFinancialsCapability` is the
     * existing synchronous sibling written for exactly this case and already used by the
     * service-plan-template and charge-template routes.
     *
     * Fail-closed is unchanged: absent or null `permissionKeys` contains nothing, so the capability
     * is refused. Scope and tenancy remain the handler's, exactly as before — the org used below is
     * still the gate's, never the query's.
     */
    const denied = requireFinancialsCapability(ctx, FINANCIALS_READ_PERMISSION_KEY);
    if (denied) return denied;

    mark("perm");

    const requestedSite = new URL(request.url).searchParams.get("site_location_id")?.trim() || null;
    try {
        const cohort = await resolveFinancialPositionCohort(supabase, {
            orgId: ctx.orgId,
            siteScope: ctx.siteScope === "restricted" ? "restricted" : "all",
            allowedSiteLocationIds: ctx.siteScope === "restricted" ? (ctx.allowedSiteLocationIds ?? []) : [],
            activeSiteLocationId: requestedSite,
        });
        mark("cohort");
        const body = JSON.stringify({ ok: true, ...cohort });
        mark("serialize");
        return new NextResponse(body, {
            status: 200,
            headers: {
                "content-type": "application/json",
                "cache-control": "no-store",
                "server-timing": serverTiming(),
            },
        });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
}

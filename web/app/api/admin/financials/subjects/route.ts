import { NextRequest, NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { FINANCIALS_READ_PERMISSION_KEY, requireFinancialsCapability } from "@/lib/financials/financialsPermissions";
import { resolveFinancialSubjectCohort, FINANCIAL_SUBJECT_SCAN_CAP } from "@/lib/financials/workspace/resolveFinancialSubjects";
import { readAccountSubjectFacts } from "@/lib/financials/workspace/readAccountSubjectFacts";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/subjects?site_location_id=…
 *
 * WHICH HOUSEHOLDS HAVE A FINANCIAL ACCOUNT IN SCOPE — identity and location, and no money.
 *
 * This is the left side of Accounts' `eligible financial subjects LEFT JOIN current financial
 * position`. It exists so a household with no transaction yet is still reachable on the surface an
 * operator looks families up on; the position read continues to own every figure.
 *
 * ── THE SCOPE IS THE SERVER'S, NOT THE CALLER'S ──
 *
 * Identical to `/api/admin/financials/position`: `siteScope` and `allowedSiteLocationIds` come from
 * the authenticated route gate, and `site_location_id` is a filter an operator may NARROW with. It
 * can never widen, because the projection intersects it with the rights the gate resolved.
 *
 * Reading financial subjects is `fin.read`. This route executes nothing.
 */
export async function GET(request: NextRequest) {
    /*
     * ── WHERE THE SECONDS GO ──────────────────────────────────────────────────────────────────
     *
     * This route gates the Accounts account list: measured on deployed staging it returns 4.2 KB
     * in 1,634-2,664 ms, and nothing on that host can render until it lands. A slice collapsed the
     * cohort's facet chaining from seven sequential waves to four and the deployed number did NOT
     * move — which means the pole is elsewhere inside it and was never identified by reading the
     * code. The certification tenant holds no households under this org, so it cannot be profiled
     * locally either.
     *
     * So the boundaries are published, the way the Financials card's are. Three slices of that
     * card were tractable only because its `Server-Timing` said which span was the cost; this one
     * is guesswork without the same thing. Deltas AND completion offsets, because overlapping
     * spans make a delta alone misattribute.
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
        /*
         * ── ONE ROUND TRIP FOR THE WHOLE COHORT ────────────────────────────────────────────────
         *
         * Measured on deployed staging, this branch was six sequential remote waves over TWELVE
         * households at a mean 113 ms each, while assembling the rows from them took 0.2 ms. The
         * facts are acquired once here; every rule that decides what they mean still runs in the
         * cohort resolver below.
         */
        /*
         * `null` means the acquisition function has not reached this database yet — the migration
         * and the deploy are two clocks. The cohort then acquires itself the original way, which
         * returns the same facts more slowly, and the list is never broken by the gap.
         */
        const facts = await readAccountSubjectFacts(supabase, {
            orgId: ctx.orgId,
            scanCap: FINANCIAL_SUBJECT_SCAN_CAP,
            enrollmentProcessKey: ENROLLMENT_PROCESS_KEY,
        });
        mark(facts ? "acquire" : "acquire_absent");
        const cohort = await resolveFinancialSubjectCohort(supabase, {
            orgId: ctx.orgId,
            siteScope: ctx.siteScope === "restricted" ? "restricted" : "all",
            allowedSiteLocationIds: ctx.siteScope === "restricted" ? (ctx.allowedSiteLocationIds ?? []) : [],
            activeSiteLocationId: requestedSite,
        }, mark, facts ?? undefined);
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

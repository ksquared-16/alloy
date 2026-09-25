import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import {
    documentActorFromAdminParts,
    projectResolvedProfilePhotosOntoRows,
} from "@/lib/documents/projectPersonProfilePhotos";
import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { FINANCIALS_READ_PERMISSION_KEY, requireFinancialsCapability } from "@/lib/financials/financialsPermissions";

/**
 * GET /api/admin/financials/card?customer_id=…&customer_member_id=…&date=…
 *
 * ONE composed VM for all three Financials densities. The alternative was six client calls — charges,
 * allocations, GL configuration, templates, period, payment setup — and the card would have rendered
 * a balance before it knew the discounts, which is the one thing a financial surface must never do.
 *
 * The org comes from the authenticated session, never the query, so a household id from another
 * tenant resolves to nothing rather than to that tenant's ledger.
 */
export async function GET(request: NextRequest) {
    /*
     * ── WHERE THE SECONDS GO ──────────────────────────────────────────────────────────────────
     *
     * Opening Details waits on this one request, and the wait was reported as "several seconds"
     * before anyone knew which part was slow. Guessing at that is how a read gets a cache it does
     * not need. These marks are published as `Server-Timing`, which the browser records natively
     * and any probe can read, so the decomposition is a measurement rather than an argument.
     */
    /*
     * ── DELTAS STOPPED BEING THE TRUTH WHEN THE SPANS STARTED OVERLAPPING ───────────────────
     *
     * These marks were deltas between consecutive calls, which reads correctly only while every
     * span is strictly sequential. Hoisting the org-grain reads and the permission verdict off the
     * critical path broke that: a read that now finishes during an earlier await would be charged
     * to whichever mark happened to land next, and `policies;dur=` would report ~0 for a read that
     * genuinely happened. A delta that moves because work was PARALLELISED rather than removed is
     * exactly the instrument that lets a latency repair certify itself.
     *
     * So each mark publishes both: `name;dur=` is the span as before, and `name_at;dur=` is its
     * completion offset from the start of the request. Where the two stay consistent the work is
     * still serial; where `name;dur=` collapses but `total` does not, the overlap is visible
     * rather than inferred.
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

    /*
     * ── TWO RESOLVERS, ONE SESSION, ASKED AT THE SAME TIME ──────────────────────────────────
     *
     * `requireAdminOrOps` resolves PORTAL ADMISSION through `resolveAdminPortalOrgCore`;
     * `getAdminContextCached` and `getAdminAuthCached` resolve the ACCESS BUNDLE through
     * `resolveAdminAccessCore`. They are deliberately different resolvers answering different
     * questions, and neither consumes the other's answer — yet they ran one after the other, and
     * measured on deployed staging that pair was `auth;dur=` 354–522 ms before any Financials
     * work began.
     *
     * Both are request-memoized with React `cache()`, so starting them together costs no extra
     * work; the second caller of either joins the first. The CHECKS below are unchanged and stay
     * in the same order — admission first, then context, then auth — so a caller refused by any
     * one of them is refused exactly as before, with the same status and the same body.
     */
    const forbiddenP = requireAdminOrOps();
    const ctxP = getAdminContextCached();
    const authP = getAdminAuthCached();
    const forbidden = await forbiddenP;
    if (forbidden) return forbidden;
    const ctx = await ctxP;
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await authP;
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    mark("auth");

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customer_id")?.trim() || null;
    const customerMemberId = searchParams.get("customer_member_id")?.trim() || null;
    if (!customerId && !customerMemberId) {
        return NextResponse.json(
            { error: "customer_id or customer_member_id is required" },
            { status: 400 },
        );
    }

    try {
        /*
         * Started, not awaited: the verdict below is what decides whether its answer is ever
         * looked at. `.catch` is attached at creation because the denial path never awaits it and
         * an unawaited rejection must not surface as an unhandled one — the real failure is not
         * swallowed, it is re-thrown at the join where the catch below still owns it.
         */
        let readFailure: unknown = null;
        const vmP = buildFinancialsCardVM(createAdminClient(), {
            orgId: ctx.orgId,
            customerId,
            customerMemberId,
            today: searchParams.get("date")?.trim() || null,
            mark,
        }).catch((e: unknown) => {
            readFailure = e;
            return null;
        });

        /*
         * ── THE VERDICT IS ANSWERED FROM THE KEYS THIS REQUEST ALREADY RESOLVED ──────────────
         *
         * `fin.read` used to resolve through two more reads here — memberships, then the grants
         * those roles carry — measured on deployed staging at `perm;dur=` 204-565ms. This request
         * had already paid for exactly those two tables: `getAdminContextCached` resolves the access
         * bundle through `resolveAdminAccessCore`, whose `fetchPermissionKeys` reads
         * `role_permission_grants` with the same predicates (org_id, role_key in the caller's roles,
         * allowed = true) that `resolveActorPermissionGrants` uses. Same rows, same fact, handed
         * over as `ctx.permissionKeys` — which this module's own contract names as what a handler
         * reads to decide what a caller may do.
         *
         * NOT a cache and NOT a reused verdict. Nothing crosses a request boundary and no earlier
         * allow is replayed; the capability is evaluated at request time against the keys this
         * request resolved, by the module that names the key. The gate is otherwise untouched:
         * `requireAdminOrOps` still resolves portal admission through its own separate resolver, and
         * the org used below is still the session's, never the query's.
         *
         * Fail-closed is strengthened rather than kept. Absent or null `permissionKeys` contains
         * nothing, so the capability is refused; and because the answer no longer needs a round
         * trip, the refusal now lands BEFORE the composed read is awaited, so the discarded
         * service-role SELECT that the previous overlap deliberately accepted no longer happens.
         */
        const denied = requireFinancialsCapability(ctx, FINANCIALS_READ_PERMISSION_KEY);
        mark("perm");
        if (denied) return denied;

        const vm = await vmP;
        if (!vm) throw readFailure ?? new Error("Financial records unavailable.");
        mark("read");

        /*
         * ── CANONICAL IDENTITY, RESOLVED WHERE THE ACTOR IS ──────────────────────────────────
         *
         * A resolved photo URL is authorized per actor per request. The view-model builder holds a
         * service-role client and no actor, so resolving there would either leak an unauthorized
         * reference or bake a signed URL into a cached model — which is why it carries `personId`
         * and leaves `imageUrl` null.
         *
         * This is the SHARED projection Records and the Focus Panel already use, not a Financials
         * resolver: the same child resolves the same photo on every surface, and a child whose
         * person has none falls through to the canonical initials avatar.
         */
        const subjects = (vm as { subjects?: Array<Record<string, unknown>> }).subjects ?? [];
        if (subjects.length > 0) {
            const withPhotos = await projectResolvedProfilePhotosOntoRows({
                supabase: createAdminClient(),
                orgId: ctx.orgId,
                actor: documentActorFromAdminParts({
                    ok: true,
                    userId: ctx.userId,
                    orgId: ctx.orgId,
                    role: ctx.role,
                }),
                rows: subjects.map((s) => ({ ...s, person_id: (s.personId as string | null) ?? null })) as Array<
                    Record<string, unknown>
                >,
            });
            withPhotos.forEach((row, index) => {
                const subject = subjects[index];
                if (subject) {
                    subject.imageUrl = ((row as Record<string, unknown>).resolved_photo_url as string | null) ?? null;
                }
            });
        }
        mark("identity");

        const body = JSON.stringify({ ok: true, vm });
        mark("serialize");
        return new NextResponse(body, {
            status: 200,
            headers: {
                "content-type": "application/json",
                "cache-control": "no-store",
                "server-timing": marks
                    .map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`)
                    .concat(`total;dur=${(performance.now() - t0).toFixed(1)}`)
                    .join(", "),
            },
        });
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }
}

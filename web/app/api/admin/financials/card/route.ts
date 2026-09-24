import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import {
    documentActorFromAdminParts,
    projectResolvedProfilePhotosOntoRows,
} from "@/lib/documents/projectPersonProfilePhotos";
import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { FINANCIALS_READ_PERMISSION_KEY, assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";

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

    /*
     * ── THE VERDICT IS ASKED FOR NOW AND ANSWERED BEFORE ANYTHING IS RETURNED ────────────────
     *
     * `fin.read` resolves through two reads — memberships, then the grants those roles carry —
     * and measured on deployed staging that cost `perm;dur=` 204–565 ms sitting alone on the
     * critical path, with the composed read not yet started. It is issued here instead and joined
     * below, before a single byte of the model is serialized.
     *
     * This is NOT a relaxation of the gate, and deliberately not any of the three shapes that
     * would be: the verdict is resolved per request, from the live grants tables, and it is never
     * persisted, cached across requests, or carried over from an earlier answer. What changes is
     * only WHEN the question is asked relative to a read that returns nothing until it is
     * answered. The trade it accepts is explicit: an operator who cleared `requireAdminOrOps`
     * but lacks `fin.read` now causes a service-role SELECT whose rows are discarded — reads
     * only, no writes, nothing returned, and nothing reaching the client but the 403.
     */
    const allowedReadP = assertFinancialsReadAllowed({
        supabase: createAdminClient(),
        orgId: ctx.orgId,
        userId: ctx.userId,
    }).catch(() => ({
        /* A grants lookup that throws denies, exactly as one that answers null does. */
        ok: false as const,
        message: "Financial access could not be verified.",
        requiredPermission: FINANCIALS_READ_PERMISSION_KEY,
    }));

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

        const allowedRead = await allowedReadP;
        mark("perm");
        if (!allowedRead.ok) {
            return NextResponse.json(
                { error: allowedRead.message, required_permission: allowedRead.requiredPermission },
                { status: 403 },
            );
        }

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

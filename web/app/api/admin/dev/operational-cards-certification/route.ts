import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import {
    ensureOperationalCardsCertification,
    inspectCertificationGraph,
    diagnoseChildLens,
    repairOperationalCardsCertification,
    restoreOperationalCardsCertification,
    verifyOperationalCardsCertification,
} from "@/lib/certification/operationalCardsCertificationFixture";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import {
    ensureCertificationHealthTruth,
    restoreCertificationHealthTruth,
} from "@/lib/certification/operationalCardsHealthFixture";

/**
 * THE TRUSTED CERTIFICATION RUNNER — a bounded capability, not a script tunnel.
 *
 * ── THE GAP THIS CLOSES ──
 *
 * A worktree deliberately holds no privileged credentials, so an autonomous lane cannot create
 * canonical certification state; the alternative was asking an operator to hand-build test data
 * before every certification run. The dev server ALREADY holds the trusted environment, so the
 * capability belongs here — inside the process that is already authorized — rather than in a
 * credential tunnel that would defeat the boundary.
 *
 * ── WHAT MAKES IT SAFE ──
 *
 * It is not a seed runner. There is no script name, no SQL, no table, no payload: three fixed verbs
 * over ONE fixture whose namespace is compiled in. A caller cannot ask it to touch anything else,
 * so the blast radius is a property of the code rather than of the request.
 *
 *   never in production   — 404 before anything else runs
 *   real operator auth    — the same admin/ops gate every admin route uses
 *   org from the session  — never from the body, so it cannot be pointed at another tenant
 *   fixed fixture         — `ensure` | `verify` | `reset`, and nothing accepts a parameter
 *
 * Identity resolution is NOT bypassed: `ensure` calls the real Create Lead command and fails closed
 * when that command reports an ambiguous identity. See the fixture module.
 */
export async function POST(request: NextRequest) {
    const isProduction =
        process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
    if (isProduction) {
        return NextResponse.json({ error: "Not available in production" }, { status: 404 });
    }

    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { action?: unknown };
    const action = typeof body.action === "string" ? body.action.trim() : "";

    // The org comes from the authenticated session, never the request: a body-supplied org id would
    // let one tenant's session write into another's.
    const supabase = createAdminClient();
    const orgId = ctx.orgId;
    const actorUserId = auth.user?.id ?? null;

    try {
        if (action === "ensure") {
            const result = await ensureOperationalCardsCertification(supabase, orgId, actorUserId);
            if (!result.ok) {
                // `needsOperator` means the CANONICAL command found identity ambiguous. That is a
                // product decision, not a failure to route around.
                return NextResponse.json(result, { status: result.needsOperator ? 409 : 400 });
            }
            const verify = await verifyOperationalCardsCertification(supabase, orgId);
            return NextResponse.json({ ok: true, ensured: result, verify });
        }
        if (action === "inspect") {
            // Read-only: reports what survives and what is missing, and claims nothing.
            return NextResponse.json({ ok: true, graph: await inspectCertificationGraph(supabase, orgId) });
        }
        if (action === "health-ensure" || action === "health-restore") {
            /*
             * Health fixture facts go through H4, so the fixture meets the SAME permission check an
             * operator does. The caller's real grants are passed — a fixture that granted itself
             * health.manage would prove the table accepts rows and nothing about the boundary.
             */
            const graph = await inspectCertificationGraph(supabase, orgId);
            const childIds = Object.fromEntries(
                graph.members.map((m) => [m.firstName, m.customerMemberId]),
            );
            const accessCtx = await getAdminAccessContextCached();
            const access = { permissionKeys: accessCtx.ok ? accessCtx.permissionKeys : null };
            const run =
                action === "health-ensure"
                    ? ensureCertificationHealthTruth
                    : restoreCertificationHealthTruth;
            return NextResponse.json({
                ok: true,
                health: await run(supabase, orgId, childIds, access, actorUserId),
            });
        }
        if (action === "diagnose") {
            return NextResponse.json({ ok: true, diagnose: await diagnoseChildLens(supabase, orgId) });
        }
        if (action === "repair") {
            return NextResponse.json({
                ok: true,
                repair: await repairOperationalCardsCertification(supabase, orgId, actorUserId),
            });
        }
        if (action === "verify") {
            return NextResponse.json({ ok: true, verify: await verifyOperationalCardsCertification(supabase, orgId) });
        }
        if (action === "restore") {
            /*
             * The non-destructive replacement for `reset`. There is deliberately NO destructive verb
             * on this runner any more: once a certification subject has append-only Attendance
             * history, "remove it and start again" is not an operation the platform permits, and a
             * fixture is not the place to make an exception to that rule.
             */
            const restored = await restoreOperationalCardsCertification(supabase, orgId, actorUserId);
            const verify = await verifyOperationalCardsCertification(supabase, orgId);
            return NextResponse.json({ ok: true, restore: restored, verify });
        }
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }

    // Fail closed. An unrecognised verb is not a no-op that might have done something.
    return NextResponse.json({ error: "action must be ensure | inspect | diagnose | repair | restore | verify | health-ensure | health-restore" }, { status: 400 });
}

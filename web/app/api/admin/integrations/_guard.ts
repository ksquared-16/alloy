/**
 * The one place a route turns an operator into an authorized actor.
 *
 * Every integrations route calls this FIRST. Hiding a menu entry is a courtesy;
 * this is the control, and a route that renders nothing without calling it is
 * unprotected. Kept beside the routes rather than in the service so it cannot be
 * mistaken for something the service already did.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    authorizeIntegrationsAdmin,
    INTEGRATIONS_ADMIN_OPERATIONS,
    type IntegrationsAdminOperation,
} from "@/lib/platform/admin/integrationsAdminAuth";

export type Authorized = { supabase: SupabaseClient; orgId: string; actorUserId: string };

/**
 * The only two permissions this surface may ever require.
 *
 * The needed key is resolved from a map one hop away from the route that calls
 * this, which is what keeps the routes readable — and also what would let a
 * future operation quietly require some unrelated capability, `fin.read` say,
 * with every route still looking correct. So the resolved key is checked against
 * this closed set before it is used, and an operation resolving outside it is
 * refused rather than honoured.
 *
 * It is deliberately written as the keys themselves rather than as imported
 * constants: this module gates the routes, so this module should say out loud
 * which permissions it enforces instead of asserting them at a distance.
 */
const ENFORCEABLE_INTEGRATIONS_PERMISSIONS: readonly string[] = ["integrations.read", "integrations.manage"];

export async function requireIntegrationsAccess(
    operation: IntegrationsAdminOperation,
): Promise<{ ok: true; ctx: Authorized } | { ok: false; response: NextResponse }> {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: ctx.status }) };
    }

    // Fail closed on an operation this surface does not own, before any grant is read.
    const required: string = INTEGRATIONS_ADMIN_OPERATIONS[operation];
    if (!ENFORCEABLE_INTEGRATIONS_PERMISSIONS.includes(required)) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: "This action is not an integrations permission.", code: "forbidden" },
                { status: 403 },
            ),
        };
    }

    const supabase = createAdminClient();
    const verdict = await authorizeIntegrationsAdmin(supabase, {
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        operation,
    });
    if (!verdict.ok) {
        return {
            ok: false,
            response: NextResponse.json({ error: verdict.message, code: verdict.code }, { status: verdict.status }),
        };
    }
    return { ok: true, ctx: { supabase, orgId: ctx.orgId, actorUserId: ctx.userId } };
}

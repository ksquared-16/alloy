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
    type IntegrationsAdminOperation,
} from "@/lib/platform/admin/integrationsAdminAuth";

export type Authorized = { supabase: SupabaseClient; orgId: string; actorUserId: string };

export async function requireIntegrationsAccess(
    operation: IntegrationsAdminOperation,
): Promise<{ ok: true; ctx: Authorized } | { ok: false; response: NextResponse }> {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: ctx.status }) };
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

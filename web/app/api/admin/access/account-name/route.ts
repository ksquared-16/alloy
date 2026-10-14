import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { ADMIN_USERS_WRITE, requireAccessAdministration } from "@/lib/admin/canManageUsersAndRoles";
import { updateUserAccountName, UserAccountNameError } from "@/lib/access/userAccountNameService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/access/account-name — edit a login's own account name (W7-F002, corrected).
 *
 * The name a USER account carries, independent of any Person link: what Access → Users shows and
 * what financial attribution falls back to when the login is not linked to a Person. Authorised by
 * `admin.users.write`, scoped to a login in the caller's organisation, recorded as an access
 * mutation event. Email and Person identity are never touched.
 */
export async function PATCH(request: NextRequest) {
    const auth = await requireAccessAdministration(ADMIN_USERS_WRITE);
    if (!auth.ok) return auth.response;
    const { orgId, userId } = auth.access;

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ ok: false, error: "A JSON body is required." }, { status: 400 });
    }

    try {
        const result = await updateUserAccountName(createAdminClient(), {
            orgId,
            actorUserId: userId,
            targetUserId: typeof body.user_id === "string" ? body.user_id : "",
            name: body.name,
            correlationId: randomUUID(),
        });
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        const status = error instanceof UserAccountNameError ? error.status : 500;
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : "Could not save the name." },
            { status },
        );
    }
}

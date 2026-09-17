import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { ADMIN_USERS_WRITE, requireAccessAdministration } from "@/lib/admin/canManageUsersAndRoles";

/**
 * POST — start a member's password reset.
 *
 * Administering someone's credential lifecycle is USER administration, so it takes
 * `admin.users.write`, the key the Access Administration Split already gave to inviting a person,
 * removing them, and changing which roles they hold. It is deliberately NOT `admin.roles.write`
 * (what a role may do), NOT `admin.access_scope.write` (where a person may operate), and NOT
 * `communications.send` — an email leaves the building here, but the operator is administering an
 * account, not composing a message, and requiring a Communications key would mean a user
 * administrator could invite someone they could not then help sign in.
 *
 * It asked `ctx.role !== "admin"`, which admitted an administrator whose package withholds
 * `admin.users.write` and refused a custom User Administrator who holds it — while the role and
 * scope controls beside it on the same Access surface had already been decided on the grant.
 *
 * ── THE TARGET IS A MEMBER, NOT AN ADDRESS ──
 *
 * This route used to take an arbitrary `email` from the body and hand it straight to
 * `resetPasswordForEmail` on the service-role client. Nothing tied that address to the caller's
 * organization, so an administrator of one tenant could start a credential reset for a member of
 * another — or for anyone at all with an account in the project. The non-enumerating response hid
 * the OUTCOME, which is why this was easy to miss: the caller learned nothing, and the email was
 * sent anyway.
 *
 * So the contract is now the member, not the address. `user_id` is checked against `user_roles` for
 * the caller's organization — the same membership test `users/[userId]/remove` and
 * `users/[userId]/role` apply — and the address is resolved server-side from the authenticated
 * identity rather than accepted from the request. A caller can no longer name a stranger.
 *
 * The non-enumeration property is kept where it still means something: once membership is proven,
 * the provider's answer is not reported, so a missing or unconfirmed account cannot be distinguished
 * from a delivered one.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAccessAdministration(ADMIN_USERS_WRITE);
    if (!auth.ok) return auth.response;
    const { orgId } = auth.access;

    const body = (await request.json().catch(() => ({}))) as { user_id?: unknown };
    const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
    if (!userId) {
        return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL || (request.nextUrl ? `${request.nextUrl.origin}` : "");
    const redirectTo = baseUrl ? `${baseUrl.replace(/\/$/, "")}/reset-password` : "";
    if (!redirectTo) {
        return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL is not set" }, { status: 500 });
    }

    const supabase = createAdminClient();

    /*
     * MEMBERSHIP IS THE TENANT BOUNDARY. `user_roles` is what `resolveAdminAccessCore` answers from,
     * so a row here is what "belongs to this organization" means everywhere else in Access.
     */
    const { data: membership, error: membershipError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
    if (membershipError) {
        return NextResponse.json({ error: "Could not resolve the member" }, { status: 500 });
    }
    if (!membership) {
        // Same answer a non-existent member gets: a foreign target is not found here, and nothing
        // is sent.
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // The address comes from the authenticated identity, never from the request body.
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const email = authUser?.user?.email ?? "";
    if (!email) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    try {
        await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    } catch (_) {
        // Do not leak whether the provider accepted it (prevent enumeration of account state).
    }

    return NextResponse.json({
        ok: true,
        message: "If an account exists for that member, a reset link has been sent.",
    });
}

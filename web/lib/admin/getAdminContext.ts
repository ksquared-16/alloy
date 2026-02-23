/**
 * Resolve admin org context from public.user_roles (membership scoping).
 * Use in admin API routes that need org_id; throws 401/403 if not allowed.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { createAdminClient } from "@/lib/supabaseAdmin";
import type { User } from "@supabase/supabase-js";

const ALLOWED_ROLES = ["admin", "ops"] as const;

export interface AdminContext {
    user: User;
    orgId: string;
    role: string;
}

/**
 * Get current user and their org + role from user_roles.
 * - Uses Supabase server client for auth (getUser), admin client for user_roles query.
 * - Returns context or throws (via returning NextResponse) for 401/403.
 */
export async function getAdminContext(): Promise<AdminContext | NextResponse> {
    const supabaseAuth = await createClient();
    const {
        data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: row, error } = await admin
        .from("user_roles")
        .select("org_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("[getAdminContext] user_roles error:", error);
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!row || !(row as { org_id?: string }).org_id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const role = (row as { role?: string }).role ?? "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return {
        user,
        orgId: (row as { org_id: string }).org_id,
        role,
    };
}

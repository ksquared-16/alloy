/**
 * Admin portal auth: role-based access using public.user_profiles.role.
 * V1 roles: admin (full access), ops (read-only).
 * Use in server layout (role check + redirect) and API routes (requireAdmin for mutations).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { createAdminClient } from "@/lib/supabaseAdmin";
import type { User } from "@supabase/supabase-js";

const ALLOWED_ROLES = ["admin", "ops"] as const;
export type AdminRole = (typeof ALLOWED_ROLES)[number];

export interface AdminAuthResult {
    user: User;
    role: string;
}

/**
 * Get current user and their admin role from user_profiles.
 * Returns null if not logged in, or no profile, or role not in (admin, ops).
 */
export async function getAdminAuth(): Promise<AdminAuthResult | null> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = createAdminClient();
    const { data: profile, error } = await admin
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (error || !profile || !ALLOWED_ROLES.includes(profile.role as AdminRole)) {
        return null;
    }
    return { user, role: profile.role as string };
}

/**
 * Use in mutation routes (POST/PATCH/DELETE). Returns a 401/403 Response if not allowed; otherwise null (caller proceeds).
 * 401 if not logged in or no valid profile; 403 if role !== admin.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
    const auth = await getAdminAuth();
    if (!auth) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
}

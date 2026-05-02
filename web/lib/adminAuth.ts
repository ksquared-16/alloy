/**
 * Admin portal auth: role-based access (admin / ops).
 * Resolved from user_profiles, then user_roles, then app_users — no email allowlist.
 * V1 roles: admin (full access), ops (read-only). All other roles are denied.
 *
 * `getAdminAuth` / `getAdminAuthCached` are request-scoped memoized (React `cache()`).
 */

import { cache } from "react";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import type { User } from "@supabase/supabase-js";
import { getCachedAuthUser } from "@/lib/admin/cachedAuthSession";

const ALLOWED_ROLES = ["admin", "ops"] as const;
export type AdminRole = (typeof ALLOWED_ROLES)[number];

export interface AdminAuthResult {
    user: User;
    role: string;
}

async function loadAdminAuth(): Promise<AdminAuthResult | null> {
    const t0 = Date.now();
    const user = await getCachedAuthUser();
    const authUserMs = Date.now() - t0;
    if (!user?.id) return null;

    const t1 = Date.now();
    const admin = createAdminClient();

    const { data: profile } = await admin
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    let role: string | null = null;
    const pr = profile && typeof (profile as { role?: unknown }).role === "string" ? (profile as { role: string }).role : null;
    if (pr && ALLOWED_ROLES.includes(pr as AdminRole)) {
        role = pr;
    }

    if (!role) {
        const { data: urRows } = await admin.from("user_roles").select("role, org_id").eq("user_id", user.id);
        const rows = Array.isArray(urRows) ? urRows : [];
        const pick = rows.find(
            (r) =>
                r &&
                typeof (r as { role?: string }).role === "string" &&
                ALLOWED_ROLES.includes((r as { role: string }).role as AdminRole) &&
                typeof (r as { org_id?: string }).org_id === "string" &&
                (r as { org_id: string }).org_id.length > 0
        ) as { role: string } | undefined;
        if (pick?.role) {
            role = pick.role;
        }
    }

    if (!role) {
        const { data: au } = await admin.from("app_users").select("role").eq("id", user.id).maybeSingle();
        const ar =
            au && typeof (au as { role?: unknown }).role === "string" ? (au as { role: string }).role : null;
        if (ar && ALLOWED_ROLES.includes(ar as AdminRole)) {
            role = ar;
        }
    }

    if (!role) {
        const { data: au2 } = await admin.from("app_users").select("role").eq("auth_user_id", user.id).maybeSingle();
        const ar2 =
            au2 && typeof (au2 as { role?: unknown }).role === "string" ? (au2 as { role: string }).role : null;
        if (ar2 && ALLOWED_ROLES.includes(ar2 as AdminRole)) {
            role = ar2;
        }
    }

    if (!role) return null;

    const profileMs = Date.now() - t1;
    const totalMs = Date.now() - t0;
    if (totalMs > 400) {
        console.warn("[admin-context-perf] getAdminAuth", {
            auth_get_user_ms: authUserMs,
            role_resolve_ms: profileMs,
            total_ms: totalMs,
        });
    }
    return { user, role };
}

const resolveAdminAuthOnce = cache(async (): Promise<AdminAuthResult | null> => {
    const t0 = Date.now();
    const result = await loadAdminAuth();
    console.log("[admin-context]", {
        cache_hit: false,
        duration_ms: Date.now() - t0,
    });
    return result;
});

const adminAuthInvocationCounter = cache(() => ({ n: 0 }));

/**
 * Request-scoped: repeated calls in the same handler request share one role resolution pass.
 */
export async function getAdminAuthCached(): Promise<AdminAuthResult | null> {
    const ctr = adminAuthInvocationCounter();
    ctr.n += 1;
    const out = await resolveAdminAuthOnce();
    if (ctr.n > 1) {
        console.log("[admin-context]", {
            cache_hit: true,
            duration_ms: 0,
        });
    }
    return out;
}

/** @deprecated Use `getAdminAuthCached` in new code — behavior is identical (cached). */
export const getAdminAuth = getAdminAuthCached;

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

/**
 * Use in PATCH routes that both admin and ops can call (opportunities, jobs, contacts, customers, schedules).
 * Returns 401 if not logged in or no valid profile; 403 if role not in (admin, ops); otherwise null.
 */
export async function requireAdminOrOps(): Promise<NextResponse | null> {
    const auth = await getAdminAuth();
    if (!auth) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return null;
}

/**
 * V1 audit: log admin/ops change to console. Optionally write to audit_log table later.
 */
export function logAdminAudit(params: {
    entity: string;
    id: string;
    changed_fields: string[];
    actor_user_id: string;
    role: string;
}) {
    console.log("[ADMIN_AUDIT]", JSON.stringify(params));
}

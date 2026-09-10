"use client";

import { createContext, useContext, ReactNode } from "react";
import { hasPortalAdminMutateAccess } from "@/lib/admin/adminPortalRolePick";

/** Where `roleKeys` in this context come from (server layouts pass DB-resolved keys). */
export const ADMIN_AUTH_ROLE_KEYS_SOURCE =
    "user_roles + resolveAdminAccessCore primary org (matches Settings → Users & Roles for that org_id)" as const;

export interface AdminAuthContextValue {
    userEmail: string;
    /** Supabase auth user id when the shell passed it. */
    userId: string;
    /** Resolved CRM org id (same rule as admin access APIs). */
    orgId: string;
    role: string;
    /** Membership role keys for the resolved org when the shell supplied them (Admin V2 / auth layout). */
    roleKeys: string[];
    /** Human-readable provenance for debugging mismatches vs Settings UI. */
    roleKeysSource: typeof ADMIN_AUTH_ROLE_KEYS_SOURCE;
    /** True only when membership includes portal `admin` (same bar as `ctx.role === "admin"` on APIs). */
    canMutate: boolean;
    /**
     * The principal's resolved capability grants, or `null` when this shell did not supply them.
     *
     * `null` and `[]` are different answers and every reader must keep them apart. `[]` is a
     * principal who holds nothing; `null` is a mount point that did not pass the prop, and there are
     * several mounts of this provider. A surface that treats the second as the first hides itself
     * from an operator who has the grant — which is the shape of the defect this initiative began
     * with, arriving from the other side. See `lib/access/financialsSurfaceVisibility.ts`.
     *
     * It is for deciding what to OFFER. Authorization is the server's, on every route and every
     * registered action, and stays that way.
     */
    permissionKeys: string[] | null;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function useAdminAuth() {
    const ctx = useContext(AdminAuthContext);
    if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
    return ctx;
}

/** Safe when rendered outside AdminAuthProvider (e.g. dev shells). */
export function useAdminAuthOptional(): AdminAuthContextValue | null {
    return useContext(AdminAuthContext);
}

export function AdminAuthProvider({
    userEmail,
    userId,
    orgId,
    role,
    roleKeys,
    permissionKeys,
    children,
}: {
    userEmail: string;
    userId?: string;
    orgId?: string;
    role: string;
    /** When provided (non-empty), mutate access follows membership keys — matches admin API gates. */
    roleKeys?: string[];
    /** Resolved grants for the org. Omit rather than pass `[]` when the shell does not know them. */
    permissionKeys?: string[] | null;
    children: ReactNode;
}) {
    const safeEmail = typeof userEmail === "string" ? userEmail : "Unknown";
    const safeUserId = typeof userId === "string" && userId.trim() ? userId.trim() : "";
    const safeOrgId = typeof orgId === "string" && orgId.trim() ? orgId.trim() : "";
    const safeRole = typeof role === "string" ? role : "";
    const keys = Array.isArray(roleKeys) ? roleKeys.map((k) => String(k).trim()).filter(Boolean) : [];
    const normalizedCompatRole = safeRole.trim().toLowerCase();
    const canMutate = keys.length > 0 ? hasPortalAdminMutateAccess(keys) : normalizedCompatRole === "admin";
    // Absent stays absent. Mapping an omitted prop onto `[]` here would erase the distinction the
    // field exists to carry, one line before every reader receives it.
    const safePermissionKeys = Array.isArray(permissionKeys)
        ? permissionKeys.map((k) => String(k).trim()).filter(Boolean)
        : null;
    const value: AdminAuthContextValue = {
        userEmail: safeEmail,
        userId: safeUserId,
        orgId: safeOrgId,
        role: safeRole,
        roleKeys: keys,
        roleKeysSource: ADMIN_AUTH_ROLE_KEYS_SOURCE,
        canMutate,
        permissionKeys: safePermissionKeys,
    };
    return (
        <AdminAuthContext.Provider value={value}>
            {children}
        </AdminAuthContext.Provider>
    );
}

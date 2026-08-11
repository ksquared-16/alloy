"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    AUTHORITY_SET_LOADING,
    type AuthoritySetLoad,
    authoritySetFailed,
    authoritySetIsWritable,
    authoritySetKeysForDisplay,
    authoritySetLoaded,
    authoritySetWriteRefusal,
} from "@/lib/access/authoritySetLoad";

type RoleRow = {
    role_key: string;
    role_label: string;
    is_system: boolean;
    is_active: boolean;
    created_at: string | null;
};

type PermissionRow = {
    key: string;
    group_key: string;
    label: string;
};

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
    const out: Record<string, T[]> = {};
    for (const item of arr) {
        const k = key(item);
        if (!out[k]) out[k] = [];
        out[k].push(item);
    }
    return out;
}

export default function RolesClient({ embedded }: { embedded?: boolean }) {
    const { canMutate } = useAdminAuth();
    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [permissions, setPermissions] = useState<PermissionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedRoleKey, setSelectedRoleKey] = useState<string | null>(null);
    const [roleLabel, setRoleLabel] = useState("");
    const [roleActive, setRoleActive] = useState(true);
    /** W-56. The grant set is a LOAD — see `lib/access/authoritySetLoad`. Unknown is not empty. */
    const [grantLoad, setGrantLoad] = useState<AuthoritySetLoad>(AUTHORITY_SET_LOADING);
    const grantKeys = authoritySetKeysForDisplay(grantLoad);
    /**
     * Editing a not-known set would manufacture a confident answer out of a failed read: the
     * operator ticks one box and the other keys become a deliberate-looking empty set. The three
     * mutators below are unchanged; they simply cannot reach a set that was never loaded.
     */
    const setGrantKeys = (update: (prev: Set<string>) => Set<string>) => {
        setGrantLoad((prev) => (prev.status === "loaded" ? authoritySetLoaded(update(new Set(prev.keys))) : prev));
    };
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [newRoleOpen, setNewRoleOpen] = useState(false);
    const [newRoleKey, setNewRoleKey] = useState("");
    const [newRoleLabel, setNewRoleLabel] = useState("");
    const [newRoleSaving, setNewRoleSaving] = useState(false);
    const [newRoleError, setNewRoleError] = useState<string | null>(null);

    const fetchRoles = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/rbac/roles");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json.error as string) || "Failed to load roles");
            setRoles((json as { roles?: RoleRow[] }).roles ?? []);
        } catch (e) {
            setError((e as Error).message);
            setRoles([]);
        }
    }, []);

    const fetchPermissions = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/rbac/permissions");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json.error as string) || "Failed to load permissions");
            setPermissions((json as { permissions?: PermissionRow[] }).permissions ?? []);
        } catch (e) {
            setError((e as Error).message);
            setPermissions([]);
        }
    }, []);

    /**
     * W-56 / `T-22`, `S-11`. This surface carried the SAME total-revocation chain as the canonical
     * Access chapter, and swallowed its error entirely: a failed grants read cleared the set, the
     * grid rendered all-*None*, and `handleSave` `PUT`s `Array.from(grantKeys)` — which the route
     * implements as delete-all-then-skip-insert. `01…§52` named only the canonical surface; the
     * `S-11` lock is stated over every authority surface, and this is what it found.
     *
     * `W-59` still owns retiring this editor. Until it does, the page is live, and a live total
     * revocation is not left in place on the grounds that a later workstream will delete the file.
     */
    const fetchGrants = useCallback(async (role_key: string) => {
        setGrantLoad(AUTHORITY_SET_LOADING);
        try {
            const res = await fetch(`/api/admin/rbac/grants?role_key=${encodeURIComponent(role_key)}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json.error as string) || "Failed to load grants");
            const keys = (json as { permission_keys?: string[] }).permission_keys ?? [];
            setGrantLoad(authoritySetLoaded(keys));
        } catch (e) {
            setGrantLoad(authoritySetFailed(e));
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        setError(null);
        Promise.all([fetchRoles(), fetchPermissions()]).finally(() => setLoading(false));
    }, [fetchRoles, fetchPermissions]);

    useEffect(() => {
        if (!selectedRoleKey) {
            setRoleLabel("");
            setRoleActive(true);
            // No role selected is not a failed read: there is nothing to know, and nothing to save.
            setGrantLoad(authoritySetLoaded([]));
            return;
        }
        const role = roles.find((r) => r.role_key === selectedRoleKey);
        if (role) {
            setRoleLabel(role.role_label);
            setRoleActive(role.is_active);
        }
        fetchGrants(selectedRoleKey);
    }, [selectedRoleKey, roles, fetchGrants]);

    const togglePermission = (key: string) => {
        if (!canMutate) return;
        setGrantKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const selectAllInGroup = (group_key: string) => {
        if (!canMutate) return;
        const inGroup = permissions.filter((p) => p.group_key === group_key).map((p) => p.key);
        setGrantKeys((prev) => {
            const next = new Set(prev);
            inGroup.forEach((k) => next.add(k));
            return next;
        });
    };

    const clearGroup = (group_key: string) => {
        if (!canMutate) return;
        const inGroup = permissions.filter((p) => p.group_key === group_key).map((p) => p.key);
        setGrantKeys((prev) => {
            const next = new Set(prev);
            inGroup.forEach((k) => next.delete(k));
            return next;
        });
    };

    const handleSave = async () => {
        if (!selectedRoleKey || !canMutate) return;
        /**
         * W-56 / `S-11`. In front of the write, not only on the button. This save `PUT`s the grant
         * set, and the route replaces the role's grants with whatever it receives — so an unknown
         * set must never reach it.
         */
        if (!authoritySetIsWritable(grantLoad)) {
            setSaveError(authoritySetWriteRefusal(grantLoad));
            return;
        }
        setSaving(true);
        setSaveError(null);
        try {
            const patchRes = await fetch(`/api/admin/rbac/roles/${encodeURIComponent(selectedRoleKey)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role_label: roleLabel.trim(), is_active: roleActive }),
            });
            if (!patchRes.ok) {
                const j = await patchRes.json().catch(() => ({}));
                throw new Error((j.error as string) || "Failed to update role");
            }
            const putRes = await fetch(`/api/admin/rbac/grants?role_key=${encodeURIComponent(selectedRoleKey)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ permission_keys: Array.from(grantKeys) }),
            });
            if (!putRes.ok) {
                const j = await putRes.json().catch(() => ({}));
                throw new Error((j.error as string) || "Failed to update grants");
            }
            await fetchRoles();
        } catch (e) {
            setSaveError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleCreateRole = async () => {
        if (!canMutate) return;
        const key = newRoleKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
        const label = newRoleLabel.trim();
        if (!key || !label) {
            setNewRoleError("Role key and label are required");
            return;
        }
        setNewRoleSaving(true);
        setNewRoleError(null);
        try {
            const res = await fetch("/api/admin/rbac/roles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role_key: key, role_label: label }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json.error as string) || "Failed to create role");
            await fetchRoles();
            setNewRoleOpen(false);
            setNewRoleKey("");
            setNewRoleLabel("");
            setSelectedRoleKey(key);
        } catch (e) {
            setNewRoleError((e as Error).message);
        } finally {
            setNewRoleSaving(false);
        }
    };

    const permissionGroups = groupBy(permissions, (p) => p.group_key);
    const groupOrder = ["operations", "financials", "system"];
    const orderedGroups = groupOrder.filter((g) => permissionGroups[g]).concat(Object.keys(permissionGroups).filter((g) => !groupOrder.includes(g)));

    return (
        <>
            {!embedded && (
                <AdminPageHeader
                    title="Roles & Permissions"
                    subtitle="Manage org-scoped roles and permission grants. Only admins can create or edit."
                />
            )}
            {!embedded && !canMutate && (
                <p className="mb-4 text-sm text-alloy-midnight/60">
                    You can view roles and permissions. Only admins can make changes.
                </p>
            )}
            {embedded && !canMutate && (
                <p className="mb-4 text-sm text-alloy-midnight/60">
                    You can view roles and permissions. Only admins can make changes.
                </p>
            )}
            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {error}
                </div>
            )}
            {loading ? (
                <p className="text-sm text-alloy-midnight/60">Loading…</p>
            ) : (
                <div className="flex gap-6">
                    <SectionCard title="Roles" className="w-64 shrink-0">
                        <ul className="space-y-0.5">
                            {roles.map((r) => (
                                <li key={r.role_key}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedRoleKey(r.role_key)}
                                        className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                                            selectedRoleKey === r.role_key
                                                ? "bg-[#31394d] text-white"
                                                : "text-[#45506c] hover:bg-[#F4F6F9]"
                                        }`}
                                    >
                                        {r.role_label}
                                        {r.is_system && <span className="ml-1.5 text-xs opacity-80">(system)</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {canMutate && (
                            <button
                                type="button"
                                onClick={() => {
                                    setNewRoleError(null);
                                    setNewRoleOpen(true);
                                }}
                                className="mt-4 w-full rounded-md border border-alloy-stone/50 px-3 py-2 text-sm font-medium text-alloy-midnight hover:bg-alloy-stone/20"
                            >
                                New role
                            </button>
                        )}
                    </SectionCard>

                    <SectionCard title="Role details" className="min-w-0 flex-1">
                        {!selectedRoleKey ? (
                            <p className="text-sm text-alloy-midnight/60">Select a role or create one.</p>
                        ) : (
                            <>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">Label</label>
                                        <input
                                            type="text"
                                            value={roleLabel}
                                            onChange={(e) => setRoleLabel(e.target.value)}
                                            disabled={!canMutate}
                                            className="w-full max-w-md rounded border border-alloy-stone/40 px-3 py-2 text-sm disabled:bg-alloy-stone/20 disabled:opacity-70"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="role-active"
                                            checked={roleActive}
                                            onChange={(e) => setRoleActive(e.target.checked)}
                                            disabled={!canMutate || roles.find((r) => r.role_key === selectedRoleKey)?.is_system}
                                            className="h-4 w-4 rounded border-alloy-stone/50"
                                        />
                                        <label htmlFor="role-active" className="text-sm font-medium text-alloy-midnight/80">
                                            Active
                                        </label>
                                        {roles.find((r) => r.role_key === selectedRoleKey)?.is_system && (
                                            <span className="text-xs text-alloy-midnight/50">(system roles cannot be deactivated)</span>
                                        )}
                                    </div>
                                </div>

                                <h3 className="mt-6 mb-2 text-sm font-semibold text-alloy-midnight/80">Permissions</h3>
                                <p className="mb-4 text-xs text-alloy-midnight/60">Grant permissions by group. Changes are saved when you click Save.</p>
                                <div className="space-y-4">
                                    {orderedGroups.map((group_key) => {
                                        const perms = permissionGroups[group_key] ?? [];
                                        if (perms.length === 0) return null;
                                        const groupLabel = group_key.charAt(0).toUpperCase() + group_key.slice(1);
                                        return (
                                            <div key={group_key} className="rounded-md border border-alloy-stone/30 p-4">
                                                <div className="mb-2 flex items-center justify-between">
                                                    <span className="text-sm font-medium text-alloy-midnight/80">{groupLabel}</span>
                                                    {canMutate && (
                                                        <span className="flex gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => selectAllInGroup(group_key)}
                                                                className="text-xs text-alloy-blue hover:underline"
                                                            >
                                                                Select all
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => clearGroup(group_key)}
                                                                className="text-xs text-alloy-midnight/60 hover:underline"
                                                            >
                                                                Clear
                                                            </button>
                                                        </span>
                                                    )}
                                                </div>
                                                <ul className="space-y-1.5">
                                                    {perms.map((p) => (
                                                        <li key={p.key} className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                id={`perm-${p.key}`}
                                                                checked={grantKeys.has(p.key)}
                                                                onChange={() => togglePermission(p.key)}
                                                                disabled={!canMutate}
                                                                className="h-4 w-4 rounded border-alloy-stone/50"
                                                            />
                                                            <label htmlFor={`perm-${p.key}`} className="text-sm text-alloy-midnight/80 cursor-pointer">
                                                                {p.label}
                                                            </label>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* W-56: an unknown grant set says so, and cannot be saved over. */}
                                {grantLoad.status === "failed" && (
                                    <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                                        {authoritySetWriteRefusal(grantLoad)}
                                    </p>
                                )}
                                {canMutate && (
                                    <div className="mt-6 flex items-center gap-4">
                                        <button
                                            type="button"
                                            onClick={handleSave}
                                            disabled={saving || !authoritySetIsWritable(grantLoad)}
                                            className="rounded-md bg-alloy-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                                        >
                                            {saving ? "Saving…" : "Save"}
                                        </button>
                                        {saveError && <span className="text-sm text-red-600">{saveError}</span>}
                                    </div>
                                )}
                            </>
                        )}
                    </SectionCard>
                </div>
            )}

            {newRoleOpen && (
                <>
                    <div className="fixed inset-0 z-40 bg-black/50" onClick={() => canMutate && !newRoleSaving && setNewRoleOpen(false)} />
                    <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-alloy-stone/30 bg-white p-6 shadow-lg">
                        <h3 className="text-lg font-semibold text-alloy-midnight mb-4">New role</h3>
                        {newRoleError && <p className="mb-3 text-sm text-red-600">{newRoleError}</p>}
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">Role key (slug)</label>
                                <input
                                    type="text"
                                    value={newRoleKey}
                                    onChange={(e) => setNewRoleKey(e.target.value)}
                                    placeholder="e.g. manager"
                                    className="w-full rounded border border-alloy-stone/40 px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">Label</label>
                                <input
                                    type="text"
                                    value={newRoleLabel}
                                    onChange={(e) => setNewRoleLabel(e.target.value)}
                                    placeholder="e.g. Manager"
                                    className="w-full rounded border border-alloy-stone/40 px-3 py-2 text-sm"
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => !newRoleSaving && setNewRoleOpen(false)}
                                className="rounded border border-alloy-stone/50 px-4 py-2 text-sm font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateRole}
                                disabled={newRoleSaving}
                                className="rounded bg-alloy-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                            >
                                {newRoleSaving ? "Creating…" : "Create"}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}

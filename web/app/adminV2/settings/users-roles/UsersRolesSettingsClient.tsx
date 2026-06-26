"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";
import {
    PERMISSION_GRID_ROWS,
    applyGridRowSelection,
    levelFromGrantedKeys,
    type PermissionGridLevel,
} from "@/lib/admin/permissionGrid";

type MainTab = "users" | "roles";

type MemberRow = {
    user_id: string;
    email: string | null;
    display_name: string | null;
    role_keys: string[];
    primary_role: string;
    department_scope: "all" | "restricted";
    site_scope: "all" | "restricted";
    department_ids: string[];
    site_location_ids: string[];
};

type DeptOpt = { id: string; name: string | null; key: string | null };
type SiteLocOpt = { id: string; label: string | null };

type RoleRow = {
    role_key: string;
    role_label: string;
    is_system: boolean;
    is_active: boolean;
    created_at: string | null;
};

type PermissionRow = { key: string; group_key: string; label: string };

function displayName(m: MemberRow): string {
    const n = (m.display_name ?? "").trim();
    if (n) return n;
    return (m.email ?? "").trim() || m.user_id;
}

export default function UsersRolesSettingsClient({ canManageUsersRoles }: { canManageUsersRoles: boolean }) {
    const router = useRouter();
    const [mainTab, setMainTab] = useState<MainTab>("users");
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [departments, setDepartments] = useState<DeptOpt[]>([]);
    const [siteLocations, setSiteLocations] = useState<SiteLocOpt[]>([]);
    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [permissions, setPermissions] = useState<PermissionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [msg, setMsg] = useState<string | null>(null);

    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [editRole, setEditRole] = useState("");
    const [deptScope, setDeptScope] = useState<"all" | "restricted">("all");
    const [siteScope, setSiteScope] = useState<"all" | "restricted">("all");
    const [selDeptIds, setSelDeptIds] = useState<string[]>([]);
    const [selSiteIds, setSelSiteIds] = useState<string[]>([]);
    const [userSaving, setUserSaving] = useState(false);

    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState("");
    const [inviteBusy, setInviteBusy] = useState(false);

    const [selectedRoleKey, setSelectedRoleKey] = useState<string | null>(null);
    const [roleLabel, setRoleLabel] = useState("");
    const [roleActive, setRoleActive] = useState(true);
    const [grantKeys, setGrantKeys] = useState<Set<string>>(new Set());
    const [roleSaving, setRoleSaving] = useState(false);
    const [newRoleOpen, setNewRoleOpen] = useState(false);
    const [newRoleKey, setNewRoleKey] = useState("");
    const [newRoleLabel, setNewRoleLabel] = useState("");
    const [newRoleBusy, setNewRoleBusy] = useState(false);

    const deptLabel = useCallback(
        (id: string) => departments.find((d) => d.id === id)?.name ?? departments.find((d) => d.id === id)?.key ?? id,
        [departments]
    );
    const siteLabel = useCallback(
        (id: string) => siteLocations.find((s) => s.id === id)?.label ?? id,
        [siteLocations]
    );

    const loadMembers = useCallback(async () => {
        if (!canManageUsersRoles) return;
        setErr(null);
        const res = await fetch("/api/admin/settings/users-roles/members");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to load members");
        setMembers(Array.isArray(json.members) ? json.members : []);
        setDepartments(Array.isArray(json.departments) ? json.departments : []);
        setSiteLocations(Array.isArray(json.site_locations) ? json.site_locations : []);
    }, [canManageUsersRoles]);

    const loadRoleDefs = useCallback(async () => {
        if (!canManageUsersRoles) return;
        const rRes = await fetch("/api/admin/rbac/roles");
        const rJson = await rRes.json().catch(() => ({}));
        if (!rRes.ok) throw new Error(typeof rJson.error === "string" ? rJson.error : "Failed to load roles");
        setRoles((rJson as { roles?: RoleRow[] }).roles ?? []);
    }, [canManageUsersRoles]);

    const loadRolesCatalog = useCallback(async () => {
        if (!canManageUsersRoles) return;
        const [rRes, pRes] = await Promise.all([fetch("/api/admin/rbac/roles"), fetch("/api/admin/rbac/permissions")]);
        const rJson = await rRes.json().catch(() => ({}));
        const pJson = await pRes.json().catch(() => ({}));
        if (!rRes.ok) throw new Error(typeof rJson.error === "string" ? rJson.error : "Failed to load roles");
        if (!pRes.ok) throw new Error(typeof pJson.error === "string" ? pJson.error : "Failed to load permissions");
        setRoles((rJson as { roles?: RoleRow[] }).roles ?? []);
        setPermissions((pJson as { permissions?: PermissionRow[] }).permissions ?? []);
    }, [canManageUsersRoles]);

    useEffect(() => {
        if (!canManageUsersRoles) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setErr(null);
        const p =
            mainTab === "users"
                ? Promise.all([loadMembers(), loadRoleDefs()])
                : loadRolesCatalog();
        void p.catch((e) => setErr(e instanceof Error ? e.message : "Failed to load")).finally(() => setLoading(false));
    }, [canManageUsersRoles, mainTab, loadMembers, loadRoleDefs, loadRolesCatalog]);

    const selectedMember = useMemo(
        () => (selectedUserId ? members.find((m) => m.user_id === selectedUserId) ?? null : null),
        [members, selectedUserId]
    );

    useEffect(() => {
        if (!selectedMember) {
            setEditRole("");
            setDeptScope("all");
            setSiteScope("all");
            setSelDeptIds([]);
            setSelSiteIds([]);
            return;
        }
        setEditRole(selectedMember.primary_role);
        setDeptScope(selectedMember.department_scope);
        setSiteScope(selectedMember.site_scope);
        setSelDeptIds([...selectedMember.department_ids]);
        setSelSiteIds([...selectedMember.site_location_ids]);
    }, [selectedMember]);

    const fetchGrants = useCallback(async (role_key: string) => {
        const res = await fetch(`/api/admin/rbac/grants?role_key=${encodeURIComponent(role_key)}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            setGrantKeys(new Set());
            return;
        }
        const keys = (json as { permission_keys?: string[] }).permission_keys ?? [];
        setGrantKeys(new Set(keys));
    }, []);

    useEffect(() => {
        if (mainTab !== "roles" || !selectedRoleKey) {
            setRoleLabel("");
            setRoleActive(true);
            setGrantKeys(new Set());
            return;
        }
        const r = roles.find((x) => x.role_key === selectedRoleKey);
        if (r) {
            setRoleLabel(r.role_label);
            setRoleActive(r.is_system ? true : r.is_active);
        }
        void fetchGrants(selectedRoleKey);
    }, [mainTab, selectedRoleKey, roles, fetchGrants]);

    const activeRoles = useMemo(() => roles.filter((r) => r.is_active !== false), [roles]);

    const permissionLabelByKey = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of permissions) {
            if (p?.key) m.set(p.key, p.label);
        }
        return m;
    }, [permissions]);

    const saveUserRole = async () => {
        if (!selectedUserId || !canManageUsersRoles) return;
        setUserSaving(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/users/${encodeURIComponent(selectedUserId)}/role`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: editRole }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Role save failed");
            setMsg("Role updated.");
            await loadMembers();
            /** Re-run settings layout server props so `AdminAuthProvider` roleKeys match fresh `user_roles` (layout does not refetch on client nav). */
            router.refresh();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Role save failed");
        } finally {
            setUserSaving(false);
        }
    };

    const saveUserAccess = async () => {
        if (!selectedUserId || !canManageUsersRoles) return;
        setUserSaving(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/users/${encodeURIComponent(selectedUserId)}/access-scope`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    department_scope: deptScope,
                    site_scope: siteScope,
                    department_ids: deptScope === "restricted" ? selDeptIds : [],
                    site_location_ids: siteScope === "restricted" ? selSiteIds : [],
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Access save failed");
            setMsg("Data access profile updated.");
            await loadMembers();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Access save failed");
        } finally {
            setUserSaving(false);
        }
    };

    const inviteUser = async () => {
        if (!canManageUsersRoles) return;
        setInviteBusy(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole.trim() }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Invite failed");
            setMsg("Invitation sent.");
            setInviteEmail("");
            setInviteRole("");
            await loadMembers();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Invite failed");
        } finally {
            setInviteBusy(false);
        }
    };

    const saveRoleMeta = async () => {
        if (!selectedRoleKey || !canManageUsersRoles) return;
        setRoleSaving(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/rbac/roles/${encodeURIComponent(selectedRoleKey)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role_label: roleLabel, is_active: roleActive }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Role update failed");
            setMsg("Role saved.");
            await loadRolesCatalog();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Role update failed");
        } finally {
            setRoleSaving(false);
        }
    };

    const saveGrants = async () => {
        if (!selectedRoleKey || !canManageUsersRoles) return;
        setRoleSaving(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/rbac/grants?role_key=${encodeURIComponent(selectedRoleKey)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ permission_keys: [...grantKeys] }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Permissions save failed");
            setMsg("Permissions saved.");
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Permissions save failed");
        } finally {
            setRoleSaving(false);
        }
    };

    const setGridLevel = (rowId: string, level: PermissionGridLevel) => {
        const row = PERMISSION_GRID_ROWS.find((r) => r.id === rowId);
        if (!row) return;
        setGrantKeys((prev) => applyGridRowSelection({ row, level, granted: prev }));
    };

    const createRole = async () => {
        if (!canManageUsersRoles) return;
        setNewRoleBusy(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch("/api/admin/rbac/roles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role_key: newRoleKey.trim(), role_label: newRoleLabel.trim() }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Create role failed");
            setMsg("Role created.");
            setNewRoleOpen(false);
            setNewRoleKey("");
            setNewRoleLabel("");
            await loadRolesCatalog();
            const rk = (json as { role_key?: string }).role_key;
            if (typeof rk === "string" && rk) setSelectedRoleKey(rk);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Create role failed");
        } finally {
            setNewRoleBusy(false);
        }
    };

    const toggleGrant = (key: string) => {
        if (!canManageUsersRoles) return;
        setGrantKeys((prev) => {
            const n = new Set(prev);
            if (n.has(key)) n.delete(key);
            else n.add(key);
            return n;
        });
    };

    if (!canManageUsersRoles) {
        return (
            <div className="rounded-lg border border-alloy-forge/12 bg-white/40 px-4 py-3 text-sm text-alloy-midnight/75">
                You need org <span className="font-medium text-alloy-midnight">admin</span> or the{" "}
                <code className="rounded bg-alloy-forge/10 px-1">settings.users_roles</code> permission to view or change users and roles.
            </div>
        );
    }

    return (
        <div className="space-y-4 text-sm text-alloy-midnight">
            <SettingsEntityTabBar<MainTab>
                aria-label="Users and roles"
                tabs={[
                    { key: "users", label: "Users" },
                    { key: "roles", label: "Roles" },
                ]}
                activeKey={mainTab}
                onSelect={setMainTab}
            />

            <p className="text-xs leading-snug text-alloy-midnight/55">
                <span className="font-semibold text-alloy-midnight/70">Roles</span> control what people can do.{" "}
                <span className="font-semibold text-alloy-midnight/70">Location and department access</span> control what records they can see.
            </p>

            {err ? <div className="rounded border border-red-200 bg-red-50/80 px-3 py-2 text-red-900">{err}</div> : null}
            {msg ? <div className="rounded border border-alloy-pine/25 bg-alloy-pine/10 px-3 py-2 text-alloy-pine">{msg}</div> : null}

            {loading ? <p className="text-xs text-alloy-midnight/55">Loading…</p> : null}

            {mainTab === "users" && !loading ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                    <div className="space-y-3 rounded-lg border border-alloy-forge/12 bg-white/40 p-3 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-semibold">Org members</h2>
                            <button
                                type="button"
                                className="rounded-md border border-alloy-forge/15 bg-white px-2 py-1 text-xs font-medium text-alloy-midnight hover:bg-white/90"
                                onClick={() => void loadMembers()}
                            >
                                Refresh
                            </button>
                        </div>
                        <div className="max-h-[420px] overflow-auto rounded border border-alloy-forge/10">
                            <table className="w-full min-w-[520px] text-left text-xs">
                                <thead className="sticky top-0 bg-alloy-forge/5 text-alloy-midnight/65">
                                    <tr>
                                        <th className="px-2 py-1.5 font-semibold">User</th>
                                        <th className="px-2 py-1.5 font-semibold">Roles</th>
                                        <th className="px-2 py-1.5 font-semibold">Departments</th>
                                        <th className="px-2 py-1.5 font-semibold">Sites</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {members.map((m) => {
                                        const on = m.user_id === selectedUserId;
                                        return (
                                            <tr
                                                key={m.user_id}
                                                className={on ? "bg-alloy-pine/8" : "hover:bg-alloy-forge/5"}
                                                onClick={() => setSelectedUserId(m.user_id)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        setSelectedUserId(m.user_id);
                                                    }
                                                }}
                                                tabIndex={0}
                                                role="button"
                                            >
                                                <td className="px-2 py-1.5">
                                                    <div className="font-medium">{displayName(m)}</div>
                                                    <div className="text-alloy-midnight/50">{m.email ?? m.user_id}</div>
                                                </td>
                                                <td className="px-2 py-1.5 text-alloy-midnight/80">{(m.role_keys ?? []).join(", ") || "—"}</td>
                                                <td className="px-2 py-1.5 text-alloy-midnight/75">
                                                    {m.department_scope === "all" ? (
                                                        "All"
                                                    ) : (
                                                        <span className="line-clamp-2">
                                                            {(m.department_ids ?? []).map((id) => deptLabel(id)).join(", ") || "Restricted"}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 text-alloy-midnight/75">
                                                    {m.site_scope === "all" ? (
                                                        "All"
                                                    ) : (
                                                        <span className="line-clamp-2">
                                                            {(m.site_location_ids ?? []).map((id) => siteLabel(id)).join(", ") || "Restricted"}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="border-t border-alloy-forge/10 pt-3">
                            <h3 className="text-xs font-semibold text-alloy-midnight/70">Invite user</h3>
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                                <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] font-medium text-alloy-midnight/60">
                                    Email
                                    <input
                                        className="rounded border border-alloy-forge/15 bg-white px-2 py-1.5 text-sm"
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        placeholder="name@org.com"
                                    />
                                </label>
                                <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-alloy-midnight/60">
                                    Role
                                    <select
                                        className="rounded border border-alloy-forge/15 bg-white px-2 py-1.5 text-sm"
                                        value={inviteRole}
                                        onChange={(e) => setInviteRole(e.target.value)}
                                    >
                                        <option value="">Select…</option>
                                        {activeRoles.map((r) => (
                                            <option key={r.role_key} value={r.role_key}>
                                                {r.role_label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    disabled={inviteBusy || !inviteEmail.trim() || !inviteRole}
                                    className="rounded-md bg-alloy-pine px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                                    onClick={() => void inviteUser()}
                                >
                                    {inviteBusy ? "Sending…" : "Invite"}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3 rounded-lg border border-alloy-forge/12 bg-white/40 p-3 shadow-sm">
                        {!selectedMember ? (
                            <p className="text-xs text-alloy-midnight/55">Select a user to edit primary role and data access.</p>
                        ) : (
                            <>
                                <h2 className="text-sm font-semibold">Edit {displayName(selectedMember)}</h2>

                                <div className="space-y-1 border-b border-alloy-forge/10 pb-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Capabilities (roles)</p>
                                    <p className="text-[11px] text-alloy-midnight/55">
                                        One primary role_key is stored per user for this org (replaces all rows in{" "}
                                        <code className="rounded bg-alloy-forge/8 px-0.5">user_roles</code>).
                                    </p>
                                    <select
                                        className="mt-1 w-full rounded border border-alloy-forge/15 bg-white px-2 py-1.5 text-sm"
                                        value={editRole}
                                        onChange={(e) => setEditRole(e.target.value)}
                                    >
                                        {activeRoles.map((r) => (
                                            <option key={r.role_key} value={r.role_key}>
                                                {r.role_label} ({r.role_key})
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        disabled={userSaving}
                                        className="mt-2 rounded-md border border-alloy-forge/20 bg-white px-3 py-1.5 text-xs font-semibold text-alloy-midnight hover:bg-white/90 disabled:opacity-40"
                                        onClick={() => void saveUserRole()}
                                    >
                                        Save role
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Data access profile</p>
                                    <p className="text-[11px] text-alloy-midnight/55">
                                        Departments and <span className="font-medium">sites only</span> (
                                        <code className="rounded bg-alloy-forge/8 px-0.5">location_type = site</code>).
                                    </p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-alloy-midnight/60">
                                            Department scope
                                            <select
                                                className="rounded border border-alloy-forge/15 bg-white px-2 py-1.5 text-sm"
                                                value={deptScope}
                                                onChange={(e) => setDeptScope(e.target.value as "all" | "restricted")}
                                            >
                                                <option value="all">All departments</option>
                                                <option value="restricted">Selected only</option>
                                            </select>
                                        </label>
                                        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-alloy-midnight/60">
                                            Site scope
                                            <select
                                                className="rounded border border-alloy-forge/15 bg-white px-2 py-1.5 text-sm"
                                                value={siteScope}
                                                onChange={(e) => setSiteScope(e.target.value as "all" | "restricted")}
                                            >
                                                <option value="all">All sites</option>
                                                <option value="restricted">Selected sites</option>
                                            </select>
                                        </label>
                                    </div>
                                    {deptScope === "restricted" ? (
                                        <div className="max-h-32 overflow-auto rounded border border-alloy-forge/10 p-2">
                                            {departments.map((d) => (
                                                <label key={d.id} className="flex items-center gap-2 py-0.5 text-xs">
                                                    <input
                                                        type="checkbox"
                                                        checked={selDeptIds.includes(d.id)}
                                                        onChange={(e) =>
                                                            setSelDeptIds((prev) =>
                                                                e.target.checked ? [...new Set([...prev, d.id])] : prev.filter((x) => x !== d.id)
                                                            )
                                                        }
                                                    />
                                                    {d.name ?? d.key ?? d.id}
                                                </label>
                                            ))}
                                        </div>
                                    ) : null}
                                    {siteScope === "restricted" ? (
                                        <div className="max-h-32 overflow-auto rounded border border-alloy-forge/10 p-2">
                                            {siteLocations.map((s) => (
                                                <label key={s.id} className="flex items-center gap-2 py-0.5 text-xs">
                                                    <input
                                                        type="checkbox"
                                                        checked={selSiteIds.includes(s.id)}
                                                        onChange={(e) =>
                                                            setSelSiteIds((prev) =>
                                                                e.target.checked ? [...new Set([...prev, s.id])] : prev.filter((x) => x !== s.id)
                                                            )
                                                        }
                                                    />
                                                    {s.label ?? s.id}
                                                </label>
                                            ))}
                                        </div>
                                    ) : null}
                                    <button
                                        type="button"
                                        disabled={userSaving}
                                        className="rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                                        onClick={() => void saveUserAccess()}
                                    >
                                        {userSaving ? "Saving…" : "Save data access"}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            ) : null}

            {mainTab === "roles" && !loading ? (
                <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="space-y-2 rounded-lg border border-alloy-forge/12 bg-white/40 p-3 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-semibold">Roles</h2>
                            <button
                                type="button"
                                className="text-xs font-medium text-alloy-pine hover:underline"
                                onClick={() => setNewRoleOpen((o) => !o)}
                            >
                                {newRoleOpen ? "Close" : "New role"}
                            </button>
                        </div>
                        {newRoleOpen ? (
                            <div className="space-y-2 border-b border-alloy-forge/10 pb-2">
                                <input
                                    className="w-full rounded border border-alloy-forge/15 bg-white px-2 py-1 text-xs"
                                    placeholder="role_key"
                                    value={newRoleKey}
                                    onChange={(e) => setNewRoleKey(e.target.value)}
                                />
                                <input
                                    className="w-full rounded border border-alloy-forge/15 bg-white px-2 py-1 text-xs"
                                    placeholder="Label"
                                    value={newRoleLabel}
                                    onChange={(e) => setNewRoleLabel(e.target.value)}
                                />
                                <button
                                    type="button"
                                    disabled={newRoleBusy || !newRoleKey.trim() || !newRoleLabel.trim()}
                                    className="w-full rounded bg-alloy-pine py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                                    onClick={() => void createRole()}
                                >
                                    {newRoleBusy ? "Creating…" : "Create"}
                                </button>
                            </div>
                        ) : null}
                        <ul className="max-h-[480px] space-y-0.5 overflow-auto text-xs">
                            {roles.map((r) => (
                                <li key={r.role_key}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedRoleKey(r.role_key)}
                                        className={[
                                            "w-full rounded px-2 py-1.5 text-left transition-colors",
                                            selectedRoleKey === r.role_key ? "bg-alloy-pine/12 font-semibold text-alloy-midnight" : "hover:bg-alloy-forge/6",
                                            r.is_active === false ? "text-alloy-midnight/45" : "",
                                        ].join(" ")}
                                    >
                                        <span className="block truncate">{r.role_label}</span>
                                        <span className="block truncate font-normal text-alloy-midnight/45">{r.role_key}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="space-y-3 rounded-lg border border-alloy-forge/12 bg-white/40 p-3 shadow-sm">
                        {!selectedRoleKey ? (
                            <p className="text-xs text-alloy-midnight/55">Select a role to edit label, activation, and permission grants.</p>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-end gap-3">
                                    <label className="flex min-w-[12rem] flex-1 flex-col gap-0.5 text-[11px] font-medium text-alloy-midnight/60">
                                        Label
                                        <input
                                            className="rounded border border-alloy-forge/15 bg-white px-2 py-1.5 text-sm"
                                            value={roleLabel}
                                            onChange={(e) => setRoleLabel(e.target.value)}
                                        />
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-alloy-midnight/70">
                                        <input
                                            type="checkbox"
                                            checked={roleActive}
                                            disabled={roles.find((x) => x.role_key === selectedRoleKey)?.is_system === true}
                                            onChange={(e) => setRoleActive(e.target.checked)}
                                        />
                                        Active
                                    </label>
                                    <button
                                        type="button"
                                        disabled={roleSaving}
                                        className="rounded-md border border-alloy-forge/20 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                                        onClick={() => void saveRoleMeta()}
                                    >
                                        Save role
                                    </button>
                                </div>
                                <div className="overflow-hidden rounded-lg border border-alloy-forge/10 bg-white/40">
                                    <table className="w-full min-w-[680px] text-left text-xs">
                                        <thead className="bg-alloy-forge/5 text-alloy-midnight/65">
                                            <tr>
                                                <th className="px-3 py-2 font-semibold">Capability area</th>
                                                <th className="px-3 py-2 font-semibold">No access</th>
                                                <th className="px-3 py-2 font-semibold">Read</th>
                                                <th className="px-3 py-2 font-semibold">Write / Manage</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {PERMISSION_GRID_ROWS.map((row) => {
                                                const level = levelFromGrantedKeys(row, grantKeys);
                                                const readHint = row.readKeys
                                                    .map((k) => permissionLabelByKey.get(k) ?? k)
                                                    .filter(Boolean)
                                                    .join(", ");
                                                const writeHint = row.writeKeys
                                                    .map((k) => permissionLabelByKey.get(k) ?? k)
                                                    .filter(Boolean)
                                                    .join(", ");
                                                return (
                                                    <tr key={row.id} className="border-t border-alloy-forge/10">
                                                        <td className="px-3 py-2">
                                                            <div className="font-medium text-alloy-midnight">{row.label}</div>
                                                            <div className="mt-0.5 text-[11px] text-alloy-midnight/45">
                                                                {readHint || writeHint ? (
                                                                    <span>
                                                                        {readHint ? `Read: ${readHint}` : null}
                                                                        {readHint && writeHint ? " · " : null}
                                                                        {writeHint ? `Write: ${writeHint}` : null}
                                                                    </span>
                                                                ) : (
                                                                    <span>—</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        {(["none", "read", "write"] as const).map((opt) => (
                                                            <td key={opt} className="px-3 py-2 align-top">
                                                                <label className="inline-flex items-center gap-2">
                                                                    <input
                                                                        type="radio"
                                                                        name={`perm-${row.id}`}
                                                                        checked={level === opt}
                                                                        onChange={() => setGridLevel(row.id, opt)}
                                                                    />
                                                                    <span className="sr-only">{opt}</span>
                                                                </label>
                                                            </td>
                                                        ))}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <button
                                    type="button"
                                    disabled={roleSaving}
                                    className="rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                                    onClick={() => void saveGrants()}
                                >
                                    {roleSaving ? "Saving…" : "Save permissions"}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

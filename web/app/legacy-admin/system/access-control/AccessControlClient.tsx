"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { formatDateTime } from "@/lib/adminFormatters";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import RolesClient from "../roles/RolesClient";

type UserRow = {
    user_id: string;
    email: string | null;
    role: string;
    role_keys?: string[];
    created_at: string;
};

type RoleOption = {
    role_key: string;
    role_label: string;
    is_active: boolean;
};

export default function AccessControlClient() {
    const { canMutate } = useAdminAuth();
    const [activeTab, setActiveTab] = useState<"users" | "roles">("users");

    const [users, setUsers] = useState<UserRow[]>([]);
    const [roles, setRoles] = useState<RoleOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [roleLoadingId, setRoleLoadingId] = useState<string | null>(null);
    const [resetLoadingId, setResetLoadingId] = useState<string | null>(null);
    const [removeTarget, setRemoveTarget] = useState<UserRow | null>(null);
    const [removeLoading, setRemoveLoading] = useState(false);
    /** `W-20`/`T-19` — the route's statement that this removal would not revoke access. */
    const [removeResidual, setRemoveResidual] = useState<string | null>(null);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState("");
    const [inviteSaving, setInviteSaving] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/users");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load users");
            setUsers((json as { users?: UserRow[] }).users ?? []);
        } catch (e) {
            setError((e as Error).message);
            setUsers([]);
        }
    }, []);

    /**
     * W-56 / `S-11`. Both failure paths were silent: `!res.ok` returned without a word, and the
     * `catch` emptied the list. An empty role picker then reads as *"this org defines no roles"*
     * rather than *"we could not find out"* — `IA-R1`'s manufactured-certainty shape, and the same
     * conflation of unknown with empty that made the grants read an S3 on the sibling surface.
     * This list is not written back, so it is a truthfulness defect rather than a revocation one.
     */
    const fetchRoles = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/rbac/roles");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json.error as string) || "Failed to load roles");
            const list = (json as { roles?: RoleOption[] }).roles ?? [];
            setRoles(list.filter((r) => r.is_active));
        } catch (e) {
            setError((e as Error).message);
            setRoles([]);
        }
    }, []);

    useEffect(() => {
        if (activeTab !== "users") return;
        setLoading(true);
        setError(null);
        Promise.all([fetchUsers(), fetchRoles()]).finally(() => setLoading(false));
    }, [activeTab, fetchUsers, fetchRoles]);

    /**
     * W-54 / `I-34`ᴬ. See the note on the same handler in `legacy-admin/users/UsersClient.tsx`:
     * this surface collapses the membership, the route now refuses a replacement that would delete
     * an unshown role, and a discarded non-2xx would render as a success that wrote nothing.
     */
    const handleRoleChange = async (userId: string, role: string) => {
        setRoleLoadingId(userId);
        setError(null);
        try {
            const res = await fetch(`/api/admin/users/${userId}/role`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role }),
            });
            if (res.ok) {
                fetchUsers();
                return;
            }
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            setError(json.error ?? "Failed to update role");
            fetchUsers();
        } finally {
            setRoleLoadingId(null);
        }
    };

    const handleSendReset = async (u: UserRow) => {
        if (!u.email) return;
        setResetLoadingId(u.user_id);
        setError(null);
        try {
            /** `S-11` — see the same handler in `legacy-admin/users/UsersClient.tsx` (`W49-F1`). */
            const res = await fetch("/api/admin/send-password-reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: u.email }),
            });
            if (!res.ok) {
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                setError(json.error ?? "Failed to send the password reset email");
            }
        } finally {
            setResetLoadingId(null);
        }
    };

    const handleRemoveConfirm = async (acknowledgeResidual = false) => {
        if (!removeTarget) return;
        setRemoveLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/users/${removeTarget.user_id}/remove`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ acknowledge_residual_authority: acknowledgeResidual }),
            });
            if (res.ok) {
                setRemoveTarget(null);
                setRemoveResidual(null);
                fetchUsers();
            } else {
                /** `S-11`. A failed revocation must not read as a completed one. */
                const json = (await res.json().catch(() => ({}))) as { error?: string; acknowledgeable?: boolean };
                /** `W-20`/`T-19` — a removal that would revoke nothing is stated in the dialog, not the banner. */
                if (res.status === 409 && json.acknowledgeable === true && json.error) {
                    setRemoveResidual(json.error);
                } else {
                    setError(json.error ?? "Failed to remove this member");
                }
            }
        } finally {
            setRemoveLoading(false);
        }
    };

    const handleInviteSubmit = async () => {
        const email = inviteEmail.trim();
        const role = inviteRole.trim();
        if (!email || !role) {
            setInviteError("Email and role are required");
            return;
        }
        setInviteSaving(true);
        setInviteError(null);
        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, role }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json.error as string) || "Invite failed");
            setInviteOpen(false);
            setInviteEmail("");
            setInviteRole("");
            fetchUsers();
        } catch (e) {
            setInviteError((e as Error).message);
        } finally {
            setInviteSaving(false);
        }
    };

    return (
        <>
            <AdminPageHeader
                title="Access Control"
                subtitle="Manage users and org-scoped roles & permissions. Only admins can create or edit."
            />
            {!canMutate && (
                <p className="mb-4 text-sm text-alloy-midnight/60">
                    You can view users and roles. Only admins can invite users, change roles, or edit permissions.
                </p>
            )}

            <div className="mb-6 flex gap-2 border-b border-alloy-stone/30">
                <button
                    type="button"
                    onClick={() => setActiveTab("users")}
                    className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${activeTab === "users" ? "bg-alloy-stone text-alloy-midnight border-b-2 border-transparent" : "text-alloy-midnight/60 hover:bg-alloy-stone/50"}`}
                >
                    Users
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("roles")}
                    className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${activeTab === "roles" ? "bg-alloy-stone text-alloy-midnight border-b-2 border-transparent" : "text-alloy-midnight/60 hover:bg-alloy-stone/50"}`}
                >
                    Roles
                </button>
            </div>

            {activeTab === "users" && (
                <SectionCard title="Users">
                    {error && (
                        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                            {error}
                        </div>
                    )}
                    {loading ? (
                        <p className="text-sm text-alloy-midnight/60">Loading…</p>
                    ) : (
                        <>
                            {canMutate && (
                                <div className="mb-4">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setInviteError(null);
                                            setInviteOpen(true);
                                            if (roles.length) setInviteRole(roles[0].role_key);
                                        }}
                                        className="rounded-md border border-alloy-stone/50 bg-white px-3 py-2 text-sm font-medium text-alloy-midnight hover:bg-alloy-stone/20"
                                    >
                                        Invite user
                                    </button>
                                </div>
                            )}
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-alloy-stone/30 text-left text-alloy-midnight/70">
                                            <th className="pb-2 pr-4">Email</th>
                                            <th className="pb-2 pr-4">Role</th>
                                            <th className="pb-2 pr-4">Created</th>
                                            <th className="pb-2 pr-4">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="py-4 text-alloy-midnight/60">
                                                    No members in this org.
                                                </td>
                                            </tr>
                                        ) : (
                                            users.map((u) => (
                                                <tr key={u.user_id} className="border-b border-alloy-stone/20 hover:bg-alloy-stone/10">
                                                    <td className="py-2 pr-4">{u.email ?? "—"}</td>
                                                    <td className="py-2 pr-4">
                                                        {canMutate ? (
                                                            <select
                                                                value={u.role}
                                                                onChange={(e) => handleRoleChange(u.user_id, e.target.value)}
                                                                disabled={roleLoadingId === u.user_id}
                                                                className="rounded border border-alloy-stone/40 px-2 py-1 text-sm disabled:opacity-50"
                                                            >
                                                                {roles.map((r) => (
                                                                    <option key={r.role_key} value={r.role_key}>
                                                                        {r.role_label}
                                                                    </option>
                                                                ))}
                                                                {(u.role_keys ?? [])
                                                                    .filter((rk) => !roles.some((r) => r.role_key === rk))
                                                                    .map((rk) => (
                                                                        <option key={rk} value={rk}>
                                                                            {rk}
                                                                        </option>
                                                                    ))}
                                                                {!roles.some((r) => r.role_key === u.role) && !(u.role_keys ?? []).includes(u.role) ? (
                                                                    <option value={u.role}>{u.role}</option>
                                                                ) : null}
                                                            </select>
                                                        ) : (
                                                            <span>
                                                                {(u.role_keys?.length ?? 0) > 1
                                                                    ? `${(u.role_keys ?? []).join(", ")}`
                                                                    : roles.find((r) => r.role_key === u.role)?.role_label ?? u.role}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-2 pr-4">{u.created_at ? formatDateTime(u.created_at) : "—"}</td>
                                                    <td className="py-2 pr-4">
                                                        <span className="flex flex-wrap gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSendReset(u)}
                                                                disabled={resetLoadingId === u.user_id || !u.email || !canMutate}
                                                                className="text-xs px-2 py-0.5 text-alloy-blue hover:underline disabled:opacity-50"
                                                            >
                                                                {resetLoadingId === u.user_id ? "Sending…" : "Send password reset"}
                                                            </button>
                                                            {canMutate && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setRemoveTarget(u)}
                                                                    className="text-xs px-2 py-0.5 text-amber-700 hover:underline"
                                                                >
                                                                    Remove from org
                                                                </button>
                                                            )}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </SectionCard>
            )}

            {activeTab === "roles" && <RolesClient embedded />}

            {removeTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
                    <div className="mx-4 w-full max-w-md rounded-lg border border-alloy-stone/30 bg-white p-6 shadow-lg">
                        <h3 className="mb-2 text-lg font-semibold text-alloy-midnight">Remove from org</h3>
                        {/* `W-20`/`T-19` — "They will lose access" is the claim the legacy fallback falsifies. */}
                        <p className="mb-4 text-sm text-alloy-midnight/80">
                            Remove <strong>{removeTarget.email ?? removeTarget.user_id}</strong> from this org? Their membership in this org is deleted. Their account (auth) is not deleted.
                        </p>
                        {removeResidual && (
                            <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                                {removeResidual}
                            </div>
                        )}
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setRemoveTarget(null);
                                    setRemoveResidual(null);
                                }}
                                disabled={removeLoading}
                                className="rounded border border-alloy-stone/40 px-3 py-1.5 text-sm hover:bg-alloy-stone/20 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => handleRemoveConfirm(removeResidual !== null)}
                                disabled={removeLoading}
                                className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                                {removeLoading
                                    ? "Removing…"
                                    : removeResidual
                                      ? "Remove membership anyway"
                                      : "Remove"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {inviteOpen && (
                <>
                    <div className="fixed inset-0 z-40 bg-black/50" onClick={() => !inviteSaving && setInviteOpen(false)} />
                    <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-alloy-stone/30 bg-white p-6 shadow-lg">
                        <h3 className="mb-4 text-lg font-semibold text-alloy-midnight">Invite user</h3>
                        {inviteError && <p className="mb-3 text-sm text-red-600">{inviteError}</p>}
                        <div className="space-y-3">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-alloy-midnight/80">Email</label>
                                <input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    className="w-full rounded border border-alloy-stone/40 px-3 py-2 text-sm"
                                    placeholder="user@example.com"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-alloy-midnight/80">Role</label>
                                <select
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value)}
                                    className="w-full rounded border border-alloy-stone/40 px-3 py-2 text-sm"
                                >
                                    {roles.map((r) => (
                                        <option key={r.role_key} value={r.role_key}>
                                            {r.role_label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => !inviteSaving && setInviteOpen(false)}
                                className="rounded border border-alloy-stone/50 px-4 py-2 text-sm font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleInviteSubmit}
                                disabled={inviteSaving}
                                className="rounded bg-alloy-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                            >
                                {inviteSaving ? "Inviting…" : "Invite"}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}

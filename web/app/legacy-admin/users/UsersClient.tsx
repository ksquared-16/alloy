"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { formatDateTime } from "@/lib/adminFormatters";

type UserRow = {
  user_id: string;
  email: string | null;
  role: string;
  role_keys?: string[];
  created_at: string;
};

export default function UsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleLoadingId, setRoleLoadingId] = useState<string | null>(null);
  const [resetLoadingId, setResetLoadingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<UserRow | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Failed to load users");
        if (res.status === 403) setUsers([]);
        else setUsers([]);
        return;
      }
      setUsers((json as { users?: UserRow[] }).users ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  /**
   * W-54 / `I-34`ᴬ. This surface collapses a membership to one value and cannot render a set, so
   * the route refuses a replacement that would delete a role it never showed (HTTP 409). The
   * refusal has to be reported: `if (res.ok) fetchUsers()` discarded every non-2xx silently, which
   * would leave the operator looking at a changed dropdown and an unchanged database. A surface
   * that cannot express the fact must not be able to delete it — and must not pretend it did.
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
      /**
       * `S-11`. The response was never read, so every failure reported success. This is not
       * hypothetical here: `W49-F1` records that this route enforces `ctx.role !== "admin"` while
       * the surface offers the control to any holder of `settings.users_roles` — so a grant-holder
       * who is not org admin gets a 403 and, until now, saw a button that appeared to work.
       */
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

  const handleRemoveConfirm = async () => {
    if (!removeTarget) return;
    setRemoveLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${removeTarget.user_id}/remove`, {
        method: "POST",
      });
      if (res.ok) {
        setRemoveTarget(null);
        fetchUsers();
      } else {
        // `S-11`. A membership removal that failed must not leave the operator believing it
        // succeeded — this is the revocation path, where a false success is the dangerous direction.
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "Failed to remove this member");
      }
    } finally {
      setRemoveLoading(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Users"
        subtitle="Org members. Only admins can change roles or remove users. Changing role replaces all role_keys for that member with the selected admin/ops key (see Access Control for full RBAC roles)."
      />
      <SectionCard title="Members">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-alloy-midnight/60">Loading…</p>
        ) : (
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
                        <div className="space-y-1">
                          {(u.role_keys?.length ?? 0) > 1 ? (
                            <p className="text-xs text-alloy-midnight/60">Roles: {(u.role_keys ?? []).join(" · ")}</p>
                          ) : null}
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.user_id, e.target.value)}
                            disabled={roleLoadingId === u.user_id}
                            className="px-2 py-1 border border-alloy-stone/40 rounded text-sm disabled:opacity-50"
                          >
                            <option value="admin">admin</option>
                            <option value="ops">ops</option>
                          </select>
                        </div>
                      </td>
                      <td className="py-2 pr-4">{u.created_at ? formatDateTime(u.created_at) : "—"}</td>
                      <td className="py-2 pr-4">
                        <span className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleSendReset(u)}
                            disabled={resetLoadingId === u.user_id || !u.email}
                            className="text-xs px-2 py-0.5 text-alloy-blue hover:underline disabled:opacity-50"
                          >
                            {resetLoadingId === u.user_id ? "Sending…" : "Send password reset"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoveTarget(u)}
                            className="text-xs px-2 py-0.5 text-amber-700 hover:underline"
                          >
                            Remove from org
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
          <div className="bg-white rounded-lg shadow-lg border border-alloy-stone/30 p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-alloy-midnight mb-2">Remove from org</h3>
            <p className="text-sm text-alloy-midnight/80 mb-4">
              Remove <strong>{removeTarget.email ?? removeTarget.user_id}</strong> from this org? They will lose access to the admin portal. Their account (auth) is not deleted.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                disabled={removeLoading}
                className="px-3 py-1.5 text-sm border border-alloy-stone/40 rounded hover:bg-alloy-stone/20 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemoveConfirm}
                disabled={removeLoading}
                className="px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded hover:opacity-90 disabled:opacity-50"
              >
                {removeLoading ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type OrgMember = { user_id: string; email: string | null; role: string };
type RoleDef = { role_key: string; role_label: string; is_active: boolean };
type Dept = { id: string; name: string | null };
type Loc = { id: string; label: string | null; location_type: string | null };

type Effective = {
    roleKeys: string[];
    permissionKeys: string[];
    departmentScope: "all" | "restricted";
    siteScope: "all" | "restricted";
    allowedDepartmentIds: string[] | null;
    allowedSiteLocationIds: string[] | null;
    portalEligible: boolean;
};

export default function UserAccessClient() {
    const [users, setUsers] = useState<OrgMember[]>([]);
    const [roleDefs, setRoleDefs] = useState<RoleDef[]>([]);
    const [departments, setDepartments] = useState<Dept[]>([]);
    const [locations, setLocations] = useState<Loc[]>([]);
    const [userId, setUserId] = useState("");
    const [role, setRole] = useState("");
    const [departmentScope, setDepartmentScope] = useState<"all" | "restricted">("all");
    const [siteScope, setSiteScope] = useState<"all" | "restricted">("all");
    const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
    const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
    const [effective, setEffective] = useState<Effective | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);

    const siteLocations = useMemo(
        () => locations.filter((l) => String(l.location_type ?? "").toLowerCase() === "site"),
        [locations]
    );

    const loadLists = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const [uRes, rRes, dRes, lRes] = await Promise.all([
                fetch("/api/admin/users"),
                fetch("/api/admin/rbac/roles"),
                fetch("/api/admin/departments"),
                fetch("/api/admin/locations"),
            ]);
            const uJson = await uRes.json().catch(() => ({}));
            const rJson = await rRes.json().catch(() => ({}));
            const dJson = await dRes.json().catch(() => ({}));
            const lJson = await lRes.json().catch(() => ({}));
            if (!uRes.ok) throw new Error(typeof uJson.error === "string" ? uJson.error : "Failed to load users");
            if (!rRes.ok) throw new Error(typeof rJson.error === "string" ? rJson.error : "Failed to load roles");
            if (!dRes.ok) throw new Error(typeof dJson.error === "string" ? dJson.error : "Failed to load departments");
            if (!lRes.ok) throw new Error(typeof lJson.error === "string" ? lJson.error : "Failed to load locations");

            setUsers(Array.isArray(uJson.users) ? uJson.users : []);
            const rolesRaw = Array.isArray(rJson.roles) ? rJson.roles : [];
            setRoleDefs(rolesRaw.filter((x: RoleDef) => x.is_active !== false));
            const deptItems = Array.isArray(dJson.items) ? dJson.items : [];
            setDepartments(deptItems.map((x: { id: string; name?: string | null }) => ({ id: x.id, name: x.name ?? null })));
            const locList = Array.isArray(lJson.locations) ? lJson.locations : [];
            setLocations(
                locList.map((x: { id: string; label?: string | null; location_type?: string | null }) => ({
                    id: x.id,
                    label: x.label ?? null,
                    location_type: x.location_type ?? null,
                }))
            );
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadLists();
    }, [loadLists]);

    const loadUserScope = useCallback(async (uid: string) => {
        if (!uid) return;
        setErr(null);
        setSaveMsg(null);
        try {
            const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}/access-scope`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to load access scope");
            const u = users.find((x) => x.user_id === uid);
            setRole(u?.role ?? "");
            const eff = json.effective as Effective;
            setEffective(eff);
            setDepartmentScope(eff.departmentScope);
            setSiteScope(eff.siteScope);
            setSelectedDeptIds(Array.isArray(json.department_ids) ? json.department_ids : []);
            setSelectedSiteIds(Array.isArray(json.site_location_ids) ? json.site_location_ids : []);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to load user");
        }
    }, [users]);

    useEffect(() => {
        if (userId) void loadUserScope(userId);
    }, [userId, loadUserScope]);

    const toggleId = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

    const saveRole = async () => {
        if (!userId) return;
        setSaveMsg(null);
        setErr(null);
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            setErr(typeof json.error === "string" ? json.error : "Role update failed");
            return;
        }
        setSaveMsg("Role saved.");
        await loadLists();
        await loadUserScope(userId);
    };

    const saveScope = async () => {
        if (!userId) return;
        setSaveMsg(null);
        setErr(null);
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/access-scope`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                department_scope: departmentScope,
                site_scope: siteScope,
                department_ids: departmentScope === "restricted" ? selectedDeptIds : [],
                site_location_ids: siteScope === "restricted" ? selectedSiteIds : [],
            }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            setErr(typeof json.error === "string" ? json.error : "Scope update failed");
            return;
        }
        setSaveMsg("Access scope saved.");
        if (json.effective) setEffective(json.effective as Effective);
        await loadUserScope(userId);
    };

    if (loading && !users.length) {
        return <p className="text-sm text-alloy-midnight/60">Loading…</p>;
    }

    return (
        <div className="max-w-2xl space-y-6 text-sm text-alloy-midnight">
            <p className="text-xs leading-snug text-alloy-midnight/60">
                Per-user CRM visibility (department and site). Capabilities stay on roles and permission grants; this page only edits{" "}
                <code className="rounded bg-alloy-forge/8 px-1">user_access_profiles</code> and allow lists. Restricted scopes require at
                least one allowed id (empty lists are rejected).
            </p>

            {err ? <div className="rounded border border-red-200 bg-red-50/80 px-3 py-2 text-red-900">{err}</div> : null}
            {saveMsg ? <div className="rounded border border-alloy-pine/25 bg-alloy-pine/10 px-3 py-2 text-alloy-pine">{saveMsg}</div> : null}

            <div className="space-y-1">
                <label className="text-xs font-semibold text-alloy-midnight/70" htmlFor="user-select">
                    User
                </label>
                <select
                    id="user-select"
                    className="w-full rounded border border-alloy-forge/15 bg-white px-2 py-1.5"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                >
                    <option value="">Select…</option>
                    {users.map((u) => (
                        <option key={u.user_id} value={u.user_id}>
                            {(u.email ?? u.user_id).slice(0, 64)} ({u.role})
                        </option>
                    ))}
                </select>
            </div>

            {userId ? (
                <>
                    <div className="space-y-2 border-t border-alloy-forge/10 pt-4">
                        <h2 className="text-sm font-semibold">Role key (user_roles)</h2>
                        <select className="w-full rounded border border-alloy-forge/15 bg-white px-2 py-1.5" value={role} onChange={(e) => setRole(e.target.value)}>
                            {roleDefs.map((r) => (
                                <option key={r.role_key} value={r.role_key}>
                                    {r.role_label} ({r.role_key})
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            className="rounded bg-alloy-midnight px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
                            onClick={() => void saveRole()}
                        >
                            Save role
                        </button>
                    </div>

                    <div className="space-y-3 border-t border-alloy-forge/10 pt-4">
                        <h2 className="text-sm font-semibold">Department scope</h2>
                        <div className="flex flex-wrap gap-3 text-xs">
                            <label className="flex items-center gap-1.5">
                                <input type="radio" checked={departmentScope === "all"} onChange={() => setDepartmentScope("all")} />
                                All departments
                            </label>
                            <label className="flex items-center gap-1.5">
                                <input type="radio" checked={departmentScope === "restricted"} onChange={() => setDepartmentScope("restricted")} />
                                Restricted
                            </label>
                        </div>
                        {departmentScope === "restricted" ? (
                            <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-alloy-forge/12 p-2">
                                {departments.map((d) => (
                                    <label key={d.id} className="flex items-center gap-2 text-xs">
                                        <input
                                            type="checkbox"
                                            checked={selectedDeptIds.includes(d.id)}
                                            onChange={(e) => setSelectedDeptIds(toggleId(selectedDeptIds, d.id, e.target.checked))}
                                        />
                                        <span>{d.name ?? d.id}</span>
                                    </label>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    <div className="space-y-3 border-t border-alloy-forge/10 pt-4">
                        <h2 className="text-sm font-semibold">Site scope (locations where type = site)</h2>
                        <div className="flex flex-wrap gap-3 text-xs">
                            <label className="flex items-center gap-1.5">
                                <input type="radio" checked={siteScope === "all"} onChange={() => setSiteScope("all")} />
                                All sites
                            </label>
                            <label className="flex items-center gap-1.5">
                                <input type="radio" checked={siteScope === "restricted"} onChange={() => setSiteScope("restricted")} />
                                Restricted
                            </label>
                        </div>
                        {siteScope === "restricted" ? (
                            <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-alloy-forge/12 p-2">
                                {siteLocations.length === 0 ? (
                                    <p className="text-xs text-alloy-midnight/50">No site locations in this org.</p>
                                ) : (
                                    siteLocations.map((loc) => (
                                        <label key={loc.id} className="flex items-center gap-2 text-xs">
                                            <input
                                                type="checkbox"
                                                checked={selectedSiteIds.includes(loc.id)}
                                                onChange={(e) => setSelectedSiteIds(toggleId(selectedSiteIds, loc.id, e.target.checked))}
                                            />
                                            <span>{loc.label ?? loc.id}</span>
                                        </label>
                                    ))
                                )}
                            </div>
                        ) : null}
                        <button
                            type="button"
                            className="rounded bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
                            onClick={() => void saveScope()}
                        >
                            Save access scope
                        </button>
                    </div>

                    {effective ? (
                        <div className="border-t border-alloy-forge/10 pt-4">
                            <h2 className="text-sm font-semibold">Effective preview</h2>
                            <pre className="mt-2 overflow-x-auto rounded border border-alloy-forge/12 bg-white/60 p-3 text-[11px] leading-relaxed">
                                {JSON.stringify(effective, null, 2)}
                            </pre>
                            <p className="mt-2 text-[11px] text-alloy-midnight/50">
                                Legacy admin/ops users typically retain portal-wide visibility via resolver defaults until profiles are tightened.
                                Multi-org users are edited per org membership row only.
                            </p>
                        </div>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}

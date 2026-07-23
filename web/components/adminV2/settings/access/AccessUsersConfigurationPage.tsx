"use client";

/**
 * Access → Users. Collection rail (members) + Selected workspace (Overview / Roles / Access /
 * Security / History) for one org member. Mutations reuse the existing Users & Roles APIs —
 * this file is UI-only.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, UserRound } from "lucide-react";
import {
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceCard, ConfigWorkspaceTabBar } from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
    QUEUE_ROW_CARD_SELECTED_BORDER_CLASS,
    QUEUE_ROW_CARD_SHELL_CLASS,
    QUEUE_ROW_SELECTED_RAIL_CLASS,
} from "@/lib/presentation/runtime/queueRowCardShell";
import { LocationMultiSelect } from "@/components/adminV2/settings/configurationRuntime/LocationMultiSelect";

type AccessUserTab = "overview" | "roles" | "access" | "security" | "history";

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

type RoleRow = { role_key: string; role_label: string; is_system: boolean; is_active: boolean; created_at: string | null };

function displayName(m: MemberRow): string {
    const n = (m.display_name ?? "").trim();
    if (n) return n;
    return (m.email ?? "").trim() || "Unnamed user";
}

function locationSummary(m: MemberRow, siteLocations: SiteLocOpt[]): string {
    if (m.site_scope === "all") return "All locations";
    const n = m.site_location_ids.length;
    if (n === 0) return "No locations selected";
    if (n === 1) {
        const label = siteLocations.find((s) => s.id === m.site_location_ids[0])?.label;
        return label ?? "1 location";
    }
    return `${n} locations`;
}

function departmentSummary(m: MemberRow, departments: DeptOpt[]): string {
    if (m.department_scope === "all") return "All departments";
    const n = m.department_ids.length;
    if (n === 0) return "No departments selected";
    if (n === 1) {
        const dept = departments.find((d) => d.id === m.department_ids[0]);
        return (dept?.name ?? dept?.key) || "1 department";
    }
    return `${n} departments`;
}

export default function AccessUsersConfigurationPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialUserId = searchParams.get("userId");

    const [members, setMembers] = useState<MemberRow[]>([]);
    const [departments, setDepartments] = useState<DeptOpt[]>([]);
    const [siteLocations, setSiteLocations] = useState<SiteLocOpt[]>([]);
    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [selectedUserId, setSelectedUserId] = useState<string | null>(initialUserId);
    const [tab, setTab] = useState<AccessUserTab>("overview");

    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState("");
    const [inviteBusy, setInviteBusy] = useState(false);

    const [editRole, setEditRole] = useState("");
    const [roleSaving, setRoleSaving] = useState(false);

    const [deptScope, setDeptScope] = useState<"all" | "restricted">("all");
    const [siteScope, setSiteScope] = useState<"all" | "restricted">("all");
    const [selDeptIds, setSelDeptIds] = useState<string[]>([]);
    const [selSiteIds, setSelSiteIds] = useState<string[]>([]);
    const [accessSaving, setAccessSaving] = useState(false);

    const [resetBusy, setResetBusy] = useState(false);
    const [removeBusy, setRemoveBusy] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [actionsOpen, setActionsOpen] = useState(false);

    const reload = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch("/api/admin/settings/users-roles/members");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to load members");
            setMembers(Array.isArray(json.members) ? json.members : []);
            setDepartments(Array.isArray(json.departments) ? json.departments : []);
            setSiteLocations(Array.isArray(json.site_locations) ? json.site_locations : []);

            const rRes = await fetch("/api/admin/rbac/roles");
            const rJson = await rRes.json().catch(() => ({}));
            if (!rRes.ok) throw new Error(typeof rJson.error === "string" ? rJson.error : "Failed to load roles");
            setRoles((rJson as { roles?: RoleRow[] }).roles ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load users.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        if (initialUserId) setSelectedUserId(initialUserId);
    }, [initialUserId]);

    const activeRoles = useMemo(() => roles.filter((r) => r.is_active !== false), [roles]);
    const roleLabelByKey = useMemo(() => {
        const map = new Map<string, string>();
        for (const r of roles) map.set(r.role_key, r.role_label);
        return map;
    }, [roles]);
    const roleLabelFor = useCallback(
        (roleKey: string) => roleLabelByKey.get(roleKey) ?? roleKey,
        [roleLabelByKey],
    );

    const visibleMembers = useMemo(() => {
        const query = search.trim().toLowerCase();
        return members
            .filter((m) => {
                if (!query) return true;
                const haystack = `${displayName(m)} ${m.email ?? ""} ${roleLabelFor(m.primary_role)}`.toLowerCase();
                return haystack.includes(query);
            })
            .sort((a, b) => displayName(a).localeCompare(displayName(b)));
    }, [members, search, roleLabelFor]);

    const selected = useMemo(
        () => (selectedUserId ? members.find((m) => m.user_id === selectedUserId) ?? null : null),
        [members, selectedUserId],
    );

    useEffect(() => {
        if (!selected) {
            setEditRole("");
            setDeptScope("all");
            setSiteScope("all");
            setSelDeptIds([]);
            setSelSiteIds([]);
            return;
        }
        setEditRole(selected.primary_role);
        setDeptScope(selected.department_scope);
        setSiteScope(selected.site_scope);
        setSelDeptIds([...selected.department_ids]);
        setSelSiteIds([...selected.site_location_ids]);
        setConfirmRemove(false);
        setActionsOpen(false);
    }, [selected]);

    const selectMember = (userId: string) => {
        setSelectedUserId(userId);
        setTab("overview");
        setMessage(null);
        setError(null);
    };

    const openInvite = () => {
        setInviteEmail("");
        setInviteRole("");
        setInviteOpen(true);
    };

    const sendInvite = async () => {
        setInviteBusy(true);
        setMessage(null);
        setError(null);
        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole.trim() }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Invite failed");
            setMessage(`Invitation sent to ${inviteEmail.trim()}.`);
            setInviteOpen(false);
            await reload();
            const newUserId = (json as { user_id?: string }).user_id;
            if (typeof newUserId === "string" && newUserId) selectMember(newUserId);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Invite failed.");
        } finally {
            setInviteBusy(false);
        }
    };

    const saveRole = async () => {
        if (!selected) return;
        setRoleSaving(true);
        setMessage(null);
        setError(null);
        try {
            const res = await fetch(`/api/admin/users/${encodeURIComponent(selected.user_id)}/role`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: editRole }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Role save failed");
            setMessage("Role updated.");
            await reload();
            /** Re-run settings layout server props so `AdminAuthProvider` roleKeys match fresh `user_roles`. */
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Role save failed.");
        } finally {
            setRoleSaving(false);
        }
    };

    const saveAccess = async () => {
        if (!selected) return;
        setAccessSaving(true);
        setMessage(null);
        setError(null);
        try {
            const res = await fetch(`/api/admin/users/${encodeURIComponent(selected.user_id)}/access-scope`, {
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
            setMessage("Access updated.");
            await reload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Access save failed.");
        } finally {
            setAccessSaving(false);
        }
    };

    const sendPasswordReset = async () => {
        if (!selected?.email) return;
        setResetBusy(true);
        setMessage(null);
        setError(null);
        try {
            const res = await fetch("/api/admin/send-password-reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: selected.email }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not send reset email");
            setMessage(typeof json.message === "string" ? json.message : "Password reset email sent.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not send reset email.");
        } finally {
            setResetBusy(false);
        }
    };

    const removeUser = async () => {
        if (!selected) return;
        setRemoveBusy(true);
        setMessage(null);
        setError(null);
        try {
            const res = await fetch(`/api/admin/users/${encodeURIComponent(selected.user_id)}/remove`, {
                method: "POST",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not remove user");
            setMessage(`${displayName(selected)} removed from this organization.`);
            setSelectedUserId(null);
            setConfirmRemove(false);
            setActionsOpen(false);
            await reload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not remove user.");
        } finally {
            setRemoveBusy(false);
        }
    };

    const departmentOptions = useMemo(
        () => departments.map((d) => ({ id: d.id, name: (d.name ?? d.key ?? d.id) as string })),
        [departments],
    );
    const siteOptions = useMemo(
        () => siteLocations.map((s) => ({ id: s.id, name: (s.label ?? s.id) as string })),
        [siteLocations],
    );

    const tabs = [
        { key: "overview" as const, label: "Overview" },
        { key: "roles" as const, label: "Roles" },
        { key: "access" as const, label: "Access" },
        { key: "security" as const, label: "Security" },
        { key: "history" as const, label: "History" },
    ];

    return (
        <div data-testid="access-users-page">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs leading-snug text-alloy-midnight/55">
                    Manage people who can sign in to Alloy.
                </p>
                <ConfigurationPrimaryButton className="gap-1" onClick={openInvite} data-testid="access-users-invite">
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                    Invite User
                </ConfigurationPrimaryButton>
            </div>

            {error ?
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}
            {message ?
                <p
                    className="mb-3 rounded-lg border border-alloy-pine/25 bg-alloy-pine/10 px-3 py-2 text-sm text-alloy-pine"
                    role="status"
                >
                    {message}
                </p>
            :   null}

            <ConfigurationShell testId="access-users-shell">
                {loading ?
                    <ConfigurationEmptyState testId="access-users-loading" title="Loading Users" description="Fetching org members." />
                :   <div className="grid items-start gap-4 pb-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
                        <aside className="locations-collection-rail process-config-setup-card hidden min-w-0 p-0 xl:block">
                            <header className="locations-collection-rail__header">
                                <h2 className="locations-collection-rail__title">Users</h2>
                                <p className="locations-collection-rail__count">{visibleMembers.length} people</p>
                            </header>
                            <div className="programs-collection-controls">
                                <div className="programs-collection-controls__search-wrap">
                                    <Search className="programs-collection-controls__search-icon" strokeWidth={2} aria-hidden />
                                    <input
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder="Search users…"
                                        className="programs-collection-controls__search"
                                        data-testid="access-users-search"
                                    />
                                </div>
                            </div>
                            <div className="locations-collection-rail__list" role="listbox" aria-label="Users">
                                {visibleMembers.map((m) => {
                                    const selectedRow = m.user_id === selectedUserId;
                                    return (
                                        <button
                                            key={m.user_id}
                                            type="button"
                                            role="option"
                                            aria-selected={selectedRow}
                                            className={`${QUEUE_ROW_CARD_SHELL_CLASS} locations-collection-row ${
                                                selectedRow ? QUEUE_ROW_CARD_SELECTED_BORDER_CLASS : QUEUE_ROW_CARD_IDLE_BORDER_CLASS
                                            }`}
                                            onClick={() => selectMember(m.user_id)}
                                            data-testid={`access-user-${m.user_id}`}
                                        >
                                            {selectedRow ? <span aria-hidden className={QUEUE_ROW_SELECTED_RAIL_CLASS} /> : null}
                                            <span className="locations-collection-row__body">
                                                <span className="locations-collection-row__name">{displayName(m)}</span>
                                                <span className="locations-collection-row__place">{m.email ?? "No email on file"}</span>
                                                <span className="locations-collection-row__meta text-alloy-midnight/50">
                                                    {roleLabelFor(m.primary_role)} · {locationSummary(m, siteLocations)} ·{" "}
                                                    {departmentSummary(m, departments)}
                                                </span>
                                            </span>
                                            <span className="locations-collection-row__status locations-collection-row__status--active">
                                                Active
                                            </span>
                                        </button>
                                    );
                                })}
                                {members.length > 0 && visibleMembers.length === 0 ?
                                    <p className="px-2 py-6 text-center text-xs text-alloy-midnight/45">
                                        No users match this search.
                                    </p>
                                :   null}
                                {members.length === 0 ?
                                    <p className="px-2 py-6 text-center text-xs text-alloy-midnight/45">
                                        No users in this organization yet.
                                    </p>
                                :   null}
                            </div>
                        </aside>

                        <main className="min-w-0">
                            {!selected ?
                                <ConfigurationEmptyState
                                    testId="access-users-no-selection"
                                    title="Choose a user"
                                    description="Choose a user to manage their roles, access, security, and history."
                                />
                            :   <div className="space-y-4" data-testid="access-user-selected-workspace">
                                    <section className="process-config-setup-card p-5">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h2 className="config-typo-workspace-title text-xl text-alloy-midnight">
                                                        {displayName(selected)}
                                                    </h2>
                                                    <span className="locations-collection-row__status locations-collection-row__status--active">
                                                        Active
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-sm text-alloy-midnight/55">
                                                    {roleLabelFor(selected.primary_role)} · {locationSummary(selected, siteLocations)} ·{" "}
                                                    Password sign-in
                                                </p>
                                            </div>
                                            <div className="relative flex flex-wrap gap-2">
                                                <ConfigurationSecondaryButton
                                                    onClick={() => setTab("access")}
                                                    data-testid="access-user-edit"
                                                >
                                                    Edit User
                                                </ConfigurationSecondaryButton>
                                                <ConfigurationSecondaryButton
                                                    onClick={() => setActionsOpen((open) => !open)}
                                                    data-testid="access-user-more"
                                                >
                                                    More
                                                </ConfigurationSecondaryButton>
                                                {actionsOpen ?
                                                    <div
                                                        className="absolute right-0 top-full z-10 mt-1 w-56 rounded-lg border border-alloy-stone/25 bg-white p-2 shadow-lg"
                                                        data-testid="access-user-more-menu"
                                                    >
                                                        {!confirmRemove ?
                                                            <button
                                                                type="button"
                                                                className="w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-red-700 hover:bg-red-50"
                                                                onClick={() => setConfirmRemove(true)}
                                                                data-testid="access-user-remove"
                                                            >
                                                                Remove from organization
                                                            </button>
                                                        :   <div className="space-y-2 px-2 py-1">
                                                                <p className="text-xs text-alloy-midnight/70">
                                                                    Remove {displayName(selected)}? They will lose access to this
                                                                    organization.
                                                                </p>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        type="button"
                                                                        disabled={removeBusy}
                                                                        className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
                                                                        onClick={() => void removeUser()}
                                                                        data-testid="access-user-remove-confirm"
                                                                    >
                                                                        {removeBusy ? "Removing…" : "Confirm remove"}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="rounded-md border border-alloy-stone/25 px-2 py-1 text-xs font-medium"
                                                                        onClick={() => setConfirmRemove(false)}
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        }
                                                    </div>
                                                :   null}
                                            </div>
                                        </div>
                                        <ConfigWorkspaceTabBar
                                            tabs={tabs}
                                            activeSection={tab}
                                            onSectionChange={setTab}
                                            ariaLabel="User sections"
                                            testIdPrefix="access-user-tab"
                                        />
                                    </section>

                                    {tab === "overview" ?
                                        <div className="grid gap-4 md:grid-cols-2" data-testid="access-user-overview">
                                            <ConfigWorkspaceCard title="Account Snapshot" testId="access-user-overview-account">
                                                <dl className="grid gap-3 text-sm">
                                                    <div>
                                                        <dt className="text-[11px] font-medium text-alloy-midnight/40">Email</dt>
                                                        <dd className="mt-0.5">{selected.email ?? "No email on file"}</dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-[11px] font-medium text-alloy-midnight/40">Role</dt>
                                                        <dd className="mt-0.5">{roleLabelFor(selected.primary_role)}</dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-[11px] font-medium text-alloy-midnight/40">Status</dt>
                                                        <dd className="mt-0.5">Active</dd>
                                                    </div>
                                                </dl>
                                            </ConfigWorkspaceCard>
                                            <ConfigWorkspaceCard
                                                title="Effective Access"
                                                testId="access-user-overview-effective-access"
                                                className="opacity-90"
                                            >
                                                <p
                                                    className="text-sm leading-6 text-alloy-midnight/55"
                                                    data-capability="planned"
                                                    data-testid="access-user-effective-access-planned"
                                                >
                                                    Computed effective access will appear here when available.
                                                </p>
                                            </ConfigWorkspaceCard>
                                            <ConfigWorkspaceCard
                                                title="Security Summary"
                                                testId="access-user-overview-security"
                                                className="md:col-span-2"
                                            >
                                                <p className="text-sm text-alloy-midnight/70">
                                                    Password · Reset available via the Security tab.
                                                </p>
                                            </ConfigWorkspaceCard>
                                        </div>
                                    : tab === "roles" ?
                                        <ConfigWorkspaceCard testId="access-user-roles" title="Assigned Role">
                                            <p className="text-sm text-alloy-midnight/60">
                                                This user receives the permissions of their assigned role. One role is
                                                supported per user today.
                                            </p>
                                            <label className="mt-3 block max-w-sm">
                                                <span className="config-typo-field-label">Role</span>
                                                <select
                                                    className="config-runtime-select mt-1"
                                                    value={editRole}
                                                    onChange={(event) => setEditRole(event.target.value)}
                                                    data-testid="access-user-role-select"
                                                >
                                                    {activeRoles.map((r) => (
                                                        <option key={r.role_key} value={r.role_key}>
                                                            {r.role_label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <ConfigurationPrimaryButton
                                                className="mt-3"
                                                disabled={roleSaving || editRole === selected.primary_role}
                                                onClick={() => void saveRole()}
                                                data-testid="access-user-role-save"
                                            >
                                                {roleSaving ? "Saving…" : "Save role"}
                                            </ConfigurationPrimaryButton>
                                        </ConfigWorkspaceCard>
                                    : tab === "access" ?
                                        <div className="space-y-4" data-testid="access-user-access">
                                            <ConfigWorkspaceCard testId="access-user-access-locations" title="Locations">
                                                <LocationMultiSelect
                                                    testId="access-user-access-locations-select"
                                                    legend="Locations"
                                                    locations={siteOptions}
                                                    mode={siteScope === "all" ? "all" : "selected"}
                                                    selectedIds={selSiteIds}
                                                    onModeChange={(mode) => setSiteScope(mode === "all" ? "all" : "restricted")}
                                                    onSelectedIdsChange={setSelSiteIds}
                                                    allLabel="All locations"
                                                    selectedLabel="Selected locations"
                                                />
                                            </ConfigWorkspaceCard>
                                            <ConfigWorkspaceCard testId="access-user-access-departments" title="Departments">
                                                <LocationMultiSelect
                                                    testId="access-user-access-departments-select"
                                                    legend="Departments"
                                                    locations={departmentOptions}
                                                    mode={deptScope === "all" ? "all" : "selected"}
                                                    selectedIds={selDeptIds}
                                                    onModeChange={(mode) => setDeptScope(mode === "all" ? "all" : "restricted")}
                                                    onSelectedIdsChange={setSelDeptIds}
                                                    radioGroupAriaLabel="Department applicability"
                                                    allLabel="All departments"
                                                    selectedLabel="Selected departments"
                                                    emptyLabel="No departments are configured for this organization yet."
                                                    searchPlaceholder="Search departments…"
                                                    allModeHint="Visible across every department."
                                                />
                                            </ConfigWorkspaceCard>
                                            <ConfigurationPrimaryButton
                                                disabled={accessSaving}
                                                onClick={() => void saveAccess()}
                                                data-testid="access-user-access-save"
                                            >
                                                {accessSaving ? "Saving…" : "Save access"}
                                            </ConfigurationPrimaryButton>
                                        </div>
                                    : tab === "security" ?
                                        <div className="space-y-4" data-testid="access-user-security">
                                            <ConfigWorkspaceCard testId="access-user-security-account" title="Account">
                                                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                                                    <div>
                                                        <dt className="text-[11px] font-medium text-alloy-midnight/40">Account</dt>
                                                        <dd className="mt-0.5">Active</dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-[11px] font-medium text-alloy-midnight/40">Authentication</dt>
                                                        <dd className="mt-0.5">Password</dd>
                                                    </div>
                                                </dl>
                                                <ConfigurationSecondaryButton
                                                    className="mt-3"
                                                    disabled={resetBusy || !selected.email}
                                                    onClick={() => void sendPasswordReset()}
                                                    data-testid="access-user-security-reset"
                                                >
                                                    {resetBusy ? "Sending…" : "Send password reset"}
                                                </ConfigurationSecondaryButton>
                                            </ConfigWorkspaceCard>
                                            <ConfigWorkspaceCard testId="access-user-security-mfa" title="Multi-factor authentication">
                                                <p className="text-sm text-alloy-midnight/55" data-capability="planned">
                                                    Multi-factor authentication is planned and not yet available.
                                                </p>
                                            </ConfigWorkspaceCard>
                                            <ConfigWorkspaceCard testId="access-user-security-sessions" title="Sessions">
                                                <p className="text-sm text-alloy-midnight/55" data-capability="planned">
                                                    Active session visibility is planned and not yet available.
                                                </p>
                                            </ConfigWorkspaceCard>
                                        </div>
                                    :   <ConfigWorkspaceCard testId="access-user-history" title="History">
                                            <p className="text-sm text-alloy-midnight/55" data-capability="planned">
                                                A verified account and role history for this user is planned. No events
                                                are fabricated for display.
                                            </p>
                                        </ConfigWorkspaceCard>
                                    }
                                </div>
                            }
                        </main>
                    </div>
                }
            </ConfigurationShell>

            {inviteOpen ?
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Invite user"
                >
                    <div className="w-full max-w-md rounded-xl border border-alloy-stone/25 bg-white p-5">
                        <div className="flex items-center gap-2">
                            <UserRound className="h-4 w-4 text-alloy-bend-pine" aria-hidden />
                            <h2 className="text-lg font-semibold text-alloy-midnight">Invite User</h2>
                        </div>
                        <div className="mt-4 space-y-3">
                            <label className="block">
                                <span className="config-typo-field-label">Email *</span>
                                <input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(event) => setInviteEmail(event.target.value)}
                                    placeholder="name@org.com"
                                    className="config-runtime-input mt-1"
                                    data-testid="access-invite-email"
                                />
                            </label>
                            <label className="block">
                                <span className="config-typo-field-label">Role *</span>
                                <select
                                    value={inviteRole}
                                    onChange={(event) => setInviteRole(event.target.value)}
                                    className="config-runtime-select mt-1"
                                    data-testid="access-invite-role"
                                >
                                    <option value="">Select a role…</option>
                                    {activeRoles.map((r) => (
                                        <option key={r.role_key} value={r.role_key}>
                                            {r.role_label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <p className="text-xs text-alloy-midnight/45" data-capability="planned">
                                Location and department access can be set after the invitation is accepted, from the
                                Access tab. Custom onboarding steps are planned.
                            </p>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <ConfigurationSecondaryButton disabled={inviteBusy} onClick={() => setInviteOpen(false)}>
                                Cancel
                            </ConfigurationSecondaryButton>
                            <ConfigurationPrimaryButton
                                disabled={inviteBusy || !inviteEmail.trim() || !inviteRole}
                                onClick={() => void sendInvite()}
                                data-testid="access-invite-send"
                            >
                                {inviteBusy ? "Sending…" : "Send Invitation"}
                            </ConfigurationPrimaryButton>
                        </div>
                    </div>
                </div>
            :   null}
        </div>
    );
}

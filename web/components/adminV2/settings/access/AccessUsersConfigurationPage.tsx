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

import {
    authenticationMethodLabel,
    scopeSummary,
    MEMBER_LIFECYCLE_LABEL,
    type MemberAuthenticationProjection,
    type MemberLifecycleProjection,
    type ConfiguredScope,
} from "@/lib/access/memberIdentityProjection";
import { UnknownValue } from "@/components/adminV2/settings/access/UnknownValue";
import {
    heldRoleKeys,
    replacementIsNoOp,
    roleAssignmentLabel,
    rolesDiscardedByReplacement,
} from "@/lib/access/memberRoleAssignment";

type MemberRow = {
    user_id: string;
    email: string | null;
    display_name: string | null;
    role_keys: string[];
    primary_role: string;
    department_scope: ConfiguredScope;
    site_scope: ConfiguredScope;
    has_access_profile: boolean;
    effective_department_scope: "all" | "restricted";
    effective_site_scope: "all" | "restricted";
    effective_divergence_reason: string | null;
    department_ids: string[];
    site_location_ids: string[];
    lifecycle: MemberLifecycleProjection;
    authentication: MemberAuthenticationProjection;
};

type DeptOpt = { id: string; name: string | null; key: string | null };
type SiteLocOpt = { id: string; label: string | null };

type RoleRow = { role_key: string; role_label: string; is_system: boolean; is_active: boolean; created_at: string | null };

function displayName(m: MemberRow): string {
    const n = (m.display_name ?? "").trim();
    if (n) return n;
    return (m.email ?? "").trim() || "Unnamed user";
}

/**
 * W-45 / W-47 — these summaries used to open with `if (scope === "all") return "All locations"`,
 * and an absent access profile reached that branch because the projection defaulted it to `all`.
 * The rule now lives in `scopeSummary`, which returns the certainty alongside the label so an
 * unconfigured scope renders as its own state rather than as a reassurance (`IA-R3`).
 */
function locationSummary(m: MemberRow, siteLocations: SiteLocOpt[]) {
    return scopeSummary({
        configured: m.site_scope,
        ids: m.site_location_ids,
        labelFor: (id) => siteLocations.find((s) => s.id === id)?.label ?? null,
        allLabel: "All locations",
        noneLabel: "No locations selected",
        unitSingular: "location",
        unitPlural: "locations",
    });
}

function departmentSummary(m: MemberRow, departments: DeptOpt[]) {
    return scopeSummary({
        configured: m.department_scope,
        ids: m.department_ids,
        labelFor: (id) => {
            const dept = departments.find((d) => d.id === id);
            return (dept?.name ?? dept?.key) || null;
        },
        allLabel: "All departments",
        noneLabel: "No departments selected",
        unitSingular: "department",
        unitPlural: "departments",
    });
}

/** Status pill class — a state the platform did not read must not borrow the "active" styling. */
function lifecyclePillClass(state: MemberLifecycleProjection["state"]): string {
    return state === "active" ?
            "locations-collection-row__status locations-collection-row__status--active"
        :   "locations-collection-row__status";
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
    /**
     * `M2-17`. Acknowledgement that a replacement will delete the other roles this membership
     * holds. It starts false and is reset by any change of selection or of the target role, so an
     * acknowledgement can never outlive the statement it was given for.
     */
    const [confirmRoleReplace, setConfirmRoleReplace] = useState(false);

    /**
     * W-47: the editor's scope state carries `unset` too. Prefilling `all` for a membership that
     * has no access profile would let the operator save a grant the product invented — §1.7's
     * *"a simplification MUST NOT promote a value it has not corrected"*, in the one place where
     * the promotion would be written back to the database.
     */
    const [deptScope, setDeptScope] = useState<ConfiguredScope>("all");
    const [siteScope, setSiteScope] = useState<ConfiguredScope>("all");
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

    /**
     * W-51 / `IA-7`. Every role the membership holds, labelled — `null` when it holds none, which
     * the callers render as an explicit unknown rather than a plausible word.
     */
    const rolesLabelFor = useCallback(
        (member: MemberRow) => roleAssignmentLabel(member, roleLabelFor),
        [roleLabelFor],
    );

    const visibleMembers = useMemo(() => {
        const query = search.trim().toLowerCase();
        return members
            .filter((m) => {
                if (!query) return true;
                // Searching a role the operator can see must find the people who hold it. Against
                // the collapsed value, a member holding {admin, regional_lead} was unfindable by
                // "regional lead" — the union is searched, not the survivor.
                const haystack = `${displayName(m)} ${m.email ?? ""} ${rolesLabelFor(m) ?? ""}`.toLowerCase();
                return haystack.includes(query);
            })
            .sort((a, b) => displayName(a).localeCompare(displayName(b)));
    }, [members, search, rolesLabelFor]);

    const selected = useMemo(
        () => (selectedUserId ? members.find((m) => m.user_id === selectedUserId) ?? null : null),
        [members, selectedUserId],
    );

    /** The union this membership actually holds. Empty is a real answer and is rendered as one. */
    const selectedHeldRoles = useMemo(() => (selected ? heldRoleKeys(selected) : []), [selected]);

    /**
     * `M2-17`. The roles the replacement `PATCH` would delete if submitted as it stands. The write
     * replaces every role row for the pair, so this is *everything held except the selection* —
     * and until it is empty or acknowledged, the save does not fire.
     */
    const rolesLostBySave = useMemo(
        () => (selected ? rolesDiscardedByReplacement(selected, editRole) : []),
        [selected, editRole],
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
        setConfirmRoleReplace(false);
        setActionsOpen(false);
    }, [selected]);

    /**
     * The scope editor is hidden for a membership with no access profile until the operator asks
     * for it. `LocationMultiSelect` has two modes, so simply rendering it for an `unset` scope
     * would show one radio already chosen — a choice nobody made, one click from being written.
     */
    const scopeEditorVisible = (selected?.has_access_profile ?? false) || deptScope !== "unset" || siteScope !== "unset";

    /** Starts from the closed direction: restricted with nothing selected, never org-wide. */
    const beginScopeConfiguration = () => {
        setDeptScope("restricted");
        setSiteScope("restricted");
        setSelDeptIds([]);
        setSelSiteIds([]);
    };

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
        // M2-17, asserted rather than assumed. The button is already disabled in both cases, but a
        // destructive replacement must not be reachable from a stale render or a programmatic
        // click either — the guard that matters is the one in front of the write.
        if (replacementIsNoOp(selected, editRole)) return;
        if (rolesDiscardedByReplacement(selected, editRole).length > 0 && !confirmRoleReplace) return;
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
            setConfirmRoleReplace(false);
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
            // Refused rather than coerced: an `unset` dimension has no value to write, and
            // choosing one here is exactly the fabrication W-47 removes from the read path.
            if (deptScope === "unset" || siteScope === "unset") {
                throw new Error("Choose a location and department scope before saving.");
            }
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
                                                    {rolesLabelFor(m) ?? "No role assigned"} ·{" "}
                                                    {locationSummary(m, siteLocations).label} ·{" "}
                                                    {departmentSummary(m, departments).label}
                                                </span>
                                            </span>
                                            <span
                                                className={lifecyclePillClass(m.lifecycle.state)}
                                                data-testid={`access-user-status-${m.user_id}`}
                                                data-lifecycle-state={m.lifecycle.state}
                                                {...(m.lifecycle.state === "unknown" ?
                                                    { "data-capability": "unknown", title: m.lifecycle.unknown_reason ?? undefined }
                                                :   {})}
                                            >
                                                {MEMBER_LIFECYCLE_LABEL[m.lifecycle.state]}
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
                                                    <span
                                                        className={lifecyclePillClass(selected.lifecycle.state)}
                                                        data-testid="access-user-selected-status"
                                                        data-lifecycle-state={selected.lifecycle.state}
                                                        {...(selected.lifecycle.state === "unknown" ?
                                                            {
                                                                "data-capability": "unknown",
                                                                title: selected.lifecycle.unknown_reason ?? undefined,
                                                            }
                                                        :   {})}
                                                    >
                                                        {MEMBER_LIFECYCLE_LABEL[selected.lifecycle.state]}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-sm text-alloy-midnight/55">
                                                    {rolesLabelFor(selected) ?? "No role assigned"} ·{" "}
                                                    {locationSummary(selected, siteLocations).label} ·{" "}
                                                    {authenticationMethodLabel(selected.authentication)}
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
                                                    {/*
                                                      * W-51 / IA-7. The label follows the record: a membership
                                                      * holding two roles is titled "Roles", because `user_roles`
                                                      * is keyed on (user_id, org_id, role) and a singular heading
                                                      * over a union states a model the schema does not have.
                                                      */}
                                                    <div>
                                                        <dt className="text-[11px] font-medium text-alloy-midnight/40">
                                                            {selectedHeldRoles.length > 1 ? "Roles" : "Role"}
                                                        </dt>
                                                        <dd className="mt-0.5" data-testid="access-user-overview-roles">
                                                            {rolesLabelFor(selected) ?? (
                                                                <UnknownValue
                                                                    reason="This membership has no role rows in this organization."
                                                                    testId="access-user-overview-roles-none"
                                                                />
                                                            )}
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-[11px] font-medium text-alloy-midnight/40">Status</dt>
                                                        <dd className="mt-0.5" data-testid="access-user-overview-status">
                                                            {selected.lifecycle.state === "unknown" ?
                                                                <UnknownValue
                                                                    reason={
                                                                        selected.lifecycle.unknown_reason ??
                                                                        "This state was not read."
                                                                    }
                                                                />
                                                            :   MEMBER_LIFECYCLE_LABEL[selected.lifecycle.state]}
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-[11px] font-medium text-alloy-midnight/40">
                                                            Invited
                                                        </dt>
                                                        <dd className="mt-0.5" data-testid="access-user-overview-invited">
                                                            {selected.lifecycle.invited_at ?
                                                                new Date(selected.lifecycle.invited_at).toLocaleString()
                                                            :   <UnknownValue
                                                                    label="No invitation recorded"
                                                                    reason="The authentication record carries no invitation timestamp for this membership."
                                                                />
                                                            }
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-[11px] font-medium text-alloy-midnight/40">
                                                            Last sign-in
                                                        </dt>
                                                        <dd className="mt-0.5" data-testid="access-user-overview-last-sign-in">
                                                            {selected.lifecycle.last_sign_in_at ?
                                                                new Date(selected.lifecycle.last_sign_in_at).toLocaleString()
                                                            :   <UnknownValue
                                                                    label="Never signed in"
                                                                    reason="The authentication record carries no sign-in timestamp for this membership."
                                                                />
                                                            }
                                                        </dd>
                                                    </div>
                                                </dl>
                                            </ConfigWorkspaceCard>
                                            <ConfigWorkspaceCard
                                                title="Effective Access"
                                                testId="access-user-overview-effective-access"
                                                className="opacity-90"
                                            >
                                                {/*
                                                  * W-47: the scope half of effective access is readable today, so it is
                                                  * shown. `effective_*` comes from the enforcing resolver
                                                  * (`resolveScopeAnswerFromProfile` under `ABSENT_PROFILE_ENFORCEMENT`),
                                                  * not from a second rule — `IA-R4`'s "MUST NOT have a second
                                                  * implementation" applied where it already costs nothing.
                                                  *
                                                  * The capability half is still Planned: W-48 binds it to the resolver
                                                  * after W-41/W-42, and computing it here would be the second
                                                  * implementation that workstream exists to prevent.
                                                  */}
                                                <dl
                                                    className="grid gap-3 text-sm"
                                                    data-testid="access-user-effective-scope"
                                                >
                                                    <div>
                                                        <dt className="text-[11px] font-medium text-alloy-midnight/40">
                                                            Locations
                                                        </dt>
                                                        <dd
                                                            className="mt-0.5"
                                                            data-scope-configured={selected.site_scope}
                                                            data-scope-effective={selected.effective_site_scope}
                                                        >
                                                            {locationSummary(selected, siteLocations).label}
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-[11px] font-medium text-alloy-midnight/40">
                                                            Departments
                                                        </dt>
                                                        <dd
                                                            className="mt-0.5"
                                                            data-scope-configured={selected.department_scope}
                                                            data-scope-effective={selected.effective_department_scope}
                                                        >
                                                            {departmentSummary(selected, departments).label}
                                                        </dd>
                                                    </div>
                                                    {selected.effective_divergence_reason ?
                                                        <div
                                                            className="rounded-md border border-amber-300/60 bg-amber-50 px-2.5 py-2 text-[12px] leading-5 text-amber-900"
                                                            data-testid="access-user-effective-scope-divergence"
                                                            role="note"
                                                        >
                                                            {selected.effective_divergence_reason}
                                                        </div>
                                                    :   null}
                                                    <p
                                                        className="text-[12px] leading-5 text-alloy-midnight/55"
                                                        data-capability="planned"
                                                        data-testid="access-user-effective-access-planned"
                                                    >
                                                        Capability-level effective access — what this person may do, not
                                                        only where — is planned and is not computed yet.
                                                    </p>
                                                </dl>
                                            </ConfigWorkspaceCard>
                                            <ConfigWorkspaceCard
                                                title="Security Summary"
                                                testId="access-user-overview-security"
                                                className="md:col-span-2"
                                            >
                                                <p className="text-sm text-alloy-midnight/70">
                                                    {selected.authentication.state === "unknown" ?
                                                        <UnknownValue
                                                            label="Sign-in method unknown"
                                                            reason={
                                                                selected.authentication.unknown_reason ??
                                                                "The authentication record was not read."
                                                            }
                                                            testId="access-user-overview-auth-unknown"
                                                        />
                                                    :   `${authenticationMethodLabel(selected.authentication)} · Reset available via the Security tab.`
                                                    }
                                                </p>
                                            </ConfigWorkspaceCard>
                                        </div>
                                    : tab === "roles" ?
                                        <ConfigWorkspaceCard
                                            testId="access-user-roles"
                                            title={selectedHeldRoles.length > 1 ? "Assigned Roles" : "Assigned Role"}
                                        >
                                            {/*
                                              * W-51 / IA-7. The card previously stated "One role is supported per
                                              * user today." `user_roles` is keyed on (user_id, org_id, role) and
                                              * the resolver unions every row, so that sentence described the
                                              * PICKER, not the platform — and the picker is the thing at fault.
                                              */}
                                            <p className="text-sm text-alloy-midnight/60">
                                                This user receives the permissions of every role they hold.
                                            </p>
                                            <div className="mt-3" data-testid="access-user-roles-held">
                                                <span className="config-typo-field-label">
                                                    {selectedHeldRoles.length > 1 ? "Roles held" : "Role held"}
                                                </span>
                                                {selectedHeldRoles.length === 0 ?
                                                    <p className="mt-1">
                                                        <UnknownValue
                                                            reason="This membership has no role rows in this organization."
                                                            testId="access-user-roles-held-none"
                                                        />
                                                    </p>
                                                :   <ul className="mt-1 flex flex-wrap gap-1.5">
                                                        {selectedHeldRoles.map((roleKey) => (
                                                            <li
                                                                key={roleKey}
                                                                className="rounded-full border border-alloy-stone/30 px-2 py-0.5 text-[12px] text-alloy-midnight/75"
                                                                data-testid={`access-user-role-held-${roleKey}`}
                                                            >
                                                                {roleLabelFor(roleKey)}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                }
                                            </div>
                                            <label className="mt-3 block max-w-sm">
                                                <span className="config-typo-field-label">Replace with</span>
                                                <select
                                                    className="config-runtime-select mt-1"
                                                    value={editRole}
                                                    onChange={(event) => {
                                                        setEditRole(event.target.value);
                                                        setConfirmRoleReplace(false);
                                                    }}
                                                    data-testid="access-user-role-select"
                                                >
                                                    {activeRoles.map((r) => (
                                                        <option key={r.role_key} value={r.role_key}>
                                                            {r.role_label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            {/*
                                              * M2-17. `PATCH …/role` replaces every role row for the pair, so a
                                              * membership holding {admin, regional_lead} loses `regional_lead` the
                                              * moment the visible role changes. The loss was silent because the
                                              * screen never showed the second role. It is now named, itemized, and
                                              * requires a deliberate acknowledgement before the save can fire.
                                              * W-17 makes the write additive and retires this block.
                                              */}
                                            {rolesLostBySave.length > 0 ?
                                                <div
                                                    className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-[13px] leading-5 text-amber-900"
                                                    role="note"
                                                    data-testid="access-user-role-replace-warning"
                                                >
                                                    <p className="font-medium">
                                                        Saving removes{" "}
                                                        {rolesLostBySave.length === 1 ? "another role" : (
                                                            `${rolesLostBySave.length} other roles`
                                                        )}
                                                        .
                                                    </p>
                                                    <p className="mt-1">
                                                        This control replaces the whole assignment rather than adding
                                                        to it. These would be removed:{" "}
                                                        <span className="font-medium">
                                                            {rolesLostBySave.map((key) => roleLabelFor(key)).join(", ")}
                                                        </span>
                                                        .
                                                    </p>
                                                    <label className="mt-2 flex items-start gap-2">
                                                        <input
                                                            type="checkbox"
                                                            className="mt-0.5"
                                                            checked={confirmRoleReplace}
                                                            onChange={(event) =>
                                                                setConfirmRoleReplace(event.target.checked)
                                                            }
                                                            data-testid="access-user-role-replace-confirm"
                                                        />
                                                        <span>
                                                            Remove{" "}
                                                            {rolesLostBySave.map((key) => roleLabelFor(key)).join(", ")}{" "}
                                                            and leave only {roleLabelFor(editRole)}.
                                                        </span>
                                                    </label>
                                                </div>
                                            :   null}
                                            <ConfigurationPrimaryButton
                                                className="mt-3"
                                                disabled={
                                                    roleSaving ||
                                                    replacementIsNoOp(selected, editRole) ||
                                                    (rolesLostBySave.length > 0 && !confirmRoleReplace)
                                                }
                                                onClick={() => void saveRole()}
                                                data-testid="access-user-role-save"
                                            >
                                                {roleSaving ? "Saving…" : "Save role"}
                                            </ConfigurationPrimaryButton>
                                        </ConfigWorkspaceCard>
                                    : tab === "access" ?
                                        <div className="space-y-4" data-testid="access-user-access">
                                            {!selected.has_access_profile ?
                                                <div
                                                    className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-[13px] leading-5 text-amber-900"
                                                    data-testid="access-user-access-no-profile"
                                                    role="note"
                                                >
                                                    <p className="font-medium">No access profile exists for this user.</p>
                                                    <p className="mt-1">
                                                        {selected.effective_divergence_reason}
                                                    </p>
                                                    <p className="mt-1">
                                                        Nothing is pre-selected, because nothing has been configured.
                                                        Start configuring to choose a scope and create the profile.
                                                    </p>
                                                    <ConfigurationSecondaryButton
                                                        className="mt-2"
                                                        onClick={beginScopeConfiguration}
                                                        data-testid="access-user-access-configure"
                                                    >
                                                        Configure access scope
                                                    </ConfigurationSecondaryButton>
                                                </div>
                                            :   null}
                                            {scopeEditorVisible ?
                                            <>
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
                                                disabled={accessSaving || deptScope === "unset" || siteScope === "unset"}
                                                onClick={() => void saveAccess()}
                                                data-testid="access-user-access-save"
                                            >
                                                {accessSaving ? "Saving…" : "Save access"}
                                            </ConfigurationPrimaryButton>
                                            </>
                                            :   null}
                                        </div>
                                    : tab === "security" ?
                                        <div className="space-y-4" data-testid="access-user-security">
                                            <ConfigWorkspaceCard testId="access-user-security-account" title="Account">
                                                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                                                    <div>
                                                        <dt className="text-[11px] font-medium text-alloy-midnight/40">Account</dt>
                                                        <dd className="mt-0.5" data-testid="access-user-security-status">
                                                            {selected.lifecycle.state === "unknown" ?
                                                                <UnknownValue
                                                                    reason={
                                                                        selected.lifecycle.unknown_reason ??
                                                                        "This state was not read."
                                                                    }
                                                                />
                                                            :   MEMBER_LIFECYCLE_LABEL[selected.lifecycle.state]}
                                                            {selected.lifecycle.deactivated_until ?
                                                                <span className="ml-1 text-[11px] text-alloy-midnight/50">
                                                                    until{" "}
                                                                    {new Date(
                                                                        selected.lifecycle.deactivated_until,
                                                                    ).toLocaleString()}
                                                                </span>
                                                            :   null}
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-[11px] font-medium text-alloy-midnight/40">Authentication</dt>
                                                        <dd className="mt-0.5" data-testid="access-user-security-auth">
                                                            {selected.authentication.state === "unknown" ?
                                                                <UnknownValue
                                                                    reason={
                                                                        selected.authentication.unknown_reason ??
                                                                        "The authentication record was not read."
                                                                    }
                                                                />
                                                            :   authenticationMethodLabel(selected.authentication)}
                                                        </dd>
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
                                                {/*
                                                  * W-46: factor *presence* is readable from the auth record, so it is
                                                  * reported. MFA *policy* — who must enrol — has no source until W-36,
                                                  * and that half stays marked Planned rather than implied by the first.
                                                  */}
                                                <p className="text-sm" data-testid="access-user-security-mfa-state">
                                                    {selected.authentication.mfa === "unknown" ?
                                                        <UnknownValue
                                                            reason={
                                                                selected.authentication.mfa_unknown_reason ??
                                                                "Factor enrolment was not read."
                                                            }
                                                        />
                                                    : selected.authentication.mfa === "enrolled" ?
                                                        "A verified second factor is enrolled on this account."
                                                    :   "No second factor is enrolled on this account."}
                                                </p>
                                                <p
                                                    className="mt-1.5 text-[12px] text-alloy-midnight/55"
                                                    data-capability="planned"
                                                >
                                                    Requiring multi-factor authentication by role is planned and not yet
                                                    available.
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
                    <div className="w-full max-w-lg rounded-xl border border-alloy-stone/25 bg-white p-5">
                        <div className="flex items-center gap-2">
                            <UserRound className="h-4 w-4 text-alloy-bend-pine" aria-hidden />
                            <h2 className="text-lg font-semibold text-alloy-midnight">Invite User</h2>
                        </div>
                        <ol
                            className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-wide"
                            data-testid="access-invite-steps"
                            aria-label="Invite sequence"
                        >
                            {[
                                { id: "person", label: "Person", state: "available" as const },
                                { id: "role", label: "Role", state: "available" as const },
                                { id: "access", label: "Access", state: "planned" as const },
                                { id: "sign-in", label: "Sign-in", state: "available" as const },
                                { id: "review", label: "Review", state: "available" as const },
                            ].map((step) => (
                                <li
                                    key={step.id}
                                    className={`rounded-full border px-2 py-0.5 ${
                                        step.state === "planned"
                                            ? "border-alloy-stone/30 bg-alloy-stone/15 text-alloy-midnight/45"
                                            : "border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.06] text-alloy-bend-pine"
                                    }`}
                                    data-capability={step.state === "planned" ? "planned" : "available"}
                                    data-testid={`access-invite-step-${step.id}`}
                                >
                                    {step.label}
                                    {step.state === "planned" ? " · Planned" : ""}
                                </li>
                            ))}
                        </ol>
                        <div className="mt-4 space-y-3">
                            <p className="text-xs text-alloy-midnight/50" data-capability="planned">
                                Linking an existing Person record is planned. Today, invite by email creates sign-in
                                access for that address.
                            </p>
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
                            <div
                                className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.04] px-3 py-2 text-xs text-alloy-midnight/55"
                                data-capability="planned"
                                data-testid="access-invite-access-planned"
                            >
                                Location and department access are set after invitation from the Access tab. Access
                                during invite is Planned.
                            </div>
                            <p className="text-xs text-alloy-midnight/55">
                                Sign-in method: <span className="font-medium text-alloy-midnight/75">Email invitation</span>
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

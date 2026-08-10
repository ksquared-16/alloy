"use client";

/**
 * Access → Roles. Collection rail (role catalog) + Selected workspace (Overview / Permissions /
 * Users / Experience Access / History). Permission grants render through an operator-facing grid
 * **projected from the permission catalog** (W-10) — raw `permission_key` strings never appear as
 * primary UI text, and no permission key is named in this file. The grid's rows are whatever
 * `GET /api/admin/rbac/permissions` returns, so a capability added to the catalog appears here with
 * no change to this component.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Search, ShieldCheck } from "lucide-react";
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
import {
    applyGridRowSelection,
    buildPermissionGridRows,
    levelFromGrantedKeys,
    offerableLevelsForRow,
    rowEnforcement,
    type PermissionGridLevel,
} from "@/lib/admin/permissionGrid";
import { accessWorkspaceChapterHref } from "@/lib/access/accessChapterRoutes";

type RoleTab = "overview" | "permissions" | "users" | "experience" | "history";

type RoleRow = { role_key: string; role_label: string; is_system: boolean; is_active: boolean; created_at: string | null };
type MemberRow = { user_id: string; email: string | null; display_name: string | null; primary_role: string };
type PermissionRow = { key: string; group_key: string; label: string };

function memberDisplayName(m: MemberRow): string {
    const n = (m.display_name ?? "").trim();
    if (n) return n;
    return (m.email ?? "").trim() || "Unnamed user";
}

export default function AccessRolesConfigurationPage() {
    const searchParams = useSearchParams();
    const initialRoleKey = searchParams.get("roleKey");

    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [permissions, setPermissions] = useState<PermissionRow[]>([]);
    const [grantKeys, setGrantKeys] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [selectedRoleKey, setSelectedRoleKey] = useState<string | null>(initialRoleKey);
    const [tab, setTab] = useState<RoleTab>("overview");

    const [roleLabel, setRoleLabel] = useState("");
    const [roleActive, setRoleActive] = useState(true);
    const [roleSaving, setRoleSaving] = useState(false);
    const [grantsSaving, setGrantsSaving] = useState(false);

    const [newRoleOpen, setNewRoleOpen] = useState(false);
    const [newRoleKey, setNewRoleKey] = useState("");
    const [newRoleLabel, setNewRoleLabel] = useState("");
    const [newRoleBusy, setNewRoleBusy] = useState(false);

    const reload = useCallback(async () => {
        setError(null);
        try {
            const [rRes, mRes, pRes] = await Promise.all([
                fetch("/api/admin/rbac/roles"),
                fetch("/api/admin/settings/users-roles/members"),
                fetch("/api/admin/rbac/permissions"),
            ]);
            const rJson = await rRes.json().catch(() => ({}));
            const mJson = await mRes.json().catch(() => ({}));
            const pJson = await pRes.json().catch(() => ({}));
            if (!rRes.ok) throw new Error(typeof rJson.error === "string" ? rJson.error : "Failed to load roles");
            if (!mRes.ok) throw new Error(typeof mJson.error === "string" ? mJson.error : "Failed to load members");
            if (!pRes.ok) throw new Error(typeof pJson.error === "string" ? pJson.error : "Failed to load permissions");
            setRoles((rJson as { roles?: RoleRow[] }).roles ?? []);
            setMembers(Array.isArray(mJson.members) ? mJson.members : []);
            setPermissions((pJson as { permissions?: PermissionRow[] }).permissions ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load roles.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        if (initialRoleKey) setSelectedRoleKey(initialRoleKey);
    }, [initialRoleKey]);

    const memberCountByRole = useMemo(() => {
        const map = new Map<string, number>();
        for (const m of members) {
            map.set(m.primary_role, (map.get(m.primary_role) ?? 0) + 1);
        }
        return map;
    }, [members]);

    const visibleRoles = useMemo(() => {
        const query = search.trim().toLowerCase();
        return roles
            .filter((r) => !query || `${r.role_label} ${r.role_key}`.toLowerCase().includes(query))
            .sort((a, b) => a.role_label.localeCompare(b.role_label));
    }, [roles, search]);

    const selected = useMemo(
        () => (selectedRoleKey ? roles.find((r) => r.role_key === selectedRoleKey) ?? null : null),
        [roles, selectedRoleKey],
    );

    const fetchGrants = useCallback(async (roleKey: string) => {
        try {
            const res = await fetch(`/api/admin/rbac/grants?role_key=${encodeURIComponent(roleKey)}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setGrantKeys(new Set());
                return;
            }
            setGrantKeys(new Set((json as { permission_keys?: string[] }).permission_keys ?? []));
        } catch {
            setGrantKeys(new Set());
        }
    }, []);

    useEffect(() => {
        if (!selected) {
            setRoleLabel("");
            setRoleActive(true);
            setGrantKeys(new Set());
            return;
        }
        setRoleLabel(selected.role_label);
        setRoleActive(selected.is_system ? true : selected.is_active);
        void fetchGrants(selected.role_key);
    }, [selected, fetchGrants]);

    const permissionLabelByKey = useMemo(() => {
        const map = new Map<string, string>();
        for (const p of permissions) if (p?.key) map.set(p.key, p.label);
        return map;
    }, [permissions]);

    /**
     * W-10 — the grid *is* the catalog. No row is authored here; every row is derived from what the
     * permissions endpoint returned, so the grid cannot name a key that does not exist.
     */
    const gridRows = useMemo(() => buildPermissionGridRows(permissions), [permissions]);

    /**
     * W-50. A grant on a key nothing consults is still a grant — the row exists in the database and
     * hiding it would misstate the record — but it is not a capability the role *has*. `IA-R6`
     * forbids simulating unbuilt capability, so the summary keeps the row and marks it rather than
     * listing it beside the ones that work. A role that was granted the whole catalog would
     * otherwise read as though it could do 57 things, 36 of which nothing performs.
     */
    const capabilitySummary = useMemo(() => {
        return gridRows
            .filter((row) => levelFromGrantedKeys(row, grantKeys) !== "none")
            .map((row) => ({
                id: row.id,
                label: row.label,
                level: levelFromGrantedKeys(row, grantKeys),
                enforced: !rowEnforcement(row).inert,
            }));
    }, [gridRows, grantKeys]);

    const selectRole = (roleKey: string) => {
        setSelectedRoleKey(roleKey);
        setTab("overview");
        setMessage(null);
        setError(null);
    };

    const openNewRole = () => {
        setNewRoleKey("");
        setNewRoleLabel("");
        setNewRoleOpen(true);
    };

    const createRole = async () => {
        setNewRoleBusy(true);
        setMessage(null);
        setError(null);
        try {
            const res = await fetch("/api/admin/rbac/roles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role_key: newRoleKey.trim(), role_label: newRoleLabel.trim() }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Create role failed");
            setMessage("Role created.");
            setNewRoleOpen(false);
            await reload();
            const rk = (json as { role_key?: string }).role_key;
            if (typeof rk === "string" && rk) selectRole(rk);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Create role failed.");
        } finally {
            setNewRoleBusy(false);
        }
    };

    const saveRoleMeta = async () => {
        if (!selected) return;
        setRoleSaving(true);
        setMessage(null);
        setError(null);
        try {
            const res = await fetch(`/api/admin/rbac/roles/${encodeURIComponent(selected.role_key)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role_label: roleLabel, is_active: roleActive }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Role update failed");
            setMessage("Role saved.");
            await reload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Role update failed.");
        } finally {
            setRoleSaving(false);
        }
    };

    const saveGrants = async () => {
        if (!selected) return;
        setGrantsSaving(true);
        setMessage(null);
        setError(null);
        try {
            const res = await fetch(`/api/admin/rbac/grants?role_key=${encodeURIComponent(selected.role_key)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ permission_keys: [...grantKeys] }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Permissions save failed");
            setMessage("Permissions saved.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Permissions save failed.");
        } finally {
            setGrantsSaving(false);
        }
    };

    const setGridLevel = (rowId: string, level: PermissionGridLevel) => {
        const row = gridRows.find((r) => r.id === rowId);
        if (!row) return;
        setGrantKeys((prev) => applyGridRowSelection({ row, level, granted: prev }));
    };

    const usersWithRole = useMemo(
        () => (selected ? members.filter((m) => m.primary_role === selected.role_key) : []),
        [members, selected],
    );

    const tabs = [
        { key: "overview" as const, label: "Overview" },
        { key: "permissions" as const, label: "Permissions" },
        { key: "users" as const, label: "Users" },
        { key: "experience" as const, label: "Experience Access" },
        { key: "history" as const, label: "History" },
    ];

    return (
        <div data-testid="access-roles-page">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs leading-snug text-alloy-midnight/55">
                    Roles control what people can do. Permission grants apply to every user assigned this role.
                </p>
                <ConfigurationPrimaryButton className="gap-1" onClick={openNewRole} data-testid="access-roles-new">
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                    New Role
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

            <ConfigurationShell testId="access-roles-shell">
                {loading ?
                    <ConfigurationEmptyState testId="access-roles-loading" title="Loading Roles" description="Fetching role catalog." />
                :   <div className="grid items-start gap-4 pb-4 xl:grid-cols-[20.5rem_minmax(0,1fr)]">
                        <aside className="locations-collection-rail process-config-setup-card hidden min-w-0 p-0 xl:block">
                            <header className="locations-collection-rail__header">
                                <h2 className="locations-collection-rail__title">Roles</h2>
                                <p className="locations-collection-rail__count">{visibleRoles.length} roles</p>
                            </header>
                            <div className="programs-collection-controls">
                                <div className="programs-collection-controls__search-wrap">
                                    <Search className="programs-collection-controls__search-icon" strokeWidth={2} aria-hidden />
                                    <input
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder="Search roles…"
                                        className="programs-collection-controls__search"
                                        data-testid="access-roles-search"
                                    />
                                </div>
                            </div>
                            <div className="locations-collection-rail__list" role="listbox" aria-label="Roles">
                                {visibleRoles.map((r) => {
                                    const selectedRow = r.role_key === selectedRoleKey;
                                    const count = memberCountByRole.get(r.role_key) ?? 0;
                                    return (
                                        <button
                                            key={r.role_key}
                                            type="button"
                                            role="option"
                                            aria-selected={selectedRow}
                                            className={`${QUEUE_ROW_CARD_SHELL_CLASS} locations-collection-row ${
                                                selectedRow ? QUEUE_ROW_CARD_SELECTED_BORDER_CLASS : QUEUE_ROW_CARD_IDLE_BORDER_CLASS
                                            }`}
                                            onClick={() => selectRole(r.role_key)}
                                            data-testid={`access-role-${r.role_key}`}
                                        >
                                            {selectedRow ? <span aria-hidden className={QUEUE_ROW_SELECTED_RAIL_CLASS} /> : null}
                                            <span className="locations-collection-row__body">
                                                <span className="locations-collection-row__name">
                                                    {r.role_label}
                                                    {r.is_system ?
                                                        <span className="ml-1.5 rounded-full border border-alloy-stone/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                                            System
                                                        </span>
                                                    :   null}
                                                </span>
                                                <span className="locations-collection-row__meta text-alloy-midnight/50">
                                                    {r.is_active === false ? "Inactive · " : ""}
                                                    {count} {count === 1 ? "user" : "users"}
                                                </span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>

                        <main className="min-w-0">
                            {!selected ?
                                <ConfigurationEmptyState
                                    testId="access-roles-no-selection"
                                    title="Choose a role"
                                    description="Choose a role to review its capability summary, permissions, and assigned users."
                                />
                            :   <div className="space-y-4" data-testid="access-role-selected-workspace">
                                    <section className="process-config-setup-card p-5">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h2 className="config-typo-workspace-title text-xl text-alloy-midnight">
                                                        {selected.role_label}
                                                    </h2>
                                                    {selected.is_system ?
                                                        <span className="rounded-full border border-alloy-stone/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                                            System
                                                        </span>
                                                    :   null}
                                                </div>
                                                <p className="mt-1 text-sm text-alloy-midnight/55">
                                                    {selected.is_active === false ? "Inactive" : "Active"} ·{" "}
                                                    {usersWithRole.length} {usersWithRole.length === 1 ? "user assigned" : "users assigned"}
                                                </p>
                                            </div>
                                        </div>
                                        <ConfigWorkspaceTabBar
                                            tabs={tabs}
                                            activeSection={tab}
                                            onSectionChange={setTab}
                                            ariaLabel="Role sections"
                                            testIdPrefix="access-role-tab"
                                        />
                                    </section>

                                    {tab === "overview" ?
                                        <div className="grid gap-4 md:grid-cols-2" data-testid="access-role-overview">
                                            <ConfigWorkspaceCard title="Role Snapshot" testId="access-role-overview-snapshot">
                                                <label className="block">
                                                    <span className="config-typo-field-label">Label</span>
                                                    <input
                                                        value={roleLabel}
                                                        onChange={(event) => setRoleLabel(event.target.value)}
                                                        className="config-runtime-input mt-1"
                                                        data-testid="access-role-label-input"
                                                    />
                                                </label>
                                                <label className="mt-3 flex items-center gap-2 text-sm text-alloy-midnight/70">
                                                    <input
                                                        type="checkbox"
                                                        checked={roleActive}
                                                        disabled={selected.is_system}
                                                        onChange={(event) => setRoleActive(event.target.checked)}
                                                        data-testid="access-role-active-checkbox"
                                                    />
                                                    Active
                                                </label>
                                                {selected.is_system ?
                                                    <p className="mt-1 text-[11px] text-alloy-midnight/45">
                                                        System roles cannot be deactivated.
                                                    </p>
                                                :   null}
                                                <ConfigurationSecondaryButton
                                                    className="mt-3"
                                                    disabled={roleSaving}
                                                    onClick={() => void saveRoleMeta()}
                                                    data-testid="access-role-save-meta"
                                                >
                                                    {roleSaving ? "Saving…" : "Save role"}
                                                </ConfigurationSecondaryButton>
                                            </ConfigWorkspaceCard>
                                            <ConfigWorkspaceCard title="Capability Summary" testId="access-role-overview-capabilities">
                                                {capabilitySummary.length === 0 ?
                                                    <p className="text-sm text-alloy-midnight/55">
                                                        This role has no capability grants yet.
                                                    </p>
                                                :   <ul className="space-y-1.5 text-sm">
                                                        {capabilitySummary.map((c) => (
                                                            <li
                                                                key={c.id}
                                                                className="flex items-center justify-between gap-2"
                                                                data-capability={c.enforced ? undefined : "planned"}
                                                                data-testid={`access-role-capability-${c.id}`}
                                                            >
                                                                <span
                                                                    className={
                                                                        c.enforced ? "text-alloy-midnight/80" : (
                                                                            "text-alloy-midnight/45"
                                                                        )
                                                                    }
                                                                >
                                                                    {c.label}
                                                                </span>
                                                                <span
                                                                    className={
                                                                        c.enforced ?
                                                                            "text-[11px] font-medium uppercase tracking-wide text-alloy-bend-pine/80"
                                                                        :   "text-[11px] font-medium uppercase tracking-wide text-alloy-midnight/40"
                                                                    }
                                                                >
                                                                    {c.enforced ?
                                                                        c.level === "write" ? "Write"
                                                                        :   "Read"
                                                                    :   "Granted · not enforced"}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                }
                                            </ConfigWorkspaceCard>
                                            <ConfigWorkspaceCard
                                                title="Assigned Users"
                                                testId="access-role-overview-assigned-users"
                                                className="md:col-span-2"
                                            >
                                                <p className="text-sm text-alloy-midnight/70">
                                                    <span className="font-semibold text-alloy-midnight">{usersWithRole.length}</span>{" "}
                                                    {usersWithRole.length === 1 ? "user has" : "users have"} this role assigned today.
                                                </p>
                                            </ConfigWorkspaceCard>
                                        </div>
                                    : tab === "permissions" ?
                                        <ConfigWorkspaceCard testId="access-role-permissions" title="Permissions">
                                            <p className="text-sm text-alloy-midnight/55">
                                                No access, Read, or Write/Manage per capability area. Write includes Read.
                                                Every area below is a capability the platform defines — this grid is
                                                generated from the permission catalog, not maintained by hand.
                                            </p>
                                            <div className="mt-3 overflow-hidden rounded-lg border border-alloy-stone/20 bg-white/40">
                                                <table className="w-full min-w-[640px] text-left text-xs">
                                                    <thead className="bg-alloy-stone/10 text-alloy-midnight/65">
                                                        <tr>
                                                            <th className="px-3 py-2 font-semibold">Capability area</th>
                                                            <th className="px-3 py-2 font-semibold">No access</th>
                                                            <th className="px-3 py-2 font-semibold">Read</th>
                                                            <th className="px-3 py-2 font-semibold">Write / Manage</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {gridRows.length === 0 ?
                                                            <tr>
                                                                <td
                                                                    colSpan={4}
                                                                    className="px-3 py-3 text-sm text-alloy-midnight/55"
                                                                    data-testid="access-role-permissions-empty"
                                                                >
                                                                    No capabilities are defined in the permission catalog.
                                                                </td>
                                                            </tr>
                                                        :   null}
                                                        {gridRows.map((row, index) => {
                                                            const level = levelFromGrantedKeys(row, grantKeys);
                                                            // W-50 / IA-R8. `offerable` is the
                                                            // enforced subset: a column nothing
                                                            // consults renders no radio, because a
                                                            // control that changes nothing is T-6's
                                                            // revocation theatre.
                                                            const offered = offerableLevelsForRow(row);
                                                            const enforcement = rowEnforcement(row);
                                                            const readHint = row.readKeys
                                                                .map((k) => permissionLabelByKey.get(k) ?? "")
                                                                .filter(Boolean)
                                                                .join(", ");
                                                            const writeHint = row.writeKeys
                                                                .map((k) => permissionLabelByKey.get(k) ?? "")
                                                                .filter(Boolean)
                                                                .join(", ");
                                                            const startsGroup =
                                                                index === 0 || gridRows[index - 1]!.groupLabel !== row.groupLabel;
                                                            return (
                                                                <Fragment key={row.id}>
                                                                    {startsGroup ?
                                                                        <tr
                                                                            className="border-t border-alloy-stone/15 bg-alloy-stone/5"
                                                                            data-permission-group={row.groupKey}
                                                                        >
                                                                            <th
                                                                                colSpan={4}
                                                                                scope="colgroup"
                                                                                className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50"
                                                                            >
                                                                                {row.groupLabel}
                                                                            </th>
                                                                        </tr>
                                                                    :   null}
                                                                    <tr
                                                                        className="border-t border-alloy-stone/15"
                                                                        data-permission-row={row.id}
                                                                        data-capability={enforcement.inert ? "planned" : undefined}
                                                                    >
                                                                        <td className="px-3 py-2">
                                                                            <div
                                                                                className={
                                                                                    enforcement.inert ?
                                                                                        "font-medium text-alloy-midnight/45"
                                                                                    :   "font-medium text-alloy-midnight"
                                                                                }
                                                                            >
                                                                                {row.label}
                                                                            </div>
                                                                            {readHint || writeHint ?
                                                                                <div className="mt-0.5 text-[11px] text-alloy-midnight/45">
                                                                                    {readHint ? `Read: ${readHint}` : null}
                                                                                    {readHint && writeHint ? " · " : null}
                                                                                    {writeHint ? `Write: ${writeHint}` : null}
                                                                                </div>
                                                                            :   null}
                                                                        </td>
                                                                        {/*
                                                                          * IA-R8 — a row no code consults is not a setting, so it
                                                                          * states its condition once instead of drawing three
                                                                          * radios that would change nothing. Any grant already
                                                                          * held on these keys is left exactly as it is: without a
                                                                          * control there is nothing to fire `setGridLevel`, and H2
                                                                          * keeps an untouched save non-destructive.
                                                                          */}
                                                                        {enforcement.inert ?
                                                                            <td
                                                                                colSpan={3}
                                                                                className="px-3 py-2 align-top text-[11px] text-alloy-midnight/45"
                                                                                data-testid={`access-role-permission-${row.id}-unenforced`}
                                                                            >
                                                                                Not enforced — nothing in the platform reads this
                                                                                capability yet, so granting it would change
                                                                                nothing.
                                                                            </td>
                                                                        :   (["none", "read", "write"] as const).map((opt) => (
                                                                                <td key={opt} className="px-3 py-2 align-top">
                                                                                    {offered.includes(opt) ?
                                                                                        <label className="inline-flex items-center gap-2">
                                                                                            <input
                                                                                                type="radio"
                                                                                                name={`access-perm-${row.id}`}
                                                                                                checked={level === opt}
                                                                                                onChange={() => setGridLevel(row.id, opt)}
                                                                                                data-testid={`access-role-permission-${row.id}-${opt}`}
                                                                                            />
                                                                                            <span className="sr-only">{opt}</span>
                                                                                        </label>
                                                                                    :   <span
                                                                                            className="text-alloy-midnight/30"
                                                                                            aria-label="Not available for this capability"
                                                                                            data-testid={`access-role-permission-${row.id}-${opt}-unavailable`}
                                                                                        >
                                                                                            —
                                                                                        </span>
                                                                                    }
                                                                                </td>
                                                                            ))
                                                                        }
                                                                    </tr>
                                                                </Fragment>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {/*
                                              * The grid is now a projection, so a failed catalog read renders an
                                              * empty grid rather than a stale one. H2 keeps that non-destructive —
                                              * an untouched save PUTs the grants exactly as fetched — but an
                                              * operator must not be invited to save a surface showing nothing.
                                              * The full S-11 remedy (surface the read failure, disable on unknown
                                              * state) is T-22's and is not taken here.
                                              */}
                                            <ConfigurationPrimaryButton
                                                className="mt-3"
                                                disabled={grantsSaving || gridRows.length === 0}
                                                onClick={() => void saveGrants()}
                                                data-testid="access-role-permissions-save"
                                            >
                                                {grantsSaving ? "Saving…" : "Save permissions"}
                                            </ConfigurationPrimaryButton>
                                        </ConfigWorkspaceCard>
                                    : tab === "users" ?
                                        <ConfigWorkspaceCard testId="access-role-users" title="Users with this role">
                                            {usersWithRole.length === 0 ?
                                                <p className="text-sm text-alloy-midnight/55">No users have this role assigned yet.</p>
                                            :   <ul className="space-y-2 text-sm">
                                                    {usersWithRole.map((m) => (
                                                        <li key={m.user_id} className="flex items-center justify-between gap-2">
                                                            <span className="text-alloy-midnight">{memberDisplayName(m)}</span>
                                                            <Link
                                                                href={accessWorkspaceChapterHref("users", { userId: m.user_id })}
                                                                className="text-xs font-medium text-alloy-bend-pine hover:underline"
                                                                data-testid={`access-role-open-user-${m.user_id}`}
                                                            >
                                                                Open user
                                                            </Link>
                                                        </li>
                                                    ))}
                                                </ul>
                                            }
                                        </ConfigWorkspaceCard>
                                    : tab === "experience" ?
                                        <ConfigWorkspaceCard testId="access-role-experience" title="Experience Access">
                                            <p className="text-sm text-alloy-midnight/55" data-capability="planned">
                                                Derived from permission grants. Planned projection.
                                            </p>
                                        </ConfigWorkspaceCard>
                                    :   <ConfigWorkspaceCard testId="access-role-history" title="History">
                                            <p className="text-sm text-alloy-midnight/55" data-capability="planned">
                                                A verified change history for this role is planned. No events are
                                                fabricated for display.
                                            </p>
                                        </ConfigWorkspaceCard>
                                    }
                                </div>
                            }
                        </main>
                    </div>
                }
            </ConfigurationShell>

            {newRoleOpen ?
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label="New role"
                >
                    <div className="w-full max-w-md rounded-xl border border-alloy-stone/25 bg-white p-5">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-alloy-bend-pine" aria-hidden />
                            <h2 className="text-lg font-semibold text-alloy-midnight">New Role</h2>
                        </div>
                        <div className="mt-4 space-y-3">
                            <label className="block">
                                <span className="config-typo-field-label">Label *</span>
                                <input
                                    value={newRoleLabel}
                                    onChange={(event) => setNewRoleLabel(event.target.value)}
                                    placeholder="Front Desk Coordinator"
                                    className="config-runtime-input mt-1"
                                    data-testid="access-new-role-label"
                                />
                            </label>
                            <label className="block">
                                <span className="config-typo-field-label">Key *</span>
                                <input
                                    value={newRoleKey}
                                    onChange={(event) => setNewRoleKey(event.target.value)}
                                    placeholder="front_desk_coordinator"
                                    className="config-runtime-input mt-1"
                                    data-testid="access-new-role-key"
                                />
                                <span className="mt-1 block text-[11px] text-alloy-midnight/45">
                                    Technical identifier only — operators see the label, not this key.
                                </span>
                            </label>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <ConfigurationSecondaryButton disabled={newRoleBusy} onClick={() => setNewRoleOpen(false)}>
                                Cancel
                            </ConfigurationSecondaryButton>
                            <ConfigurationPrimaryButton
                                disabled={newRoleBusy || !newRoleKey.trim() || !newRoleLabel.trim()}
                                onClick={() => void createRole()}
                                data-testid="access-new-role-save"
                            >
                                {newRoleBusy ? "Creating…" : "Create"}
                            </ConfigurationPrimaryButton>
                        </div>
                    </div>
                </div>
            :   null}
        </div>
    );
}

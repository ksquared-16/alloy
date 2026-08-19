"use client";

/**
 * Access → Roles. **One page per role** (`W-57`).
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §46.
 *
 * **What W-57 merged.** The surface had six levels of navigation and the operator has four nouns.
 * Level 4 — a five-tab bar inside the selected role (Overview / Permissions / Users / Experience
 * Access / History) — is gone. Overview became this page's head, Permissions became the named
 * *Access* section, Users folded in below it, and the two tabs whose entire content was a
 * `data-capability="planned"` sentence left navigation rather than continuing to occupy a third of
 * the role's tab bar. `RL-52`: no planned element is the sole content of a tab panel, at most one
 * tab bar exists in the Access tree, and depth to a capability control is now four — workspace,
 * chapter, role, control.
 *
 * **`OD-8`: Access is the canonical home for capability configuration.** So the capability section
 * lives here, on the role, rather than being distributed to Enrollment, Communications, Billing or a
 * Settings subsection. What OD-8 did *not* do is make Access the owner of what a capability means:
 * every area, label and level in this file is projected from `permission_definitions` via
 * `buildPermissionGridRows` (`W-10`), and server enforcement remains authoritative. No permission
 * key is named in this component, and a capability absent from the catalog cannot be displayed.
 *
 * **Three things this workstream must not do**, each a prohibition the corpus states by name:
 *
 * - **It does not fold the Scopes chapter into the role.** That would *"put scope inside the role
 *   object and encode the category error `I-27` exists to forbid"*. Scope is presented here as a
 *   sibling of capability — a pointer to the chapter that owns it — and this component reads and
 *   writes no scope table. `RL-53`.
 * - **It does not present the four nouns as a left-to-right sequence.** *"A four-item list read left
 *   to right is a five-link chain with one link hidden."* Membership, Role, Capability and Scope are
 *   trunk-then-branches: the role is the subject, capability and scope are siblings hanging off it.
 * - **It does not let the level collapse strip out-of-grid keys.** `H2` holds because
 *   `applyGridRowSelection` touches only the edited row's keys and the submit sends the union. The
 *   seed grants `admin` every active key, of which the grid represents a subset — without `H2`,
 *   opening this section and pressing Save would delete the remainder. `RL-48` now tests it.
 *
 * **`IA-13`'s caveat bounds the copy.** The grid derives one level per area, so a grant set that is
 * not No-access/View/Manage has no representation. Until `W-10` lands, this section is *legible*,
 * not *the vocabulary* — so it never tells the operator that these areas are what capability is,
 * and the advanced disclosure below every area shows the catalog keys the level stands for.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Pencil, Plus, Search, ShieldCheck } from "lucide-react";
import {
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
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
import {
    OPERATOR_LEVEL_LABEL,
    areaAuthorityLabel,
    buildRoleAuthorityAreas,
    heldAuthorityAreas,
} from "@/lib/access/roleAuthoritySummary";
import { accessWorkspaceChapterHref } from "@/lib/access/accessChapterRoutes";
import {
    AUTHORITY_SET_LOADING,
    type AuthoritySetLoad,
    authoritySetFailed,
    authoritySetIsWritable,
    authoritySetKeysForDisplay,
    authoritySetLoaded,
    authoritySetWriteRefusal,
} from "@/lib/access/authoritySetLoad";
import { heldRoleKeys, memberHoldsRole } from "@/lib/access/memberRoleAssignment";

type RoleRow = { role_key: string; role_label: string; is_system: boolean; is_active: boolean; created_at: string | null };
/**
 * W-51 / `IA-7`. `role_keys` is the union `user_roles` stores; `primary_role` is the collapsed
 * display value. Both are carried because the shape must not quietly drop the authority half — a
 * hand-written member type that omitted `role_keys` is exactly how this chapter came to count
 * members by the survivor of the collapse.
 */
type MemberRow = {
    user_id: string;
    email: string | null;
    display_name: string | null;
    role_keys: string[];
    primary_role: string;
};
type PermissionRow = { key: string; group_key: string; label: string };

function memberDisplayName(m: MemberRow): string {
    const n = (m.display_name ?? "").trim();
    if (n) return n;
    return (m.email ?? "").trim() || "Unnamed user";
}

const CHIP_CLASS =
    "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap";

export default function AccessRolesConfigurationPage() {
    const searchParams = useSearchParams();
    const initialRoleKey = searchParams.get("roleKey");

    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [permissions, setPermissions] = useState<PermissionRow[]>([]);
    /**
     * W-56 / `T-22`. The grants read is a LOAD, not a set. It was `Set<string>`, and both failure
     * paths collapsed to `new Set()` — so an unreadable role and a role with no grants were the same
     * value, the section rendered all-*No access* for both, and Save wrote the empty set over the real one.
     */
    const [grantLoad, setGrantLoad] = useState<AuthoritySetLoad>(AUTHORITY_SET_LOADING);
    const grantKeys = useMemo(() => authoritySetKeysForDisplay(grantLoad), [grantLoad]);
    const grantWriteRefusal = authoritySetWriteRefusal(grantLoad);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [selectedRoleKey, setSelectedRoleKey] = useState<string | null>(initialRoleKey);

    const [roleLabel, setRoleLabel] = useState("");
    const [roleActive, setRoleActive] = useState(true);
    const [saving, setSaving] = useState(false);
    /**
     * Editing is intentional. The identity fields are a read-out until the operator asks to change
     * them — a permanently-live text input beside a role's name reads as a form, and a role page
     * that always looks mid-edit is the database-admin feeling this workstream is removing.
     */
    const [editingIdentity, setEditingIdentity] = useState(false);
    /** Progressive disclosure. The catalog keys are diagnostics, not the normal experience. */
    const [showAdvanced, setShowAdvanced] = useState(false);

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

    /**
     * W-51 / `IA-7`, locked by `W-55` / `RL-51`. A member counts toward **every** role they hold, not
     * the one that survived `displayRoleForAdminPicker`. Counting the collapsed value reported zero
     * for any role that is never anyone's primary — `regional_lead` beside `admin` is the plan's own
     * example — so the Roles chapter told the operator a role had no holders while the resolver was
     * unioning its grants into live requests.
     */
    const memberCountByRole = useMemo(() => {
        const map = new Map<string, number>();
        for (const m of members) {
            for (const roleKey of heldRoleKeys(m)) {
                map.set(roleKey, (map.get(roleKey) ?? 0) + 1);
            }
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

    /**
     * W-56. Every exit from this function sets a state that says what happened. The two that used to
     * say nothing — `!res.ok` and `catch` — now record a FAILED load, which disables the save and
     * renders. `T-22`: *"a failed read becomes a silent total revocation on the next save."*
     */
    const fetchGrants = useCallback(async (roleKey: string) => {
        setGrantLoad(AUTHORITY_SET_LOADING);
        try {
            const res = await fetch(`/api/admin/rbac/grants?role_key=${encodeURIComponent(roleKey)}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setGrantLoad(
                    authoritySetFailed(typeof json.error === "string" ? json.error : "Failed to load permissions."),
                );
                return;
            }
            setGrantLoad(authoritySetLoaded((json as { permission_keys?: string[] }).permission_keys ?? []));
        } catch (err) {
            setGrantLoad(authoritySetFailed(err));
        }
    }, []);

    useEffect(() => {
        if (!selected) {
            setRoleLabel("");
            setRoleActive(true);
            // No role selected is not a failed read: there is nothing to know, and nothing to save.
            setGrantLoad(authoritySetLoaded([]));
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
     * permissions endpoint returned, so this page cannot name a capability that does not exist.
     */
    const gridRows = useMemo(() => buildPermissionGridRows(permissions), [permissions]);

    /**
     * W-57. The role read as a responsibility bundle: catalog groups, each with the operator's verb.
     * The summary never travels without its rows — see `roleAuthoritySummary.ts` for why collapsing
     * a disagreeing area to one word would be an authority misstatement rather than a simplification.
     */
    const authorityAreas = useMemo(() => buildRoleAuthorityAreas(gridRows, grantKeys), [gridRows, grantKeys]);
    const heldAreas = useMemo(() => heldAuthorityAreas(authorityAreas), [authorityAreas]);

    const selectRole = (roleKey: string) => {
        setSelectedRoleKey(roleKey);
        setEditingIdentity(false);
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

    /**
     * W-58 / `RM-11` — ONE submit for the role page.
     *
     * `01…§40` records the defect this replaces: role meta and grants were two independent save
     * paths with no dirty-state tracking between them, so *"an operator who edits the label and the
     * grid and presses one button silently discards the other edit"*. Both edits now travel in one
     * request, and `save_role_definition_and_grants` writes them in ONE transaction — a failure in
     * the grants half rolls the label back rather than leaving the page half-saved.
     *
     * `W-56`'s refusal still runs FIRST and still refuses the whole submit. That ordering is
     * deliberate: combining the two saves must not let an unknown grant set reach the write just
     * because the operator also happened to edit the label.
     *
     * **`H2`/`RL-48` lives in what this sends.** `grantKeys` is the whole set the load returned,
     * mutated only where a control fired — never a set rebuilt from the rows this page can draw. A
     * role holding keys outside the grid keeps them across an untouched save.
     */
    const saveRole = async () => {
        if (!selected) return;
        if (!authoritySetIsWritable(grantLoad)) {
            setMessage(null);
            setError(grantWriteRefusal);
            return;
        }
        setSaving(true);
        setMessage(null);
        setError(null);
        try {
            const res = await fetch(`/api/admin/rbac/roles/${encodeURIComponent(selected.role_key)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    role_label: roleLabel,
                    is_active: roleActive,
                    permission_keys: [...grantKeys],
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Save failed");
            // The response carries what the database committed, so the section re-renders the
            // committed set rather than the set this client hoped for.
            if (Array.isArray(json.permission_keys)) {
                setGrantLoad(authoritySetLoaded(json.permission_keys as string[]));
            }
            setMessage("Role saved.");
            setEditingIdentity(false);
            await reload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed.");
        } finally {
            setSaving(false);
        }
    };

    /**
     * W-56. An edit against a not-known set would manufacture a `loaded` state out of a failed read
     * — the operator would touch one control and the rest of the keys would become a confident empty
     * set. Editing is refused for the same reason saving is.
     */
    const setGridLevel = (rowId: string, level: PermissionGridLevel) => {
        const row = gridRows.find((r) => r.id === rowId);
        if (!row) return;
        if (grantLoad.status !== "loaded") return;
        const granted = grantLoad.keys;
        setGrantLoad(authoritySetLoaded(applyGridRowSelection({ row, level, granted: new Set(granted) })));
    };

    /** Everyone who holds this role — the same predicate as the count, so the two cannot disagree. */
    const usersWithRole = useMemo(
        () => (selected ? members.filter((m) => memberHoldsRole(m, selected.role_key)) : []),
        [members, selected],
    );

    const writable = authoritySetIsWritable(grantLoad);

    return (
        <div data-testid="access-roles-page">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs leading-snug text-alloy-midnight/55">
                    A role is a bundle of responsibilities. Everyone assigned this role can do what it says here.
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
                                    description="Choose a role to see what it can do, where that authority applies, and who holds it."
                                />
                            :   <div className="space-y-4" data-testid="access-role-selected-workspace">
                                    {/*
                                      * 1 — ROLE. The page head, not a tab. `W-55`/`RL-51` is what makes
                                      * the assigned-user count safe to promote here: it is computed
                                      * from the membership union, so it is not wrong for multi-role
                                      * members. §1.7 forbids promoting a value that has not been
                                      * corrected, and this one has been.
                                      */}
                                    <section className="process-config-setup-card p-5" data-testid="access-role-identity">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h2 className="config-typo-workspace-title text-xl text-alloy-midnight">
                                                        {selected.role_label}
                                                    </h2>
                                                    {selected.is_system ?
                                                        <span
                                                            className={`${CHIP_CLASS} border-alloy-stone/30 text-alloy-midnight/45`}
                                                        >
                                                            System
                                                        </span>
                                                    :   null}
                                                    {selected.is_active === false ?
                                                        <span className={`${CHIP_CLASS} border-alloy-stone/30 text-alloy-midnight/45`}>
                                                            Inactive
                                                        </span>
                                                    :   null}
                                                </div>
                                                <p className="mt-1 text-sm text-alloy-midnight/55">
                                                    {usersWithRole.length}{" "}
                                                    {usersWithRole.length === 1 ? "person holds" : "people hold"} this role
                                                    {heldAreas.length > 0 ?
                                                        <> · authority in {heldAreas.length}{" "}
                                                        {heldAreas.length === 1 ? "area" : "areas"}</>
                                                    :   null}
                                                </p>
                                            </div>
                                            {!editingIdentity ?
                                                <ConfigurationSecondaryButton
                                                    className="gap-1"
                                                    onClick={() => setEditingIdentity(true)}
                                                    data-testid="access-role-edit-identity"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                                                    Edit
                                                </ConfigurationSecondaryButton>
                                            :   null}
                                        </div>

                                        {editingIdentity ?
                                            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,22rem)_auto] sm:items-end">
                                                <label className="block">
                                                    <span className="config-typo-field-label">Name</span>
                                                    <input
                                                        value={roleLabel}
                                                        onChange={(event) => setRoleLabel(event.target.value)}
                                                        className="config-runtime-input mt-1"
                                                        data-testid="access-role-label-input"
                                                    />
                                                </label>
                                                <label className="flex items-center gap-2 pb-2 text-sm text-alloy-midnight/70">
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
                                                    <p className="text-[11px] text-alloy-midnight/45 sm:col-span-2">
                                                        System roles cannot be deactivated.
                                                    </p>
                                                :   null}
                                            </div>
                                        :   null}
                                    </section>

                                    {/*
                                      * 2 — CAPABILITY. OD-8's canonical home, as a named section of the
                                      * role rather than a fifth chapter: a capability set with no role
                                      * holding it grants nothing to nobody and has no row to live in.
                                      */}
                                    <ConfigWorkspaceCard
                                        title="Access"
                                        description="What someone with this role can do. Grouped by the areas the platform defines."
                                        testId="access-role-access-section"
                                    >
                                        {/**
                                         * W-56 / `T-22`. A failed grants read used to render as a
                                         * legitimate all-*No access* state. It now says so, in place, and
                                         * the save below is disabled — an unknown authority state must
                                         * never be presented as an empty one.
                                         */}
                                        {grantLoad.status === "failed" ?
                                            <p
                                                data-testid="access-role-permissions-load-error"
                                                role="alert"
                                                className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
                                            >
                                                {grantWriteRefusal}
                                            </p>
                                        :   null}

                                        {gridRows.length === 0 ?
                                            <p className="text-sm text-alloy-midnight/55" data-testid="access-role-permissions-empty">
                                                No capabilities are defined in the platform catalog.
                                            </p>
                                        :   <div className="space-y-3" data-testid="access-role-areas">
                                                {authorityAreas.map((area) => (
                                                    <section
                                                        key={area.groupKey}
                                                        className="overflow-hidden rounded-lg border border-alloy-stone/20 bg-white/40"
                                                        data-testid={`access-role-area-${area.groupKey}`}
                                                        data-authority={area.authority}
                                                    >
                                                        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-alloy-stone/15 bg-alloy-stone/5 px-3 py-2">
                                                            <h3 className="text-[12px] font-semibold text-alloy-midnight">
                                                                {area.groupLabel}
                                                            </h3>
                                                            <span
                                                                className={`${CHIP_CLASS} ${
                                                                    area.authority === "manage" ?
                                                                        "border-alloy-bend-pine/35 text-alloy-bend-pine"
                                                                    : area.authority === "view" ?
                                                                        "border-alloy-stone/35 text-alloy-midnight/70"
                                                                    : area.authority === "limited" ?
                                                                        "border-alloy-stone/35 text-alloy-midnight/60"
                                                                    :   "border-alloy-stone/25 text-alloy-midnight/40"
                                                                }`}
                                                                data-testid={`access-role-area-${area.groupKey}-authority`}
                                                            >
                                                                {areaAuthorityLabel(area)}
                                                            </span>
                                                        </header>

                                                        <ul className="divide-y divide-alloy-stone/12">
                                                            {area.rows.map((row) => {
                                                                const level = levelFromGrantedKeys(row, grantKeys);
                                                                // W-50 / IA-R8. `offered` is the enforced
                                                                // subset: a level nothing consults renders
                                                                // no control, because a control that
                                                                // changes nothing is T-6's revocation
                                                                // theatre.
                                                                const offered = offerableLevelsForRow(row);
                                                                const enforcement = rowEnforcement(row);
                                                                const inert = enforcement.inert || offered.length <= 1;
                                                                return (
                                                                    <li
                                                                        key={row.id}
                                                                        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2"
                                                                        data-permission-row={row.id}
                                                                        data-capability={inert ? "planned" : undefined}
                                                                    >
                                                                        <div className="min-w-0">
                                                                            <div
                                                                                className={`text-[13px] ${
                                                                                    inert ?
                                                                                        "text-alloy-midnight/45"
                                                                                    :   "font-medium text-alloy-midnight"
                                                                                }`}
                                                                            >
                                                                                {row.label}
                                                                            </div>
                                                                            {showAdvanced ?
                                                                                <div
                                                                                    className="mt-0.5 font-mono text-[10px] text-alloy-midnight/45"
                                                                                    data-testid={`access-role-keys-${row.id}`}
                                                                                >
                                                                                    {[...row.readKeys, ...row.writeKeys]
                                                                                        .map(
                                                                                            (k) =>
                                                                                                `${k}${
                                                                                                    permissionLabelByKey.get(k) ?
                                                                                                        ""
                                                                                                    :   " (uncatalogued)"
                                                                                                }`,
                                                                                        )
                                                                                        .join("  ·  ")}
                                                                                </div>
                                                                            :   null}
                                                                        </div>

                                                                        {inert ?
                                                                            <span
                                                                                className="text-[11px] text-alloy-midnight/45"
                                                                                data-testid={`access-role-permission-${row.id}-unenforced`}
                                                                            >
                                                                                Not enforced yet — granting this would change nothing
                                                                            </span>
                                                                        :   <div
                                                                                role="radiogroup"
                                                                                aria-label={`${row.label} access level`}
                                                                                className="flex shrink-0 items-center gap-1 rounded-md border border-alloy-stone/25 bg-white/70 p-0.5"
                                                                            >
                                                                                {(["none", "read", "write"] as const)
                                                                                    .filter((opt) => offered.includes(opt))
                                                                                    .map((opt) => (
                                                                                        <label
                                                                                            key={opt}
                                                                                            className={`cursor-pointer rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                                                                                                level === opt ?
                                                                                                    "bg-alloy-bend-pine/12 text-alloy-bend-pine"
                                                                                                :   "text-alloy-midnight/55 hover:text-alloy-midnight"
                                                                                            }`}
                                                                                        >
                                                                                            <input
                                                                                                type="radio"
                                                                                                className="sr-only"
                                                                                                name={`access-perm-${row.id}`}
                                                                                                checked={level === opt}
                                                                                                disabled={!writable}
                                                                                                onChange={() => setGridLevel(row.id, opt)}
                                                                                                data-testid={`access-role-permission-${row.id}-${opt}`}
                                                                                            />
                                                                                            {OPERATOR_LEVEL_LABEL[opt]}
                                                                                        </label>
                                                                                    ))}
                                                                            </div>
                                                                        }
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    </section>
                                                ))}
                                            </div>
                                        }

                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                            {/*
                                              * Progressive disclosure. `IA-13`: until W-10 lands, these
                                              * areas are legible but are not the vocabulary — so the
                                              * catalog keys stay reachable for diagnostics without
                                              * dominating the normal experience.
                                              */}
                                            <label className="flex items-center gap-2 text-[11px] text-alloy-midnight/55">
                                                <input
                                                    type="checkbox"
                                                    checked={showAdvanced}
                                                    onChange={(event) => setShowAdvanced(event.target.checked)}
                                                    data-testid="access-role-advanced-toggle"
                                                />
                                                Show capability keys
                                            </label>
                                            <ConfigurationPrimaryButton
                                                disabled={saving || !writable}
                                                onClick={() => void saveRole()}
                                                data-testid="access-role-save"
                                            >
                                                {saving ? "Saving…" : "Save role"}
                                            </ConfigurationPrimaryButton>
                                        </div>
                                    </ConfigWorkspaceCard>

                                    {/*
                                      * 3 — SCOPE, as a SIBLING of capability and never a field of the
                                      * role. `06…` : folding the Scopes chapter in here is *"the single
                                      * change in this whole area that would change the access
                                      * architecture — it would put scope inside the role object and
                                      * encode the category error I-27 exists to forbid"*. So this states
                                      * the separation and points at the chapter that owns it. `RL-53`
                                      * asserts no role-editing component reads or writes a scope table,
                                      * and this card is the reason that stays easy to obey.
                                      */}
                                    <ConfigWorkspaceCard
                                        title="Where this authority applies"
                                        testId="access-role-scope-sibling"
                                    >
                                        <p className="text-sm text-alloy-midnight/70">
                                            Scope is set per person, not on the role. Two people with this role can hold it
                                            organization-wide and at selected locations respectively — the role says what they
                                            may do, their scope says where.
                                        </p>
                                        <Link
                                            href={accessWorkspaceChapterHref("scopes")}
                                            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-alloy-bend-pine hover:underline"
                                            data-testid="access-role-open-scopes"
                                        >
                                            Open Access Scopes
                                            <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                                        </Link>
                                    </ConfigWorkspaceCard>

                                    {/*
                                      * 4 — MEMBERSHIP, from this role's side. Folded in from the tab
                                      * (`05…§5A.6` item 3) because `W-55`/`RL-51` corrected the value
                                      * first: the list is `memberHoldsRole` over the union, the same
                                      * predicate as the rail's count, so the two cannot disagree.
                                      */}
                                    <ConfigWorkspaceCard title="Who holds this role" testId="access-role-users">
                                        {usersWithRole.length === 0 ?
                                            <p className="text-sm text-alloy-midnight/55">No one holds this role yet.</p>
                                        :   <ul className="divide-y divide-alloy-stone/12 text-sm">
                                                {usersWithRole.map((m) => (
                                                    <li
                                                        key={m.user_id}
                                                        className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0"
                                                    >
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

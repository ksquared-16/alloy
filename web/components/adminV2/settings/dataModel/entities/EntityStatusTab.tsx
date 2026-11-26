"use client";

/**
 * Entity → Status. The entity's status domain, hosted and edited in place.
 *
 * Domain ownership still comes from the status category registry (see
 * `dataModelEntityStatusDomain.ts`) and the values are the effective
 * `status_definitions` rows composed into the route payload — the Entity does not
 * invent a second status system, and nothing here links to a Statuses page.
 *
 * Two authority levels are real and the UI must not blur them:
 *
 * - An **organization** status is a tenant row; `PATCH /api/admin/status-definitions/:id`
 *   owns it, so label, order, and active state are directly editable.
 * - An **Alloy default** is inherited (`org_id` is null). The PATCH route scopes to
 *   the caller's org, so editing one means *creating* an organization row that
 *   overrides it. That is offered explicitly rather than pretending the inherited
 *   row is editable.
 */

import { useEffect, useState } from "react";
import ConfigurationAdvancedToggle from "@/components/adminV2/configuration/ConfigurationAdvancedToggle";
import { ConfigChildObjectMasterDetail } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigWorkspaceTabBar } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { EntitySurfacesUsageCard } from "@/components/adminV2/settings/dataModel/entities/EntitySurfacesUsageCard";
import {
    ENTITY_CHILD_DETAIL_TABS,
    withStatusDomainStatuses,
    type EntityChildDetailTabKey,
    type EntityStatusDomainVm,
    type EntityStatusValueVm,
    type EntityWorkspaceVm,
} from "@/lib/dataModel/dataModelWorkspaceVm";
import { slugifyOperatorKey } from "@/lib/fields/dataModelWorkspaceOperatorUi";

const STATUS_KEY_REGEX = /^[a-z0-9_]{2,32}$/;

type CreatedStatusRow = {
    id?: string;
    status_key?: string;
    status_label?: string | null;
    sort_order?: number;
    is_active?: boolean;
};

function StatusDetail({
    status,
    domain,
    canMutate,
    configLocked,
    onStatusesChanged,
    testId,
}: {
    status: EntityStatusValueVm;
    domain: EntityStatusDomainVm;
    canMutate: boolean;
    configLocked: boolean;
    onStatusesChanged: (next: EntityStatusValueVm) => void;
    testId: string;
}) {
    const [activeTab, setActiveTab] = useState<EntityChildDetailTabKey>("definition");
    const [label, setLabel] = useState(status.label);
    const [sortOrder, setSortOrder] = useState(String(status.sortOrder));
    const [active, setActive] = useState(status.isActive);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    useEffect(() => {
        setActiveTab("definition");
        setLabel(status.label);
        setSortOrder(String(status.sortOrder));
        setActive(status.isActive);
        setError(null);
        setSaved(false);
        setAdvancedOpen(false);
    }, [status.id, status.statusKey, status.label, status.sortOrder, status.isActive]);

    const permitted = canMutate && !configLocked;
    /** System rows are protected: platform behavior keys off them. */
    const editable = permitted && !status.isSystem;
    const inherited = status.scope === "industry_default";

    const dirty =
        label.trim() !== status.label ||
        Number(sortOrder) !== status.sortOrder ||
        active !== status.isActive;

    const save = async () => {
        if (!editable) return;
        if (!label.trim()) {
            setError("Name is required.");
            return;
        }
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            const nextSortOrder = Number(sortOrder);
            if (inherited) {
                /** Materialize an organization row that overrides the inherited default. */
                const res = await fetch("/api/admin/status-definitions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        entity_type: domain.statusEntityType,
                        status_key: status.statusKey,
                        status_label: label.trim(),
                        sort_order: Number.isFinite(nextSortOrder) ? nextSortOrder : status.sortOrder,
                        is_active: active,
                    }),
                });
                const json = (await res.json().catch(() => ({}))) as CreatedStatusRow & { error?: string };
                if (!res.ok) throw new Error(json.error ?? "Save failed");
                onStatusesChanged({
                    ...status,
                    id: json.id ?? status.id,
                    label: label.trim(),
                    sortOrder: Number.isFinite(nextSortOrder) ? nextSortOrder : status.sortOrder,
                    isActive: active,
                    scope: "organization",
                });
            } else {
                const res = await fetch(`/api/admin/status-definitions/${status.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        status_label: label.trim(),
                        sort_order: Number.isFinite(nextSortOrder) ? nextSortOrder : status.sortOrder,
                        is_active: active,
                    }),
                });
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(json.error ?? "Save failed");
                onStatusesChanged({
                    ...status,
                    label: label.trim(),
                    sortOrder: Number.isFinite(nextSortOrder) ? nextSortOrder : status.sortOrder,
                    isActive: active,
                });
            }
            setSaved(true);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div data-testid={testId} data-status-key={status.statusKey}>
            <header>
                <p className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">{domain.label}</p>
                <h2 className="text-lg font-semibold leading-tight text-alloy-midnight">{status.label}</h2>
                <p className="mt-0.5 text-[11px] text-alloy-midnight/50">
                    {inherited ? "Alloy default" : "Your organization"} ·{" "}
                    {status.isActive ? "Active" : "Inactive"}
                    {status.isSystem ? " · System" : ""}
                </p>
            </header>

            <ConfigWorkspaceTabBar<EntityChildDetailTabKey>
                tabs={ENTITY_CHILD_DETAIL_TABS}
                activeSection={activeTab}
                onSectionChange={setActiveTab}
                ariaLabel="Status details"
                testId={`${testId}-tabs`}
                testIdPrefix={`${testId}-tab`}
            />

            <div className="pt-3" data-testid={`${testId}-${activeTab}`}>
                {activeTab === "definition" ?
                    <ConfigWorkspaceCard title="Definition" compact>
                        {editable ?
                            <div className="space-y-2.5">
                                <p className="text-[12px] leading-5 text-alloy-midnight/70">{domain.usageSummary}</p>
                                <label className="block space-y-0.5">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                        Status name
                                    </span>
                                    <input
                                        value={label}
                                        onChange={(event) => setLabel(event.target.value)}
                                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                                        data-testid={`${testId}-label-input`}
                                    />
                                </label>
                                <label className="block max-w-[10rem] space-y-0.5">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                        Order
                                    </span>
                                    <input
                                        type="number"
                                        value={sortOrder}
                                        onChange={(event) => setSortOrder(event.target.value)}
                                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                                        data-testid={`${testId}-sort-input`}
                                    />
                                </label>
                                <label className="flex items-center gap-2 text-[12px] text-alloy-midnight">
                                    <input
                                        type="checkbox"
                                        checked={active}
                                        onChange={(event) => setActive(event.target.checked)}
                                        data-testid={`${testId}-active-input`}
                                    />
                                    Active — staff can move records into this status
                                </label>
                                {error ?
                                    <p className="text-xs text-alloy-ember" data-testid={`${testId}-error`}>
                                        {error}
                                    </p>
                                :   null}
                                <div className="flex items-center gap-2 border-t border-alloy-stone/25 pt-2.5">
                                    <button
                                        type="button"
                                        disabled={saving || !dirty}
                                        onClick={() => void save()}
                                        className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                        data-testid={`${testId}-save`}
                                    >
                                        {saving ? "Saving…"
                                        : inherited ? "Save as organization status"
                                        : "Save Status"}
                                    </button>
                                    {saved && !dirty ?
                                        <span className="text-[11px] text-[#007d68]" data-testid={`${testId}-saved`}>
                                            Saved
                                        </span>
                                    :   null}
                                </div>
                            </div>

                        :   <>
                                <dl className="grid grid-cols-2 gap-2.5 text-[12px]">
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                                            Status name
                                        </dt>
                                        <dd className="mt-0.5 text-alloy-midnight">{status.label}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                                            Order
                                        </dt>
                                        <dd className="mt-0.5 text-alloy-midnight">{status.sortOrder}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                                            Active
                                        </dt>
                                        <dd className="mt-0.5 text-alloy-midnight">{status.isActive ? "Yes" : "No"}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                                            Owner
                                        </dt>
                                        <dd className="mt-0.5 text-alloy-midnight">
                                            {inherited ? "Alloy" : "Your organization"}
                                        </dd>
                                    </div>
                                </dl>
                                <p
                                    className="mt-3 border-t border-alloy-stone/25 pt-2.5 text-[11px] text-alloy-midnight/50"
                                    data-testid={`${testId}-protected`}
                                >
                                    {status.isSystem ?
                                        "System status — protected because platform behavior depends on it."
                                    : configLocked ?
                                        "Configuration is locked for this organization."
                                    :   "You do not have permission to change statuses."}
                                </p>
                            </>
                        }

                        <div className="mt-3 border-t border-alloy-stone/20 pt-2.5">
                            <ConfigurationAdvancedToggle
                                open={advancedOpen}
                                onToggle={() => setAdvancedOpen((open) => !open)}
                            />
                            {advancedOpen ?
                                <dl className="mt-2 grid grid-cols-2 gap-2.5" data-testid={`${testId}-advanced`}>
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                                            Internal reference
                                        </dt>
                                        <dd className="mt-0.5 font-mono text-[11px] text-alloy-midnight/70">
                                            {status.statusKey}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                                            Storage location
                                        </dt>
                                        <dd className="mt-0.5 font-mono text-[11px] text-alloy-midnight/70">
                                            {domain.authoritativeTable}.{domain.authoritativeColumn}
                                        </dd>
                                    </div>
                                </dl>
                            :   null}
                        </div>
                    </ConfigWorkspaceCard>
                : activeTab === "usage" ?
                    <EntitySurfacesUsageCard
                        title="Where this status is used"
                        testId={`${testId}-usage`}
                    />
                :   <ConfigWorkspaceCard title="History" compact>
                        <p className="text-[12px] leading-5 text-alloy-midnight/55">
                            Change history for status definitions is planned but not wired yet.
                        </p>
                    </ConfigWorkspaceCard>
                }
            </div>
        </div>
    );
}

function StatusCreatePanel({
    domain,
    existingKeys,
    nextSortOrder,
    onCancel,
    onCreated,
    testId,
}: {
    domain: EntityStatusDomainVm;
    existingKeys: ReadonlySet<string>;
    nextSortOrder: number;
    onCancel: () => void;
    onCreated: (created: EntityStatusValueVm) => void;
    testId: string;
}) {
    const [label, setLabel] = useState("");
    const [statusKey, setStatusKey] = useState("");
    const [keyTouched, setKeyTouched] = useState(false);
    const [sortOrder, setSortOrder] = useState(String(nextSortOrder));
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (keyTouched) return;
        setStatusKey(slugifyOperatorKey(label).slice(0, 32));
    }, [label, keyTouched]);

    const create = async () => {
        const key = statusKey.trim().toLowerCase();
        if (!label.trim()) {
            setError("Name is required.");
            return;
        }
        if (!STATUS_KEY_REGEX.test(key)) {
            setError("Could not derive a valid internal reference from this name.");
            return;
        }
        if (existingKeys.has(key)) {
            setError("A status with this name already exists.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const order = Number(sortOrder);
            const res = await fetch("/api/admin/status-definitions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity_type: domain.statusEntityType,
                    status_key: key,
                    status_label: label.trim(),
                    sort_order: Number.isFinite(order) ? order : nextSortOrder,
                    is_active: true,
                }),
            });
            const json = (await res.json().catch(() => ({}))) as CreatedStatusRow & { error?: string };
            if (res.status === 409) {
                setError("A status with this name already exists.");
                return;
            }
            if (!res.ok) throw new Error(json.error ?? "Could not create status.");
            onCreated({
                id: json.id ?? `pending:${key}`,
                statusKey: key,
                label: label.trim(),
                sortOrder: Number.isFinite(order) ? order : nextSortOrder,
                isActive: true,
                isSystem: false,
                scope: "organization",
            });
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div data-testid={testId}>
            <header>
                <p className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">{domain.label}</p>
                <h2 className="text-lg font-semibold leading-tight text-alloy-midnight">New status</h2>
                <p className="mt-0.5 text-[11px] text-alloy-midnight/50">{domain.usageSummary}</p>
            </header>

            <ConfigWorkspaceCard title="Definition" compact>
                <div className="space-y-2.5">
                    <label className="block space-y-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                            Status name
                        </span>
                        <input
                            autoFocus
                            value={label}
                            onChange={(event) => setLabel(event.target.value)}
                            placeholder="e.g. Waiting on paperwork"
                            className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                            data-testid={`${testId}-label`}
                        />
                    </label>
                    <label className="block max-w-[10rem] space-y-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                            Order
                        </span>
                        <input
                            type="number"
                            value={sortOrder}
                            onChange={(event) => setSortOrder(event.target.value)}
                            className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                            data-testid={`${testId}-sort`}
                        />
                    </label>

                    <div>
                        <ConfigurationAdvancedToggle
                            open={advancedOpen}
                            onToggle={() => setAdvancedOpen((open) => !open)}
                        />
                        {advancedOpen ?
                            <label className="mt-2 block space-y-0.5">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                    Internal reference
                                </span>
                                <input
                                    value={statusKey}
                                    onChange={(event) => {
                                        setKeyTouched(true);
                                        setStatusKey(event.target.value);
                                    }}
                                    className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 font-mono text-sm"
                                    data-testid={`${testId}-key`}
                                />
                                <span className="text-[10px] text-alloy-midnight/40">
                                    Generated from the name. Cannot change later.
                                </span>
                            </label>
                        :   null}
                    </div>

                    {error ?
                        <p className="text-xs text-alloy-ember" data-testid={`${testId}-error`}>
                            {error}
                        </p>
                    :   null}

                    <div className="flex items-center gap-2 border-t border-alloy-stone/25 pt-2.5">
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => void create()}
                            className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                            data-testid={`${testId}-submit`}
                        >
                            {saving ? "Creating…" : "Create Status"}
                        </button>
                        <button
                            type="button"
                            onClick={onCancel}
                            className="config-secondary-btn rounded-lg border border-alloy-forge/12 px-2.5 py-1.5 text-[11px] font-medium text-alloy-midnight/70"
                            data-testid={`${testId}-cancel`}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </ConfigWorkspaceCard>
        </div>
    );
}

export function EntityStatusTab({
    entity,
    canMutate,
    configLocked,
    onEntityChanged,
    testId = "entity-status-tab",
}: {
    entity: EntityWorkspaceVm;
    canMutate: boolean;
    configLocked: boolean;
    onEntityChanged: (entity: EntityWorkspaceVm) => void;
    testId?: string;
}) {
    const domain = entity.statusDomain;
    const [selectedKey, setSelectedKey] = useState<string | null>(domain?.statuses[0]?.statusKey ?? null);
    const [creating, setCreating] = useState(false);

    if (!domain) {
        return (
            <ConfigWorkspaceCard title="Status domain" compact testId={testId}>
                <p className="text-[12px] leading-5 text-alloy-midnight/55" data-testid={`${testId}-none`}>
                    {entity.displayName} records do not move through a status of their own.
                </p>
            </ConfigWorkspaceCard>
        );
    }

    const selected = domain.statuses.find((row) => row.statusKey === selectedKey) ?? domain.statuses[0] ?? null;
    const canCreate = canMutate && !configLocked;
    const existingKeys = new Set(domain.statuses.map((row) => row.statusKey));
    const nextSortOrder =
        domain.statuses.length > 0 ? Math.max(...domain.statuses.map((row) => row.sortOrder)) + 10 : 100;

    const replaceStatus = (next: EntityStatusValueVm) => {
        onEntityChanged(
            withStatusDomainStatuses(
                entity,
                domain.statuses.map((row) => (row.statusKey === next.statusKey ? next : row)),
            ),
        );
    };

    return (
        <ConfigChildObjectMasterDetail
            testId={testId}
            listTitle={domain.label}
            listSummary={`${domain.statuses.length} status${domain.statuses.length === 1 ? "" : "es"} records can move through`}
            listActions={
                canCreate ?
                    <button
                        type="button"
                        onClick={() => {
                            setCreating(true);
                            setSelectedKey(null);
                        }}
                        className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2 py-1 text-[10px] font-semibold text-white"
                        data-testid={`${testId}-new`}
                    >
                        New Status
                    </button>
                :   null
            }
            list={
                domain.statuses.length > 0 ?
                    <ul className="space-y-0.5" data-testid={`${testId}-list`}>
                        {domain.statuses.map((status) => {
                            const active = !creating && status.statusKey === selected?.statusKey;
                            return (
                                <li key={`${status.id}-${status.statusKey}`}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCreating(false);
                                            setSelectedKey(status.statusKey);
                                        }}
                                        aria-current={active ? "true" : undefined}
                                        className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                                            active ?
                                                "bg-alloy-bend-pine/[0.10] text-alloy-bend-pine"
                                            :   "text-alloy-midnight hover:bg-alloy-stone/20"
                                        } ${status.isActive ? "" : "opacity-60"}`}
                                        data-testid={`${testId}-item-${status.statusKey}`}
                                    >
                                        <span
                                            className={`min-w-0 truncate text-[12px] ${active ? "font-semibold" : ""}`}
                                        >
                                            {status.label}
                                        </span>
                                        {status.scope === "industry_default" ?
                                            <span className="shrink-0 text-[9px] text-alloy-midnight/40">Default</span>
                                        :   null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                :   <p className="px-2 py-4 text-center text-[11px] text-alloy-midnight/45">
                        No statuses are defined for this domain yet.
                    </p>
            }
            detail={
                creating ?
                    <StatusCreatePanel
                        domain={domain}
                        existingKeys={existingKeys}
                        nextSortOrder={nextSortOrder}
                        onCancel={() => setCreating(false)}
                        onCreated={(created) => {
                            onEntityChanged(withStatusDomainStatuses(entity, [...domain.statuses, created]));
                            setCreating(false);
                            setSelectedKey(created.statusKey);
                        }}
                        testId={`${testId}-create`}
                    />
                : selected ?
                    <StatusDetail
                        status={selected}
                        domain={domain}
                        canMutate={canMutate}
                        configLocked={configLocked}
                        onStatusesChanged={replaceStatus}
                        testId={`${testId}-detail`}
                    />
                :   <p className="text-[12px] text-alloy-midnight/45">
                        No statuses are defined for {domain.label} yet.
                    </p>
            }
        />
    );
}

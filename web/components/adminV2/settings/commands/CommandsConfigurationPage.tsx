"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import SettingsConfigurationSurfaceShell from "@/components/adminV2/settings/configurationRuntime/SettingsConfigurationSurfaceShell";
import {
    getOrganizationCommandCatalogEntry,
    listOrganizationCommandCatalog,
    type OrganizationCommandCatalogEntry,
} from "@/lib/platform/commands/organizationCommandCatalog";
import {
    commandProductSupport,
    commandPurpose,
    groupOperationalExposures,
    humanFamily,
    safetySummary,
    type CommandProductSupportState,
    type OperationalExposureGroup,
} from "@/lib/platform/commands/commandProductPresentation";

type DetailPayload = {
    command: OrganizationCommandCatalogEntry;
    definitions: Array<{
        id: string;
        orgId: string | null;
        key: string;
        label: string;
        entityType: string | null;
        isActive: boolean;
        orgOwned: boolean;
    }>;
    placements: Array<{
        id: string;
        orgOwned: boolean;
        surface: string;
        slot: string;
        entityType: string | null;
        sectionKey: string | null;
        isActive: boolean;
        orderIndex: number;
        departmentId?: string | null;
        workUnitId?: string | null;
    }>;
    variants: Array<{ variantKey: string; label: string; description?: string }>;
    processUsage: Array<{
        departmentId: string;
        departmentName: string;
        processId: string;
        processKey: string;
        processName: string;
        authority: string;
        selected: boolean;
    }>;
};

type CatalogFilter = "all" | CommandProductSupportState;

function SupportBadge({ state, label }: { state: CommandProductSupportState; label: string }) {
    const tone =
        state === "supported"
            ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
            : state === "needs_attention"
              ? "bg-amber-50 text-amber-900 ring-amber-200"
              : "bg-stone-100 text-stone-600 ring-stone-200";
    return (
        <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tone}`}>
            {label}
        </span>
    );
}

export default function CommandsConfigurationPage({
    initialCommandKey,
}: {
    initialCommandKey?: string | null;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<CatalogFilter>("all");
    const [detail, setDetail] = useState<DetailPayload | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [labelDraft, setLabelDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    const catalog = useMemo(() => listOrganizationCommandCatalog(), []);
    const selectedKey =
        (initialCommandKey?.trim() || searchParams.get("commandKey")?.trim() || "") || null;

    const catalogWithProduct = useMemo(
        () =>
            catalog.map((row) => ({
                row,
                support: commandProductSupport(row),
            })),
        [catalog]
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return catalogWithProduct.filter(({ row, support }) => {
            if (filter !== "all" && support.state !== filter) return false;
            if (!q) return true;
            return (
                row.operatorLabel.toLowerCase().includes(q) ||
                row.family.toLowerCase().includes(q) ||
                support.label.toLowerCase().includes(q)
            );
        });
    }, [catalogWithProduct, query, filter]);

    const selected = selectedKey ? getOrganizationCommandCatalogEntry(selectedKey) : null;
    const selectedSupport = selected ? commandProductSupport(selected) : null;

    useEffect(() => {
        if (!selectedKey) {
            setDetail(null);
            setDetailError(null);
            return;
        }
        let cancelled = false;
        setDetailLoading(true);
        setDetailError(null);
        setSaveMessage(null);
        fetch(`/api/admin/commands/${encodeURIComponent(selectedKey)}`)
            .then(async (res) => {
                if (!res.ok) {
                    const body = (await res.json().catch(() => ({}))) as { error?: string };
                    throw new Error(body.error || `Failed to load Command (${res.status})`);
                }
                return res.json() as Promise<DetailPayload>;
            })
            .then((payload) => {
                if (cancelled) return;
                setDetail(payload);
                const orgDef = payload.definitions.find((d) => d.orgOwned) ?? payload.definitions[0];
                setLabelDraft(orgDef?.label ?? payload.command.operatorLabel);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setDetail(null);
                setDetailError(err instanceof Error ? err.message : "Failed to load Command");
            })
            .finally(() => {
                if (!cancelled) setDetailLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [selectedKey]);

    function selectCommand(key: string) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("commandKey", key);
        router.replace(`${pathname}?${params.toString()}`);
    }

    const orgOwnedDef = detail?.definitions.find((d) => d.orgOwned) ?? null;
    const exposures: OperationalExposureGroup[] = useMemo(
        () => groupOperationalExposures(detail?.placements ?? []),
        [detail?.placements]
    );
    const editableExposures = exposures.filter((g) => g.orgEditable);
    const systemExposures = exposures.filter((g) => !g.orgEditable);
    const variants = detail?.variants ?? [];
    const processUsage = detail?.processUsage ?? [];
    const safety = selected ? safetySummary(selected) : null;

    async function saveOrgLabel() {
        if (!orgOwnedDef) return;
        const label = labelDraft.trim();
        if (!label) return;
        setSaving(true);
        setSaveMessage(null);
        try {
            const res = await fetch(`/api/admin/action-definitions/${encodeURIComponent(orgOwnedDef.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(body.error || "Could not save label");
            }
            setDetail((prev) =>
                prev
                    ? {
                          ...prev,
                          definitions: prev.definitions.map((d) =>
                              d.id === orgOwnedDef.id ? { ...d, label } : d
                          ),
                      }
                    : prev
            );
            setSaveMessage("Label saved.");
        } catch (err) {
            setDetailError(err instanceof Error ? err.message : "Save failed");
        } finally {
            setSaving(false);
        }
    }

    async function setOrgEnabled(nextActive: boolean) {
        if (!orgOwnedDef) return;
        setSaving(true);
        setSaveMessage(null);
        try {
            const res = await fetch(`/api/admin/action-definitions/${encodeURIComponent(orgOwnedDef.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: nextActive }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(body.error || "Could not update enablement");
            }
            setDetail((prev) =>
                prev
                    ? {
                          ...prev,
                          definitions: prev.definitions.map((d) =>
                              d.id === orgOwnedDef.id ? { ...d, isActive: nextActive } : d
                          ),
                      }
                    : prev
            );
            setSaveMessage(nextActive ? "Command enabled for this organization." : "Command disabled for this organization.");
        } catch (err) {
            setDetailError(err instanceof Error ? err.message : "Update failed");
        } finally {
            setSaving(false);
        }
    }

    async function toggleExposureGroup(group: OperationalExposureGroup) {
        if (!group.orgEditable || group.orgPlacementIds.length === 0) return;
        const nextActive = !group.enabled;
        setSaving(true);
        setSaveMessage(null);
        try {
            const results = await Promise.all(
                group.orgPlacementIds.map((id) =>
                    fetch(`/api/admin/action-placements/${encodeURIComponent(id)}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ is_active: nextActive }),
                    })
                )
            );
            const failed = results.find((r) => !r.ok);
            if (failed) {
                const body = (await failed.json().catch(() => ({}))) as { error?: string };
                throw new Error(body.error || "Could not update where this Command appears");
            }
            const idSet = new Set(group.orgPlacementIds);
            setDetail((prev) =>
                prev
                    ? {
                          ...prev,
                          placements: prev.placements.map((p) =>
                              idSet.has(p.id) ? { ...p, isActive: nextActive } : p
                          ),
                      }
                    : prev
            );
            setSaveMessage("Where operators see this Command was updated.");
        } catch (err) {
            setDetailError(err instanceof Error ? err.message : "Update failed");
        } finally {
            setSaving(false);
        }
    }

    return (
        <SettingsConfigurationSurfaceShell
            title="Commands"
            subtitle="Configure which Alloy capabilities this organization uses — labels, enablement, and where operators encounter them."
            testId="settings-commands-page"
        >
            <div className="mb-3">
                <Link
                    href="/organization"
                    className="text-sm font-medium text-alloy-midnight/70 underline-offset-2 hover:text-alloy-midnight hover:underline"
                    data-testid="commands-back-to-organization"
                >
                    ← Organization Configuration
                </Link>
            </div>

            <p className="mb-4 max-w-3xl text-sm text-alloy-midnight/60" data-testid="commands-product-intro">
                Commands are governed business capabilities. Choose a Command to see whether Alloy
                supports it, enable it for this organization when allowed, set the operator label, and
                review where it appears. Business Processes select which Commands may run; this page
                does not invent new Commands.
            </p>

            <div className="grid min-h-[28rem] gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
                <section
                    className="flex min-h-0 flex-col rounded-xl border border-alloy-midnight/10 bg-white"
                    data-testid="commands-catalog-list"
                >
                    <div className="space-y-2 border-b border-alloy-midnight/10 p-3">
                        <label className="sr-only" htmlFor="commands-catalog-search">
                            Search Commands
                        </label>
                        <input
                            id="commands-catalog-search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search Commands"
                            className="w-full rounded-lg border border-alloy-midnight/15 bg-white px-3 py-2 text-sm outline-none focus:border-alloy-midnight/35"
                        />
                        <div className="flex flex-wrap gap-1">
                            {(
                                [
                                    ["all", "All"],
                                    ["supported", "Supported"],
                                    ["needs_attention", "Needs attention"],
                                    ["not_supported", "Not yet supported"],
                                ] as const
                            ).map(([id, label]) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setFilter(id)}
                                    className={`rounded-md px-2 py-1 text-[11px] ${
                                        filter === id
                                            ? "bg-alloy-midnight text-white"
                                            : "bg-alloy-midnight/[0.04] text-alloy-midnight/70"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-alloy-midnight/50">
                            {filtered.length} {filtered.length === 1 ? "Command" : "Commands"}
                        </p>
                    </div>
                    <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                        {filtered.map(({ row, support }) => {
                            const active = selected?.canonicalCommandKey === row.canonicalCommandKey;
                            return (
                                <li key={row.capabilityKey}>
                                    <button
                                        type="button"
                                        onClick={() => selectCommand(row.canonicalCommandKey)}
                                        className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition ${
                                            active
                                                ? "bg-alloy-midnight/[0.06]"
                                                : "hover:bg-alloy-midnight/[0.03]"
                                        }`}
                                        data-testid={`commands-catalog-row-${row.canonicalCommandKey}`}
                                    >
                                        <span className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-medium text-alloy-midnight">
                                                {row.operatorLabel}
                                            </span>
                                            <SupportBadge state={support.state} label={support.label} />
                                        </span>
                                        <span className="text-[11px] text-alloy-midnight/45">
                                            {humanFamily(row.family)}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                        {filtered.length === 0 ? (
                            <li className="px-3 py-6 text-sm text-alloy-midnight/50">
                                No Commands match this search.
                            </li>
                        ) : null}
                    </ul>
                </section>

                <section
                    className="rounded-xl border border-alloy-midnight/10 bg-white p-5"
                    data-testid="commands-selected-workspace"
                >
                    {!selected || !selectedSupport ? (
                        <div className="flex h-full min-h-[16rem] flex-col justify-center gap-2 text-sm text-alloy-midnight/55">
                            <p className="text-base font-medium text-alloy-midnight/80">
                                Select a Command
                            </p>
                            <p>
                                Start with a Supported Command such as Create lead to configure
                                organization settings. Use Needs attention or Not yet supported to see
                                gaps honestly.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-5" data-testid="commands-detail-panel">
                            <header className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-lg font-semibold text-alloy-midnight">
                                        {selected.operatorLabel}
                                    </h2>
                                    <SupportBadge
                                        state={selectedSupport.state}
                                        label={selectedSupport.label}
                                    />
                                </div>
                                <p className="text-sm text-alloy-midnight/70">
                                    {commandPurpose(selected)}
                                </p>
                                <p className="text-xs text-alloy-midnight/50">
                                    {selectedSupport.explanation}
                                </p>
                            </header>

                            {detailLoading ? (
                                <p className="text-sm text-alloy-midnight/55">Loading organization settings…</p>
                            ) : null}
                            {detailError ? (
                                <p className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-950">
                                    {detailError}
                                </p>
                            ) : null}
                            {saveMessage ? (
                                <p
                                    className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-950"
                                    data-testid="commands-save-message"
                                >
                                    {saveMessage}
                                </p>
                            ) : null}

                            {/* Hold org sections until detail resolves — avoid false platform-owned flash */}
                            {!detailLoading && detail ? (
                            <>
                            {/* Organization settings */}
                            <section
                                className="space-y-3 rounded-lg border border-alloy-midnight/10 p-4"
                                data-testid="commands-org-settings"
                            >
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                    Organization settings
                                </h3>
                                {orgOwnedDef ? (
                                    <>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <span className="text-sm text-alloy-midnight/70">
                                                Enabled for this organization
                                            </span>
                                            <button
                                                type="button"
                                                disabled={saving}
                                                onClick={() => void setOrgEnabled(!orgOwnedDef.isActive)}
                                                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                                                    orgOwnedDef.isActive
                                                        ? "bg-emerald-50 text-emerald-800"
                                                        : "bg-stone-100 text-stone-600"
                                                }`}
                                                data-testid="commands-org-enabled-toggle"
                                            >
                                                {orgOwnedDef.isActive ? "Enabled" : "Disabled"}
                                            </button>
                                        </div>
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                            <label className="sr-only" htmlFor="commands-org-label">
                                                Display label
                                            </label>
                                            <input
                                                id="commands-org-label"
                                                value={labelDraft}
                                                onChange={(e) => setLabelDraft(e.target.value)}
                                                className="flex-1 rounded-lg border border-alloy-midnight/15 px-3 py-2 text-sm"
                                                maxLength={120}
                                                aria-label="Organization Command label"
                                            />
                                            <button
                                                type="button"
                                                disabled={saving}
                                                onClick={() => void saveOrgLabel()}
                                                className="rounded-lg bg-alloy-midnight px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                                            >
                                                Save label
                                            </button>
                                        </div>
                                        <p className="text-xs text-alloy-midnight/50">
                                            Operators see this label. Stable capability identity stays
                                            system-owned.
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-sm text-alloy-midnight/60">
                                        Platform-owned Command. This organization has no editable overlay
                                        yet — enablement and label stay with the platform default.
                                    </p>
                                )}
                            </section>

                            {/* Business Process usage */}
                            <section
                                className="space-y-2 rounded-lg border border-alloy-midnight/10 p-4"
                                data-testid="commands-process-usage"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                        Business Process use
                                    </h3>
                                    <Link
                                        href="/organization/processes"
                                        className="text-xs font-medium text-alloy-midnight underline-offset-2 hover:underline"
                                    >
                                        Manage process selection
                                    </Link>
                                </div>
                                {processUsage.length === 0 ? (
                                    <p className="text-sm text-alloy-midnight/60">
                                        Not currently used by a Business Process. Processes select which
                                        Commands may run; stages only recommend from that set.
                                    </p>
                                ) : (
                                    <ul className="space-y-2">
                                        {processUsage.map((u) => (
                                            <li
                                                key={`${u.departmentId}:${u.processId}`}
                                                className="rounded-md border border-alloy-midnight/10 px-3 py-2 text-sm"
                                            >
                                                <p className="font-medium">{u.processName}</p>
                                                <p className="text-xs text-alloy-midnight/45">
                                                    {u.departmentName}
                                                </p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>

                            {/* Operational exposure */}
                            <section
                                className="space-y-3 rounded-lg border border-alloy-midnight/10 p-4"
                                data-testid="commands-operational-exposure"
                            >
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                    Where operators encounter it
                                </h3>
                                <p className="text-sm text-alloy-midnight/60">
                                    Contexts are grouped so duplicate stored rows do not appear as
                                    separate choices. Only organization-owned contexts can be toggled.
                                </p>
                                {editableExposures.length === 0 && systemExposures.length === 0 ? (
                                    <p className="text-sm text-alloy-midnight/55">
                                        No operational placements are configured for this Command yet.
                                    </p>
                                ) : null}
                                {editableExposures.length > 0 ? (
                                    <ul className="space-y-2">
                                        {editableExposures.map((g) => (
                                            <li
                                                key={g.key}
                                                className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-alloy-midnight/10 px-3 py-2"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-alloy-midnight">
                                                        {g.title}
                                                    </p>
                                                    <p className="text-xs text-alloy-midnight/50">
                                                        {g.description}
                                                    </p>
                                                    {g.note ? (
                                                        <p className="mt-1 text-[11px] text-alloy-midnight/45">
                                                            {g.note}
                                                        </p>
                                                    ) : null}
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={saving}
                                                    onClick={() => void toggleExposureGroup(g)}
                                                    className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${
                                                        g.enabled
                                                            ? "bg-emerald-50 text-emerald-800"
                                                            : "bg-stone-100 text-stone-600"
                                                    }`}
                                                    data-testid={`commands-exposure-toggle-${g.key}`}
                                                >
                                                    {g.enabled ? "Shown" : "Hidden"}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                                {systemExposures.length > 0 ? (
                                    <details className="rounded-md border border-dashed border-alloy-midnight/15 p-3">
                                        <summary className="cursor-pointer text-xs font-medium text-alloy-midnight/55">
                                            Platform defaults ({systemExposures.length})
                                        </summary>
                                        <ul className="mt-2 space-y-1 text-xs text-alloy-midnight/55">
                                            {systemExposures.map((g) => (
                                                <li key={g.key}>
                                                    {g.title} — {g.enabled ? "active" : "inactive"}
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                ) : null}
                            </section>

                            {/* Variants — only when present */}
                            {variants.length > 0 ? (
                                <section
                                    className="space-y-2 rounded-lg border border-alloy-midnight/10 p-4"
                                    data-testid="commands-variants"
                                >
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                        Variants
                                    </h3>
                                    <p className="text-sm text-alloy-midnight/60">
                                        Variants adjust expression for the same Command. They never choose
                                        a different executor.
                                    </p>
                                    <ul className="space-y-2">
                                        {variants.map((v) => (
                                            <li
                                                key={v.variantKey}
                                                className="rounded-md border border-alloy-midnight/10 px-3 py-2 text-sm"
                                            >
                                                <p className="font-medium">{v.label}</p>
                                                {v.description ? (
                                                    <p className="text-xs text-alloy-midnight/55">
                                                        {v.description}
                                                    </p>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ) : null}
                            </>
                            ) : null}

                            {/* Safety — compact always; emphasize when material */}
                            {safety ? (
                                <section
                                    className={`space-y-2 rounded-lg border p-4 ${
                                        safety.showExpanded
                                            ? "border-amber-200/80 bg-amber-50/30"
                                            : "border-alloy-midnight/10"
                                    }`}
                                    data-testid="commands-safety"
                                >
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                        Safety
                                    </h3>
                                    <ul className="space-y-1 text-sm text-alloy-midnight/70">
                                        <li>{safety.confirmation}</li>
                                        <li>{safety.preview}</li>
                                        <li>{safety.destructive}</li>
                                        <li>Authorization is checked when the Command runs.</li>
                                    </ul>
                                </section>
                            ) : null}
                        </div>
                    )}
                </section>
            </div>
        </SettingsConfigurationSurfaceShell>
    );
}

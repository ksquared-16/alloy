"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import SettingsConfigurationSurfaceShell from "@/components/adminV2/settings/configurationRuntime/SettingsConfigurationSurfaceShell";
import {
    confirmationPolicyLabel,
    destructiveKindLabel,
    getOrganizationCommandCatalogEntry,
    listOrganizationCommandCatalog,
    type OrganizationCommandCatalogEntry,
} from "@/lib/platform/commands/organizationCommandCatalog";
import {
    settingsSlotLabel,
    settingsSurfaceLabel,
} from "@/lib/admin/actions/actionPlacementPresentation";

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
        orgId: string | null;
        orgOwned: boolean;
        definitionId: string;
        surface: string;
        slot: string;
        entityType: string | null;
        sectionKey: string | null;
        isActive: boolean;
        orderIndex: number;
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

type WorkspaceTab =
    | "overview"
    | "availability"
    | "processes"
    | "variants"
    | "safety";

function StatusPill({ status }: { status: OrganizationCommandCatalogEntry["statusLabel"] }) {
    const tone =
        status === "Available"
            ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
            : status === "Limited"
              ? "bg-amber-50 text-amber-900 ring-amber-200"
              : status === "Unavailable"
                ? "bg-stone-100 text-stone-600 ring-stone-200"
                : "bg-slate-50 text-slate-600 ring-slate-200";
    return (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tone}`}>
            {status}
        </span>
    );
}

function familyLabel(family: string): string {
    return family.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const TABS: Array<{ id: WorkspaceTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "availability", label: "Availability" },
    { id: "processes", label: "Business Processes" },
    { id: "variants", label: "Variants" },
    { id: "safety", label: "Safety" },
];

export default function CommandsConfigurationPage({
    initialCommandKey,
}: {
    initialCommandKey?: string | null;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "Available" | "Limited" | "Unavailable">(
        "all"
    );
    const [tab, setTab] = useState<WorkspaceTab>("overview");
    const [detail, setDetail] = useState<DetailPayload | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [labelDraft, setLabelDraft] = useState("");
    const [saving, setSaving] = useState(false);

    const catalog = useMemo(() => listOrganizationCommandCatalog(), []);
    const selectedKey =
        (initialCommandKey?.trim() || searchParams.get("commandKey")?.trim() || "") || null;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return catalog.filter((row) => {
            if (statusFilter !== "all" && row.statusLabel !== statusFilter) return false;
            if (!q) return true;
            return (
                row.operatorLabel.toLowerCase().includes(q) ||
                row.canonicalCommandKey.toLowerCase().includes(q) ||
                row.family.toLowerCase().includes(q)
            );
        });
    }, [catalog, query, statusFilter]);

    const grouped = useMemo(() => {
        const map = new Map<string, OrganizationCommandCatalogEntry[]>();
        for (const row of filtered) {
            const list = map.get(row.family) ?? [];
            list.push(row);
            map.set(row.family, list);
        }
        return [...map.entries()];
    }, [filtered]);

    const selected = selectedKey ? getOrganizationCommandCatalogEntry(selectedKey) : null;

    useEffect(() => {
        if (!selectedKey) {
            setDetail(null);
            setDetailError(null);
            return;
        }
        let cancelled = false;
        setDetailLoading(true);
        setDetailError(null);
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
        setTab("overview");
        router.replace(`${pathname}?${params.toString()}`);
    }

    async function togglePlacement(placementId: string, nextActive: boolean) {
        setSaving(true);
        try {
            const res = await fetch(`/api/admin/action-placements/${encodeURIComponent(placementId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: nextActive }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(body.error || "Could not update availability");
            }
            setDetail((prev) =>
                prev
                    ? {
                          ...prev,
                          placements: prev.placements.map((p) =>
                              p.id === placementId ? { ...p, isActive: nextActive } : p
                          ),
                      }
                    : prev
            );
        } catch (err) {
            setDetailError(err instanceof Error ? err.message : "Update failed");
        } finally {
            setSaving(false);
        }
    }

    async function saveOrgLabel() {
        const orgDef = detail?.definitions.find((d) => d.orgOwned);
        if (!orgDef) return;
        const label = labelDraft.trim();
        if (!label) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/admin/action-definitions/${encodeURIComponent(orgDef.id)}`, {
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
                              d.id === orgDef.id ? { ...d, label } : d
                          ),
                      }
                    : prev
            );
        } catch (err) {
            setDetailError(err instanceof Error ? err.message : "Save failed");
        } finally {
            setSaving(false);
        }
    }

    const orgOwnedDef = detail?.definitions.find((d) => d.orgOwned) ?? null;

    return (
        <SettingsConfigurationSurfaceShell
            title="Commands"
            subtitle="Organization Command catalog — enablement, availability, process use, and safety policy."
            testId="settings-commands-page"
        >
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
                            {(["all", "Available", "Limited", "Unavailable"] as const).map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setStatusFilter(s)}
                                    className={`rounded-md px-2 py-1 text-[11px] ${
                                        statusFilter === s
                                            ? "bg-alloy-midnight text-white"
                                            : "bg-alloy-midnight/[0.04] text-alloy-midnight/70"
                                    }`}
                                >
                                    {s === "all" ? "All" : s}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-alloy-midnight/50">
                            {filtered.length} Command{filtered.length === 1 ? "" : "s"}
                        </p>
                    </div>
                    <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                        {grouped.map(([family, rows]) => (
                            <li key={family} className="mb-2">
                                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                    {familyLabel(family)}
                                </p>
                                <ul>
                                    {rows.map((row) => {
                                        const active =
                                            selected?.canonicalCommandKey === row.canonicalCommandKey;
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
                                                        <StatusPill status={row.statusLabel} />
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </li>
                        ))}
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
                    {!selected ? (
                        <div className="flex h-full min-h-[16rem] flex-col justify-center gap-2 text-sm text-alloy-midnight/55">
                            <p className="text-base font-medium text-alloy-midnight/80">
                                Select a Command
                            </p>
                            <p>
                                Commands are configured, not invented. Choose a Command to review
                                availability, Business Process use, variants, and safety.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <header className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-lg font-semibold text-alloy-midnight">
                                        {selected.operatorLabel}
                                    </h2>
                                    <StatusPill status={selected.statusLabel} />
                                </div>
                                <p className="text-sm text-alloy-midnight/55">
                                    {familyLabel(selected.family)}
                                </p>
                            </header>

                            <nav className="flex flex-wrap gap-1 border-b border-alloy-midnight/10 pb-2">
                                {TABS.map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setTab(t.id)}
                                        className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                                            tab === t.id
                                                ? "bg-alloy-midnight text-white"
                                                : "text-alloy-midnight/65 hover:bg-alloy-midnight/[0.04]"
                                        }`}
                                        data-testid={`commands-tab-${t.id}`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </nav>

                            {detailLoading ? (
                                <p className="text-sm text-alloy-midnight/55">Loading Command details…</p>
                            ) : null}
                            {detailError ? (
                                <p className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-950">
                                    {detailError}
                                </p>
                            ) : null}

                            {tab === "overview" ? (
                                <div className="space-y-4 text-sm">
                                    {selected.reason ? (
                                        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-amber-950">
                                            <p className="font-medium">Needs attention</p>
                                            <p className="mt-1 text-amber-900/80">{selected.reason}</p>
                                        </div>
                                    ) : null}
                                    <div className="rounded-lg border border-alloy-midnight/10 p-3">
                                        <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                            Organization label
                                        </h3>
                                        {orgOwnedDef ? (
                                            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                                <input
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
                                        ) : (
                                            <p className="mt-2 text-alloy-midnight/60">
                                                Platform-owned label. Organization overlays appear when
                                                this Command has an organization definition row.
                                            </p>
                                        )}
                                    </div>
                                    <p className="text-alloy-midnight/60">
                                        Authorization is evaluated when the Command runs. Catalog
                                        availability is not permission.
                                    </p>
                                </div>
                            ) : null}

                            {tab === "availability" ? (
                                <div className="space-y-3 text-sm" data-testid="commands-availability-panel">
                                    <p className="text-alloy-midnight/60">
                                        Operational contexts where this Command can appear. Toggle
                                        organization placements only — system defaults stay read-only.
                                    </p>
                                    {(detail?.placements.length ?? 0) === 0 ? (
                                        <p className="rounded-lg border border-dashed border-alloy-midnight/15 p-4 text-alloy-midnight/50">
                                            No operational placements configured yet. Business Processes
                                            still select whether the Command is in scope.
                                        </p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {detail!.placements.map((p) => (
                                                <li
                                                    key={p.id}
                                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-alloy-midnight/10 px-3 py-2"
                                                >
                                                    <div>
                                                        <p className="font-medium text-alloy-midnight">
                                                            {settingsSurfaceLabel(p.surface)} ·{" "}
                                                            {settingsSlotLabel(p.slot)}
                                                        </p>
                                                        <p className="text-xs text-alloy-midnight/45">
                                                            {p.entityType ?? "Any record type"}
                                                            {p.sectionKey ? ` · ${p.sectionKey}` : ""}
                                                            {p.orgOwned ? "" : " · system default"}
                                                        </p>
                                                    </div>
                                                    {p.orgOwned ? (
                                                        <button
                                                            type="button"
                                                            disabled={saving}
                                                            onClick={() =>
                                                                void togglePlacement(p.id, !p.isActive)
                                                            }
                                                            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                                                                p.isActive
                                                                    ? "bg-emerald-50 text-emerald-800"
                                                                    : "bg-stone-100 text-stone-600"
                                                            }`}
                                                        >
                                                            {p.isActive ? "Enabled" : "Disabled"}
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-alloy-midnight/45">
                                                            {p.isActive ? "Enabled" : "Disabled"}
                                                        </span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ) : null}

                            {tab === "processes" ? (
                                <div className="space-y-3 text-sm" data-testid="commands-processes-panel">
                                    <p className="text-alloy-midnight/60">
                                        Business Processes that select this Command. Stages may only
                                        recommend selected Commands.
                                    </p>
                                    <p>
                                        <Link
                                            href="/organization/processes"
                                            className="text-sm font-medium text-alloy-midnight underline-offset-2 hover:underline"
                                        >
                                            Open Business Processes
                                        </Link>
                                    </p>
                                    {(detail?.processUsage.length ?? 0) === 0 ? (
                                        <p className="rounded-lg border border-dashed border-alloy-midnight/15 p-4 text-alloy-midnight/50">
                                            No Business Processes currently select this Command.
                                        </p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {detail!.processUsage.map((u) => (
                                                <li
                                                    key={`${u.departmentId}:${u.processId}`}
                                                    className="rounded-lg border border-alloy-midnight/10 px-3 py-2"
                                                >
                                                    <p className="font-medium">{u.processName}</p>
                                                    <p className="text-xs text-alloy-midnight/45">
                                                        {u.departmentName}
                                                        {u.authority === "legacy_compatibility"
                                                            ? " · legacy selection"
                                                            : ""}
                                                    </p>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ) : null}

                            {tab === "variants" ? (
                                <div className="space-y-3 text-sm" data-testid="commands-variants-panel">
                                    <p className="text-alloy-midnight/60">
                                        Variants adjust labels and expression for the same Command.
                                        They never select a different executor.
                                    </p>
                                    {(detail?.variants.length ?? 0) === 0 ? (
                                        <p className="rounded-lg border border-dashed border-alloy-midnight/15 p-4 text-alloy-midnight/50">
                                            No organization variants configured for this Command.
                                        </p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {detail!.variants.map((v) => (
                                                <li
                                                    key={v.variantKey}
                                                    className="rounded-lg border border-alloy-midnight/10 px-3 py-2"
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
                                    )}
                                </div>
                            ) : null}

                            {tab === "safety" ? (
                                <div className="space-y-3 text-sm" data-testid="commands-safety-panel">
                                    <dl className="grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-lg border border-alloy-midnight/10 p-3">
                                            <dt className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                                Confirmation
                                            </dt>
                                            <dd className="mt-1">
                                                {confirmationPolicyLabel(selected.confirmationPolicy)}
                                            </dd>
                                        </div>
                                        <div className="rounded-lg border border-alloy-midnight/10 p-3">
                                            <dt className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                                Preview
                                            </dt>
                                            <dd className="mt-1">
                                                {selected.supportsPreview
                                                    ? "Preview available before commit"
                                                    : "No shared preview required"}
                                            </dd>
                                        </div>
                                        <div className="rounded-lg border border-alloy-midnight/10 p-3 sm:col-span-2">
                                            <dt className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                                Destructive class
                                            </dt>
                                            <dd className="mt-1">
                                                {selected.destructiveKind
                                                    ? destructiveKindLabel(selected.destructiveKind)
                                                    : "Not classified as destructive"}
                                            </dd>
                                        </div>
                                    </dl>
                                    <p className="text-alloy-midnight/60">
                                        Safety policy is platform-owned. Organization configuration
                                        cannot weaken confirmation or authorization.
                                    </p>
                                </div>
                            ) : null}
                        </div>
                    )}
                </section>
            </div>
        </SettingsConfigurationSurfaceShell>
    );
}

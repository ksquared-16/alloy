"use client";

/**
 * Internal Command capability diagnostics — not an Organization Configuration product.
 * Capability selection → Business Processes; exposure → Surfaces; invocation → Automation.
 */

import { useEffect, useMemo, useState } from "react";
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
        fetch(`/api/admin/commands/${encodeURIComponent(selectedKey)}`)
            .then(async (res) => {
                if (!res.ok) {
                    const body = (await res.json().catch(() => ({}))) as { error?: string };
                    throw new Error(body.error || `Failed to load capability (${res.status})`);
                }
                return res.json() as Promise<DetailPayload>;
            })
            .then((payload) => {
                if (!cancelled) setDetail(payload);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setDetail(null);
                setDetailError(err instanceof Error ? err.message : "Failed to load capability");
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
    const exposures = useMemo(
        () => groupOperationalExposures(detail?.placements ?? []),
        [detail?.placements]
    );
    const variants = detail?.variants ?? [];
    const processUsage = detail?.processUsage ?? [];
    const safety = selected ? safetySummary(selected) : null;

    return (
        <SettingsConfigurationSurfaceShell
            title="Command capability diagnostics"
            subtitle="Internal Capability Registry inspection. Not organization configuration — do not use this as an administrator workflow."
            testId="settings-commands-page"
        >
            <div
                className="mb-4 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-950"
                data-testid="commands-diagnostics-banner"
            >
                <p className="font-medium">Internal diagnostics only</p>
                <p className="mt-1 text-amber-950/80">
                    Configure Command selection in Business Processes, exposure in Surfaces, and
                    invocation in Automation. This page does not edit organization policy.
                </p>
            </div>

            <div className="grid min-h-[28rem] gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
                <section
                    className="flex min-h-0 flex-col rounded-xl border border-alloy-midnight/10 bg-white"
                    data-testid="commands-catalog-list"
                >
                    <div className="space-y-2 border-b border-alloy-midnight/10 p-3">
                        <label className="sr-only" htmlFor="commands-catalog-search">
                            Search capabilities
                        </label>
                        <input
                            id="commands-catalog-search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search capabilities"
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
                            {filtered.length} {filtered.length === 1 ? "capability" : "capabilities"}
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
                                No capabilities match this search.
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
                                Select a capability
                            </p>
                            <p>
                                Read-only inspection of Capability Registry support, process usage,
                                and stored placements. No organization configuration is edited here.
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
                                <p className="text-sm text-alloy-midnight/55">Loading diagnostics…</p>
                            ) : null}
                            {detailError ? (
                                <p className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-950">
                                    {detailError}
                                </p>
                            ) : null}

                            {!detailLoading && detail ? (
                                <>
                                    <section
                                        className="space-y-2 rounded-lg border border-alloy-midnight/10 p-4"
                                        data-testid="commands-org-settings"
                                    >
                                        <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                            Organization overlay (read-only)
                                        </h3>
                                        {orgOwnedDef ? (
                                            <ul className="space-y-1 text-sm text-alloy-midnight/70">
                                                <li>
                                                    Stored label:{" "}
                                                    <span className="font-medium text-alloy-midnight">
                                                        {orgOwnedDef.label}
                                                    </span>
                                                </li>
                                                <li>
                                                    Definition active:{" "}
                                                    {orgOwnedDef.isActive ? "yes" : "no"}
                                                </li>
                                                <li className="text-xs text-alloy-midnight/50">
                                                    Global org labels are not edited here. Process or
                                                    surface context labels belong with those products;
                                                    no new schema is invented on this route.
                                                </li>
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-alloy-midnight/60">
                                                No organization-owned definition overlay. Platform
                                                default applies.
                                            </p>
                                        )}
                                    </section>

                                    <section
                                        className="space-y-2 rounded-lg border border-alloy-midnight/10 p-4"
                                        data-testid="commands-process-usage"
                                    >
                                        <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                            Business Process selection (owned by Processes)
                                        </h3>
                                        {processUsage.length === 0 ? (
                                            <p className="text-sm text-alloy-midnight/60">
                                                Not currently selected by a Business Process via
                                                command_set_v1.
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

                                    <section
                                        className="space-y-2 rounded-lg border border-alloy-midnight/10 p-4"
                                        data-testid="commands-operational-exposure"
                                    >
                                        <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                            Stored placements (owned by Surfaces)
                                        </h3>
                                        <p className="text-sm text-alloy-midnight/60">
                                            Grouped for inspection. Exposure configuration belongs in
                                            Surfaces — not editable here.
                                        </p>
                                        {exposures.length === 0 ? (
                                            <p className="text-sm text-alloy-midnight/55">
                                                No placement rows stored for this capability.
                                            </p>
                                        ) : (
                                            <ul className="space-y-2">
                                                {exposures.map((g) => (
                                                    <li
                                                        key={g.key}
                                                        className="rounded-md border border-alloy-midnight/10 px-3 py-2 text-sm"
                                                    >
                                                        <p className="font-medium text-alloy-midnight">
                                                            {g.title}
                                                        </p>
                                                        <p className="text-xs text-alloy-midnight/50">
                                                            {g.description} ·{" "}
                                                            {g.enabled ? "active" : "inactive"} ·{" "}
                                                            {g.orgEditable
                                                                ? "org-owned rows present"
                                                                : "platform default"}
                                                        </p>
                                                        {g.note ? (
                                                            <p className="mt-1 text-[11px] text-alloy-midnight/45">
                                                                {g.note}
                                                            </p>
                                                        ) : null}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </section>

                                    {variants.length > 0 ? (
                                        <section
                                            className="space-y-2 rounded-lg border border-alloy-midnight/10 p-4"
                                            data-testid="commands-variants"
                                        >
                                            <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                                Variants (read-only)
                                            </h3>
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
                                        Safety (platform-owned)
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

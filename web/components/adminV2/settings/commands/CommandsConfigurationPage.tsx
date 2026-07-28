"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import SettingsConfigurationSurfaceShell from "@/components/adminV2/settings/configurationRuntime/SettingsConfigurationSurfaceShell";
import {
    getOrganizationCommandCatalogEntry,
    listOrganizationCommandCatalog,
    type OrganizationCommandCatalogEntry,
} from "@/lib/platform/commands/organizationCommandCatalog";

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

export default function CommandsConfigurationPage({
    initialCommandKey,
}: {
    initialCommandKey?: string | null;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState("");

    const catalog = useMemo(() => listOrganizationCommandCatalog(), []);
    const selectedKey =
        (initialCommandKey?.trim() || searchParams.get("commandKey")?.trim() || "") || null;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return catalog;
        return catalog.filter(
            (row) =>
                row.operatorLabel.toLowerCase().includes(q) ||
                row.canonicalCommandKey.toLowerCase().includes(q) ||
                row.family.toLowerCase().includes(q)
        );
    }, [catalog, query]);

    const selected = selectedKey ? getOrganizationCommandCatalogEntry(selectedKey) : null;

    function selectCommand(key: string) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("commandKey", key);
        router.replace(`${pathname}?${params.toString()}`);
    }

    return (
        <SettingsConfigurationSurfaceShell
            title="Commands"
            subtitle="Organization Command catalog — what can run, what is unavailable, and how Commands relate to Business Processes."
            testId="settings-commands-page"
        >
            <div className="grid min-h-[28rem] gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
                <section
                    className="flex min-h-0 flex-col rounded-xl border border-alloy-midnight/10 bg-white"
                    data-testid="commands-catalog-list"
                >
                    <div className="border-b border-alloy-midnight/10 p-3">
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
                        <p className="mt-2 text-xs text-alloy-midnight/50">
                            {filtered.length} Command{filtered.length === 1 ? "" : "s"}
                        </p>
                    </div>
                    <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                        {filtered.map((row) => {
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
                                        <span className="text-[11px] text-alloy-midnight/45">
                                            {familyLabel(row.family)}
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
                    {!selected ? (
                        <div className="flex h-full min-h-[16rem] flex-col justify-center gap-2 text-sm text-alloy-midnight/55">
                            <p className="text-base font-medium text-alloy-midnight/80">
                                Select a Command
                            </p>
                            <p>
                                Commands are configured, not invented. Choose a Command to see its
                                identity, availability status, and process usage guidance.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <header className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-lg font-semibold text-alloy-midnight">
                                        {selected.operatorLabel}
                                    </h2>
                                    <StatusPill status={selected.statusLabel} />
                                </div>
                                <p className="text-sm text-alloy-midnight/55">
                                    {familyLabel(selected.family)} · system identity{" "}
                                    <code className="rounded bg-alloy-midnight/[0.04] px-1.5 py-0.5 text-[11px]">
                                        {selected.canonicalCommandKey}
                                    </code>
                                </p>
                            </header>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="rounded-lg border border-alloy-midnight/10 p-3">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                        Overview
                                    </h3>
                                    <dl className="mt-2 space-y-2 text-sm">
                                        <div>
                                            <dt className="text-alloy-midnight/45">Status</dt>
                                            <dd>{selected.statusLabel}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-alloy-midnight/45">Aliases</dt>
                                            <dd>
                                                {selected.aliases.length
                                                    ? selected.aliases.join(", ")
                                                    : "None"}
                                            </dd>
                                        </div>
                                    </dl>
                                </div>
                                <div className="rounded-lg border border-alloy-midnight/10 p-3">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                        Business Processes
                                    </h3>
                                    <p className="mt-2 text-sm text-alloy-midnight/60">
                                        Business Processes select which Commands may run. Open a
                                        Process to enable this Command and set stage recommendations.
                                    </p>
                                </div>
                            </div>

                            {selected.reason ? (
                                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-950">
                                    <p className="font-medium">Needs attention</p>
                                    <p className="mt-1 text-amber-900/80">{selected.reason}</p>
                                </div>
                            ) : null}

                            <div className="rounded-lg border border-alloy-midnight/10 p-3 text-sm text-alloy-midnight/60">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                    Safety
                                </h3>
                                <p className="mt-2">
                                    Authorization is evaluated when the Command runs. Catalog
                                    availability is not permission. Destructive Commands keep their
                                    existing confirmation policies.
                                </p>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </SettingsConfigurationSurfaceShell>
    );
}

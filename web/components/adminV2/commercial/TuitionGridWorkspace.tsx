"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SETTINGS_PAGE_SHELL_CLASS, SETTINGS_PAGE_INTRO_CLASS } from "@/lib/adminV2/settingsPageLayout";
import {
    buildTuitionRateMap,
    formatRateCents,
    isLocationOverride,
    parseDollarsToCents,
    tuitionRateCellKey,
    DEFAULT_BILLING_PERIOD,
    type TuitionRateRow,
    type TuitionBillingPeriod,
} from "@/lib/commercial/tuitionRates";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import OwnershipBadge from "@/components/configRuntime/OwnershipBadge";

type SiteRow = { id: string; label: string | null; location_type: string };

type OptionValueRow = { value: string; label: string; sort_order: number };

/** Supported schedule types from childcare_schedule_type option set. */
const FALLBACK_SCHEDULE_TYPES: OptionValueRow[] = [
    { value: "full_time", label: "Full time", sort_order: 10 },
    { value: "part_time", label: "Part time", sort_order: 20 },
    { value: "drop_in", label: "Drop-in", sort_order: 30 },
    { value: "before_school", label: "Before school", sort_order: 40 },
    { value: "after_school", label: "After school", sort_order: 50 },
];

type ScopeSelectorProps = {
    sites: SiteRow[];
    activeSiteId: string | null;
    onSelect: (siteId: string | null) => void;
};

function ScopeSelector({ sites, activeSiteId, onSelect }: ScopeSelectorProps) {
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <button
                type="button"
                onClick={() => onSelect(null)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeSiteId === null
                        ? "border-alloy-midnight/20 bg-alloy-midnight/8 text-alloy-midnight"
                        : "border-alloy-forge/12 bg-white text-alloy-midnight/55 hover:bg-alloy-stone/20"
                }`}
            >
                Org default
            </button>
            {sites.map((site) => (
                <button
                    key={site.id}
                    type="button"
                    onClick={() => onSelect(site.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        activeSiteId === site.id
                            ? "border-alloy-pine/25 bg-alloy-pine/10 text-alloy-pine"
                            : "border-alloy-forge/12 bg-white text-alloy-midnight/55 hover:bg-alloy-stone/20"
                    }`}
                >
                    {(site.label ?? "Untitled site").trim() || "Untitled site"}
                </button>
            ))}
        </div>
    );
}

type TuitionCellProps = {
    rateRow: TuitionRateRow | undefined;
    orgDefaultRow: TuitionRateRow | undefined;
    isLocationScope: boolean;
    saving: boolean;
    onSave: (rateCents: number) => Promise<void>;
    onClear: () => Promise<void>;
};

function TuitionCell({ rateRow, orgDefaultRow, isLocationScope, saving, onSave, onClear }: TuitionCellProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");

    const isOverride = isLocationScope && rateRow != null && rateRow.location_id !== null;
    const displayRow = rateRow ?? orgDefaultRow;
    const displayCents = displayRow?.rate_cents;

    const handleBlur = useCallback(async () => {
        setEditing(false);
        const cents = parseDollarsToCents(draft);
        if (cents === null) return;
        if (cents === displayCents) return;
        await onSave(cents);
    }, [draft, displayCents, onSave]);

    if (editing) {
        return (
            <td className="border-b border-r border-alloy-forge/8 p-0 last:border-r-0">
                <input
                    autoFocus
                    type="text"
                    value={draft}
                    disabled={saving}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => void handleBlur()}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") {
                            setEditing(false);
                            setDraft("");
                        }
                    }}
                    className="w-full rounded-none border-0 bg-alloy-pine/5 px-3 py-2.5 text-right text-sm text-alloy-midnight outline-none ring-1 ring-inset ring-alloy-pine/40 focus:ring-alloy-pine/60"
                />
            </td>
        );
    }

    return (
        <td className="group relative border-b border-r border-alloy-forge/8 last:border-r-0">
            <button
                type="button"
                disabled={saving}
                onClick={() => {
                    setEditing(true);
                    setDraft(
                        displayCents != null
                            ? (displayCents / 100).toFixed(0)
                            : ""
                    );
                }}
                className={`flex w-full items-center justify-end gap-1.5 px-3 py-2.5 text-right text-sm transition-colors hover:bg-alloy-pine/5 ${
                    saving ? "opacity-50" : ""
                } ${isOverride ? "font-medium text-alloy-pine" : "text-alloy-midnight/75"} ${
                    !displayCents && !isOverride ? "text-alloy-midnight/25" : ""
                }`}
            >
                {isOverride ? (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alloy-pine/60" title="Location override" />
                ) : null}
                {displayCents != null ? (
                    formatRateCents(displayCents)
                ) : (
                    <span className="text-alloy-midnight/25">—</span>
                )}
            </button>

            {/* Clear override button — only shown for location overrides */}
            {isOverride && (
                <button
                    type="button"
                    disabled={saving}
                    onClick={(e) => {
                        e.stopPropagation();
                        void onClear();
                    }}
                    title="Reset to org default"
                    className="absolute right-1 top-1 hidden rounded p-0.5 text-alloy-midnight/30 hover:text-red-500 group-hover:block"
                >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            )}
        </td>
    );
}

export default function TuitionGridWorkspace() {
    const [sites, setSites] = useState<SiteRow[]>([]);
    const [programs, setPrograms] = useState<LocationProgramCategoryRow[]>([]);
    const [scheduleTypes, setScheduleTypes] = useState<OptionValueRow[]>(FALLBACK_SCHEDULE_TYPES);
    const [rates, setRates] = useState<TuitionRateRow[]>([]);
    const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
    const [billingPeriod] = useState<TuitionBillingPeriod>(DEFAULT_BILLING_PERIOD);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingCells, setSavingCells] = useState<Set<string>>(new Set());

    // Unique programs across all sites (for grid rows) — deduplicated by key
    const uniquePrograms = useMemo(() => {
        const seen = new Map<string, LocationProgramCategoryRow>();
        for (const p of programs) {
            if (!seen.has(p.key) && p.is_active !== false) {
                seen.set(p.key, p);
            }
        }
        return Array.from(seen.values()).sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100));
    }, [programs]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const [locRes, catRes, optRes, rateRes] = await Promise.all([
                    fetch("/api/admin/locations", { credentials: "include" }),
                    fetch("/api/admin/location-program-categories", { credentials: "include" }),
                    fetch("/api/admin/option-sets/childcare_schedule_type", { credentials: "include" }),
                    fetch("/api/admin/commercial/tuition-rates", { credentials: "include" }),
                ]);
                const locJson = (await locRes.json().catch(() => ({}))) as { locations?: SiteRow[] };
                const catJson = (await catRes.json().catch(() => ({}))) as { categories?: LocationProgramCategoryRow[] };
                const optJson = (await optRes.json().catch(() => ({}))) as { items?: OptionValueRow[] };
                const rateJson = (await rateRes.json().catch(() => ({}))) as { rates?: TuitionRateRow[] };

                if (!cancelled) {
                    const siteList: SiteRow[] = (locJson.locations ?? []).filter(
                        (l) => l.location_type === "site"
                    );
                    setSites(siteList);
                    setPrograms(catJson.categories ?? []);
                    if (optJson.items?.length) {
                        setScheduleTypes(
                            [...optJson.items].sort((a, b) => a.sort_order - b.sort_order)
                        );
                    }
                    setRates(rateJson.rates ?? []);
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const rateMap = useMemo(
        () => buildTuitionRateMap(rates, activeSiteId),
        [rates, activeSiteId]
    );

    const orgDefaultMap = useMemo(
        () => buildTuitionRateMap(rates, null),
        [rates]
    );

    const handleSaveRate = useCallback(
        async (programKey: string, scheduleKey: string, rateCents: number) => {
            const cellKey = tuitionRateCellKey(programKey, scheduleKey, billingPeriod);
            setSavingCells((s) => new Set(s).add(cellKey));
            try {
                const res = await fetch("/api/admin/commercial/tuition-rates", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        program_key: programKey,
                        schedule_key: scheduleKey,
                        rate_cents: rateCents,
                        billing_period: billingPeriod,
                        location_id: activeSiteId,
                    }),
                });
                const json = (await res.json().catch(() => ({}))) as {
                    rate?: TuitionRateRow;
                    error?: string;
                };
                if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
                if (json.rate) {
                    setRates((prev) => {
                        const idx = prev.findIndex((r) => r.id === json.rate!.id);
                        if (idx >= 0) {
                            const next = [...prev];
                            next[idx] = json.rate!;
                            return next;
                        }
                        return [...prev, json.rate!];
                    });
                }
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setSavingCells((s) => {
                    const next = new Set(s);
                    next.delete(cellKey);
                    return next;
                });
            }
        },
        [activeSiteId, billingPeriod]
    );

    const handleClearOverride = useCallback(
        async (programKey: string, scheduleKey: string) => {
            const cellKey = tuitionRateCellKey(programKey, scheduleKey, billingPeriod);
            const existing = rateMap.get(cellKey);
            if (!existing || existing.location_id === null) return;

            setSavingCells((s) => new Set(s).add(cellKey));
            try {
                const res = await fetch(`/api/admin/commercial/tuition-rates/${existing.id}`, {
                    method: "DELETE",
                    credentials: "include",
                });
                if (!res.ok) {
                    const json = (await res.json().catch(() => ({}))) as { error?: string };
                    throw new Error(json.error ?? "Delete failed");
                }
                setRates((prev) => prev.filter((r) => r.id !== existing.id));
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setSavingCells((s) => {
                    const next = new Set(s);
                    next.delete(cellKey);
                    return next;
                });
            }
        },
        [billingPeriod, rateMap]
    );

    const scopeIsLocation = activeSiteId !== null;

    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS}>
            <header className="flex items-center gap-3">
                <Link
                    href="/admin/commercial"
                    className="text-xs text-alloy-midnight/40 hover:text-alloy-midnight/70"
                >
                    Programs & Tuition
                </Link>
                <span className="text-alloy-midnight/25">/</span>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Tuition</h1>
            </header>

            <p className={SETTINGS_PAGE_INTRO_CLASS}>
                Set tuition rates by program and schedule type. Org defaults apply to all locations
                unless a location has its own override.{" "}
                <span className="inline-flex items-center gap-1 text-alloy-pine/70">
                    <span className="h-1.5 w-1.5 rounded-full bg-alloy-pine/60" />
                    Green dot
                </span>{" "}
                indicates a location override.
            </p>

            {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}{" "}
                    <button onClick={() => setError(null)} className="ml-2 text-red-500 underline">
                        Dismiss
                    </button>
                </div>
            ) : null}

            {loading ? (
                <p className="text-sm text-alloy-midnight/50">Loading tuition grid…</p>
            ) : (
                <div className="space-y-4">
                    {/* Scope selector */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <ScopeSelector
                            sites={sites}
                            activeSiteId={activeSiteId}
                            onSelect={setActiveSiteId}
                        />
                        <OwnershipBadge owner={scopeIsLocation ? "location" : "org"} />
                    </div>

                    {uniquePrograms.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-alloy-forge/20 bg-alloy-stone/10 px-5 py-8 text-center">
                            <p className="text-sm text-alloy-midnight/50">
                                No active programs found. Configure programs in{" "}
                                <Link href="/admin/commercial/programs" className="text-alloy-pine underline">
                                    Programs
                                </Link>{" "}
                                first.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Tuition grid */}
                            <div className="overflow-x-auto rounded-xl border border-alloy-forge/12 bg-white/90 shadow-sm">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="border-b border-alloy-forge/10 bg-alloy-stone/20">
                                            <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                                Program
                                            </th>
                                            {scheduleTypes.map((st) => (
                                                <th
                                                    key={st.value}
                                                    className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40"
                                                >
                                                    {st.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {uniquePrograms.map((program) => (
                                            <tr
                                                key={program.key}
                                                className="border-b border-alloy-forge/6 last:border-0 hover:bg-alloy-stone/10"
                                            >
                                                <td className="border-r border-alloy-forge/8 px-4 py-2.5">
                                                    <span className="text-sm font-medium text-alloy-midnight">
                                                        {program.label}
                                                    </span>
                                                </td>
                                                {scheduleTypes.map((st) => {
                                                    const cellKey = tuitionRateCellKey(
                                                        program.key,
                                                        st.value,
                                                        billingPeriod
                                                    );
                                                    const rateRow = rateMap.get(cellKey);
                                                    const orgRow = orgDefaultMap.get(cellKey);
                                                    const saving = savingCells.has(cellKey);

                                                    return (
                                                        <TuitionCell
                                                            key={st.value}
                                                            rateRow={rateRow}
                                                            orgDefaultRow={orgRow}
                                                            isLocationScope={scopeIsLocation}
                                                            saving={saving}
                                                            onSave={(cents) =>
                                                                handleSaveRate(
                                                                    program.key,
                                                                    st.value,
                                                                    cents
                                                                )
                                                            }
                                                            onClear={() =>
                                                                handleClearOverride(program.key, st.value)
                                                            }
                                                        />
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 text-xs text-alloy-midnight/45">
                                <span>Click any cell to edit · Press Enter or click away to save</span>
                                {scopeIsLocation ? (
                                    <span className="flex items-center gap-1">
                                        <span className="h-1.5 w-1.5 rounded-full bg-alloy-pine/60" />
                                        Location override · Click × to reset to org default
                                    </span>
                                ) : (
                                    <span>
                                        Setting org defaults · Switch to a location to set overrides
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
    ConfigurationShell,
    ConfigurationQueue,
    ConfigurationQueueItem,
    ConfigurationDetailCard,
    ConfigurationEmptyState,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    type TuitionRateRow,
    type TuitionBillingPeriod,
    TUITION_BILLING_PERIODS,
    formatRateCents,
    parseDollarsToCents,
    tuitionRateCellKey,
    buildTuitionRateMap,
} from "@/lib/commercial/tuitionRates";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ProgramOption = { key: string; label: string; siteCount: number };
type ScheduleOption = { key: string; label: string };
type OwnershipMode = "org" | "location";
type PayerTab = "private" | "subsidy" | "corporate";
type ScopedLocation = { id: string; name: string };

// ─── Constants ─────────────────────────────────────────────────────────────────

const SECTION_TABS = [
    { key: "programs_tuition", label: "Programs & tuition", available: true },
    { key: "funding", label: "Funding", available: false },
    { key: "fees", label: "Fees & add-ons", available: false },
    { key: "policies", label: "Policies", available: false },
    { key: "accounting", label: "Accounting", available: false },
    { key: "simulator", label: "Simulator", available: false },
] as const;

const PAYER_TABS: { key: PayerTab; label: string; available: boolean }[] = [
    { key: "private", label: "Private pay", available: true },
    { key: "subsidy", label: "Subsidy", available: false },
    { key: "corporate", label: "Corporate", available: false },
];

const FALLBACK_SCHEDULES: ScheduleOption[] = [
    { key: "full_time", label: "Full Time" },
    { key: "part_time", label: "Part Time" },
    { key: "drop_in", label: "Drop-In" },
    { key: "before_school", label: "Before School" },
    { key: "after_school", label: "After School" },
];

// ─── TuitionCell ───────────────────────────────────────────────────────────────

type OnSave = (
    programKey: string,
    scheduleKey: string,
    billingPeriod: TuitionBillingPeriod,
    payload: { rate_cents?: number; not_offered?: boolean },
) => Promise<void>;

type CellProps = {
    programKey: string;
    scheduleKey: string;
    billingPeriod: TuitionBillingPeriod;
    rateRow: TuitionRateRow | undefined;
    orgDefaultRow: TuitionRateRow | undefined;
    locationId: string | null;
    onSave: OnSave;
    onClear: (rateId: string) => Promise<void>;
};

function TuitionCell({
    programKey,
    scheduleKey,
    billingPeriod,
    rateRow,
    orgDefaultRow,
    locationId,
    onSave,
    onClear,
}: CellProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const isLocationView = locationId !== null;
    const isLocOverride = isLocationView && rateRow?.location_id === locationId;
    const isInherited = isLocationView && !isLocOverride && rateRow != null;
    const isNotOffered = rateRow?.not_offered === true;
    const displayRate = rateRow && !isNotOffered ? rateRow.rate_cents : null;

    function startEdit() {
        if (isNotOffered) return;
        setDraft(displayRate != null ? String(displayRate / 100) : "");
        setEditing(true);
        setTimeout(() => inputRef.current?.select(), 0);
    }

    async function commitEdit() {
        const cents = parseDollarsToCents(draft);
        if (cents === null) {
            setEditing(false);
            return;
        }
        setSaving(true);
        await onSave(programKey, scheduleKey, billingPeriod, { rate_cents: cents });
        setSaving(false);
        setEditing(false);
    }

    async function toggleNotOffered() {
        setSaving(true);
        await onSave(programKey, scheduleKey, billingPeriod, { not_offered: !isNotOffered });
        setSaving(false);
    }

    async function clearOverride() {
        if (!rateRow?.id) return;
        setSaving(true);
        await onClear(rateRow.id);
        setSaving(false);
    }

    if (editing) {
        return (
            <td className="px-3 py-1.5 border-b border-alloy-stone/10">
                <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => void commitEdit()}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void commitEdit();
                        if (e.key === "Escape") setEditing(false);
                    }}
                    className="w-full border border-alloy-pine/40 rounded px-2 py-0.5 text-sm text-right focus:outline-none focus:border-alloy-pine"
                    placeholder="0.00"
                    autoFocus
                />
            </td>
        );
    }

    return (
        <td
            className={[
                "px-3 py-2.5 text-right text-sm group relative select-none border-b border-alloy-stone/10",
                isNotOffered
                    ? "text-alloy-midnight/25"
                    : isInherited
                      ? "text-alloy-midnight/40 italic"
                      : "text-alloy-midnight",
                saving ? "opacity-50" : "cursor-pointer hover:bg-alloy-stone/5",
            ].join(" ")}
            onClick={isNotOffered ? undefined : startEdit}
            title={isInherited ? "Inherited from org — click to set a location override" : undefined}
        >
            {isNotOffered ? (
                <span className="flex items-center justify-end gap-1">
                    <span className="text-xs text-alloy-midnight/25 line-through">N/A</span>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            void toggleNotOffered();
                        }}
                        className="text-alloy-midnight/30 hover:text-alloy-midnight/60 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                        title="Mark as offered"
                    >
                        ↩
                    </button>
                </span>
            ) : displayRate != null ? (
                <span className="flex items-center justify-end gap-1.5">
                    {isLocOverride && (
                        <span className="w-1.5 h-1.5 rounded-full bg-alloy-pine/70 flex-shrink-0" />
                    )}
                    <span>{formatRateCents(displayRate)}</span>
                    {isLocOverride && rateRow?.id && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                void clearOverride();
                            }}
                            className="text-alloy-midnight/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
                            title="Remove override — revert to org default"
                        >
                            ×
                        </button>
                    )}
                </span>
            ) : (
                <span className="text-alloy-midnight/20">—</span>
            )}

            {!isNotOffered && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        void toggleNotOffered();
                    }}
                    className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-alloy-midnight/20 hover:text-alloy-midnight/50 text-xs"
                    title="Mark as not offered"
                >
                    ⊘
                </button>
            )}
        </td>
    );
}

// ─── ProgramTuitionPanel ───────────────────────────────────────────────────────

type PanelProps = {
    program: ProgramOption;
    schedules: ScheduleOption[];
    locations: ScopedLocation[];
    ownershipMode: OwnershipMode;
    onOwnershipChange: (mode: OwnershipMode) => void;
    selectedLocationId: string | null;
    onLocationSelect: (id: string | null) => void;
    payerTab: PayerTab;
    onPayerTabChange: (tab: PayerTab) => void;
    rateMap: Map<string, TuitionRateRow>;
    orgOnlyMap: Map<string, TuitionRateRow>;
    locationId: string | null;
    onSave: OnSave;
    onClear: (id: string) => Promise<void>;
    onCopyToAll: () => void;
    bulkCopying: boolean;
};

function ProgramTuitionPanel({
    program,
    schedules,
    locations,
    ownershipMode,
    onOwnershipChange,
    selectedLocationId,
    onLocationSelect,
    payerTab,
    onPayerTabChange,
    rateMap,
    orgOnlyMap,
    locationId,
    onSave,
    onClear,
    onCopyToAll,
    bulkCopying,
}: PanelProps) {
    const payerLabel = payerTab === "private" ? "private pay" : payerTab;

    return (
        <div className="flex flex-col min-h-0 overflow-y-auto">
            <div className="p-6 space-y-5">
                {/* Program heading */}
                <div>
                    <h2 className="config-typo-workspace-title text-xl">{program.label}</h2>
                    <Link
                        href="/settings/commercial/programs"
                        className="inline-flex items-center gap-1 text-xs text-alloy-midnight/40 hover:text-alloy-pine mt-1 transition-colors"
                    >
                        Managed in Programs
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </Link>
                </div>

                {/* Ownership card */}
                <ConfigurationDetailCard title="How is this program's tuition managed?">
                    <div className="flex flex-col gap-3">
                        <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                                type="radio"
                                name={`ownership-${program.key}`}
                                checked={ownershipMode === "org"}
                                onChange={() => onOwnershipChange("org")}
                                className="mt-0.5 accent-alloy-pine"
                            />
                            <div>
                                <p className="text-sm font-medium text-alloy-midnight group-has-[:checked]:text-alloy-midnight">
                                    Organization managed
                                </p>
                                <p className="text-xs text-alloy-midnight/50 mt-0.5">
                                    One set of rates applies across all locations.
                                </p>
                            </div>
                        </label>
                        <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                                type="radio"
                                name={`ownership-${program.key}`}
                                checked={ownershipMode === "location"}
                                onChange={() => onOwnershipChange("location")}
                                className="mt-0.5 accent-alloy-pine"
                            />
                            <div>
                                <p className="text-sm font-medium text-alloy-midnight">
                                    Location managed
                                </p>
                                <p className="text-xs text-alloy-midnight/50 mt-0.5">
                                    Org sets defaults. Locations can view and override rates independently.
                                </p>
                            </div>
                        </label>
                    </div>
                </ConfigurationDetailCard>

                {/* Location managed controls */}
                {ownershipMode === "location" && (
                    <>
                        {/* Bulk actions */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                type="button"
                                onClick={onCopyToAll}
                                disabled={bulkCopying}
                                className="text-xs font-medium text-alloy-pine border border-alloy-pine/30 bg-alloy-pine/5 hover:bg-alloy-pine/10 px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                            >
                                {bulkCopying ? "Copying…" : "Copy org grid to all"}
                            </button>
                            <button
                                type="button"
                                disabled
                                className="text-xs text-alloy-midnight/30 border border-alloy-stone/25 px-3 py-1.5 rounded-md cursor-not-allowed"
                                title="Coming soon"
                            >
                                Apply adjustment
                            </button>
                            <button
                                type="button"
                                disabled
                                className="text-xs text-alloy-midnight/30 border border-alloy-stone/25 px-3 py-1.5 rounded-md cursor-not-allowed"
                                title="Coming soon"
                            >
                                Compare locations
                            </button>
                            <button
                                type="button"
                                disabled
                                className="text-xs text-alloy-midnight/30 border border-alloy-stone/25 px-3 py-1.5 rounded-md cursor-not-allowed"
                                title="Coming soon"
                            >
                                Schedule change
                            </button>
                        </div>

                        {/* Location pills */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                type="button"
                                onClick={() => onLocationSelect(null)}
                                className={[
                                    "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                                    selectedLocationId === null
                                        ? "bg-alloy-midnight text-white border-alloy-midnight"
                                        : "bg-white text-alloy-midnight/60 border-alloy-stone/30 hover:border-alloy-midnight/40",
                                ].join(" ")}
                            >
                                Org defaults
                            </button>
                            {locations.map((loc) => (
                                <button
                                    key={loc.id}
                                    type="button"
                                    onClick={() => onLocationSelect(loc.id)}
                                    className={[
                                        "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                                        selectedLocationId === loc.id
                                            ? "bg-alloy-pine text-white border-alloy-pine"
                                            : "bg-white text-alloy-midnight/60 border-alloy-stone/30 hover:border-alloy-pine/40",
                                    ].join(" ")}
                                >
                                    {loc.name}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {/* Payer tabs */}
                <div className="flex gap-0 border-b border-alloy-stone/20">
                    {PAYER_TABS.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            disabled={!tab.available}
                            onClick={() => {
                                if (tab.available) onPayerTabChange(tab.key);
                            }}
                            className={[
                                "px-4 py-2 text-sm -mb-px border-b-2 transition-colors",
                                payerTab === tab.key
                                    ? "border-alloy-pine text-alloy-pine font-medium"
                                    : tab.available
                                      ? "border-transparent text-alloy-midnight/50 hover:text-alloy-midnight"
                                      : "border-transparent text-alloy-midnight/25 cursor-not-allowed",
                            ].join(" ")}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tuition rate card */}
                <ConfigurationDetailCard
                    title={`What do we charge for ${program.label} — ${payerLabel}?`}
                >
                    <div className="overflow-x-auto -mx-4 px-4">
                        <table className="w-full text-sm">
                            <thead>
                                <tr>
                                    <th className="text-left pb-2.5 pr-4 text-xs font-medium text-alloy-midnight/45 w-36 border-b border-alloy-stone/15">
                                        Schedule
                                    </th>
                                    {TUITION_BILLING_PERIODS.map((bp) => (
                                        <th
                                            key={bp.key}
                                            className="text-right px-3 pb-2.5 text-xs font-medium text-alloy-midnight/45 whitespace-nowrap border-b border-alloy-stone/15"
                                        >
                                            {bp.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {schedules.map((sched) => (
                                    <tr key={sched.key}>
                                        <td className="py-2.5 pr-4 text-sm font-medium text-alloy-midnight/70 border-b border-alloy-stone/10 whitespace-nowrap">
                                            {sched.label}
                                        </td>
                                        {TUITION_BILLING_PERIODS.map((bp) => {
                                            const cellKey = tuitionRateCellKey(
                                                program.key,
                                                sched.key,
                                                bp.key,
                                            );
                                            return (
                                                <TuitionCell
                                                    key={cellKey}
                                                    programKey={program.key}
                                                    scheduleKey={sched.key}
                                                    billingPeriod={bp.key}
                                                    rateRow={rateMap.get(cellKey)}
                                                    orgDefaultRow={orgOnlyMap.get(cellKey)}
                                                    locationId={locationId}
                                                    onSave={onSave}
                                                    onClear={onClear}
                                                />
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs text-alloy-midnight/35 mt-4 pt-3 border-t border-alloy-stone/10">
                        {locationId && (
                            <>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-alloy-pine/70" />
                                    Location override
                                </span>
                                <span className="italic">Italic = inherited from org</span>
                            </>
                        )}
                        <span>
                            <span className="line-through">N/A</span> = not offered
                        </span>
                        <span>⊘ hover to mark as not offered</span>
                    </div>
                </ConfigurationDetailCard>

                {/* Revenue mapping card */}
                <ConfigurationDetailCard
                    title={`Where does ${program.label} tuition revenue land?`}
                >
                    <div className="flex items-start justify-between gap-4">
                        <p className="text-sm text-alloy-midnight/50">
                            Revenue category mapping is inherited from Accounting configuration.
                            Configure GL accounts and revenue categories there.
                        </p>
                        <Link
                            href="/settings/financials"
                            className="shrink-0 text-xs text-alloy-pine hover:underline"
                        >
                            Manage in Accounting →
                        </Link>
                    </div>
                    <div className="mt-3 rounded-md border border-alloy-stone/15 bg-alloy-stone/5 px-3 py-2.5">
                        <p className="text-xs text-alloy-midnight/35 italic">
                            No revenue categories configured — set up in Accounting.
                        </p>
                    </div>
                </ConfigurationDetailCard>
            </div>
        </div>
    );
}

// ─── CommercialConfigWorkspace ─────────────────────────────────────────────────

export function CommercialConfigWorkspace() {
    const [programs, setPrograms] = useState<ProgramOption[]>([]);
    const [selectedProgramKey, setSelectedProgramKey] = useState<string | null>(null);
    const [schedules, setSchedules] = useState<ScheduleOption[]>(FALLBACK_SCHEDULES);
    const [locations, setLocations] = useState<ScopedLocation[]>([]);
    const [ownershipMode, setOwnershipMode] = useState<OwnershipMode>("org");
    const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
    const [payerTab, setPayerTab] = useState<PayerTab>("private");
    const [rates, setRates] = useState<TuitionRateRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [bulkCopying, setBulkCopying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── Data loading ──────────────────────────────────────────────────────────

    const loadRates = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/commercial/tuition-rates");
            const json = (await res.json()) as { rates?: TuitionRateRow[] };
            setRates(json.rates ?? []);
        } catch {
            // rates stay as-is
        }
    }, []);

    useEffect(() => {
        async function boot() {
            setLoading(true);
            try {
                const [locRes, schedRes, progRes] = await Promise.all([
                    fetch("/api/admin/locations"),
                    fetch("/api/admin/option-sets/childcare_schedule_type"),
                    fetch("/api/admin/location-program-categories"),
                ]);

                // Locations
                const locJson = (await locRes.json()) as { locations?: Record<string, unknown>[] };
                const rawLocs = locJson.locations ?? [];
                setLocations(
                    rawLocs.map((l) => ({
                        id: String(l.id ?? ""),
                        name: String(l.name ?? ""),
                    })),
                );

                // Schedules
                if (schedRes.ok) {
                    const schedJson = (await schedRes.json()) as {
                        items?: Record<string, unknown>[];
                    };
                    const items: ScheduleOption[] = (schedJson.items ?? []).map((v) => ({
                        key: String(v.value ?? v.key ?? ""),
                        label: String(v.label ?? v.value ?? ""),
                    }));
                    if (items.length > 0) setSchedules(items);
                }

                // Programs — unique by key, with site count
                if (progRes.ok) {
                    const progJson = (await progRes.json()) as {
                        categories?: Record<string, unknown>[];
                    };
                    const byKey = new Map<string, { label: string; siteCount: number }>();
                    for (const c of progJson.categories ?? []) {
                        const key = String(c.key ?? c.id ?? "");
                        const label = String(c.label ?? c.name ?? "");
                        const existing = byKey.get(key);
                        if (existing) {
                            existing.siteCount++;
                        } else {
                            byKey.set(key, { label, siteCount: 1 });
                        }
                    }
                    const progs: ProgramOption[] = Array.from(byKey.entries()).map(
                        ([key, v]) => ({ key, label: v.label, siteCount: v.siteCount }),
                    );
                    setPrograms(progs);
                    if (progs.length > 0) setSelectedProgramKey(progs[0].key);
                }

                await loadRates();
            } catch (e) {
                setError(String(e));
            } finally {
                setLoading(false);
            }
        }
        void boot();
    }, [loadRates]);

    // ── Derived ────────────────────────────────────────────────────────────────

    const locationId = ownershipMode === "location" ? selectedLocationId : null;
    const selectedProgram = programs.find((p) => p.key === selectedProgramKey) ?? null;

    const programRates = rates.filter((r) => r.program_key === selectedProgramKey);
    const orgOnlyRates = programRates.filter((r) => r.location_id === null);
    const visibleRates = locationId
        ? programRates.filter((r) => r.location_id === null || r.location_id === locationId)
        : orgOnlyRates;

    const rateMap = buildTuitionRateMap(visibleRates, locationId);
    const orgOnlyMap = buildTuitionRateMap(orgOnlyRates, null);

    // ── Mutations ─────────────────────────────────────────────────────────────

    async function saveCell(
        programKey: string,
        scheduleKey: string,
        billingPeriod: TuitionBillingPeriod,
        payload: { rate_cents?: number; not_offered?: boolean },
    ) {
        setSaving(true);
        try {
            const body = {
                program_key: programKey,
                schedule_key: scheduleKey,
                billing_period: billingPeriod,
                location_id: locationId,
                ...payload,
            };
            const res = await fetch("/api/admin/commercial/tuition-rates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const j = (await res.json()) as { error?: string };
                setError(j.error ?? "Save failed");
            } else {
                await loadRates();
            }
        } finally {
            setSaving(false);
        }
    }

    async function clearCell(rateId: string) {
        setSaving(true);
        try {
            await fetch(`/api/admin/commercial/tuition-rates/${rateId}`, { method: "DELETE" });
            await loadRates();
        } finally {
            setSaving(false);
        }
    }

    async function bulkCopyOrgToAll() {
        setBulkCopying(true);
        try {
            const orgRates = rates.filter(
                (r) => r.location_id === null && r.program_key === selectedProgramKey,
            );
            await Promise.all(
                locations.flatMap((loc) =>
                    orgRates.map((r) =>
                        fetch("/api/admin/commercial/tuition-rates", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                program_key: r.program_key,
                                schedule_key: r.schedule_key,
                                billing_period: r.billing_period,
                                location_id: loc.id,
                                rate_cents: r.rate_cents,
                                not_offered: r.not_offered,
                            }),
                        }),
                    ),
                ),
            );
            await loadRates();
        } finally {
            setBulkCopying(false);
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-sm text-alloy-midnight/40">Loading…</p>
            </div>
        );
    }

    const programQueueColumn = (
        <ConfigurationQueue title="Programs">
            {programs.map((prog) => (
                <ConfigurationQueueItem
                    key={prog.key}
                    active={selectedProgramKey === prog.key}
                    title={prog.label}
                    subtitle={`offered at ${prog.siteCount} ${prog.siteCount === 1 ? "site" : "sites"}`}
                    onClick={() => setSelectedProgramKey(prog.key)}
                />
            ))}
            {programs.length === 0 && (
                <div className="px-4 py-3 text-xs text-alloy-midnight/40">
                    No programs configured.{" "}
                    <Link href="/settings/commercial/programs" className="text-alloy-pine hover:underline">
                        Add programs
                    </Link>
                </div>
            )}
        </ConfigurationQueue>
    );

    return (
        <div className="config-runtime-shell flex flex-col min-h-0 flex-1">
            {/* Commercial section tab bar */}
            <div className="flex items-end border-b border-alloy-stone/20 bg-white px-6 flex-shrink-0">
                {SECTION_TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        disabled={!tab.available}
                        className={[
                            "px-4 py-3 text-sm -mb-px border-b-2 transition-colors whitespace-nowrap",
                            tab.key === "programs_tuition"
                                ? "border-alloy-pine text-alloy-pine font-medium"
                                : "border-transparent text-alloy-midnight/30 cursor-not-allowed",
                        ].join(" ")}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {error && (
                <div className="mx-6 mt-4 flex items-center justify-between text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 flex-shrink-0">
                    <span>{error}</span>
                    <button
                        type="button"
                        onClick={() => setError(null)}
                        className="underline ml-3"
                    >
                        dismiss
                    </button>
                </div>
            )}

            <ConfigurationShell queueColumn={programQueueColumn}>
                {selectedProgram ? (
                    <ProgramTuitionPanel
                        program={selectedProgram}
                        schedules={schedules}
                        locations={locations}
                        ownershipMode={ownershipMode}
                        onOwnershipChange={(mode) => {
                            setOwnershipMode(mode);
                            setSelectedLocationId(null);
                        }}
                        selectedLocationId={selectedLocationId}
                        onLocationSelect={setSelectedLocationId}
                        payerTab={payerTab}
                        onPayerTabChange={setPayerTab}
                        rateMap={rateMap}
                        orgOnlyMap={orgOnlyMap}
                        locationId={locationId}
                        onSave={saveCell}
                        onClear={clearCell}
                        onCopyToAll={() => void bulkCopyOrgToAll()}
                        bulkCopying={bulkCopying}
                    />
                ) : (
                    <ConfigurationEmptyState
                        title="Select a program"
                        description="Choose a program from the left to configure its tuition rates."
                    />
                )}
            </ConfigurationShell>

            {saving && (
                <div className="fixed bottom-4 right-4 bg-alloy-midnight text-white text-xs px-3 py-2 rounded-lg shadow-lg">
                    Saving…
                </div>
            )}
        </div>
    );
}

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
import {
    type LocationProgramCategoryRow,
    slugifyLocationProgramCategoryKey,
    suggestNextLocationProgramCategorySortOrder,
} from "@/lib/locations/locationProgramCategories";

// ─── Types ─────────────────────────────────────────────────────────────────────

type OfferingItem = { id: string; item_key: string; label: string; sort_order: number };
type SiteLocation = { id: string; name: string };
type ProgramEntry = { key: string; label: string; siteCount: number };
type SecondaryTab = "programs" | "tuition";
type PayerTab = "private" | "subsidy" | "corporate";

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
    const inheritedRate =
        isInherited && orgDefaultRow && !orgDefaultRow.not_offered ? orgDefaultRow.rate_cents : null;

    function startEdit() {
        if (isNotOffered) return;
        setDraft(displayRate != null ? String(displayRate / 100) : inheritedRate != null ? String(inheritedRate / 100) : "");
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 0);
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
            <td className="px-2 py-1 border-b border-alloy-stone/10">
                <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => void commitEdit()}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void commitEdit();
                        if (e.key === "Escape") setEditing(false);
                    }}
                    className="w-full min-w-[72px] rounded border border-alloy-pine/50 bg-white px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-alloy-pine/30"
                    placeholder="0.00"
                />
            </td>
        );
    }

    return (
        <td
            className={[
                "px-2 py-2.5 text-right text-sm group relative select-none border-b border-alloy-stone/10",
                saving ? "opacity-40" : "",
                isNotOffered
                    ? "text-alloy-midnight/25"
                    : isInherited
                      ? "text-alloy-midnight/40 italic"
                      : displayRate != null
                        ? "text-alloy-midnight"
                        : "text-alloy-midnight/20",
            ].join(" ")}
        >
            {/* Click target for editing (not on not-offered cells) */}
            {!isNotOffered && (
                <button
                    type="button"
                    onClick={startEdit}
                    className="absolute inset-0 w-full h-full hover:bg-alloy-stone/5 rounded"
                    tabIndex={0}
                    aria-label={`Edit rate for ${scheduleKey} / ${billingPeriod}`}
                />
            )}

            {isNotOffered ? (
                <span className="flex items-center justify-end gap-1 relative z-10">
                    <span className="text-xs line-through">N/A</span>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            void toggleNotOffered();
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-alloy-midnight/40 hover:text-alloy-pine text-xs"
                        title="Mark as offered"
                    >
                        ↩
                    </button>
                </span>
            ) : (
                <span className="relative z-10 flex items-center justify-end gap-1.5 pointer-events-none">
                    {isLocOverride && (
                        <span className="w-1.5 h-1.5 rounded-full bg-alloy-pine/70 flex-shrink-0" />
                    )}
                    {displayRate != null ? (
                        <span>{formatRateCents(displayRate)}</span>
                    ) : inheritedRate != null ? (
                        <span>{formatRateCents(inheritedRate)}</span>
                    ) : (
                        <span className="text-xs">—</span>
                    )}
                    {isLocOverride && rateRow?.id && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                void clearOverride();
                            }}
                            className="pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity text-alloy-midnight/25 hover:text-red-400 text-xs leading-none"
                            title="Remove override"
                        >
                            ×
                        </button>
                    )}
                </span>
            )}

            {/* Not-offered toggle (hover) */}
            {!isNotOffered && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        void toggleNotOffered();
                    }}
                    className="absolute left-1 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity text-alloy-midnight/20 hover:text-alloy-midnight/60 text-xs"
                    title="Mark as not offered"
                >
                    ⊘
                </button>
            )}
        </td>
    );
}

// ─── ScheduleOfferingsCard ─────────────────────────────────────────────────────

type ScheduleOfferingsCardProps = {
    items: OfferingItem[];
    onAdd: (label: string, itemKey: string) => Promise<void>;
    onRename: (itemId: string, label: string) => Promise<void>;
    onDelete: (itemId: string, itemKey: string) => Promise<void>;
    hasRatesForKey: (itemKey: string) => boolean;
};

function ScheduleOfferingsCard({
    items,
    onAdd,
    onRename,
    onDelete,
    hasRatesForKey,
}: ScheduleOfferingsCardProps) {
    const [addLabel, setAddLabel] = useState("");
    const [addKey, setAddKey] = useState("");
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState("");

    const inputCls =
        "rounded border border-alloy-forge/15 bg-white px-2 py-1 text-xs text-alloy-midnight focus:border-alloy-pine/40 focus:outline-none";

    async function handleAdd() {
        const label = addLabel.trim();
        if (!label) return;
        const key = addKey.trim()
            ? slugifyLocationProgramCategoryKey(addKey)
            : slugifyLocationProgramCategoryKey(label);
        setAdding(true);
        await onAdd(label, key);
        setAddLabel("");
        setAddKey("");
        setAdding(false);
    }

    async function handleRename(item: OfferingItem) {
        const next = editLabel.trim();
        if (!next || next === item.label) {
            setEditingId(null);
            return;
        }
        await onRename(item.id, next);
        setEditingId(null);
    }

    return (
        <ConfigurationDetailCard title="What schedule offerings does this program have?">
            {items.length > 0 && (
                <div className="mb-3 overflow-hidden rounded-lg border border-alloy-stone/20">
                    {items.map((item, i) => (
                        <div
                            key={item.id}
                            className={[
                                "flex items-center gap-2 px-3 py-2",
                                i < items.length - 1 ? "border-b border-alloy-stone/10" : "",
                            ].join(" ")}
                        >
                            <span className="font-mono text-[10px] text-alloy-midnight/30 w-32 shrink-0 truncate">
                                {item.item_key}
                            </span>
                            {editingId === item.id ? (
                                <input
                                    autoFocus
                                    value={editLabel}
                                    onChange={(e) => setEditLabel(e.target.value)}
                                    onBlur={() => void handleRename(item)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") void handleRename(item);
                                        if (e.key === "Escape") setEditingId(null);
                                    }}
                                    className={`${inputCls} flex-1`}
                                />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingId(item.id);
                                        setEditLabel(item.label);
                                    }}
                                    className="flex-1 text-left text-sm text-alloy-midnight hover:text-alloy-pine"
                                >
                                    {item.label}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => void onDelete(item.id, item.item_key)}
                                className="shrink-0 text-alloy-midnight/20 hover:text-red-400 text-xs px-1 transition-colors"
                                title={
                                    hasRatesForKey(item.item_key)
                                        ? "This offering has tuition rates — deleting it will leave those rates without a display label"
                                        : "Remove offering"
                                }
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-end gap-2 flex-wrap">
                <label className="flex flex-col gap-0.5 min-w-[160px] flex-1">
                    <span className="text-[10px] text-alloy-midnight/45">Label</span>
                    <input
                        type="text"
                        value={addLabel}
                        placeholder="e.g. Part Time – 3 days"
                        disabled={adding}
                        onChange={(e) => setAddLabel(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void handleAdd();
                        }}
                        className={inputCls}
                    />
                </label>
                <label className="flex flex-col gap-0.5 min-w-[120px]">
                    <span className="text-[10px] text-alloy-midnight/45">
                        Key <span className="text-alloy-midnight/25">(auto)</span>
                    </span>
                    <input
                        type="text"
                        value={addKey}
                        placeholder="part_time_3d"
                        disabled={adding}
                        onChange={(e) => setAddKey(e.target.value)}
                        className={`${inputCls} font-mono text-[11px]`}
                    />
                </label>
                <button
                    type="button"
                    disabled={adding || !addLabel.trim()}
                    onClick={() => void handleAdd()}
                    className="rounded border border-alloy-pine/30 bg-alloy-pine/8 px-3 py-1.5 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/12 disabled:opacity-50 transition-colors"
                >
                    {adding ? "Adding…" : "Add offering"}
                </button>
            </div>

            <p className="mt-3 text-xs text-alloy-midnight/35 leading-relaxed">
                Offerings appear as rows in the Tuition grid. Each key is permanent once set — only the label
                can be renamed. Examples: "Full Time – 5 days" → <code className="font-mono bg-alloy-stone/20 px-1 rounded">full_time_5_days</code>.
                Day patterns are encoded in the label and key (V2 will add an explicit day-count field).
            </p>
        </ConfigurationDetailCard>
    );
}

// ─── ProgramsPanel ─────────────────────────────────────────────────────────────

type ProgramsPanelProps = {
    program: ProgramEntry;
    locations: SiteLocation[];
    categories: LocationProgramCategoryRow[];
    offeringItems: OfferingItem[];
    rates: TuitionRateRow[];
    onToggleSite: (siteId: string) => Promise<void>;
    onAddOffering: (label: string, key: string) => Promise<void>;
    onRenameOffering: (itemId: string, label: string) => Promise<void>;
    onDeleteOffering: (itemId: string, itemKey: string) => Promise<void>;
};

function ProgramsPanel({
    program,
    locations,
    categories,
    offeringItems,
    rates,
    onToggleSite,
    onAddOffering,
    onRenameOffering,
    onDeleteOffering,
}: ProgramsPanelProps) {
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const programCats = categories.filter((c) => c.key === program.key);

    function siteStatus(siteId: string): { active: boolean; rowId: string | null } {
        const row = programCats.find((c) => c.location_id === siteId);
        return { active: row?.is_active !== false, rowId: row?.id ?? null };
    }

    async function handleToggle(siteId: string) {
        setTogglingId(siteId);
        await onToggleSite(siteId);
        setTogglingId(null);
    }

    function hasRatesForKey(itemKey: string) {
        return rates.some((r) => r.program_key === program.key && r.schedule_key === itemKey);
    }

    return (
        <div className="flex flex-col min-h-0 overflow-y-auto">
            <div className="p-6 space-y-5">
                {/* Program heading */}
                <div>
                    <h2 className="config-typo-workspace-title text-xl">{program.label}</h2>
                    <span className="font-mono text-xs text-alloy-midnight/35">{program.key}</span>
                </div>

                {/* Location availability */}
                <ConfigurationDetailCard title="Which locations offer this program?">
                    {locations.length === 0 ? (
                        <p className="text-sm text-alloy-midnight/40">
                            No site locations configured.{" "}
                            <Link href="/settings/locations" className="text-alloy-pine hover:underline">
                                Add locations →
                            </Link>
                        </p>
                    ) : (
                        <div className="-mx-4 -mb-4">
                            {locations.map((site) => {
                                const { active } = siteStatus(site.id);
                                const toggling = togglingId === site.id;
                                return (
                                    <div
                                        key={site.id}
                                        className="flex items-center justify-between gap-3 border-b border-alloy-stone/10 last:border-0 px-4 py-2.5"
                                    >
                                        <span className="text-sm text-alloy-midnight">{site.name}</span>
                                        <button
                                            type="button"
                                            disabled={toggling}
                                            onClick={() => void handleToggle(site.id)}
                                            className={[
                                                "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50",
                                                active
                                                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                                                    : "bg-alloy-stone/20 text-alloy-midnight/40 hover:bg-alloy-stone/35",
                                            ].join(" ")}
                                        >
                                            {toggling ? "…" : active ? "Offered" : "Not offered"}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </ConfigurationDetailCard>

                {/* Schedule offerings */}
                <ScheduleOfferingsCard
                    items={offeringItems}
                    onAdd={onAddOffering}
                    onRename={onRenameOffering}
                    onDelete={onDeleteOffering}
                    hasRatesForKey={hasRatesForKey}
                />

                {/* Rooms note */}
                <ConfigurationDetailCard title="Rooms">
                    <p className="text-sm text-alloy-midnight/55 leading-relaxed">
                        Rooms are the operational children of programs — a Toddler room belongs under the
                        Toddler program for scheduling and headcount purposes. Room assignment does not affect
                        pricing: tuition is always set at the program level.
                    </p>
                    <Link
                        href="/settings/locations"
                        className="mt-2 inline-block text-xs text-alloy-pine hover:underline"
                    >
                        Manage rooms in Locations →
                    </Link>
                </ConfigurationDetailCard>
            </div>
        </div>
    );
}

// ─── TuitionPanel ──────────────────────────────────────────────────────────────

type TuitionPanelProps = {
    program: ProgramEntry;
    offeringItems: OfferingItem[];
    locations: SiteLocation[];
    selectedScopeId: string | null;
    onScopeChange: (id: string | null) => void;
    payerTab: PayerTab;
    onPayerTabChange: (tab: PayerTab) => void;
    rateMap: Map<string, TuitionRateRow>;
    orgOnlyMap: Map<string, TuitionRateRow>;
    locationId: string | null;
    onSave: OnSave;
    onClear: (id: string) => Promise<void>;
    onCopyOrgToLocation: (locId: string) => Promise<void>;
    bulkCopying: boolean;
};

function TuitionPanel({
    program,
    offeringItems,
    locations,
    selectedScopeId,
    onScopeChange,
    payerTab,
    onPayerTabChange,
    rateMap,
    orgOnlyMap,
    locationId,
    onSave,
    onClear,
    onCopyOrgToLocation,
    bulkCopying,
}: TuitionPanelProps) {
    const selectedLocName = locations.find((l) => l.id === selectedScopeId)?.name ?? "Location";
    const payerLabel = payerTab === "private" ? "private pay" : payerTab;

    return (
        <div className="flex flex-col min-h-0 overflow-y-auto">
            <div className="p-6 space-y-5">
                {/* Program heading */}
                <div>
                    <h2 className="config-typo-workspace-title text-xl">{program.label}</h2>
                </div>

                {/* Scope selector */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-alloy-midnight/45 shrink-0">Viewing:</span>
                    <button
                        type="button"
                        onClick={() => onScopeChange(null)}
                        className={[
                            "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                            selectedScopeId === null
                                ? "bg-alloy-midnight text-white border-alloy-midnight"
                                : "bg-white text-alloy-midnight/55 border-alloy-stone/30 hover:border-alloy-midnight/35",
                        ].join(" ")}
                    >
                        Org defaults
                    </button>
                    {locations.map((loc) => (
                        <button
                            key={loc.id}
                            type="button"
                            onClick={() => onScopeChange(loc.id)}
                            className={[
                                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                                selectedScopeId === loc.id
                                    ? "bg-alloy-pine text-white border-alloy-pine"
                                    : "bg-white text-alloy-midnight/55 border-alloy-stone/30 hover:border-alloy-pine/35",
                            ].join(" ")}
                        >
                            {loc.name}
                        </button>
                    ))}
                </div>

                {/* Location context banner */}
                {selectedScopeId && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-alloy-stone/25 bg-alloy-stone/8 px-4 py-2.5">
                        <p className="text-xs text-alloy-midnight/55 leading-relaxed">
                            Viewing <strong className="font-medium text-alloy-midnight">{selectedLocName}</strong>.{" "}
                            <span className="inline-flex items-center gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-alloy-pine/70" />
                                Green dot = location override.
                            </span>{" "}
                            Italic = inherited from org defaults.
                        </p>
                        <button
                            type="button"
                            disabled={bulkCopying}
                            onClick={() => void onCopyOrgToLocation(selectedScopeId)}
                            className="shrink-0 text-xs font-medium text-alloy-pine hover:underline disabled:opacity-50"
                        >
                            {bulkCopying ? "Copying…" : "Copy org grid →"}
                        </button>
                    </div>
                )}

                {/* Payer tabs */}
                <div className="flex border-b border-alloy-stone/20">
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
                    {offeringItems.length === 0 ? (
                        <div className="py-6 text-center">
                            <p className="text-sm text-alloy-midnight/40">
                                No schedule offerings configured.
                            </p>
                            <p className="text-xs text-alloy-midnight/30 mt-1">
                                Add offerings in the{" "}
                                <button
                                    type="button"
                                    className="text-alloy-pine hover:underline"
                                    onClick={() => {
                                        /* handled by parent via secondary tab */
                                    }}
                                >
                                    Programs tab
                                </button>{" "}
                                to populate this grid.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto -mx-4 px-4">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr>
                                        <th className="text-left pb-2.5 pr-3 text-xs font-medium text-alloy-midnight/45 border-b border-alloy-stone/20">
                                            Schedule offering
                                        </th>
                                        {TUITION_BILLING_PERIODS.map((bp) => (
                                            <th
                                                key={bp.key}
                                                className="text-right px-2 pb-2.5 text-xs font-medium text-alloy-midnight/45 whitespace-nowrap border-b border-alloy-stone/20"
                                            >
                                                {bp.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {offeringItems.map((offering) => (
                                        <tr key={offering.item_key} className="group/row">
                                            <td className="py-2.5 pr-3 font-medium text-alloy-midnight/70 border-b border-alloy-stone/10 whitespace-nowrap align-middle text-sm">
                                                {offering.label}
                                            </td>
                                            {TUITION_BILLING_PERIODS.map((bp) => {
                                                const cellKey = tuitionRateCellKey(
                                                    program.key,
                                                    offering.item_key,
                                                    bp.key,
                                                );
                                                return (
                                                    <TuitionCell
                                                        key={cellKey}
                                                        programKey={program.key}
                                                        scheduleKey={offering.item_key}
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
                    )}

                    {offeringItems.length > 0 && (
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
                                Click any cell to set a price.
                            </span>
                            <span>
                                <span className="line-through">N/A</span> = not offered
                            </span>
                            <span>⊘ hover to mark as not offered</span>
                        </div>
                    )}
                </ConfigurationDetailCard>

                {/* Revenue mapping reference */}
                <ConfigurationDetailCard
                    title={`Where does ${program.label} tuition revenue land?`}
                >
                    <div className="flex items-start justify-between gap-4">
                        <p className="text-sm text-alloy-midnight/50 leading-relaxed">
                            Revenue category mapping is inherited from Accounting configuration.
                            GL codes and revenue categories are set there.
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

// ─── AddProgramForm ────────────────────────────────────────────────────────────

type AddProgramFormProps = {
    onAdd: (label: string, key: string) => Promise<void>;
};

function AddProgramForm({ onAdd }: AddProgramFormProps) {
    const [label, setLabel] = useState("");
    const [key, setKey] = useState("");
    const [adding, setAdding] = useState(false);

    const inputCls =
        "rounded border border-alloy-forge/15 bg-white px-2 py-1 text-xs text-alloy-midnight focus:border-alloy-pine/40 focus:outline-none";

    async function handleAdd() {
        const l = label.trim();
        if (!l) return;
        const k = key.trim() ? slugifyLocationProgramCategoryKey(key) : slugifyLocationProgramCategoryKey(l);
        setAdding(true);
        await onAdd(l, k);
        setLabel("");
        setKey("");
        setAdding(false);
    }

    return (
        <div className="border-t border-alloy-stone/15 px-4 pt-3 pb-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                Add program
            </p>
            <div className="flex items-end gap-2 flex-wrap">
                <label className="flex flex-col gap-0.5 min-w-[140px] flex-1">
                    <span className="text-[10px] text-alloy-midnight/40">Name</span>
                    <input
                        type="text"
                        value={label}
                        placeholder="e.g. Summer Camp"
                        disabled={adding}
                        onChange={(e) => setLabel(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void handleAdd();
                        }}
                        className={inputCls}
                    />
                </label>
                <label className="flex flex-col gap-0.5 min-w-[100px]">
                    <span className="text-[10px] text-alloy-midnight/40">
                        Key <span className="text-alloy-midnight/25">(auto)</span>
                    </span>
                    <input
                        type="text"
                        value={key}
                        placeholder="summer_camp"
                        disabled={adding}
                        onChange={(e) => setKey(e.target.value)}
                        className={`${inputCls} font-mono text-[11px]`}
                    />
                </label>
                <button
                    type="button"
                    disabled={adding || !label.trim()}
                    onClick={() => void handleAdd()}
                    className="rounded border border-alloy-pine/30 bg-alloy-pine/8 px-3 py-1.5 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/12 disabled:opacity-50 transition-colors"
                >
                    {adding ? "Adding…" : "Add"}
                </button>
            </div>
        </div>
    );
}

// ─── CommercialConfigWorkspace ─────────────────────────────────────────────────

export function CommercialConfigWorkspace() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [bulkCopying, setBulkCopying] = useState(false);

    // Data
    const [locations, setLocations] = useState<SiteLocation[]>([]);
    const [categories, setCategories] = useState<LocationProgramCategoryRow[]>([]);
    const [offeringItems, setOfferingItems] = useState<OfferingItem[]>([]);
    const [rates, setRates] = useState<TuitionRateRow[]>([]);

    // Navigation state
    const [secondaryTab, setSecondaryTab] = useState<SecondaryTab>("programs");
    const [selectedProgramKey, setSelectedProgramKey] = useState<string | null>(null);
    const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
    const [payerTab, setPayerTab] = useState<PayerTab>("private");

    // ── Data loaders ──────────────────────────────────────────────────────────

    const reloadRates = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/commercial/tuition-rates");
            const json = (await res.json()) as { rates?: TuitionRateRow[] };
            setRates(json.rates ?? []);
        } catch {
            // rates stay as-is on network error
        }
    }, []);

    const reloadCategories = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/location-program-categories?include_inactive=true");
            const json = (await res.json()) as { categories?: LocationProgramCategoryRow[] };
            setCategories(json.categories ?? []);
        } catch {
            // silent
        }
    }, []);

    const reloadOfferings = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/option-sets/childcare_schedule_type");
            const json = (await res.json()) as { items?: OfferingItem[] };
            setOfferingItems(
                [...(json.items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
            );
        } catch {
            // silent
        }
    }, []);

    useEffect(() => {
        async function boot() {
            setLoading(true);
            try {
                const [locRes, catRes, offerRes, ratesRes] = await Promise.all([
                    fetch("/api/admin/locations"),
                    fetch("/api/admin/location-program-categories?include_inactive=true"),
                    fetch("/api/admin/option-sets/childcare_schedule_type"),
                    fetch("/api/admin/commercial/tuition-rates"),
                ]);

                const locJson = (await locRes.json()) as {
                    locations?: Record<string, unknown>[];
                };
                const rawLocs = (locJson.locations ?? []).filter(
                    (l) => String(l.location_type ?? "") === "site",
                );
                const locs: SiteLocation[] = rawLocs.map((l) => ({
                    id: String(l.id ?? ""),
                    name: String(l.name ?? l.label ?? "Unnamed site"),
                }));
                setLocations(locs);

                const catJson = (await catRes.json()) as {
                    categories?: LocationProgramCategoryRow[];
                };
                const cats = catJson.categories ?? [];
                setCategories(cats);

                // First program selected by default
                const byKey = new Map<string, { label: string; siteCount: number }>();
                for (const c of cats) {
                    if (c.is_active === false) continue;
                    const existing = byKey.get(c.key);
                    if (existing) {
                        existing.siteCount++;
                    } else {
                        byKey.set(c.key, { label: c.label, siteCount: 1 });
                    }
                }
                const progs = Array.from(byKey.entries()).map(([key, v]) => ({
                    key,
                    label: v.label,
                    siteCount: v.siteCount,
                }));
                if (progs.length > 0 && !selectedProgramKey) {
                    setSelectedProgramKey(progs[0].key);
                }

                const offerJson = (await offerRes.json()) as { items?: OfferingItem[] };
                setOfferingItems(
                    [...(offerJson.items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
                );

                const ratesJson = (await ratesRes.json()) as { rates?: TuitionRateRow[] };
                setRates(ratesJson.rates ?? []);
            } catch (e) {
                setError(String(e));
            } finally {
                setLoading(false);
            }
        }
        void boot();
        // intentionally run once
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Derived ────────────────────────────────────────────────────────────────

    const programs: ProgramEntry[] = (() => {
        const byKey = new Map<string, { label: string; siteCount: number }>();
        for (const c of categories) {
            if (c.is_active === false) continue;
            const existing = byKey.get(c.key);
            if (existing) {
                existing.siteCount++;
            } else {
                byKey.set(c.key, { label: c.label, siteCount: 1 });
            }
        }
        // also include programs with is_active=true if none active shows in list
        const allByKey = new Map<string, { label: string; siteCount: number }>();
        for (const c of categories) {
            if (!allByKey.has(c.key)) {
                allByKey.set(c.key, { label: c.label, siteCount: 0 });
            }
            if (c.is_active !== false) {
                allByKey.get(c.key)!.siteCount++;
            }
        }
        return Array.from(allByKey.entries()).map(([key, v]) => ({
            key,
            label: v.label,
            siteCount: v.siteCount,
        }));
    })();

    const selectedProgram = programs.find((p) => p.key === selectedProgramKey) ?? null;
    const locationId: string | null = selectedScopeId;

    const programRates = rates.filter((r) => r.program_key === selectedProgramKey);
    const orgOnlyRates = programRates.filter((r) => r.location_id === null);
    const visibleRates = locationId
        ? programRates.filter((r) => r.location_id === null || r.location_id === locationId)
        : orgOnlyRates;

    const rateMap = buildTuitionRateMap(visibleRates, locationId);
    const orgOnlyMap = buildTuitionRateMap(orgOnlyRates, null);

    // ── Program mutations ─────────────────────────────────────────────────────

    async function addProgram(label: string, key: string) {
        // Create the program at ALL active site locations
        const creates = locations.map((site) =>
            fetch("/api/admin/location-program-categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    location_id: site.id,
                    label,
                    key,
                    sort_order: suggestNextLocationProgramCategorySortOrder(
                        categories.filter((c) => c.location_id === site.id),
                        site.id,
                    ),
                }),
            }),
        );
        try {
            await Promise.all(creates);
            await reloadCategories();
            setSelectedProgramKey(key);
        } catch (e) {
            setError(String(e));
        }
    }

    async function toggleSiteForProgram(siteId: string) {
        if (!selectedProgramKey || !selectedProgram) return;
        const existing = categories.find(
            (c) => c.location_id === siteId && c.key === selectedProgramKey,
        );
        if (!existing) {
            // Create
            await fetch("/api/admin/location-program-categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    location_id: siteId,
                    label: selectedProgram.label,
                    key: selectedProgramKey,
                    sort_order: suggestNextLocationProgramCategorySortOrder(
                        categories.filter((c) => c.location_id === siteId),
                        siteId,
                    ),
                }),
            });
        } else {
            // Toggle is_active
            await fetch("/api/admin/location-program-categories", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    updates: [{ id: existing.id, is_active: existing.is_active === false }],
                }),
            });
        }
        await reloadCategories();
    }

    // ── Offering mutations ────────────────────────────────────────────────────

    async function addOffering(label: string, itemKey: string) {
        const nextOrder =
            offeringItems.length > 0
                ? Math.max(...offeringItems.map((i) => i.sort_order)) + 10
                : 10;
        const res = await fetch("/api/admin/option-sets/childcare_schedule_type/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item_key: itemKey, label, sort_order: nextOrder }),
        });
        if (!res.ok) {
            const j = (await res.json()) as { error?: string };
            setError(j.error ?? "Failed to add offering");
            return;
        }
        await reloadOfferings();
    }

    async function renameOffering(itemId: string, label: string) {
        const res = await fetch(
            `/api/admin/option-sets/childcare_schedule_type/items/${itemId}`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label }),
            },
        );
        if (!res.ok) {
            const j = (await res.json()) as { error?: string };
            setError(j.error ?? "Failed to rename offering");
            return;
        }
        await reloadOfferings();
    }

    async function deleteOffering(itemId: string, itemKey: string) {
        const hasRates = rates.some((r) => r.schedule_key === itemKey);
        if (hasRates) {
            const ok = window.confirm(
                `"${itemKey}" has existing tuition rates. Deleting the offering will hide those rates from the grid (the data is preserved). Continue?`,
            );
            if (!ok) return;
        }
        const res = await fetch(
            `/api/admin/option-sets/childcare_schedule_type/items/${itemId}`,
            { method: "DELETE" },
        );
        if (!res.ok) {
            const j = (await res.json()) as { error?: string };
            setError(j.error ?? "Failed to delete offering");
            return;
        }
        await reloadOfferings();
    }

    // ── Tuition mutations ─────────────────────────────────────────────────────

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
                await reloadRates();
            }
        } finally {
            setSaving(false);
        }
    }

    async function clearCell(rateId: string) {
        setSaving(true);
        try {
            await fetch(`/api/admin/commercial/tuition-rates/${rateId}`, { method: "DELETE" });
            await reloadRates();
        } finally {
            setSaving(false);
        }
    }

    async function bulkCopyOrgToLocation(locId: string) {
        setBulkCopying(true);
        try {
            const orgRates = rates.filter(
                (r) => r.location_id === null && r.program_key === selectedProgramKey,
            );
            await Promise.all(
                orgRates.map((r) =>
                    fetch("/api/admin/commercial/tuition-rates", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            program_key: r.program_key,
                            schedule_key: r.schedule_key,
                            billing_period: r.billing_period,
                            location_id: locId,
                            rate_cents: r.rate_cents,
                            not_offered: r.not_offered,
                        }),
                    }),
                ),
            );
            await reloadRates();
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
        <ConfigurationQueue title="Programs" actions={undefined}>
            {programs.map((prog) => (
                <ConfigurationQueueItem
                    key={prog.key}
                    active={selectedProgramKey === prog.key}
                    title={prog.label}
                    subtitle={`${prog.siteCount} ${prog.siteCount === 1 ? "site" : "sites"}`}
                    onClick={() => setSelectedProgramKey(prog.key)}
                />
            ))}
            {programs.length === 0 && (
                <p className="px-4 py-3 text-xs text-alloy-midnight/40">No programs yet.</p>
            )}
            <AddProgramForm onAdd={addProgram} />
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
                                : "border-transparent text-alloy-midnight/28 cursor-not-allowed",
                        ].join(" ")}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Error banner */}
            {error && (
                <div className="mx-6 mt-4 flex items-center justify-between text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 flex-shrink-0">
                    <span>{error}</span>
                    <button
                        type="button"
                        onClick={() => setError(null)}
                        className="underline ml-3 text-xs"
                    >
                        dismiss
                    </button>
                </div>
            )}

            <ConfigurationShell queueColumn={programQueueColumn}>
                {selectedProgram ? (
                    <div className="flex flex-col min-h-0 flex-1">
                        {/* Programs / Tuition secondary nav */}
                        <div className="flex border-b border-alloy-stone/15 px-6 bg-white flex-shrink-0">
                            {(["programs", "tuition"] as const).map((tab) => (
                                <button
                                    key={tab}
                                    type="button"
                                    onClick={() => setSecondaryTab(tab)}
                                    className={[
                                        "px-3 py-2.5 text-sm capitalize -mb-px border-b-2 transition-colors",
                                        secondaryTab === tab
                                            ? "border-alloy-midnight text-alloy-midnight font-medium"
                                            : "border-transparent text-alloy-midnight/45 hover:text-alloy-midnight",
                                    ].join(" ")}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        {secondaryTab === "programs" ? (
                            <ProgramsPanel
                                program={selectedProgram}
                                locations={locations}
                                categories={categories}
                                offeringItems={offeringItems}
                                rates={rates}
                                onToggleSite={toggleSiteForProgram}
                                onAddOffering={addOffering}
                                onRenameOffering={renameOffering}
                                onDeleteOffering={deleteOffering}
                            />
                        ) : (
                            <TuitionPanel
                                program={selectedProgram}
                                offeringItems={offeringItems}
                                locations={locations}
                                selectedScopeId={selectedScopeId}
                                onScopeChange={setSelectedScopeId}
                                payerTab={payerTab}
                                onPayerTabChange={setPayerTab}
                                rateMap={rateMap}
                                orgOnlyMap={orgOnlyMap}
                                locationId={locationId}
                                onSave={saveCell}
                                onClear={clearCell}
                                onCopyOrgToLocation={bulkCopyOrgToLocation}
                                bulkCopying={bulkCopying}
                            />
                        )}
                    </div>
                ) : (
                    <ConfigurationEmptyState
                        title="Select a program"
                        description="Choose a program from the left to configure it, or add a new one."
                    />
                )}
            </ConfigurationShell>

            {saving && (
                <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-alloy-midnight px-3 py-2 text-xs text-white shadow-lg">
                    Saving…
                </div>
            )}
        </div>
    );
}

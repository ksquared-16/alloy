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
    formatRateCents,
    parseDollarsToCents,
    tuitionRateCellKey,
    buildTuitionRateMap,
} from "@/lib/commercial/tuitionRates";
import {
    type CommercialFee,
    type CommercialAddon,
    type CommercialDeposit,
    FREQUENCY_OPTIONS,
    FEE_TYPE_SUGGESTIONS,
    ADDON_TYPE_SUGGESTIONS,
    DEPOSIT_TIMING_SUGGESTIONS,
    PACKAGE_UNIT_TYPE_OPTIONS,
    formatScope,
    frequencyLabel,
    isPackageAddon,
    describePackage,
} from "@/lib/commercial/feesAddons";
import {
    type ProgramOffering,
    type AttendanceType,
    type OfferingStatus,
    ATTENDANCE_TYPE_LABELS,
    OFFERING_STATUS_LABELS,
    NO_QUANTITY_ATTENDANCE_TYPES,
    sortOfferings,
} from "@/lib/programs/programOfferings";
import {
    type ProgramOfferingVariant,
    type QuantityType,
    type VariantStatus,
    QUANTITY_TYPE_LABELS,
    autoVariantLabel,
    describeVariant,
    isDefaultVariant,
    sortVariants,
    groupVariantsByOffering,
} from "@/lib/programs/programOfferingVariants";
import type { BillingCadence } from "@/lib/commercial/billingCadences";
import {
    type LocationProgramCategoryRow,
    slugifyLocationProgramCategoryKey,
    suggestNextLocationProgramCategorySortOrder,
} from "@/lib/locations/locationProgramCategories";

// ─── Types ─────────────────────────────────────────────────────────────────────

type SiteLocation = { id: string; name: string };
type ProgramEntry = { key: string; label: string; siteCount: number };
type SecondaryTab = "programs" | "tuition";
type PayerTab = "private" | "subsidy" | "corporate";
type SectionTab = "programs_tuition" | "fees";

type RatePayload = {
    rate_cents?: number;
    not_offered?: boolean;
    effective_start?: string | null;
    effective_end?: string | null;
};
type OnSave = (variantId: string, cadenceKey: string, payload: RatePayload) => Promise<void>;

// ─── Constants ─────────────────────────────────────────────────────────────────

const SECTION_TABS = [
    { key: "programs_tuition" as const, label: "Programs & tuition", available: true },
    { key: "funding" as const, label: "Funding", available: false },
    { key: "fees" as const, label: "Fees & add-ons", available: true },
    { key: "policies" as const, label: "Policies", available: false },
    { key: "accounting" as const, label: "Accounting", available: false },
    { key: "simulator" as const, label: "Simulator", available: false },
];

const PAYER_TABS: { key: PayerTab; label: string; available: boolean }[] = [
    { key: "private", label: "Private pay", available: true },
    { key: "subsidy", label: "Subsidy", available: false },
    { key: "corporate", label: "Corporate", available: false },
];

const ATTENDANCE_OPTIONS: AttendanceType[] = [
    "full_time", "part_time", "drop_in", "before_school", "after_school", "hourly", "custom",
];

const QUANTITY_OPTIONS: QuantityType[] = ["days", "hours", "sessions", "weeks", "months"];

const BULK_PRESETS: Record<string, number[]> = {
    days: [1, 2, 3, 4, 5],
    hours: [2, 4, 6, 8, 10],
    sessions: [5, 10, 15, 20],
    weeks: [1, 2, 4],
    months: [1, 3, 6, 12],
};

const inputCls =
    "rounded border border-alloy-forge/15 bg-white px-2 py-1 text-xs text-alloy-midnight focus:border-alloy-pine/40 focus:outline-none";

// ─── GridCell ──────────────────────────────────────────────────────────────────
// Inline-editable cell in the offering×cadence rate table.
// Edit mode: compact price input first, effective dates collapsed behind a toggle.

function GridCell({ variant, cadence, rateRow, orgDefaultRow, locationId, onSave, onClear }: {
    variant: ProgramOfferingVariant;
    cadence: BillingCadence;
    rateRow: TuitionRateRow | undefined;
    orgDefaultRow: TuitionRateRow | undefined;
    locationId: string | null;
    onSave: OnSave;
    onClear: (id: string) => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [showDates, setShowDates] = useState(false);
    const [effectiveStart, setEffectiveStart] = useState("");
    const [effectiveEnd, setEffectiveEnd] = useState("");
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const isLocationView = locationId !== null;
    const isLocOverride = isLocationView && rateRow?.location_id === locationId;
    const isInherited = isLocationView && rateRow?.location_id === null;
    const isNotOffered = rateRow?.not_offered === true;
    const displayRate = rateRow && !isNotOffered ? rateRow.rate_cents : null;
    const showOrgFallback = !rateRow && orgDefaultRow && !orgDefaultRow.not_offered;
    const hasDates = !!(rateRow?.effective_start || rateRow?.effective_end);

    function startEdit() {
        if (isNotOffered) return;
        setDraft(displayRate != null ? String(displayRate / 100) : "");
        setEffectiveStart(rateRow?.effective_start ?? "");
        setEffectiveEnd(rateRow?.effective_end ?? "");
        setShowDates(hasDates); // auto-expand if dates already set
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    }

    async function commitEdit() {
        const cents = parseDollarsToCents(draft);
        if (cents === null) { setEditing(false); return; }
        setSaving(true);
        await onSave(variant.id, cadence.item_key, {
            rate_cents: cents,
            effective_start: effectiveStart || null,
            effective_end: effectiveEnd || null,
        });
        setSaving(false);
        setEditing(false);
    }

    async function toggleNotOffered() {
        setSaving(true);
        await onSave(variant.id, cadence.item_key, { not_offered: !isNotOffered });
        setSaving(false);
    }

    if (editing) {
        return (
            // Identical padding/sizing to read mode — grid stays locked
            <td className="px-3 py-2.5 text-right text-sm relative whitespace-nowrap" style={{ minWidth: 120 }}>
                {/* Price row — right-aligned to match read mode */}
                <div className="flex items-center justify-end gap-1">
                    <span className="text-xs text-alloy-midnight/35 select-none">$</span>
                    <input
                        ref={inputRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void commitEdit(); if (e.key === "Escape") { setEditing(false); setShowDates(false); } }}
                        className="w-16 rounded border border-alloy-pine/45 px-1 py-0 text-sm text-right leading-5 focus:outline-none focus:border-alloy-pine bg-white"
                        placeholder="0.00"
                    />
                    <button type="button" onClick={() => void commitEdit()} disabled={saving} className="text-xs font-semibold text-alloy-pine hover:text-alloy-pine/70 disabled:opacity-40 leading-none">✓</button>
                    <button type="button" onClick={() => { setEditing(false); setShowDates(false); }} className="text-[11px] text-alloy-midnight/30 hover:text-alloy-midnight/60 leading-none">✕</button>
                </div>

                {/* Effective dates — absolutely positioned below cell, never affects row height */}
                {!showDates ? (
                    <button
                        type="button"
                        onClick={() => setShowDates(true)}
                        className="absolute right-3 top-full mt-0.5 text-[10px] text-alloy-midnight/30 hover:text-alloy-midnight/55 transition-colors z-10 whitespace-nowrap"
                    >
                        + dates
                    </button>
                ) : (
                    <div className="absolute right-0 top-full mt-0.5 z-20 w-48 rounded border border-alloy-stone/20 bg-white shadow-sm p-2 space-y-1.5 text-left">
                        <p className="text-[9px] text-alloy-midnight/35">Leave blank if rate applies now.</p>
                        <label className="block">
                            <span className="text-[9px] font-medium text-alloy-midnight/45 uppercase tracking-wide">Effective from</span>
                            <input
                                type="date"
                                value={effectiveStart}
                                onChange={(e) => setEffectiveStart(e.target.value)}
                                className="mt-0.5 w-full rounded border border-alloy-stone/25 px-1 py-0.5 text-[11px] text-alloy-midnight/70 focus:outline-none"
                            />
                        </label>
                        <label className="block">
                            <span className="text-[9px] font-medium text-alloy-midnight/45 uppercase tracking-wide">Ends on <span className="font-normal normal-case">(optional)</span></span>
                            <input
                                type="date"
                                value={effectiveEnd}
                                onChange={(e) => setEffectiveEnd(e.target.value)}
                                className="mt-0.5 w-full rounded border border-alloy-stone/25 px-1 py-0.5 text-[11px] text-alloy-midnight/70 focus:outline-none"
                            />
                        </label>
                        <button type="button" onClick={() => setShowDates(false)} className="text-[9px] text-alloy-midnight/30 hover:text-alloy-midnight/55">✕ close</button>
                    </div>
                )}
            </td>
        );
    }

    return (
        <td
            style={{ minWidth: 120 }}
            className={[
                "px-3 py-2.5 text-right text-sm group/cell select-none whitespace-nowrap",
                saving ? "opacity-50" : "",
                isNotOffered ? "text-alloy-midnight/25" : isInherited ? "italic text-alloy-midnight/40" : "text-alloy-midnight",
                !isNotOffered ? "cursor-pointer hover:bg-alloy-stone/5" : "",
            ].join(" ")}
            onClick={isNotOffered ? undefined : startEdit}
        >
            {isNotOffered ? (
                <span className="inline-flex items-center gap-1">
                    <span className="line-through text-xs">N/A</span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); void toggleNotOffered(); }} className="opacity-0 group-hover/cell:opacity-100 text-[10px] text-alloy-midnight/30 hover:text-alloy-midnight/60" title="Mark as offered">↩</button>
                </span>
            ) : displayRate != null ? (
                <span className="inline-flex items-center gap-1">
                    {isLocOverride && <span className="w-1.5 h-1.5 rounded-full bg-alloy-pine/70 shrink-0" />}
                    <span>{formatRateCents(displayRate)}</span>
                    {rateRow?.effective_start && (
                        <span className="opacity-0 group-hover/cell:opacity-100 text-[9px] text-alloy-midnight/30 font-normal not-italic" title={`Effective ${rateRow.effective_start}${rateRow.effective_end ? ` – ${rateRow.effective_end}` : ""}`}>📅</span>
                    )}
                    <span className="opacity-0 group-hover/cell:opacity-100 inline-flex gap-0.5">
                        <button type="button" onClick={(e) => { e.stopPropagation(); void toggleNotOffered(); }} className="text-[10px] text-alloy-midnight/25 hover:text-alloy-midnight/55" title="Mark N/A">⊘</button>
                        {!isInherited && rateRow?.id && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); void onClear(rateRow.id); }} className="text-[10px] text-alloy-midnight/20 hover:text-red-400" title="Clear rate">×</button>
                        )}
                    </span>
                </span>
            ) : showOrgFallback ? (
                <span className="text-alloy-midnight/25 italic text-xs">{formatRateCents(orgDefaultRow!.rate_cents)}</span>
            ) : (
                <span className="text-alloy-midnight/18 group-hover/cell:text-alloy-pine/50 transition-colors">
                    —
                    <button type="button" onClick={(e) => { e.stopPropagation(); void toggleNotOffered(); }} className="opacity-0 group-hover/cell:opacity-100 ml-1 text-[10px] text-alloy-midnight/25 hover:text-alloy-midnight/55" title="Mark N/A">⊘</button>
                </span>
            )}
        </td>
    );
}

// ─── OfferingRateGrid ──────────────────────────────────────────────────────────
// One table per offering: variants as rows, cadences as columns.
// "Add rate basis" adds a cadence column to this offering.

function OfferingRateGrid({ offering, variants, cadences, rateMap, orgOnlyMap, locationId, onSave, onClear }: {
    offering: ProgramOffering;
    variants: ProgramOfferingVariant[];
    cadences: BillingCadence[];
    rateMap: Map<string, TuitionRateRow>;
    orgOnlyMap: Map<string, TuitionRateRow>;
    locationId: string | null;
    onSave: OnSave;
    onClear: (id: string) => Promise<void>;
}) {
    const sorted = sortVariants(variants.filter((v) => v.is_active));
    const variantIdSet = new Set(sorted.map((v) => v.id));

    // Cadences that have at least one persisted rate for this offering
    const ratedCadenceKeys = new Set<string>();
    for (const [key] of rateMap) {
        const parts = key.split("::");
        if (variantIdSet.has(parts[0]!)) ratedCadenceKeys.add(parts[1]!);
    }
    for (const [key] of orgOnlyMap) {
        const parts = key.split("::");
        if (variantIdSet.has(parts[0]!)) ratedCadenceKeys.add(parts[1]!);
    }

    // Cadences added this session (column appears before first save)
    const [localKeys, setLocalKeys] = useState<string[]>([]);
    const [addingCol, setAddingCol] = useState(false);
    const [newKey, setNewKey] = useState("");

    const activeCadenceKeys = new Set([...ratedCadenceKeys, ...localKeys]);
    const activeCadences = cadences.filter((c) => activeCadenceKeys.has(c.item_key));
    const availableCadences = cadences.filter((c) => !activeCadenceKeys.has(c.item_key));

    function openAddCol() {
        const first = availableCadences[0];
        if (first) setNewKey(first.item_key);
        setAddingCol(true);
    }

    function confirmAddCol() {
        if (!newKey || activeCadenceKeys.has(newKey)) return;
        setLocalKeys((prev) => [...prev, newKey]);
        setAddingCol(false);
    }

    return (
        <div className="border border-alloy-stone/20 rounded-lg overflow-visible">
            {/* Header: offering name + "Add rate basis" on the right */}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-alloy-stone/5 border-b border-alloy-stone/15 rounded-t-lg">
                <span className="text-sm font-medium text-alloy-midnight">{offering.label}</span>
                <div className="shrink-0">
                    {sorted.length > 0 && availableCadences.length > 0 && (
                        addingCol ? (
                            <div className="flex items-center gap-1.5">
                                <select value={newKey} onChange={(e) => setNewKey(e.target.value)} className={inputCls}>
                                    {availableCadences.map((c) => <option key={c.item_key} value={c.item_key}>{c.label}</option>)}
                                </select>
                                <button type="button" onClick={confirmAddCol} className="rounded border border-alloy-pine/30 bg-alloy-pine/8 px-2 py-0.5 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/12">Add</button>
                                <button type="button" onClick={() => setAddingCol(false)} className="text-xs text-alloy-midnight/35 hover:text-alloy-midnight">✕</button>
                            </div>
                        ) : (
                            <button type="button" onClick={openAddCol} className="text-xs text-alloy-pine/70 hover:text-alloy-pine transition-colors flex items-center gap-0.5">
                                <span className="text-sm leading-none">+</span> Add rate basis
                            </button>
                        )
                    )}
                    {activeCadences.length === 0 && availableCadences.length === 0 && (
                        <span className="text-xs text-alloy-midnight/25">All cadences added</span>
                    )}
                </div>
            </div>

            {sorted.length === 0 ? (
                <p className="px-4 py-3 text-xs text-alloy-midnight/35">No active variants.</p>
            ) : activeCadences.length === 0 ? (
                <p className="px-4 py-3 text-xs text-alloy-midnight/35">No rate bases yet — use "+ Add rate basis" above to start.</p>
            ) : (
                <div className="overflow-x-auto overflow-y-visible">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-alloy-stone/10">
                                <th className="text-left px-4 py-1.5 text-xs font-medium text-alloy-midnight/40 w-32" />
                                {activeCadences.map((c) => (
                                    <th key={c.item_key} className="text-right px-3 py-1.5 text-xs font-medium text-alloy-midnight/50 whitespace-nowrap">{c.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((variant, vi) => (
                                <tr key={variant.id} className={`border-b border-alloy-stone/8 last:border-0 ${vi % 2 === 1 ? "bg-alloy-stone/3" : ""}`}>
                                    <td className="px-4 py-2 text-xs text-alloy-midnight/55 font-medium whitespace-nowrap">
                                        {isDefaultVariant(variant)
                                            ? <span className="italic text-alloy-midnight/30">Default</span>
                                            : describeVariant(variant)}
                                    </td>
                                    {activeCadences.map((cadence) => {
                                        const key = tuitionRateCellKey(variant.id, cadence.item_key);
                                        return (
                                            <GridCell
                                                key={cadence.item_key}
                                                variant={variant}
                                                cadence={cadence}
                                                rateRow={rateMap.get(key)}
                                                orgDefaultRow={orgOnlyMap.get(key)}
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
        </div>
    );
}

// ─── VariantBulkBuilder ─────────────────────────────────────────────────────────

function VariantBulkBuilder({ offering, variants, rates, onAddVariants, onUpdateVariant, onDeleteVariant }: {
    offering: ProgramOffering;
    variants: ProgramOfferingVariant[];
    rates: TuitionRateRow[];
    onAddVariants: (items: { quantity_type: QuantityType; quantity_value: number; label: string }[]) => Promise<void>;
    onUpdateVariant: (id: string, fields: { label?: string | null; status?: VariantStatus }) => Promise<void>;
    onDeleteVariant: (id: string) => Promise<void>;
}) {
    const noQuantity = NO_QUANTITY_ATTENDANCE_TYPES.has(offering.attendance_type);
    const [quantityType, setQuantityType] = useState<QuantityType>("days");
    const [selectedCounts, setSelectedCounts] = useState<Set<number>>(new Set());
    const [customCount, setCustomCount] = useState("");
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState("");
    const [editStatus, setEditStatus] = useState<VariantStatus>("active");
    const [savingEdit, setSavingEdit] = useState(false);

    const presets = BULK_PRESETS[quantityType] ?? [];
    function countExists(count: number) { return variants.some((v) => v.quantity_type === quantityType && Number(v.quantity_value) === count); }
    function toggleCount(count: number) { setSelectedCounts((p) => { const n = new Set(p); if (n.has(count)) n.delete(count); else n.add(count); return n; }); }
    function addCustomCount() { const n = parseFloat(customCount); if (!n || n <= 0) return; setSelectedCounts((p) => new Set([...p, n])); setCustomCount(""); }

    const newCounts = Array.from(selectedCounts).sort((a, b) => a - b).filter((n) => !countExists(n));

    async function handleBulkAdd() {
        if (!newCounts.length) return;
        setAdding(true);
        await onAddVariants(newCounts.map((count) => ({ quantity_type: quantityType, quantity_value: count, label: autoVariantLabel(count, quantityType) })));
        setSelectedCounts(new Set());
        setAdding(false);
    }

    function startEdit(v: ProgramOfferingVariant) { setEditingId(v.id); setEditLabel(v.label ?? describeVariant(v)); setEditStatus(v.status); }

    async function saveEdit() {
        if (!editingId) return;
        setSavingEdit(true);
        await onUpdateVariant(editingId, { label: editLabel.trim() || null, status: editStatus });
        setSavingEdit(false);
        setEditingId(null);
    }

    function hasRates(id: string) { return rates.some((r) => r.variant_id === id); }

    const sorted = sortVariants(variants);

    return (
        <div className="space-y-4">
            {sorted.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-alloy-stone/20">
                    {sorted.map((v, i) =>
                        editingId === v.id ? (
                            <div key={v.id} className="px-3 py-3 bg-alloy-pine/5 border-b border-alloy-stone/15 space-y-2">
                                <div className="flex flex-wrap gap-2 items-end">
                                    <label className="flex flex-col gap-0.5 flex-1 min-w-[140px]">
                                        <span className="text-[10px] text-alloy-midnight/45">Label</span>
                                        <input type="text" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(); }} className={inputCls} autoFocus />
                                    </label>
                                    <label className="flex flex-col gap-0.5">
                                        <span className="text-[10px] text-alloy-midnight/45">Status</span>
                                        <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as VariantStatus)} className={inputCls}>
                                            {Object.entries(OFFERING_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                                        </select>
                                    </label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => void saveEdit()} disabled={savingEdit} className="rounded border border-alloy-pine/30 bg-alloy-pine/8 px-3 py-1 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/12 disabled:opacity-50">{savingEdit ? "Saving…" : "Save"}</button>
                                    <button type="button" onClick={() => setEditingId(null)} className="text-xs text-alloy-midnight/40 hover:text-alloy-midnight">Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div key={v.id} className={`flex items-center gap-3 px-3 py-2.5 group ${i < sorted.length - 1 ? "border-b border-alloy-stone/10" : ""}`}>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-alloy-midnight truncate">
                                        {isDefaultVariant(v) ? <span className="text-alloy-midnight/40 italic">Default</span> : describeVariant(v)}
                                    </p>
                                    {v.status !== "active" && <p className="text-[10px] text-alloy-midnight/30 capitalize">{v.status}</p>}
                                </div>
                                {!isDefaultVariant(v) && (
                                    <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button type="button" onClick={() => startEdit(v)} className="text-xs text-alloy-midnight/35 hover:text-alloy-pine px-1">Edit</button>
                                        <button type="button" onClick={() => void onDeleteVariant(v.id)} className="text-alloy-midnight/20 hover:text-red-400 text-xs px-1" title={hasRates(v.id) ? "Has rates — will archive" : "Remove"}>×</button>
                                    </div>
                                )}
                            </div>
                        ),
                    )}
                </div>
            )}

            {!noQuantity && (
                <div className="space-y-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">Add variants</p>
                    <div className="flex gap-2 items-end flex-wrap">
                        <label className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-alloy-midnight/45">Unit</span>
                            <select value={quantityType} onChange={(e) => { setQuantityType(e.target.value as QuantityType); setSelectedCounts(new Set()); }} className={inputCls}>
                                {QUANTITY_OPTIONS.map((q) => <option key={q} value={q}>{QUANTITY_TYPE_LABELS[q]}</option>)}
                            </select>
                        </label>
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {presets.map((count) => {
                            const exists = countExists(count);
                            const selected = selectedCounts.has(count);
                            return (
                                <button key={count} type="button" disabled={exists} onClick={() => toggleCount(count)}
                                    className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${exists ? "border-alloy-stone/15 bg-alloy-stone/8 text-alloy-midnight/20 cursor-not-allowed line-through" : selected ? "border-alloy-pine bg-alloy-pine text-white" : "border-alloy-stone/30 bg-white text-alloy-midnight/55 hover:border-alloy-pine/50 hover:text-alloy-pine"}`}
                                >
                                    {count}
                                </button>
                            );
                        })}
                        <div className="flex items-center gap-1">
                            <input type="number" min="1" step="0.5" value={customCount} onChange={(e) => setCustomCount(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCustomCount(); }} placeholder="Other" className={`${inputCls} w-16 text-center`} />
                            <button type="button" onClick={addCustomCount} className="text-xs text-alloy-midnight/40 hover:text-alloy-pine">+</button>
                        </div>
                    </div>
                    {newCounts.length > 0 && (
                        <div className="rounded-lg bg-alloy-stone/8 border border-alloy-stone/15 px-3 py-2.5 space-y-2">
                            <p className="text-[10px] font-medium text-alloy-midnight/40 uppercase tracking-wide">Will add {newCounts.length} variant{newCounts.length !== 1 ? "s" : ""}</p>
                            <div className="flex flex-wrap gap-1.5">
                                {newCounts.map((count) => (
                                    <span key={count} className="text-xs text-alloy-midnight/60 bg-white rounded border border-alloy-stone/20 px-2 py-0.5">{autoVariantLabel(count, quantityType)}</span>
                                ))}
                            </div>
                            <button type="button" disabled={adding} onClick={() => void handleBulkAdd()} className="rounded border border-alloy-pine/30 bg-alloy-pine/8 px-3 py-1.5 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/12 disabled:opacity-50">
                                {adding ? "Adding…" : `Add ${newCounts.length} variant${newCounts.length !== 1 ? "s" : ""}`}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── OfferingGroup ──────────────────────────────────────────────────────────────
// Collapsed by default — expand to manage variants.

function OfferingGroup({ offering, variants, rates, onAddVariants, onUpdateVariant, onDeleteVariant, onEdit, onDelete }: {
    offering: ProgramOffering;
    variants: ProgramOfferingVariant[];
    rates: TuitionRateRow[];
    onAddVariants: (items: { quantity_type: QuantityType; quantity_value: number; label: string }[]) => Promise<void>;
    onUpdateVariant: (id: string, fields: { label?: string | null; status?: VariantStatus }) => Promise<void>;
    onDeleteVariant: (id: string) => Promise<void>;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const variantCount = variants.filter((v) => v.is_active).length;

    return (
        <div className="border border-alloy-stone/20 rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-alloy-stone/5 group">
                <button type="button" onClick={() => setExpanded((v) => !v)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <span className={`text-alloy-midnight/30 text-xs transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
                    <span className="text-sm font-medium text-alloy-midnight">{offering.label}</span>
                    <span className="text-xs text-alloy-midnight/35">{ATTENDANCE_TYPE_LABELS[offering.attendance_type]}</span>
                    <span className="text-xs text-alloy-midnight/25">{variantCount} variant{variantCount !== 1 ? "s" : ""}</span>
                    {offering.status !== "active" && <span className="text-[10px] text-alloy-midnight/25 capitalize">{offering.status}</span>}
                </button>
                <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={onEdit} className="text-xs text-alloy-midnight/35 hover:text-alloy-pine">Edit</button>
                    <button type="button" onClick={onDelete} className="text-alloy-midnight/20 hover:text-red-400 text-xs">×</button>
                </div>
            </div>
            {expanded && (
                <div className="px-4 pb-4 pt-3">
                    <VariantBulkBuilder
                        offering={offering}
                        variants={variants}
                        rates={rates}
                        onAddVariants={onAddVariants}
                        onUpdateVariant={onUpdateVariant}
                        onDeleteVariant={onDeleteVariant}
                    />
                </div>
            )}
        </div>
    );
}

// ─── ProgramsPanel ─────────────────────────────────────────────────────────────

function ProgramsPanel({ program, locations, categories, offerings, variants, rates, onToggleSite, onAddOffering, onUpdateOffering, onDeleteOffering, onAddVariants, onUpdateVariant, onDeleteVariant }: {
    program: ProgramEntry;
    locations: SiteLocation[];
    categories: LocationProgramCategoryRow[];
    offerings: ProgramOffering[];
    variants: ProgramOfferingVariant[];
    rates: TuitionRateRow[];
    onToggleSite: (siteId: string) => Promise<void>;
    onAddOffering: (fields: { attendance_type: AttendanceType; label: string }) => Promise<void>;
    onUpdateOffering: (id: string, fields: { label?: string; status?: OfferingStatus }) => Promise<void>;
    onDeleteOffering: (id: string) => Promise<void>;
    onAddVariants: (offeringId: string, items: { quantity_type: QuantityType; quantity_value: number; label: string }[]) => Promise<void>;
    onUpdateVariant: (offeringId: string, variantId: string, fields: { label?: string | null; status?: VariantStatus }) => Promise<void>;
    onDeleteVariant: (offeringId: string, variantId: string) => Promise<void>;
}) {
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [locExpanded, setLocExpanded] = useState(false);
    const [addAttType, setAddAttType] = useState<AttendanceType>("full_time");
    const [addLabel, setAddLabel] = useState("");
    const [addingOffering, setAddingOffering] = useState(false);
    const [editingOfferingId, setEditingOfferingId] = useState<string | null>(null);
    const [editOfferingLabel, setEditOfferingLabel] = useState("");
    const [editOfferingStatus, setEditOfferingStatus] = useState<OfferingStatus>("active");
    const [savingOffering, setSavingOffering] = useState(false);

    const programCats = categories.filter((c) => c.key === program.key);
    const variantsByOffering = groupVariantsByOffering(variants);
    const existingTypes = new Set(offerings.map((o) => o.attendance_type));

    function siteActive(siteId: string) { return programCats.find((c) => c.location_id === siteId)?.is_active !== false; }
    async function handleToggle(siteId: string) { setTogglingId(siteId); await onToggleSite(siteId); setTogglingId(null); }

    async function handleAddOffering() {
        const label = addLabel.trim() || ATTENDANCE_TYPE_LABELS[addAttType];
        setAddingOffering(true);
        await onAddOffering({ attendance_type: addAttType, label });
        setAddLabel("");
        setAddingOffering(false);
    }

    function startEditOffering(o: ProgramOffering) { setEditingOfferingId(o.id); setEditOfferingLabel(o.label); setEditOfferingStatus(o.status); }

    async function saveOfferingEdit() {
        if (!editingOfferingId) return;
        setSavingOffering(true);
        await onUpdateOffering(editingOfferingId, { label: editOfferingLabel.trim(), status: editOfferingStatus });
        setSavingOffering(false);
        setEditingOfferingId(null);
    }

    const offeredCount = locations.filter((l) => siteActive(l.id)).length;

    return (
        <div className="flex flex-col min-h-0 overflow-y-auto">
            <div className="p-6 space-y-5">
                <h2 className="config-typo-workspace-title text-xl">{program.label}</h2>

                <ConfigurationDetailCard title="Offerings">
                    <div className="space-y-3">
                        {offerings.map((o) =>
                            editingOfferingId === o.id ? (
                                <div key={o.id} className="border border-alloy-pine/30 rounded-lg px-4 py-3 bg-alloy-pine/5 space-y-2.5">
                                    <div className="flex flex-wrap gap-2 items-end">
                                        <label className="flex flex-col gap-0.5 flex-1 min-w-[140px]">
                                            <span className="text-[10px] text-alloy-midnight/45">Label</span>
                                            <input type="text" value={editOfferingLabel} onChange={(e) => setEditOfferingLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void saveOfferingEdit(); }} className={inputCls} autoFocus />
                                        </label>
                                        <label className="flex flex-col gap-0.5">
                                            <span className="text-[10px] text-alloy-midnight/45">Status</span>
                                            <select value={editOfferingStatus} onChange={(e) => setEditOfferingStatus(e.target.value as OfferingStatus)} className={inputCls}>
                                                {Object.entries(OFFERING_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                                            </select>
                                        </label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => void saveOfferingEdit()} disabled={savingOffering || !editOfferingLabel.trim()} className="rounded border border-alloy-pine/30 bg-alloy-pine/8 px-3 py-1 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/12 disabled:opacity-50">{savingOffering ? "Saving…" : "Save"}</button>
                                        <button type="button" onClick={() => setEditingOfferingId(null)} className="text-xs text-alloy-midnight/40 hover:text-alloy-midnight">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <OfferingGroup
                                    key={o.id}
                                    offering={o}
                                    variants={variantsByOffering.get(o.id) ?? []}
                                    rates={rates}
                                    onAddVariants={(items) => onAddVariants(o.id, items)}
                                    onUpdateVariant={(variantId, fields) => onUpdateVariant(o.id, variantId, fields)}
                                    onDeleteVariant={(variantId) => onDeleteVariant(o.id, variantId)}
                                    onEdit={() => startEditOffering(o)}
                                    onDelete={() => onDeleteOffering(o.id)}
                                />
                            ),
                        )}

                        {offerings.length === 0 && <p className="text-sm text-alloy-midnight/40">No offerings yet. Add one below.</p>}

                        <div className="pt-2 border-t border-alloy-stone/15 space-y-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">Add offering type</p>
                            <div className="flex flex-wrap gap-2 items-end">
                                <label className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-alloy-midnight/45">Type</span>
                                    <select value={addAttType} onChange={(e) => { const t = e.target.value as AttendanceType; setAddAttType(t); if (!addLabel) setAddLabel(ATTENDANCE_TYPE_LABELS[t]); }} className={inputCls}>
                                        {ATTENDANCE_OPTIONS.map((t) => <option key={t} value={t} disabled={existingTypes.has(t)}>{ATTENDANCE_TYPE_LABELS[t]}{existingTypes.has(t) ? " ✓" : ""}</option>)}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
                                    <span className="text-[10px] text-alloy-midnight/45">Label</span>
                                    <input type="text" value={addLabel} placeholder={ATTENDANCE_TYPE_LABELS[addAttType]} onChange={(e) => setAddLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void handleAddOffering(); }} className={inputCls} />
                                </label>
                                <button type="button" disabled={addingOffering || existingTypes.has(addAttType)} onClick={() => void handleAddOffering()} className="rounded border border-alloy-pine/30 bg-alloy-pine/8 px-3 py-1.5 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/12 disabled:opacity-50">
                                    {addingOffering ? "Adding…" : "Add"}
                                </button>
                            </div>
                        </div>
                    </div>
                </ConfigurationDetailCard>

                {/* Location availability — compact summary, expandable */}
                <div className="flex items-center justify-between rounded-lg border border-alloy-stone/20 px-4 py-2.5">
                    {locations.length === 0 ? (
                        <span className="text-xs text-alloy-midnight/40">No site locations. <Link href="/settings/locations" className="text-alloy-pine hover:underline">Add locations →</Link></span>
                    ) : (
                        <>
                            <span className="text-xs text-alloy-midnight/55">
                                Offered at <strong className="text-alloy-midnight">{offeredCount}</strong> of <strong className="text-alloy-midnight">{locations.length}</strong> site{locations.length !== 1 ? "s" : ""}
                            </span>
                            <button type="button" onClick={() => setLocExpanded((v) => !v)} className="text-xs text-alloy-pine hover:underline shrink-0 ml-4">
                                {locExpanded ? "Collapse" : "Configure →"}
                            </button>
                        </>
                    )}
                </div>
                {locExpanded && locations.length > 0 && (
                    <div className="rounded-lg border border-alloy-stone/20 overflow-hidden -mt-3">
                        {locations.map((site) => {
                            const active = siteActive(site.id);
                            const toggling = togglingId === site.id;
                            return (
                                <div key={site.id} className="flex items-center justify-between gap-3 border-b border-alloy-stone/10 last:border-0 px-4 py-2.5">
                                    <span className="text-sm text-alloy-midnight">{site.name}</span>
                                    <button type="button" disabled={toggling} onClick={() => void handleToggle(site.id)} className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-alloy-stone/20 text-alloy-midnight/40 hover:bg-alloy-stone/35"}`}>
                                        {toggling ? "…" : active ? "Offered" : "Not offered"}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── TuitionPanel ──────────────────────────────────────────────────────────────

function TuitionPanel({ program, offerings, variantsByOffering, cadences, locations, selectedScopeId, onScopeChange, payerTab, onPayerTabChange, rateMap, orgOnlyMap, locationId, onSave, onClear, onCopyOrgToLocation, bulkCopying }: {
    program: ProgramEntry;
    offerings: ProgramOffering[];
    variantsByOffering: Map<string, ProgramOfferingVariant[]>;
    cadences: BillingCadence[];
    locations: SiteLocation[];
    selectedScopeId: string | null;
    onScopeChange: (id: string | null) => void;
    payerTab: PayerTab;
    onPayerTabChange: (t: PayerTab) => void;
    rateMap: Map<string, TuitionRateRow>;
    orgOnlyMap: Map<string, TuitionRateRow>;
    locationId: string | null;
    onSave: OnSave;
    onClear: (id: string) => Promise<void>;
    onCopyOrgToLocation: (locId: string) => Promise<void>;
    bulkCopying: boolean;
}) {
    const selectedLocName = locations.find((l) => l.id === selectedScopeId)?.name ?? "Location";
    return (
        <div className="flex flex-col min-h-0 overflow-y-auto">
            <div className="p-6 space-y-5">
                <h2 className="config-typo-workspace-title text-xl">{program.label}</h2>

                {/* Scope selector */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-alloy-midnight/45 shrink-0">Viewing:</span>
                    <button type="button" onClick={() => onScopeChange(null)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${selectedScopeId === null ? "bg-alloy-midnight text-white border-alloy-midnight" : "bg-white text-alloy-midnight/55 border-alloy-stone/30 hover:border-alloy-midnight/35"}`}>Org defaults</button>
                    {locations.map((loc) => (
                        <button key={loc.id} type="button" onClick={() => onScopeChange(loc.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${selectedScopeId === loc.id ? "bg-alloy-pine text-white border-alloy-pine" : "bg-white text-alloy-midnight/55 border-alloy-stone/30 hover:border-alloy-pine/35"}`}>{loc.name}</button>
                    ))}
                </div>

                {selectedScopeId && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-alloy-stone/25 bg-alloy-stone/8 px-4 py-2.5">
                        <p className="text-xs text-alloy-midnight/55">
                            <strong className="font-medium text-alloy-midnight">{selectedLocName}</strong> — <span className="inline-flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-alloy-pine/70" /> green dot = override.</span> Italic = inherited.
                        </p>
                        <button type="button" disabled={bulkCopying} onClick={() => void onCopyOrgToLocation(selectedScopeId)} className="shrink-0 text-xs font-medium text-alloy-pine hover:underline disabled:opacity-50">
                            {bulkCopying ? "Copying…" : "Copy org rates →"}
                        </button>
                    </div>
                )}

                {/* Payer tabs */}
                <div className="flex border-b border-alloy-stone/20">
                    {PAYER_TABS.map((tab) => (
                        <button key={tab.key} type="button" disabled={!tab.available} onClick={() => { if (tab.available) onPayerTabChange(tab.key); }} className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${payerTab === tab.key ? "border-alloy-pine text-alloy-pine font-medium" : tab.available ? "border-transparent text-alloy-midnight/50 hover:text-alloy-midnight" : "border-transparent text-alloy-midnight/25 cursor-not-allowed"}`}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* One grid per offering */}
                {offerings.length === 0 ? (
                    <p className="py-8 text-center text-sm text-alloy-midnight/40">No offerings configured. Add offerings in the Programs tab.</p>
                ) : (
                    <div className="space-y-4">
                        {offerings.map((o) => (
                            <OfferingRateGrid
                                key={o.id}
                                offering={o}
                                variants={variantsByOffering.get(o.id) ?? []}
                                cadences={cadences}
                                rateMap={rateMap}
                                orgOnlyMap={orgOnlyMap}
                                locationId={locationId}
                                onSave={onSave}
                                onClear={onClear}
                            />
                        ))}
                        <p className="text-xs text-alloy-midnight/30 pt-1">Click any cell to set a rate. Hover to mark N/A. Effective dates (optional) appear in the rate editor.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── AddProgramForm ────────────────────────────────────────────────────────────

function AddProgramForm({ onAdd }: { onAdd: (label: string, key: string) => Promise<void> }) {
    const [label, setLabel] = useState("");
    const [adding, setAdding] = useState(false);

    async function handleAdd() {
        const l = label.trim();
        if (!l) return;
        setAdding(true);
        await onAdd(l, slugifyLocationProgramCategoryKey(l));
        setLabel("");
        setAdding(false);
    }

    return (
        <div className="border-t border-alloy-stone/15 px-4 pt-3 pb-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">Add program</p>
            <div className="flex items-end gap-2">
                <label className="flex flex-col gap-0.5 min-w-[160px] flex-1">
                    <span className="text-[10px] text-alloy-midnight/40">Name</span>
                    <input type="text" value={label} placeholder="e.g. Summer Camp" disabled={adding} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }} className={inputCls} />
                </label>
                <button type="button" disabled={adding || !label.trim()} onClick={() => void handleAdd()} className="rounded border border-alloy-pine/30 bg-alloy-pine/8 px-3 py-1.5 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/12 disabled:opacity-50">
                    {adding ? "Adding…" : "Add"}
                </button>
            </div>
        </div>
    );
}

// ─── Fees & Add-ons shared helpers ─────────────────────────────────────────────

function ScopeBadge({ locationId, programKey, locations }: { locationId: string | null; programKey: string | null; locations: { id: string; name: string }[] }) {
    const label = formatScope(locationId, programKey, locations);
    return (
        <span className="text-[10px] text-alloy-midnight/40 bg-alloy-stone/10 rounded px-1.5 py-0.5 whitespace-nowrap">
            {label}
        </span>
    );
}

function FreqBadge({ cadenceKey }: { cadenceKey: string | null }) {
    return (
        <span className="text-[10px] text-alloy-pine/70 bg-alloy-pine/6 rounded px-1.5 py-0.5 whitespace-nowrap font-medium">
            {frequencyLabel(cadenceKey)}
        </span>
    );
}

function CommercialCard({ children, onClick, editing }: { children: React.ReactNode; onClick?: () => void; editing?: boolean }) {
    return (
        <div
            className={[
                "group rounded-lg border px-4 py-3 transition-all",
                editing ? "border-alloy-pine/40 bg-alloy-pine/3 shadow-sm" : "border-alloy-stone/20 bg-white hover:border-alloy-stone/35 hover:shadow-xs",
                onClick && !editing ? "cursor-pointer" : "",
            ].join(" ")}
            onClick={editing ? undefined : onClick}
        >
            {children}
        </div>
    );
}

// Shared text input styled consistently
function CField({ label, value, onChange, placeholder, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean }) {
    return (
        <label className="block">
            <span className="text-[10px] font-medium text-alloy-midnight/45 uppercase tracking-wide">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</span>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight placeholder:text-alloy-midnight/25 focus:border-alloy-pine/50 focus:outline-none"
            />
        </label>
    );
}

// Datalist-backed freeform select (suggestions, not enforced)
function CSuggest({ label, value, onChange, suggestions, placeholder }: { label: string; value: string; onChange: (v: string) => void; suggestions: string[]; placeholder?: string }) {
    const id = `suggest-${label.replace(/\s/g, "-").toLowerCase()}`;
    return (
        <label className="block">
            <span className="text-[10px] font-medium text-alloy-midnight/45 uppercase tracking-wide">{label}</span>
            <input
                list={id}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder ?? "Type or choose…"}
                className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight placeholder:text-alloy-midnight/25 focus:border-alloy-pine/50 focus:outline-none"
            />
            <datalist id={id}>
                {suggestions.map(s => <option key={s} value={s} />)}
            </datalist>
        </label>
    );
}

function CSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { key: string; label: string }[] }) {
    return (
        <label className="block">
            <span className="text-[10px] font-medium text-alloy-midnight/45 uppercase tracking-wide">{label}</span>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight focus:border-alloy-pine/50 focus:outline-none bg-white"
            >
                {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
        </label>
    );
}

function CToggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
    return (
        <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
                onClick={() => onChange(!checked)}
                className={`w-7 h-4 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-alloy-pine" : "bg-alloy-stone/30"}`}
            >
                <div className={`w-3 h-3 rounded-full bg-white shadow-sm mt-0.5 transition-transform ${checked ? "translate-x-3.5" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm text-alloy-midnight/70">{label}</span>
            {hint && <span className="text-[10px] text-alloy-midnight/35">{hint}</span>}
        </label>
    );
}

function ScopeFields({ locationId, setLocationId, programKey, setProgramKey, locations, programs }: {
    locationId: string; setLocationId: (v: string) => void;
    programKey: string; setProgramKey: (v: string) => void;
    locations: { id: string; name: string }[];
    programs: { key: string; label: string }[];
}) {
    return (
        <div className="grid grid-cols-2 gap-3">
            <label className="block">
                <span className="text-[10px] font-medium text-alloy-midnight/45 uppercase tracking-wide">Location scope</span>
                <select value={locationId} onChange={e => setLocationId(e.target.value)} className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight focus:border-alloy-pine/50 focus:outline-none bg-white">
                    <option value="">All locations (org default)</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
            </label>
            <label className="block">
                <span className="text-[10px] font-medium text-alloy-midnight/45 uppercase tracking-wide">Program scope</span>
                <select value={programKey} onChange={e => setProgramKey(e.target.value)} className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight focus:border-alloy-pine/50 focus:outline-none bg-white">
                    <option value="">All programs</option>
                    {programs.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
            </label>
        </div>
    );
}

function EffectiveDateFields({ start, end, onStart, onEnd }: { start: string; end: string; onStart: (v: string) => void; onEnd: (v: string) => void }) {
    return (
        <div className="grid grid-cols-2 gap-3">
            <CField label="Effective from" value={start} onChange={onStart} type="date" />
            <CField label="Ends on (optional)" value={end} onChange={onEnd} type="date" />
        </div>
    );
}

function SectionHeader({ title, count, onAdd, adding }: { title: string; count: number; onAdd: () => void; adding: boolean }) {
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-alloy-midnight">{title}</h3>
                {count > 0 && <span className="text-[10px] text-alloy-midnight/35 bg-alloy-stone/10 rounded-full px-1.5 py-0.5">{count}</span>}
            </div>
            {!adding && (
                <button type="button" onClick={onAdd} className="flex items-center gap-1 text-xs text-alloy-pine/75 hover:text-alloy-pine transition-colors font-medium">
                    <span className="text-sm leading-none">+</span> Add
                </button>
            )}
        </div>
    );
}

function EmptySlate({ label, onAdd }: { label: string; onAdd: () => void }) {
    return (
        <div className="rounded-lg border border-dashed border-alloy-stone/25 px-4 py-6 text-center">
            <p className="text-sm text-alloy-midnight/35 mb-2">{label}</p>
            <button type="button" onClick={onAdd} className="text-xs text-alloy-pine/70 hover:text-alloy-pine font-medium transition-colors">
                + Add one
            </button>
        </div>
    );
}

function SaveBar({ onSave, onCancel, saving, disabled }: { onSave: () => void; onCancel: () => void; saving: boolean; disabled?: boolean }) {
    return (
        <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} className="text-xs text-alloy-midnight/45 hover:text-alloy-midnight transition-colors px-2 py-1">Cancel</button>
            <button type="button" onClick={onSave} disabled={saving || disabled} className="rounded bg-alloy-pine px-3 py-1 text-xs font-medium text-white hover:bg-alloy-pine/85 disabled:opacity-40 transition-colors">
                {saving ? "Saving…" : "Save"}
            </button>
        </div>
    );
}

// ─── FeesAddonsPanel ───────────────────────────────────────────────────────────

function FeesAddonsPanel({
    fees,
    addons,
    deposits,
    locations,
    programs,
    loading,
    onFeeCreated,
    onFeeUpdated,
    onFeeDeleted,
    onAddonCreated,
    onAddonUpdated,
    onAddonDeleted,
    onDepositCreated,
    onDepositUpdated,
    onDepositDeleted,
}: {
    fees: CommercialFee[];
    addons: CommercialAddon[];
    deposits: CommercialDeposit[];
    locations: { id: string; name: string }[];
    programs: { key: string; label: string; siteCount: number }[];
    loading: boolean;
    onFeeCreated: (f: CommercialFee) => void;
    onFeeUpdated: (f: CommercialFee) => void;
    onFeeDeleted: (id: string) => void;
    onAddonCreated: (a: CommercialAddon) => void;
    onAddonUpdated: (a: CommercialAddon) => void;
    onAddonDeleted: (id: string) => void;
    onDepositCreated: (d: CommercialDeposit) => void;
    onDepositUpdated: (d: CommercialDeposit) => void;
    onDepositDeleted: (id: string) => void;
}) {
    // ── Fee form ──────────────────────────────────────────────────────────────────
    const [addingFee, setAddingFee] = useState(false);
    const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
    const [feeName, setFeeName] = useState("");
    const [feeCategory, setFeeCategory] = useState("");
    const [feeAmount, setFeeAmount] = useState("");
    const [feeCadenceKey, setFeeCadenceKey] = useState("");
    const [feeRequired, setFeeRequired] = useState(true);
    const [feeLocationId, setFeeLocationId] = useState("");
    const [feeProgramKey, setFeeProgramKey] = useState("");
    const [feeEffStart, setFeeEffStart] = useState("");
    const [feeEffEnd, setFeeEffEnd] = useState("");
    const [feeRevCat, setFeeRevCat] = useState("");
    const [savingFee, setSavingFee] = useState(false);

    function resetFeeForm() {
        setFeeName(""); setFeeCategory(""); setFeeAmount(""); setFeeCadenceKey("");
        setFeeRequired(true); setFeeLocationId(""); setFeeProgramKey("");
        setFeeEffStart(""); setFeeEffEnd(""); setFeeRevCat("");
    }
    function startAddFee() { resetFeeForm(); setEditingFeeId(null); setAddingFee(true); }
    function startEditFee(f: CommercialFee) {
        setEditingFeeId(f.id);
        setFeeName(f.name); setFeeCategory(f.fee_type); setFeeAmount(String(f.amount_cents / 100));
        setFeeCadenceKey(f.cadence_key ?? ""); setFeeRequired(f.is_required);
        setFeeLocationId(f.location_id ?? ""); setFeeProgramKey(f.program_key ?? "");
        setFeeEffStart(f.effective_start ?? ""); setFeeEffEnd(f.effective_end ?? "");
        setFeeRevCat(f.revenue_category ?? "");
        setAddingFee(false);
    }
    function cancelFee() { setAddingFee(false); setEditingFeeId(null); resetFeeForm(); }

    async function saveFee() {
        const cents = Math.round(parseFloat(feeAmount) * 100);
        if (!feeName.trim() || !feeCategory.trim() || !Number.isFinite(cents) || cents < 0) return;
        setSavingFee(true);
        const body = {
            name: feeName.trim(), fee_type: feeCategory.trim(), amount_cents: cents,
            is_required: feeRequired, cadence_key: feeCadenceKey || null,
            location_id: feeLocationId || null, program_key: feeProgramKey || null,
            effective_start: feeEffStart || null, effective_end: feeEffEnd || null,
            revenue_category: feeRevCat.trim() || null,
        };
        try {
            if (editingFeeId) {
                const res = await fetch(`/api/admin/commercial/fees/${editingFeeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                const j = (await res.json()) as { fee?: CommercialFee };
                if (j.fee) { onFeeUpdated(j.fee); cancelFee(); }
            } else {
                const res = await fetch("/api/admin/commercial/fees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                const j = (await res.json()) as { fee?: CommercialFee };
                if (j.fee) { onFeeCreated(j.fee); cancelFee(); }
            }
        } finally { setSavingFee(false); }
    }

    async function deleteFee(id: string) {
        await fetch(`/api/admin/commercial/fees/${id}`, { method: "DELETE" });
        onFeeDeleted(id);
    }

    // ── Addon form ────────────────────────────────────────────────────────────────
    const [addingAddon, setAddingAddon] = useState(false);
    const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
    const [addonName, setAddonName] = useState("");
    const [addonCategory, setAddonCategory] = useState("");
    const [addonAmount, setAddonAmount] = useState("");
    const [addonCadenceKey, setAddonCadenceKey] = useState("monthly");
    const [addonLocationId, setAddonLocationId] = useState("");
    const [addonProgramKey, setAddonProgramKey] = useState("");
    const [addonEffStart, setAddonEffStart] = useState("");
    const [addonEffEnd, setAddonEffEnd] = useState("");
    const [addonRevCat, setAddonRevCat] = useState("");
    const [addonPkgCount, setAddonPkgCount] = useState("");
    const [addonPkgUnit, setAddonPkgUnit] = useState("uses");
    const [addonPkgExpiry, setAddonPkgExpiry] = useState("");
    const [addonIsPackage, setAddonIsPackage] = useState(false);
    const [savingAddon, setSavingAddon] = useState(false);

    function resetAddonForm() {
        setAddonName(""); setAddonCategory(""); setAddonAmount(""); setAddonCadenceKey("monthly");
        setAddonLocationId(""); setAddonProgramKey("");
        setAddonEffStart(""); setAddonEffEnd(""); setAddonRevCat("");
        setAddonPkgCount(""); setAddonPkgUnit("uses"); setAddonPkgExpiry(""); setAddonIsPackage(false);
    }
    function startAddAddon() { resetAddonForm(); setEditingAddonId(null); setAddingAddon(true); }
    function startEditAddon(a: CommercialAddon) {
        setEditingAddonId(a.id);
        setAddonName(a.name); setAddonCategory(a.addon_type); setAddonAmount(String(a.amount_cents / 100));
        setAddonCadenceKey(a.cadence_key); setAddonLocationId(a.location_id ?? ""); setAddonProgramKey(a.program_key ?? "");
        setAddonEffStart(a.effective_start ?? ""); setAddonEffEnd(a.effective_end ?? "");
        setAddonRevCat(a.revenue_category ?? "");
        const isPkg = isPackageAddon(a);
        setAddonIsPackage(isPkg);
        setAddonPkgCount(a.package_unit_count != null ? String(a.package_unit_count) : "");
        setAddonPkgUnit(a.package_unit_type ?? "uses");
        setAddonPkgExpiry(a.package_expires_days != null ? String(a.package_expires_days) : "");
        setAddingAddon(false);
    }
    function cancelAddon() { setAddingAddon(false); setEditingAddonId(null); resetAddonForm(); }

    async function saveAddon() {
        const cents = Math.round(parseFloat(addonAmount) * 100);
        if (!addonName.trim() || !addonCategory.trim() || !addonCadenceKey || !Number.isFinite(cents) || cents < 0) return;
        setSavingAddon(true);
        const body = {
            name: addonName.trim(), addon_type: addonCategory.trim(), amount_cents: cents,
            cadence_key: addonCadenceKey,
            location_id: addonLocationId || null, program_key: addonProgramKey || null,
            effective_start: addonEffStart || null, effective_end: addonEffEnd || null,
            revenue_category: addonRevCat.trim() || null,
            package_unit_count: addonIsPackage && addonPkgCount ? parseInt(addonPkgCount, 10) : null,
            package_unit_type: addonIsPackage && addonPkgUnit ? addonPkgUnit : null,
            package_expires_days: addonIsPackage && addonPkgExpiry ? parseInt(addonPkgExpiry, 10) : null,
        };
        try {
            if (editingAddonId) {
                const res = await fetch(`/api/admin/commercial/addons/${editingAddonId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                const j = (await res.json()) as { addon?: CommercialAddon };
                if (j.addon) { onAddonUpdated(j.addon); cancelAddon(); }
            } else {
                const res = await fetch("/api/admin/commercial/addons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                const j = (await res.json()) as { addon?: CommercialAddon };
                if (j.addon) { onAddonCreated(j.addon); cancelAddon(); }
            }
        } finally { setSavingAddon(false); }
    }

    async function deleteAddon(id: string) {
        await fetch(`/api/admin/commercial/addons/${id}`, { method: "DELETE" });
        onAddonDeleted(id);
    }

    // ── Deposit form ──────────────────────────────────────────────────────────────
    const [addingDeposit, setAddingDeposit] = useState(false);
    const [editingDepositId, setEditingDepositId] = useState<string | null>(null);
    const [depositName, setDepositName] = useState("");
    const [depositAmount, setDepositAmount] = useState("");
    const [depositRefundable, setDepositRefundable] = useState(true);
    const [depositApplyToBalance, setDepositApplyToBalance] = useState(false);
    const [depositTiming, setDepositTiming] = useState("at_enrollment");
    const [depositLocationId, setDepositLocationId] = useState("");
    const [depositProgramKey, setDepositProgramKey] = useState("");
    const [depositEffStart, setDepositEffStart] = useState("");
    const [depositEffEnd, setDepositEffEnd] = useState("");
    const [depositRevCat, setDepositRevCat] = useState("");
    const [savingDeposit, setSavingDeposit] = useState(false);

    function resetDepositForm() {
        setDepositName(""); setDepositAmount(""); setDepositRefundable(true); setDepositApplyToBalance(false);
        setDepositTiming("at_enrollment"); setDepositLocationId(""); setDepositProgramKey("");
        setDepositEffStart(""); setDepositEffEnd(""); setDepositRevCat("");
    }
    function startAddDeposit() { resetDepositForm(); setEditingDepositId(null); setAddingDeposit(true); }
    function startEditDeposit(d: CommercialDeposit) {
        setEditingDepositId(d.id);
        setDepositName(d.name); setDepositAmount(String(d.amount_cents / 100));
        setDepositRefundable(d.is_refundable); setDepositApplyToBalance(d.apply_to_balance);
        setDepositTiming(d.due_timing); setDepositLocationId(d.location_id ?? ""); setDepositProgramKey(d.program_key ?? "");
        setDepositEffStart(d.effective_start ?? ""); setDepositEffEnd(d.effective_end ?? "");
        setDepositRevCat(d.revenue_category ?? "");
        setAddingDeposit(false);
    }
    function cancelDeposit() { setAddingDeposit(false); setEditingDepositId(null); resetDepositForm(); }

    async function saveDeposit() {
        const cents = Math.round(parseFloat(depositAmount) * 100);
        if (!depositName.trim() || !Number.isFinite(cents) || cents < 0) return;
        setSavingDeposit(true);
        const body = {
            name: depositName.trim(), amount_cents: cents,
            is_refundable: depositRefundable, apply_to_balance: depositApplyToBalance,
            due_timing: depositTiming || "at_enrollment",
            location_id: depositLocationId || null, program_key: depositProgramKey || null,
            effective_start: depositEffStart || null, effective_end: depositEffEnd || null,
            revenue_category: depositRevCat.trim() || null,
        };
        try {
            if (editingDepositId) {
                const res = await fetch(`/api/admin/commercial/deposits/${editingDepositId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                const j = (await res.json()) as { deposit?: CommercialDeposit };
                if (j.deposit) { onDepositUpdated(j.deposit); cancelDeposit(); }
            } else {
                const res = await fetch("/api/admin/commercial/deposits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                const j = (await res.json()) as { deposit?: CommercialDeposit };
                if (j.deposit) { onDepositCreated(j.deposit); cancelDeposit(); }
            }
        } finally { setSavingDeposit(false); }
    }

    async function deleteDeposit(id: string) {
        await fetch(`/api/admin/commercial/deposits/${id}`, { method: "DELETE" });
        onDepositDeleted(id);
    }

    // ── Fee form panel ────────────────────────────────────────────────────────────
    const feeFormValid = feeName.trim().length > 0 && feeCategory.trim().length > 0 && parseFloat(feeAmount) >= 0;
    const feeFormPanel = (
        <div className="rounded-lg border border-alloy-pine/30 bg-alloy-pine/3 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <CField label="Name *" value={feeName} onChange={setFeeName} placeholder="e.g. Registration Fee" required />
                <CSuggest label="Category *" value={feeCategory} onChange={setFeeCategory} suggestions={FEE_TYPE_SUGGESTIONS} />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <CField label="Amount ($) *" value={feeAmount} onChange={setFeeAmount} placeholder="0.00" type="text" />
                <CSelect label="Frequency" value={feeCadenceKey} onChange={setFeeCadenceKey} options={FREQUENCY_OPTIONS.map(o => ({ key: o.key, label: o.label }))} />
            </div>
            <div className="flex items-center gap-4">
                <CToggle label="Required" checked={feeRequired} onChange={setFeeRequired} hint="Applied to all enrollments automatically" />
            </div>
            <ScopeFields locationId={feeLocationId} setLocationId={setFeeLocationId} programKey={feeProgramKey} setProgramKey={setFeeProgramKey} locations={locations} programs={programs} />
            <EffectiveDateFields start={feeEffStart} end={feeEffEnd} onStart={setFeeEffStart} onEnd={setFeeEffEnd} />
            <CField label="Revenue category" value={feeRevCat} onChange={setFeeRevCat} placeholder="e.g. Program Revenue" />
            <SaveBar onSave={saveFee} onCancel={cancelFee} saving={savingFee} disabled={!feeFormValid} />
        </div>
    );

    // ── Addon form panel ──────────────────────────────────────────────────────────
    const addonFormValid = addonName.trim().length > 0 && addonCategory.trim().length > 0 && addonCadenceKey.length > 0 && parseFloat(addonAmount) >= 0;
    const addonFormPanel = (
        <div className="rounded-lg border border-alloy-pine/30 bg-alloy-pine/3 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <CField label="Name *" value={addonName} onChange={setAddonName} placeholder="e.g. Extended Care" required />
                <CSuggest label="Category *" value={addonCategory} onChange={setAddonCategory} suggestions={ADDON_TYPE_SUGGESTIONS} />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <CField label="Amount ($) *" value={addonAmount} onChange={setAddonAmount} placeholder="0.00" />
                <CSelect label="Frequency *" value={addonCadenceKey} onChange={setAddonCadenceKey} options={FREQUENCY_OPTIONS.filter(o => o.key !== "").map(o => ({ key: o.key, label: o.label }))} />
            </div>
            <CToggle label="This is a pass or package" checked={addonIsPackage} onChange={setAddonIsPackage} hint="e.g. 5 uses valid 30 days" />
            {addonIsPackage && (
                <div className="grid grid-cols-3 gap-3 pl-4 border-l-2 border-alloy-pine/20">
                    <CField label="Unit count" value={addonPkgCount} onChange={setAddonPkgCount} placeholder="5" type="number" />
                    <CSelect label="Unit type" value={addonPkgUnit} onChange={setAddonPkgUnit} options={PACKAGE_UNIT_TYPE_OPTIONS.map(u => ({ key: u, label: u }))} />
                    <CField label="Expires after (days)" value={addonPkgExpiry} onChange={setAddonPkgExpiry} placeholder="30" type="number" />
                </div>
            )}
            <ScopeFields locationId={addonLocationId} setLocationId={setAddonLocationId} programKey={addonProgramKey} setProgramKey={setAddonProgramKey} locations={locations} programs={programs} />
            <EffectiveDateFields start={addonEffStart} end={addonEffEnd} onStart={setAddonEffStart} onEnd={setAddonEffEnd} />
            <CField label="Revenue category" value={addonRevCat} onChange={setAddonRevCat} placeholder="e.g. Enrichment Revenue" />
            <SaveBar onSave={saveAddon} onCancel={cancelAddon} saving={savingAddon} disabled={!addonFormValid} />
        </div>
    );

    // ── Deposit form panel ────────────────────────────────────────────────────────
    const depositFormValid = depositName.trim().length > 0 && parseFloat(depositAmount) >= 0;
    const depositFormPanel = (
        <div className="rounded-lg border border-alloy-pine/30 bg-alloy-pine/3 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <CField label="Name *" value={depositName} onChange={setDepositName} placeholder="e.g. Enrollment Deposit" required />
                <CField label="Amount ($) *" value={depositAmount} onChange={setDepositAmount} placeholder="500.00" />
            </div>
            <CSuggest label="When is it due?" value={depositTiming} onChange={setDepositTiming} suggestions={DEPOSIT_TIMING_SUGGESTIONS} />
            <div className="flex items-center gap-6">
                <CToggle label="Refundable" checked={depositRefundable} onChange={setDepositRefundable} />
                <CToggle label="Apply to first balance" checked={depositApplyToBalance} onChange={setDepositApplyToBalance} hint="Credits toward first tuition charge" />
            </div>
            <ScopeFields locationId={depositLocationId} setLocationId={setDepositLocationId} programKey={depositProgramKey} setProgramKey={setDepositProgramKey} locations={locations} programs={programs} />
            <EffectiveDateFields start={depositEffStart} end={depositEffEnd} onStart={setDepositEffStart} onEnd={setDepositEffEnd} />
            <CField label="Revenue category" value={depositRevCat} onChange={setDepositRevCat} placeholder="e.g. Deposits Held" />
            <SaveBar onSave={saveDeposit} onCancel={cancelDeposit} saving={savingDeposit} disabled={!depositFormValid} />
        </div>
    );

    if (loading) {
        return <div className="flex items-center justify-center flex-1 text-sm text-alloy-midnight/35 py-16">Loading…</div>;
    }

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-6 py-8 space-y-10">

                {/* ── Fees ─────────────────────────────────────────────────────── */}
                <section className="space-y-3">
                    <SectionHeader title="Fees" count={fees.length} onAdd={startAddFee} adding={addingFee} />
                    <p className="text-xs text-alloy-midnight/40">Required or auto-triggered charges beyond tuition — registration, materials, annual fees.</p>

                    {addingFee && feeFormPanel}

                    {fees.length === 0 && !addingFee ? (
                        <EmptySlate label="No fees configured yet." onAdd={startAddFee} />
                    ) : (
                        <div className="space-y-2">
                            {fees.map(fee => (
                                <div key={fee.id}>
                                    {editingFeeId === fee.id ? feeFormPanel : (
                                        <CommercialCard onClick={() => startEditFee(fee)}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm font-medium text-alloy-midnight truncate">{fee.name}</span>
                                                        <span className="text-[10px] text-alloy-midnight/45 bg-alloy-stone/10 rounded px-1.5 py-0.5">{fee.fee_type}</span>
                                                        {fee.is_required && <span className="text-[10px] text-alloy-pine/70 font-medium">Required</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                        <span className="text-sm font-semibold text-alloy-midnight">
                                                            {fee.amount_cents === 0 ? "$0" : `$${(fee.amount_cents / 100).toLocaleString("en-US", { minimumFractionDigits: fee.amount_cents % 100 === 0 ? 0 : 2 })}`}
                                                        </span>
                                                        <FreqBadge cadenceKey={fee.cadence_key} />
                                                        <ScopeBadge locationId={fee.location_id} programKey={fee.program_key} locations={locations} />
                                                        {fee.revenue_category && <span className="text-[10px] text-alloy-midnight/35 italic">{fee.revenue_category}</span>}
                                                    </div>
                                                    {(fee.effective_start || fee.effective_end) && (
                                                        <p className="text-[10px] text-alloy-midnight/30 mt-0.5">
                                                            {fee.effective_start ? `From ${fee.effective_start}` : ""}
                                                            {fee.effective_end ? ` · Until ${fee.effective_end}` : ""}
                                                        </p>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={e => { e.stopPropagation(); void deleteFee(fee.id); }}
                                                    className="opacity-0 group-hover:opacity-100 text-[11px] text-alloy-midnight/25 hover:text-red-400 transition-all flex-shrink-0 px-1"
                                                    title="Delete fee"
                                                >✕</button>
                                            </div>
                                        </CommercialCard>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* ── Add-ons ───────────────────────────────────────────────────── */}
                <section className="space-y-3">
                    <SectionHeader title="Add-ons" count={addons.length} onAdd={startAddAddon} adding={addingAddon} />
                    <p className="text-xs text-alloy-midnight/40">Optional commercial products families can enroll in — extended care, enrichment, lunch, passes.</p>

                    {addingAddon && addonFormPanel}

                    {addons.length === 0 && !addingAddon ? (
                        <EmptySlate label="No add-ons configured yet." onAdd={startAddAddon} />
                    ) : (
                        <div className="space-y-2">
                            {addons.map(addon => (
                                <div key={addon.id}>
                                    {editingAddonId === addon.id ? addonFormPanel : (
                                        <CommercialCard onClick={() => startEditAddon(addon)}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm font-medium text-alloy-midnight truncate">{addon.name}</span>
                                                        <span className="text-[10px] text-alloy-midnight/45 bg-alloy-stone/10 rounded px-1.5 py-0.5">{addon.addon_type}</span>
                                                        {isPackageAddon(addon) && (
                                                            <span className="text-[10px] text-alloy-midnight/50 bg-alloy-stone/8 rounded px-1.5 py-0.5">
                                                                📦 {describePackage(addon)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                        <span className="text-sm font-semibold text-alloy-midnight">
                                                            ${(addon.amount_cents / 100).toLocaleString("en-US", { minimumFractionDigits: addon.amount_cents % 100 === 0 ? 0 : 2 })}
                                                        </span>
                                                        <FreqBadge cadenceKey={addon.cadence_key} />
                                                        <ScopeBadge locationId={addon.location_id} programKey={addon.program_key} locations={locations} />
                                                        {addon.revenue_category && <span className="text-[10px] text-alloy-midnight/35 italic">{addon.revenue_category}</span>}
                                                    </div>
                                                    {(addon.effective_start || addon.effective_end) && (
                                                        <p className="text-[10px] text-alloy-midnight/30 mt-0.5">
                                                            {addon.effective_start ? `From ${addon.effective_start}` : ""}
                                                            {addon.effective_end ? ` · Until ${addon.effective_end}` : ""}
                                                        </p>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={e => { e.stopPropagation(); void deleteAddon(addon.id); }}
                                                    className="opacity-0 group-hover:opacity-100 text-[11px] text-alloy-midnight/25 hover:text-red-400 transition-all flex-shrink-0 px-1"
                                                    title="Delete add-on"
                                                >✕</button>
                                            </div>
                                        </CommercialCard>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* ── Deposits ─────────────────────────────────────────────────── */}
                <section className="space-y-3">
                    <SectionHeader title="Deposits" count={deposits.length} onAdd={startAddDeposit} adding={addingDeposit} />
                    <p className="text-xs text-alloy-midnight/40">Held amounts collected at enrollment. Refund lifecycle managed by Billing.</p>

                    {addingDeposit && depositFormPanel}

                    {deposits.length === 0 && !addingDeposit ? (
                        <EmptySlate label="No deposits configured yet." onAdd={startAddDeposit} />
                    ) : (
                        <div className="space-y-2">
                            {deposits.map(dep => (
                                <div key={dep.id}>
                                    {editingDepositId === dep.id ? depositFormPanel : (
                                        <CommercialCard onClick={() => startEditDeposit(dep)}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm font-medium text-alloy-midnight truncate">{dep.name}</span>
                                                        {dep.is_refundable && <span className="text-[10px] text-alloy-midnight/50 bg-alloy-stone/10 rounded px-1.5 py-0.5">Refundable</span>}
                                                        {dep.apply_to_balance && <span className="text-[10px] text-alloy-pine/60 bg-alloy-pine/6 rounded px-1.5 py-0.5">Credits balance</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                        <span className="text-sm font-semibold text-alloy-midnight">
                                                            ${(dep.amount_cents / 100).toLocaleString("en-US", { minimumFractionDigits: dep.amount_cents % 100 === 0 ? 0 : 2 })}
                                                        </span>
                                                        <span className="text-[10px] text-alloy-midnight/40">Due: {dep.due_timing.replace(/_/g, " ")}</span>
                                                        <ScopeBadge locationId={dep.location_id} programKey={dep.program_key} locations={locations} />
                                                        {dep.revenue_category && <span className="text-[10px] text-alloy-midnight/35 italic">{dep.revenue_category}</span>}
                                                    </div>
                                                    {(dep.effective_start || dep.effective_end) && (
                                                        <p className="text-[10px] text-alloy-midnight/30 mt-0.5">
                                                            {dep.effective_start ? `From ${dep.effective_start}` : ""}
                                                            {dep.effective_end ? ` · Until ${dep.effective_end}` : ""}
                                                        </p>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={e => { e.stopPropagation(); void deleteDeposit(dep.id); }}
                                                    className="opacity-0 group-hover:opacity-100 text-[11px] text-alloy-midnight/25 hover:text-red-400 transition-all flex-shrink-0 px-1"
                                                    title="Delete deposit"
                                                >✕</button>
                                            </div>
                                        </CommercialCard>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* ── Revenue mapping reference note ───────────────────────────── */}
                <section className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/3 px-4 py-3">
                    <p className="text-xs font-medium text-alloy-midnight/50 mb-1">Revenue mapping</p>
                    <p className="text-xs text-alloy-midnight/35 leading-relaxed">
                        The <span className="font-medium text-alloy-midnight/50">Revenue category</span> field on each item is a reference label that Accounting will map to GL codes.
                        Commercial defines what a charge is. Accounting decides where it posts.
                    </p>
                </section>

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

    const [locations, setLocations] = useState<SiteLocation[]>([]);
    const [categories, setCategories] = useState<LocationProgramCategoryRow[]>([]);
    const [offerings, setOfferings] = useState<ProgramOffering[]>([]);
    const [variants, setVariants] = useState<ProgramOfferingVariant[]>([]);
    const [cadences, setCadences] = useState<BillingCadence[]>([]);
    const [rates, setRates] = useState<TuitionRateRow[]>([]);

    const [activeSection, setActiveSection] = useState<SectionTab>("programs_tuition");
    const [secondaryTab, setSecondaryTab] = useState<SecondaryTab>("programs");
    const [selectedProgramKey, setSelectedProgramKey] = useState<string | null>(null);
    const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
    const [payerTab, setPayerTab] = useState<PayerTab>("private");

    // Fees & add-ons state (lazy-loaded when fees tab is first activated)
    const [fees, setFees] = useState<CommercialFee[]>([]);
    const [addons, setAddons] = useState<CommercialAddon[]>([]);
    const [deposits, setDeposits] = useState<CommercialDeposit[]>([]);
    const [feesLoading, setFeesLoading] = useState(false);
    const feesLoadedRef = useRef(false);

    const reloadRates = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/commercial/tuition-rates");
            const json = (await res.json()) as { rates?: TuitionRateRow[] };
            setRates(json.rates ?? []);
        } catch { /* retain */ }
    }, []);

    const reloadCategories = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/location-program-categories?include_inactive=true");
            const json = (await res.json()) as { categories?: LocationProgramCategoryRow[] };
            setCategories(json.categories ?? []);
        } catch { /* silent */ }
    }, []);

    const loadFeesData = useCallback(async () => {
        if (feesLoadedRef.current) return;
        setFeesLoading(true);
        try {
            const [feesRes, addonsRes, depositsRes] = await Promise.all([
                fetch("/api/admin/commercial/fees"),
                fetch("/api/admin/commercial/addons"),
                fetch("/api/admin/commercial/deposits"),
            ]);
            const feesJson = (await feesRes.json()) as { fees?: CommercialFee[] };
            const addonsJson = (await addonsRes.json()) as { addons?: CommercialAddon[] };
            const depositsJson = (await depositsRes.json()) as { deposits?: CommercialDeposit[] };
            setFees(feesJson.fees ?? []);
            setAddons(addonsJson.addons ?? []);
            setDeposits(depositsJson.deposits ?? []);
            feesLoadedRef.current = true;
        } catch { /* retain */ }
        finally { setFeesLoading(false); }
    }, []);

    const reloadOfferingsAndVariants = useCallback(async (programKey: string) => {
        try {
            const res = await fetch(`/api/admin/programs/offerings?program_key=${encodeURIComponent(programKey)}`);
            const json = (await res.json()) as { offerings?: ProgramOffering[] };
            const loaded = sortOfferings(json.offerings ?? []);
            setOfferings(loaded);
            const variantResults = await Promise.all(
                loaded.map((o) =>
                    fetch(`/api/admin/programs/offerings/${o.id}/variants`)
                        .then((r) => r.json() as Promise<{ variants?: ProgramOfferingVariant[] }>)
                        .then((j) => j.variants ?? [])
                        .catch(() => [] as ProgramOfferingVariant[]),
                ),
            );
            setVariants(variantResults.flat());
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        async function boot() {
            setLoading(true);
            try {
                const [locRes, catRes, cadenceRes, ratesRes] = await Promise.all([
                    fetch("/api/admin/locations"),
                    fetch("/api/admin/location-program-categories?include_inactive=true"),
                    fetch("/api/admin/commercial/billing-cadences"),
                    fetch("/api/admin/commercial/tuition-rates"),
                ]);
                const locJson = (await locRes.json()) as { locations?: Record<string, unknown>[] };
                const locs: SiteLocation[] = (locJson.locations ?? []).filter((l) => String(l.location_type ?? "") === "site").map((l) => ({ id: String(l.id ?? ""), name: String(l.name ?? l.label ?? "Unnamed site") }));
                setLocations(locs);
                const catJson = (await catRes.json()) as { categories?: LocationProgramCategoryRow[] };
                const cats = catJson.categories ?? [];
                setCategories(cats);
                const cadenceJson = (await cadenceRes.json()) as { cadences?: BillingCadence[] };
                setCadences(cadenceJson.cadences ?? []);
                const ratesJson = (await ratesRes.json()) as { rates?: TuitionRateRow[] };
                setRates(ratesJson.rates ?? []);
                const byKey = new Map<string, string>();
                for (const c of cats) { if (!byKey.has(c.key)) byKey.set(c.key, c.label); }
                const firstKey = Array.from(byKey.keys())[0] ?? null;
                if (firstKey) { setSelectedProgramKey(firstKey); await reloadOfferingsAndVariants(firstKey); }
            } catch (e) { setError(String(e)); }
            finally { setLoading(false); }
        }
        void boot();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selectedProgramKey) void reloadOfferingsAndVariants(selectedProgramKey);
    }, [selectedProgramKey, reloadOfferingsAndVariants]);

    useEffect(() => {
        if (activeSection === "fees") void loadFeesData();
    }, [activeSection, loadFeesData]);

    // ── Derived ────────────────────────────────────────────────────────────────

    const programs: ProgramEntry[] = (() => {
        const byKey = new Map<string, { label: string; siteCount: number }>();
        for (const c of categories) { if (!byKey.has(c.key)) byKey.set(c.key, { label: c.label, siteCount: 0 }); if (c.is_active !== false) byKey.get(c.key)!.siteCount++; }
        return Array.from(byKey.entries()).map(([key, v]) => ({ key, label: v.label, siteCount: v.siteCount }));
    })();

    const selectedProgram = programs.find((p) => p.key === selectedProgramKey) ?? null;
    const locationId: string | null = selectedScopeId;
    const variantIds = variants.map((v) => v.id);
    const allVariantRates = rates.filter((r) => variantIds.includes(r.variant_id));
    const orgOnlyRates = allVariantRates.filter((r) => r.location_id === null);
    const visibleRates = locationId ? allVariantRates.filter((r) => r.location_id === null || r.location_id === locationId) : orgOnlyRates;
    const rateMap = buildTuitionRateMap(visibleRates, locationId);
    const orgOnlyMap = buildTuitionRateMap(orgOnlyRates, null);
    const variantsByOffering = groupVariantsByOffering(variants);

    // ── Mutations ─────────────────────────────────────────────────────────────

    async function addProgram(label: string, key: string) {
        try {
            await Promise.all(locations.map((site) => fetch("/api/admin/location-program-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location_id: site.id, label, key, sort_order: suggestNextLocationProgramCategorySortOrder(categories.filter((c) => c.location_id === site.id), site.id) }) })));
            await reloadCategories();
            setSelectedProgramKey(key);
        } catch (e) { setError(String(e)); }
    }

    async function toggleSiteForProgram(siteId: string) {
        if (!selectedProgramKey || !selectedProgram) return;
        const existing = categories.find((c) => c.location_id === siteId && c.key === selectedProgramKey);
        if (!existing) {
            await fetch("/api/admin/location-program-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location_id: siteId, label: selectedProgram.label, key: selectedProgramKey, sort_order: suggestNextLocationProgramCategorySortOrder(categories.filter((c) => c.location_id === siteId), siteId) }) });
        } else {
            await fetch("/api/admin/location-program-categories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates: [{ id: existing.id, is_active: existing.is_active === false }] }) });
        }
        await reloadCategories();
    }

    async function addOffering(fields: { attendance_type: AttendanceType; label: string }) {
        if (!selectedProgramKey) return;
        const res = await fetch("/api/admin/programs/offerings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ program_key: selectedProgramKey, ...fields, sort_order: (offerings.length + 1) * 10 }) });
        if (!res.ok) { const j = (await res.json()) as { error?: string }; setError(j.error ?? "Failed to add offering"); return; }
        if (selectedProgramKey) await reloadOfferingsAndVariants(selectedProgramKey);
    }

    async function updateOffering(id: string, fields: { label?: string; status?: OfferingStatus }) {
        const res = await fetch(`/api/admin/programs/offerings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
        if (!res.ok) { const j = (await res.json()) as { error?: string }; setError(j.error ?? "Failed to update offering"); return; }
        if (selectedProgramKey) await reloadOfferingsAndVariants(selectedProgramKey);
    }

    async function deleteOffering(id: string) {
        const hasRates = variants.filter((v) => v.offering_id === id).some((v) => rates.some((r) => r.variant_id === v.id));
        if (hasRates && !window.confirm("This offering has tuition rates. It will be archived rather than deleted. Continue?")) return;
        const res = await fetch(`/api/admin/programs/offerings/${id}`, { method: "DELETE" });
        if (!res.ok) { const j = (await res.json()) as { error?: string }; setError(j.error ?? "Failed to delete offering"); return; }
        if (selectedProgramKey) await reloadOfferingsAndVariants(selectedProgramKey);
    }

    async function addVariants(offeringId: string, items: { quantity_type: QuantityType; quantity_value: number; label: string }[]) {
        for (const item of items) {
            await fetch(`/api/admin/programs/offerings/${offeringId}/variants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
        }
        if (selectedProgramKey) await reloadOfferingsAndVariants(selectedProgramKey);
    }

    async function updateVariant(offeringId: string, variantId: string, fields: { label?: string | null; status?: VariantStatus }) {
        const res = await fetch(`/api/admin/programs/offerings/${offeringId}/variants/${variantId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
        if (!res.ok) { const j = (await res.json()) as { error?: string }; setError(j.error ?? "Failed to update variant"); return; }
        if (selectedProgramKey) await reloadOfferingsAndVariants(selectedProgramKey);
    }

    async function deleteVariant(offeringId: string, variantId: string) {
        const res = await fetch(`/api/admin/programs/offerings/${offeringId}/variants/${variantId}`, { method: "DELETE" });
        if (!res.ok) { const j = (await res.json()) as { error?: string }; setError(j.error ?? "Failed to delete variant"); return; }
        if (selectedProgramKey) await reloadOfferingsAndVariants(selectedProgramKey);
    }

    async function saveCell(variantId: string, cadenceKey: string, payload: RatePayload) {
        setSaving(true);
        try {
            const res = await fetch("/api/admin/commercial/tuition-rates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ variant_id: variantId, cadence_key: cadenceKey, location_id: locationId, payer_type: "private_pay", ...payload }),
            });
            if (!res.ok) { const j = (await res.json()) as { error?: string }; setError(j.error ?? "Save failed"); }
            else await reloadRates();
        } finally { setSaving(false); }
    }

    async function clearCell(rateId: string) {
        setSaving(true);
        try { await fetch(`/api/admin/commercial/tuition-rates/${rateId}`, { method: "DELETE" }); await reloadRates(); }
        finally { setSaving(false); }
    }

    async function bulkCopyOrgToLocation(locId: string) {
        setBulkCopying(true);
        try {
            const orgRates = rates.filter((r) => r.location_id === null && variantIds.includes(r.variant_id));
            await Promise.all(orgRates.map((r) => fetch("/api/admin/commercial/tuition-rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variant_id: r.variant_id, cadence_key: r.cadence_key, location_id: locId, payer_type: r.payer_type, rate_cents: r.rate_cents, not_offered: r.not_offered }) })));
            await reloadRates();
        } finally { setBulkCopying(false); }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    if (loading) return <div className="flex items-center justify-center h-64"><p className="text-sm text-alloy-midnight/40">Loading…</p></div>;

    const programQueueColumn = (
        <ConfigurationQueue title="Programs">
            {programs.map((prog) => (
                <ConfigurationQueueItem key={prog.key} active={selectedProgramKey === prog.key} title={prog.label} subtitle={`${prog.siteCount} ${prog.siteCount === 1 ? "site" : "sites"}`} onClick={() => setSelectedProgramKey(prog.key)} />
            ))}
            {programs.length === 0 && <p className="px-4 py-3 text-xs text-alloy-midnight/40">No programs yet.</p>}
            <AddProgramForm onAdd={addProgram} />
        </ConfigurationQueue>
    );

    return (
        <div className="config-runtime-shell flex flex-col min-h-0 flex-1">
            <div className="flex items-end border-b border-alloy-stone/20 bg-white px-6 flex-shrink-0">
                {SECTION_TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        disabled={!tab.available}
                        onClick={() => { if (tab.available && (tab.key === "programs_tuition" || tab.key === "fees")) setActiveSection(tab.key); }}
                        className={`px-4 py-3 text-sm -mb-px border-b-2 transition-colors whitespace-nowrap ${activeSection === tab.key ? "border-alloy-pine text-alloy-pine font-medium" : tab.available ? "border-transparent text-alloy-midnight/50 hover:text-alloy-midnight" : "border-transparent text-alloy-midnight/28 cursor-not-allowed"}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {error && (
                <div className="mx-6 mt-4 flex items-center justify-between text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 flex-shrink-0">
                    <span>{error}</span>
                    <button type="button" onClick={() => setError(null)} className="underline ml-3 text-xs">dismiss</button>
                </div>
            )}

            {activeSection === "fees" ? (
                <FeesAddonsPanel
                    fees={fees}
                    addons={addons}
                    deposits={deposits}
                    locations={locations}
                    programs={programs}
                    loading={feesLoading}
                    onFeeCreated={(fee) => setFees((prev) => [...prev, fee])}
                    onFeeUpdated={(fee) => setFees((prev) => prev.map((f) => f.id === fee.id ? fee : f))}
                    onFeeDeleted={(id) => setFees((prev) => prev.filter((f) => f.id !== id))}
                    onAddonCreated={(addon) => setAddons((prev) => [...prev, addon])}
                    onAddonUpdated={(addon) => setAddons((prev) => prev.map((a) => a.id === addon.id ? addon : a))}
                    onAddonDeleted={(id) => setAddons((prev) => prev.filter((a) => a.id !== id))}
                    onDepositCreated={(deposit) => setDeposits((prev) => [...prev, deposit])}
                    onDepositUpdated={(deposit) => setDeposits((prev) => prev.map((d) => d.id === deposit.id ? deposit : d))}
                    onDepositDeleted={(id) => setDeposits((prev) => prev.filter((d) => d.id !== id))}
                />
            ) : (
                <ConfigurationShell queueColumn={programQueueColumn}>
                    {selectedProgram ? (
                        <div className="flex flex-col min-h-0 flex-1">
                            <div className="flex border-b border-alloy-stone/15 px-6 bg-white flex-shrink-0">
                                {(["programs", "tuition"] as const).map((tab) => (
                                    <button key={tab} type="button" onClick={() => setSecondaryTab(tab)} className={`px-3 py-2.5 text-sm capitalize -mb-px border-b-2 transition-colors ${secondaryTab === tab ? "border-alloy-midnight text-alloy-midnight font-medium" : "border-transparent text-alloy-midnight/45 hover:text-alloy-midnight"}`}>
                                        {tab}
                                    </button>
                                ))}
                            </div>
                            {secondaryTab === "programs" ? (
                                <ProgramsPanel
                                    program={selectedProgram}
                                    locations={locations}
                                    categories={categories}
                                    offerings={offerings}
                                    variants={variants}
                                    rates={rates}
                                    onToggleSite={toggleSiteForProgram}
                                    onAddOffering={addOffering}
                                    onUpdateOffering={updateOffering}
                                    onDeleteOffering={deleteOffering}
                                    onAddVariants={addVariants}
                                    onUpdateVariant={updateVariant}
                                    onDeleteVariant={deleteVariant}
                                />
                            ) : (
                                <TuitionPanel
                                    program={selectedProgram}
                                    offerings={offerings}
                                    variantsByOffering={variantsByOffering}
                                    cadences={cadences}
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
                        <ConfigurationEmptyState title="Select a program" description="Choose a program from the left to configure it, or add a new one." />
                    )}
                </ConfigurationShell>
            )}

            {saving && <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-alloy-midnight px-3 py-2 text-xs text-white shadow-lg">Saving…</div>}
        </div>
    );
}

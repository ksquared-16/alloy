"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    type CommercialProduct,
    type CommercialCategory,
    type CommercialRevenueCategory,
    type CommercialType,
    sortRevenueCategories,
    activeRevenueCategories,
    isRevenueCategoryMapped,
    FREQUENCY_OPTIONS,
    COMMERCIAL_TYPE_OPTIONS,
    DUE_TIMING_OPTIONS,
    PACKAGE_UNIT_TYPE_OPTIONS,
    formatScope,
    frequencyLabel,
    isPackageProduct,
    describePackage,
    feeIsRequired,
    depositBehavior,
    getPackage,
    buildBehavior,
    activeCategories,
    categoryLabel,
    sortProducts,
} from "@/lib/commercial/commercialProducts";
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
type SectionTab = "programs_tuition" | "fees" | "accounting";

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
    { key: "fees" as const, label: "Catalog", available: true },
    { key: "policies" as const, label: "Policies", available: false },
    { key: "accounting" as const, label: "Accounting", available: true },
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
    "rounded border border-alloy-forge/15 bg-white px-2 py-1 text-xs text-alloy-midnight focus:border-alloy-bend-pine/40 focus:outline-none";

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
            <td className="px-3 py-2.5 text-right text-sm relative whitespace-nowrap" style={{ minWidth: 88 }}>
                {/* Price row — right-aligned to match read mode */}
                <div className="flex items-center justify-end gap-1">
                    <span className="text-xs text-alloy-midnight/35 select-none">$</span>
                    <input
                        ref={inputRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void commitEdit(); if (e.key === "Escape") { setEditing(false); setShowDates(false); } }}
                        className="w-16 rounded border border-alloy-bend-pine/45 px-1 py-0 text-sm text-right leading-5 focus:outline-none focus:border-alloy-bend-pine bg-white"
                        placeholder="0.00"
                    />
                    <button type="button" onClick={() => void commitEdit()} disabled={saving} className="text-xs font-semibold text-alloy-bend-pine hover:text-alloy-bend-pine/70 disabled:opacity-40 leading-none">✓</button>
                    <button type="button" onClick={() => { setEditing(false); setShowDates(false); }} className="text-[11px] text-alloy-midnight/45 hover:text-alloy-midnight/60 leading-none">✕</button>
                </div>

                {/* Effective dates — absolutely positioned below cell, never affects row height */}
                {!showDates ? (
                    <button
                        type="button"
                        onClick={() => setShowDates(true)}
                        className="absolute right-3 top-full mt-0.5 text-[10px] text-alloy-midnight/45 hover:text-alloy-midnight/55 transition-colors z-10 whitespace-nowrap"
                    >
                        + dates
                    </button>
                ) : (
                    <div className="absolute right-0 top-full mt-0.5 z-20 w-48 rounded border border-alloy-stone/20 bg-white shadow-sm p-2 space-y-1.5 text-left">
                        <p className="text-[9px] text-alloy-midnight/35">Leave blank if rate applies now.</p>
                        <label className="block">
                            <span className="text-[9px] font-medium text-alloy-midnight/55 uppercase tracking-wide">Activates on</span>
                            <input
                                type="date"
                                value={effectiveStart}
                                onChange={(e) => setEffectiveStart(e.target.value)}
                                className="mt-0.5 w-full rounded border border-alloy-stone/25 px-1 py-0.5 text-[11px] text-alloy-midnight/70 focus:outline-none"
                            />
                        </label>
                        <label className="block">
                            <span className="text-[9px] font-medium text-alloy-midnight/55 uppercase tracking-wide">Expires on <span className="font-normal normal-case">(optional)</span></span>
                            <input
                                type="date"
                                value={effectiveEnd}
                                onChange={(e) => setEffectiveEnd(e.target.value)}
                                className="mt-0.5 w-full rounded border border-alloy-stone/25 px-1 py-0.5 text-[11px] text-alloy-midnight/70 focus:outline-none"
                            />
                        </label>
                        <button type="button" onClick={() => setShowDates(false)} className="text-[9px] text-alloy-midnight/45 hover:text-alloy-midnight/55">✕ close</button>
                    </div>
                )}
            </td>
        );
    }

    return (
        <td
            style={{ minWidth: 88 }}
            className={[
                "px-3 py-2.5 text-right text-sm group/cell select-none whitespace-nowrap",
                saving ? "opacity-50" : "",
                isNotOffered ? "text-alloy-midnight/40" : isInherited ? "italic text-alloy-midnight/40" : "text-alloy-midnight",
                !isNotOffered ? "cursor-pointer hover:bg-alloy-stone/5" : "",
            ].join(" ")}
            onClick={isNotOffered ? undefined : startEdit}
        >
            {isNotOffered ? (
                <span className="inline-flex items-center gap-1">
                    <span className="line-through text-xs">N/A</span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); void toggleNotOffered(); }} className="opacity-0 group-hover/cell:opacity-100 text-[10px] text-alloy-midnight/45 hover:text-alloy-midnight/60" title="Mark as offered">↩</button>
                </span>
            ) : displayRate != null ? (
                <span className="inline-flex items-center gap-1">
                    {isLocOverride && <span className="w-1.5 h-1.5 rounded-full bg-alloy-bend-pine/70 shrink-0" />}
                    <span>{formatRateCents(displayRate)}</span>
                    {rateRow?.effective_start && (
                        <span className="opacity-0 group-hover/cell:opacity-100 text-[9px] text-alloy-midnight/45 font-normal not-italic" title={`Effective ${rateRow.effective_start}${rateRow.effective_end ? ` – ${rateRow.effective_end}` : ""}`}>📅</span>
                    )}
                    <span className="opacity-0 group-hover/cell:opacity-100 inline-flex gap-0.5">
                        <button type="button" onClick={(e) => { e.stopPropagation(); void toggleNotOffered(); }} className="text-[10px] text-alloy-midnight/40 hover:text-alloy-midnight/55" title="Mark N/A">⊘</button>
                        {!isInherited && rateRow?.id && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); void onClear(rateRow.id); }} className="text-[10px] text-alloy-midnight/20 hover:text-red-400" title="Clear rate">×</button>
                        )}
                    </span>
                </span>
            ) : showOrgFallback ? (
                <span className="text-alloy-midnight/40 italic text-xs">{formatRateCents(orgDefaultRow!.rate_cents)}</span>
            ) : (
                <span className="text-alloy-midnight/35 group-hover/cell:text-alloy-bend-pine/50 transition-colors">
                    —
                    <button type="button" onClick={(e) => { e.stopPropagation(); void toggleNotOffered(); }} className="opacity-0 group-hover/cell:opacity-100 ml-1 text-[10px] text-alloy-midnight/40 hover:text-alloy-midnight/55" title="Mark N/A">⊘</button>
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
                                <button type="button" onClick={confirmAddCol} className="rounded border border-alloy-bend-pine/30 bg-alloy-bend-pine/8 px-2 py-0.5 text-xs font-medium text-alloy-bend-pine hover:bg-alloy-bend-pine/12">Add</button>
                                <button type="button" onClick={() => setAddingCol(false)} className="text-xs text-alloy-midnight/35 hover:text-alloy-midnight">✕</button>
                            </div>
                        ) : (
                            <button type="button" onClick={openAddCol} className="text-xs text-alloy-bend-pine/70 hover:text-alloy-bend-pine transition-colors flex items-center gap-0.5">
                                <span className="text-sm leading-none">+</span> Add rate basis
                            </button>
                        )
                    )}
                    {activeCadences.length === 0 && availableCadences.length === 0 && (
                        <span className="text-xs text-alloy-midnight/40">All cadences added</span>
                    )}
                </div>
            </div>

            {sorted.length === 0 ? (
                <p className="px-4 py-3 text-xs text-alloy-midnight/35">No active variants.</p>
            ) : activeCadences.length === 0 ? (
                <p className="px-4 py-3 text-xs text-alloy-midnight/35">No rate bases yet — use “+ Add rate basis” above to start.</p>
            ) : (
                <div className="overflow-x-auto overflow-y-visible">
                    <table className="w-auto text-sm">
                        <thead>
                            <tr className="border-b border-alloy-stone/10">
                                <th className="text-left px-4 py-1.5 text-xs font-medium text-alloy-midnight/55 w-24" />
                                {activeCadences.map((c) => (
                                    <th key={c.item_key} className="text-right px-3 py-1.5 text-xs font-semibold text-alloy-midnight/60 whitespace-nowrap">{c.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((variant, vi) => (
                                <tr key={variant.id} className={`border-b border-alloy-stone/8 last:border-0 ${vi % 2 === 1 ? "bg-alloy-stone/3" : ""}`}>
                                    <td className="px-4 py-2 text-xs text-alloy-midnight/55 font-medium whitespace-nowrap">
                                        {isDefaultVariant(variant)
                                            ? <span className="italic text-alloy-midnight/45">Default</span>
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
                            <div key={v.id} className="px-3 py-3 bg-alloy-bend-pine/5 border-b border-alloy-stone/15 space-y-2">
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
                                    <button type="button" onClick={() => void saveEdit()} disabled={savingEdit} className="rounded border border-alloy-bend-pine/30 bg-alloy-bend-pine/8 px-3 py-1 text-xs font-medium text-alloy-bend-pine hover:bg-alloy-bend-pine/12 disabled:opacity-50">{savingEdit ? "Saving…" : "Save"}</button>
                                    <button type="button" onClick={() => setEditingId(null)} className="text-xs text-alloy-midnight/40 hover:text-alloy-midnight">Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div key={v.id} className={`flex items-center gap-3 px-3 py-2.5 group ${i < sorted.length - 1 ? "border-b border-alloy-stone/10" : ""}`}>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-alloy-midnight truncate">
                                        {isDefaultVariant(v) ? <span className="text-alloy-midnight/40 italic">Default</span> : describeVariant(v)}
                                    </p>
                                    {v.status !== "active" && <p className="text-[10px] text-alloy-midnight/45 capitalize">{v.status}</p>}
                                </div>
                                {!isDefaultVariant(v) && (
                                    <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button type="button" onClick={() => startEdit(v)} className="text-xs text-alloy-midnight/35 hover:text-alloy-bend-pine px-1">Edit</button>
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
                                    className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${exists ? "border-alloy-stone/15 bg-alloy-stone/8 text-alloy-midnight/20 cursor-not-allowed line-through" : selected ? "border-alloy-bend-pine bg-alloy-bend-pine text-white" : "border-alloy-stone/30 bg-white text-alloy-midnight/55 hover:border-alloy-bend-pine/50 hover:text-alloy-bend-pine"}`}
                                >
                                    {count}
                                </button>
                            );
                        })}
                        <div className="flex items-center gap-1">
                            <input type="number" min="1" step="0.5" value={customCount} onChange={(e) => setCustomCount(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCustomCount(); }} placeholder="Other" className={`${inputCls} w-16 text-center`} />
                            <button type="button" onClick={addCustomCount} className="text-xs text-alloy-midnight/40 hover:text-alloy-bend-pine">+</button>
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
                            <button type="button" disabled={adding} onClick={() => void handleBulkAdd()} className="rounded border border-alloy-bend-pine/30 bg-alloy-bend-pine/8 px-3 py-1.5 text-xs font-medium text-alloy-bend-pine hover:bg-alloy-bend-pine/12 disabled:opacity-50">
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
                    <span className={`text-alloy-midnight/45 text-xs transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
                    <span className="text-sm font-medium text-alloy-midnight">{offering.label}</span>
                    <span className="text-xs text-alloy-midnight/35">{ATTENDANCE_TYPE_LABELS[offering.attendance_type]}</span>
                    <span className="text-xs text-alloy-midnight/40">{variantCount} variant{variantCount !== 1 ? "s" : ""}</span>
                    {offering.status !== "active" && <span className="text-[10px] text-alloy-midnight/40 capitalize">{offering.status}</span>}
                </button>
                <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={onEdit} className="text-xs text-alloy-midnight/35 hover:text-alloy-bend-pine">Edit</button>
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
                                <div key={o.id} className="border border-alloy-bend-pine/30 rounded-lg px-4 py-3 bg-alloy-bend-pine/5 space-y-2.5">
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
                                        <button type="button" onClick={() => void saveOfferingEdit()} disabled={savingOffering || !editOfferingLabel.trim()} className="rounded border border-alloy-bend-pine/30 bg-alloy-bend-pine/8 px-3 py-1 text-xs font-medium text-alloy-bend-pine hover:bg-alloy-bend-pine/12 disabled:opacity-50">{savingOffering ? "Saving…" : "Save"}</button>
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
                                <button type="button" disabled={addingOffering || existingTypes.has(addAttType)} onClick={() => void handleAddOffering()} className="rounded border border-alloy-bend-pine/30 bg-alloy-bend-pine/8 px-3 py-1.5 text-xs font-medium text-alloy-bend-pine hover:bg-alloy-bend-pine/12 disabled:opacity-50">
                                    {addingOffering ? "Adding…" : "Add"}
                                </button>
                            </div>
                        </div>
                    </div>
                </ConfigurationDetailCard>

                {/* Location availability — compact summary, expandable */}
                <div className="flex items-center justify-between rounded-lg border border-alloy-stone/20 px-4 py-2.5">
                    {locations.length === 0 ? (
                        <span className="text-xs text-alloy-midnight/40">No site locations. <Link href="/settings/locations" className="text-alloy-bend-pine hover:underline">Add locations →</Link></span>
                    ) : (
                        <>
                            <span className="text-xs text-alloy-midnight/55">
                                Offered at <strong className="text-alloy-midnight">{offeredCount}</strong> of <strong className="text-alloy-midnight">{locations.length}</strong> site{locations.length !== 1 ? "s" : ""}
                            </span>
                            <button type="button" onClick={() => setLocExpanded((v) => !v)} className="text-xs text-alloy-bend-pine hover:underline shrink-0 ml-4">
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
                        <button key={loc.id} type="button" onClick={() => onScopeChange(loc.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${selectedScopeId === loc.id ? "bg-alloy-bend-pine text-white border-alloy-bend-pine" : "bg-white text-alloy-midnight/55 border-alloy-stone/30 hover:border-alloy-bend-pine/35"}`}>{loc.name}</button>
                    ))}
                </div>

                {selectedScopeId && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-alloy-stone/25 bg-alloy-stone/8 px-4 py-2.5">
                        <p className="text-xs text-alloy-midnight/55">
                            <strong className="font-medium text-alloy-midnight">{selectedLocName}</strong> — <span className="inline-flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-alloy-bend-pine/70" /> green dot = override.</span> Italic = inherited.
                        </p>
                        <button type="button" disabled={bulkCopying} onClick={() => void onCopyOrgToLocation(selectedScopeId)} className="shrink-0 text-xs font-medium text-alloy-bend-pine hover:underline disabled:opacity-50">
                            {bulkCopying ? "Copying…" : "Copy org rates →"}
                        </button>
                    </div>
                )}

                {/* Payer tabs */}
                <div className="flex border-b border-alloy-stone/20">
                    {PAYER_TABS.map((tab) => (
                        <button key={tab.key} type="button" disabled={!tab.available} onClick={() => { if (tab.available) onPayerTabChange(tab.key); }} className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${payerTab === tab.key ? "border-alloy-bend-pine text-alloy-bend-pine font-medium" : tab.available ? "border-transparent text-alloy-midnight/60 hover:text-alloy-midnight" : "border-transparent text-alloy-midnight/40 cursor-not-allowed"}`}>
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
                        <p className="text-xs text-alloy-midnight/45 pt-1">Click any cell to set a rate. Hover to mark N/A. Effective dates (optional) appear in the rate editor.</p>
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
                <button type="button" disabled={adding || !label.trim()} onClick={() => void handleAdd()} className="rounded border border-alloy-bend-pine/30 bg-alloy-bend-pine/8 px-3 py-1.5 text-xs font-medium text-alloy-bend-pine hover:bg-alloy-bend-pine/12 disabled:opacity-50">
                    {adding ? "Adding…" : "Add"}
                </button>
            </div>
        </div>
    );
}

// ─── Fees & Add-ons shared helpers ─────────────────────────────────────────────

function ScopeBadge({ locationId, programKey, locations, programs }: { locationId: string | null; programKey: string | null; locations: { id: string; name: string }[]; programs?: { key: string; label: string }[] }) {
    const label = formatScope(locationId, programKey, locations, programs);
    return (
        <span className="text-[10px] text-alloy-midnight/55 bg-alloy-stone/10 rounded px-1.5 py-0.5 whitespace-nowrap">
            {label}
        </span>
    );
}

function CommercialCard({ children, onClick, editing }: { children: React.ReactNode; onClick?: () => void; editing?: boolean }) {
    return (
        <div
            className={[
                "group rounded-lg border px-4 py-3 transition-all",
                editing ? "border-alloy-bend-pine/40 bg-alloy-bend-pine/3 shadow-sm" : "border-alloy-stone/20 bg-white hover:border-alloy-stone/35 hover:shadow-xs",
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
                className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight placeholder:text-alloy-midnight/38 focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20"
            />
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
                className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20 bg-white"
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
                className={`w-7 h-4 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-alloy-bend-pine" : "bg-alloy-stone/30"}`}
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
                <select value={locationId} onChange={e => setLocationId(e.target.value)} className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20 bg-white">
                    <option value="">All locations (org default)</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
            </label>
            <label className="block">
                <span className="text-[10px] font-medium text-alloy-midnight/45 uppercase tracking-wide">Program scope</span>
                <select value={programKey} onChange={e => setProgramKey(e.target.value)} className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20 bg-white">
                    <option value="">All programs</option>
                    {programs.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
            </label>
        </div>
    );
}

function EmptySlate({ label, onAdd }: { label: string; onAdd: () => void }) {
    return (
        <div className="rounded-lg border border-dashed border-alloy-stone/25 px-4 py-6 text-center">
            <p className="text-sm text-alloy-midnight/35 mb-2">{label}</p>
            <button type="button" onClick={onAdd} className="text-xs text-alloy-bend-pine/70 hover:text-alloy-bend-pine font-medium transition-colors">
                + Add one
            </button>
        </div>
    );
}

function SaveBar({ onSave, onCancel, saving, disabled }: { onSave: () => void; onCancel: () => void; saving: boolean; disabled?: boolean }) {
    return (
        <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} className="text-xs text-alloy-midnight/45 hover:text-alloy-midnight transition-colors px-2 py-1">Cancel</button>
            <button type="button" onClick={onSave} disabled={saving || disabled} className="rounded bg-alloy-bend-pine px-3 py-1 text-xs font-medium text-white hover:bg-alloy-bend-pine/85 disabled:opacity-40 transition-colors">
                {saving ? "Saving…" : "Save"}
            </button>
        </div>
    );
}

// Section divider inside the product configuration panel.
function FormStep({ label, hint }: { label: string; hint?: string }) {
    return (
        <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] font-semibold text-alloy-bend-pine uppercase tracking-wide whitespace-nowrap">{label}</span>
            <span className="flex-1 h-px bg-alloy-stone/20" />
            {hint && <span className="text-[10px] text-alloy-midnight/50 whitespace-nowrap">{hint}</span>}
        </div>
    );
}

// ─── AccountingReferencePanel ──────────────────────────────────────────────────
// Accounting V1. Reuses the canonical chart of accounts (gl_accounts, via
// /api/admin/financials/accounts). Operators map each commercial Revenue Category
// to an existing GL account. No new GL-account table, no free-form GL codes.
// Sections: GL Accounts (create/edit/archive) · Revenue Categories (map) · Mapping Review.
// GL accounts are read/written via the existing /api/admin/financials/accounts.

type GlAccountLite = { id: string; code: string; name: string; type: string; is_active: boolean };
type AccountingTab = "revenue_categories" | "gl_accounts" | "mapping_review";

const GL_ACCOUNT_TYPES: { key: string; label: string }[] = [
    { key: "revenue", label: "Revenue" },
    { key: "liability", label: "Liability" },
    { key: "asset", label: "Asset" },
    { key: "expense", label: "Expense" },
    { key: "equity", label: "Equity" },
];

function AccountingReferencePanel({ products, loading }: {
    products: CommercialProduct[];
    loading: boolean;
}) {
    const [tab, setTab] = useState<AccountingTab>("revenue_categories");
    const [revenueCats, setRevenueCats] = useState<CommercialRevenueCategory[]>([]);
    const [glAccounts, setGlAccounts] = useState<GlAccountLite[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [glError, setGlError] = useState<string | null>(null);

    const [adding, setAdding] = useState(false);
    const [newLabel, setNewLabel] = useState("");
    const [newGlId, setNewGlId] = useState("");
    const [savingNew, setSavingNew] = useState(false);
    const [mappingId, setMappingId] = useState<string | null>(null);
    const [savingMap, setSavingMap] = useState(false);

    // GL account authoring
    const [glAdding, setGlAdding] = useState(false);
    const [glCode, setGlCode] = useState("");
    const [glName, setGlName] = useState("");
    const [glType, setGlType] = useState("revenue");
    const [glSaving, setGlSaving] = useState(false);
    const [glEditingId, setGlEditingId] = useState<string | null>(null);
    const [glEditCode, setGlEditCode] = useState("");
    const [glEditName, setGlEditName] = useState("");
    const [glEditType, setGlEditType] = useState("revenue");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setDataLoading(true);
            try {
                const [rcRes, glRes] = await Promise.all([
                    fetch("/api/admin/commercial/revenue-categories?include_inactive=true"),
                    fetch("/api/admin/financials/accounts"),
                ]);
                const rcJson = (await rcRes.json()) as { revenue_categories?: CommercialRevenueCategory[] };
                const glJson = (await glRes.json()) as { data?: GlAccountLite[] };
                if (!cancelled) {
                    setRevenueCats(sortRevenueCategories(rcJson.revenue_categories ?? []));
                    setGlAccounts(glJson.data ?? []);
                }
            } catch { /* retain */ }
            finally { if (!cancelled) setDataLoading(false); }
        })();
        return () => { cancelled = true; };
    }, []);

    const glById = useMemo(() => {
        const m = new Map<string, GlAccountLite>();
        glAccounts.forEach(a => m.set(a.id, a));
        return m;
    }, [glAccounts]);

    // Active accounts only, sorted by code — used for the mapping dropdowns.
    const activeGl = useMemo(
        () => glAccounts.filter(a => a.is_active !== false).sort((a, b) => a.code.localeCompare(b.code)),
        [glAccounts],
    );
    const sortedGl = useMemo(() => [...glAccounts].sort((a, b) => a.code.localeCompare(b.code)), [glAccounts]);

    async function createGlAccount() {
        const code = glCode.trim();
        const name = glName.trim();
        if (!code) return;
        setGlSaving(true); setGlError(null);
        try {
            const res = await fetch("/api/admin/financials/accounts", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code, name: name || code, type: glType }),
            });
            const json = (await res.json()) as GlAccountLite & { error?: string };
            if (!res.ok || json.error) { setGlError(json.error ?? "Could not create GL account"); return; }
            setGlAccounts(prev => [...prev, json]);
            setGlAdding(false); setGlCode(""); setGlName(""); setGlType("revenue");
        } finally { setGlSaving(false); }
    }

    function startGlEdit(a: GlAccountLite) { setGlEditingId(a.id); setGlEditCode(a.code); setGlEditName(a.name); setGlEditType(a.type); }

    async function saveGlEdit(id: string) {
        setGlSaving(true); setGlError(null);
        try {
            const res = await fetch(`/api/admin/financials/accounts/${id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: glEditCode.trim(), name: glEditName.trim(), type: glEditType }),
            });
            const json = (await res.json()) as GlAccountLite & { error?: string };
            if (!res.ok || json.error) { setGlError(json.error ?? "Could not update GL account"); return; }
            setGlAccounts(prev => prev.map(a => a.id === id ? json : a));
            setGlEditingId(null);
        } finally { setGlSaving(false); }
    }

    async function setGlActive(a: GlAccountLite, isActive: boolean) {
        setGlError(null);
        const res = await fetch(`/api/admin/financials/accounts/${a.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: isActive }),
        });
        const json = (await res.json()) as GlAccountLite & { error?: string };
        if (!res.ok || json.error) { setGlError(json.error ?? "Could not update GL account"); return; }
        setGlAccounts(prev => prev.map(x => x.id === a.id ? json : x));
    }

    // Product usage per revenue category — counts both the FK and legacy free-text label.
    const productCountFor = useCallback((rc: CommercialRevenueCategory) => {
        const label = rc.label.trim().toLowerCase();
        return products.filter(p =>
            p.revenue_category_id === rc.id ||
            (!p.revenue_category_id && (p.revenue_category ?? "").trim().toLowerCase() === label)
        ).length;
    }, [products]);

    const unmappedCount = useMemo(() => revenueCats.filter(c => !c.mapped_gl_account_id).length, [revenueCats]);

    async function addCategory() {
        const label = newLabel.trim();
        if (!label) return;
        setSavingNew(true);
        try {
            const res = await fetch("/api/admin/commercial/revenue-categories", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label, mapped_gl_account_id: newGlId || null }),
            });
            const json = (await res.json()) as { revenue_category?: CommercialRevenueCategory };
            if (json.revenue_category) {
                setRevenueCats(prev => sortRevenueCategories([...prev, json.revenue_category!]));
                setNewLabel(""); setNewGlId(""); setAdding(false);
            }
        } finally { setSavingNew(false); }
    }

    async function mapCategory(id: string, glId: string) {
        setSavingMap(true);
        try {
            const res = await fetch(`/api/admin/commercial/revenue-categories/${id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mapped_gl_account_id: glId || null }),
            });
            const json = (await res.json()) as { revenue_category?: CommercialRevenueCategory };
            if (json.revenue_category) {
                setRevenueCats(prev => prev.map(c => c.id === id ? json.revenue_category! : c));
                setMappingId(null);
            }
        } finally { setSavingMap(false); }
    }

    async function deleteCategory(id: string) {
        await fetch(`/api/admin/commercial/revenue-categories/${id}`, { method: "DELETE" });
        setRevenueCats(prev => prev.filter(c => c.id !== id));
    }

    if (loading || dataLoading) {
        return <div className="flex items-center justify-center flex-1 text-sm text-alloy-midnight/55 py-16">Loading…</div>;
    }

    const glLabel = (id: string | null) => {
        if (!id) return null;
        const a = glById.get(id);
        return a ? `${a.code} · ${a.name}` : null;
    };

    const TABS: { key: AccountingTab; label: string }[] = [
        { key: "revenue_categories", label: "Revenue Categories" },
        { key: "gl_accounts", label: "GL Accounts" },
        { key: "mapping_review", label: "Mapping Review" },
    ];

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">

                <div>
                    <h2 className="text-base font-semibold text-alloy-midnight">Accounting</h2>
                    <p className="text-xs text-alloy-midnight/60 mt-0.5">
                        Commercial product → revenue category → GL account. Accounting owns the chart of accounts.
                    </p>
                </div>

                {/* Sub-tabs */}
                <div className="flex gap-1 border-b border-alloy-stone/20">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/40 rounded-sm ${tab === t.key ? "border-alloy-bend-pine text-alloy-bend-pine font-medium" : "border-transparent text-alloy-midnight/60 hover:text-alloy-midnight"}`}
                        >
                            {t.label}
                            {t.key === "mapping_review" && unmappedCount > 0 && (
                                <span className="ml-1.5 text-[10px] text-alloy-ember bg-alloy-ember/10 rounded-full px-1.5 py-0.5">{unmappedCount}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* ── Revenue Categories ── */}
                {tab === "revenue_categories" && (
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-alloy-midnight/60">Commercial-owned categories that map to a GL account.</p>
                            {!adding && (
                                <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 rounded-md bg-alloy-bend-pine px-3 py-1.5 text-xs font-medium text-white hover:bg-alloy-bend-pine/85 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/40">
                                    <span className="text-sm leading-none">+</span> Revenue category
                                </button>
                            )}
                        </div>

                        {adding && (
                            <div className="rounded-xl border border-alloy-stone/20 bg-white p-4 shadow-sm space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block">
                                        <span className="text-[10px] font-medium text-alloy-midnight/55 uppercase tracking-wide">Revenue category *</span>
                                        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Program Revenue" className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight placeholder:text-alloy-midnight/38 focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20" />
                                    </label>
                                    <label className="block">
                                        <span className="text-[10px] font-medium text-alloy-midnight/55 uppercase tracking-wide">GL account</span>
                                        <select value={newGlId} onChange={e => setNewGlId(e.target.value)} className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20 bg-white">
                                            <option value="">Unmapped</option>
                                            {activeGl.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                                        </select>
                                    </label>
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                    <button type="button" onClick={() => { setAdding(false); setNewLabel(""); setNewGlId(""); }} className="text-xs text-alloy-midnight/55 hover:text-alloy-midnight px-2 py-1">Cancel</button>
                                    <button type="button" onClick={() => void addCategory()} disabled={savingNew || !newLabel.trim()} className="rounded bg-alloy-bend-pine px-3 py-1 text-xs font-medium text-white hover:bg-alloy-bend-pine/85 disabled:opacity-40">{savingNew ? "Saving…" : "Save"}</button>
                                </div>
                            </div>
                        )}

                        {revenueCats.length === 0 && !adding ? (
                            <div className="rounded-xl border border-dashed border-alloy-stone/25 px-4 py-6 text-center">
                                <p className="text-sm text-alloy-midnight/60">No revenue categories yet.</p>
                                <button type="button" onClick={() => setAdding(true)} className="text-xs text-alloy-bend-pine hover:text-alloy-bend-pine/80 font-medium mt-1">+ Add the first one</button>
                            </div>
                        ) : revenueCats.length > 0 ? (
                            <div className="rounded-xl border border-alloy-stone/20 overflow-hidden">
                                <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 bg-alloy-stone/5 border-b border-alloy-stone/15 text-[10px] font-medium text-alloy-midnight/55 uppercase tracking-wide">
                                    <span>Revenue category</span>
                                    <span className="text-right">Products</span>
                                    <span className="text-right">GL account</span>
                                </div>
                                {revenueCats.map(rc => {
                                    const isMapping = mappingId === rc.id;
                                    const mapped = glLabel(rc.mapped_gl_account_id);
                                    return (
                                        <div key={rc.id} className="group grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 border-b border-alloy-stone/8 last:border-0 items-center">
                                            <span className="text-sm text-alloy-midnight font-medium flex items-center gap-1.5">
                                                {rc.label}
                                                <button type="button" onClick={() => void deleteCategory(rc.id)} className="opacity-0 group-hover:opacity-100 text-[11px] text-alloy-midnight/40 hover:text-red-400 transition-all" title="Remove">✕</button>
                                            </span>
                                            <span className="text-xs text-alloy-midnight/65 text-right tabular-nums">{productCountFor(rc)}</span>
                                            {isMapping ? (
                                                <span className="flex items-center gap-1 justify-end">
                                                    <select defaultValue={rc.mapped_gl_account_id ?? ""} onChange={e => void mapCategory(rc.id, e.target.value)} disabled={savingMap} className="rounded border border-alloy-bend-pine/40 px-1.5 py-0.5 text-xs text-alloy-midnight bg-white focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20" autoFocus>
                                                        <option value="">Unmapped</option>
                                                        {activeGl.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                                                    </select>
                                                    <button type="button" onClick={() => setMappingId(null)} className="text-xs text-alloy-midnight/45 hover:text-alloy-midnight">✕</button>
                                                </span>
                                            ) : (
                                                <button type="button" onClick={() => setMappingId(rc.id)} className="text-right text-[11px] focus:outline-none">
                                                    {mapped
                                                        ? <span className="text-alloy-midnight/70 font-mono">{mapped}</span>
                                                        : <span className="text-alloy-ember/90 hover:text-alloy-ember">Needs accounting mapping</span>}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                    </section>
                )}

                {/* ── GL Accounts (operable chart of accounts) ── */}
                {tab === "gl_accounts" && (
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-alloy-midnight/60">The chart of accounts. Shared with Financials; revenue categories map to these.</p>
                            {!glAdding && (
                                <button type="button" onClick={() => { setGlAdding(true); setGlError(null); }} className="flex items-center gap-1.5 rounded-md bg-alloy-bend-pine px-3 py-1.5 text-xs font-medium text-white hover:bg-alloy-bend-pine/85 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/40">
                                    <span className="text-sm leading-none">+</span> GL account
                                </button>
                            )}
                        </div>

                        {glError && (
                            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{glError}</div>
                        )}

                        {glAdding && (
                            <div className="rounded-xl border border-alloy-stone/20 bg-white p-4 shadow-sm space-y-3">
                                <div className="grid grid-cols-[7rem_1fr_8rem] gap-3">
                                    <label className="block">
                                        <span className="text-[10px] font-medium text-alloy-midnight/55 uppercase tracking-wide">Code *</span>
                                        <input value={glCode} onChange={e => setGlCode(e.target.value)} placeholder="4050" className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm font-mono text-alloy-midnight placeholder:text-alloy-midnight/38 focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20" />
                                    </label>
                                    <label className="block">
                                        <span className="text-[10px] font-medium text-alloy-midnight/55 uppercase tracking-wide">Account name *</span>
                                        <input value={glName} onChange={e => setGlName(e.target.value)} placeholder="e.g. Enrichment Revenue" className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight placeholder:text-alloy-midnight/38 focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20" />
                                    </label>
                                    <label className="block">
                                        <span className="text-[10px] font-medium text-alloy-midnight/55 uppercase tracking-wide">Type</span>
                                        <select value={glType} onChange={e => setGlType(e.target.value)} className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20 bg-white">
                                            {GL_ACCOUNT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                                        </select>
                                    </label>
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                    <button type="button" onClick={() => { setGlAdding(false); setGlCode(""); setGlName(""); setGlType("revenue"); setGlError(null); }} className="text-xs text-alloy-midnight/55 hover:text-alloy-midnight px-2 py-1">Cancel</button>
                                    <button type="button" onClick={() => void createGlAccount()} disabled={glSaving || !glCode.trim()} className="rounded bg-alloy-bend-pine px-3 py-1 text-xs font-medium text-white hover:bg-alloy-bend-pine/85 disabled:opacity-40">{glSaving ? "Saving…" : "Save"}</button>
                                </div>
                            </div>
                        )}

                        {sortedGl.length === 0 && !glAdding ? (
                            <div className="rounded-xl border border-dashed border-alloy-stone/25 px-4 py-6 text-center">
                                <p className="text-sm text-alloy-midnight/60">No GL accounts yet.</p>
                                <button type="button" onClick={() => setGlAdding(true)} className="text-xs text-alloy-bend-pine hover:text-alloy-bend-pine/80 font-medium mt-1">+ Add the first account</button>
                            </div>
                        ) : sortedGl.length > 0 ? (
                            <div className="rounded-xl border border-alloy-stone/20 overflow-hidden">
                                <div className="grid grid-cols-[6rem_1fr_6rem_auto] gap-3 px-4 py-2 bg-alloy-stone/5 border-b border-alloy-stone/15 text-[10px] font-medium text-alloy-midnight/55 uppercase tracking-wide">
                                    <span>Code</span>
                                    <span>Account</span>
                                    <span>Type</span>
                                    <span />
                                </div>
                                {sortedGl.map(a => {
                                    const editing = glEditingId === a.id;
                                    const inactive = a.is_active === false;
                                    return (
                                        <div key={a.id} className={`group grid grid-cols-[6rem_1fr_6rem_auto] gap-3 px-4 py-2.5 border-b border-alloy-stone/8 last:border-0 items-center ${inactive ? "opacity-55" : ""}`}>
                                            {editing ? (
                                                <>
                                                    <input value={glEditCode} onChange={e => setGlEditCode(e.target.value)} className="rounded border border-alloy-bend-pine/40 px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20" />
                                                    <input value={glEditName} onChange={e => setGlEditName(e.target.value)} className="rounded border border-alloy-bend-pine/40 px-1.5 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20" />
                                                    <select value={glEditType} onChange={e => setGlEditType(e.target.value)} className="rounded border border-alloy-bend-pine/40 px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20">
                                                        {GL_ACCOUNT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                                                    </select>
                                                    <span className="flex items-center gap-1 justify-end">
                                                        <button type="button" onClick={() => void saveGlEdit(a.id)} disabled={glSaving} className="text-xs font-medium text-alloy-bend-pine hover:text-alloy-bend-pine/70 disabled:opacity-40">✓</button>
                                                        <button type="button" onClick={() => setGlEditingId(null)} className="text-xs text-alloy-midnight/45 hover:text-alloy-midnight">✕</button>
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-xs text-alloy-midnight/70 font-mono">{a.code}</span>
                                                    <span className="text-sm text-alloy-midnight">{a.name}{inactive && <span className="ml-1.5 text-[10px] text-alloy-midnight/45">(archived)</span>}</span>
                                                    <span className="text-[11px] text-alloy-midnight/55 capitalize">{a.type}</span>
                                                    <span className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button type="button" onClick={() => startGlEdit(a)} className="text-[11px] text-alloy-midnight/55 hover:text-alloy-bend-pine">Edit</button>
                                                        {inactive
                                                            ? <button type="button" onClick={() => void setGlActive(a, true)} className="text-[11px] text-alloy-bend-pine/80 hover:text-alloy-bend-pine">Restore</button>
                                                            : <button type="button" onClick={() => void setGlActive(a, false)} className="text-[11px] text-alloy-midnight/45 hover:text-alloy-ember">Archive</button>}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                    </section>
                )}

                {/* ── Mapping Review ── */}
                {tab === "mapping_review" && (
                    <section className="space-y-3">
                        <div className="rounded-xl border border-alloy-bend-pine/25 bg-alloy-bend-pine/5 px-4 py-3">
                            <div className="flex items-center gap-2 text-xs font-medium flex-wrap">
                                <span className="rounded-md bg-white border border-alloy-stone/25 px-2.5 py-1 text-alloy-midnight/75">Commercial product</span>
                                <span className="text-alloy-bend-pine">→</span>
                                <span className="rounded-md bg-alloy-bend-pine/12 border border-alloy-bend-pine/30 px-2.5 py-1 text-alloy-bend-pine font-semibold">Revenue category</span>
                                <span className="text-alloy-bend-pine">→</span>
                                <span className="rounded-md bg-white border border-alloy-stone/25 px-2.5 py-1 text-alloy-midnight/75">GL account</span>
                            </div>
                        </div>

                        {unmappedCount > 0 ? (
                            <div className="rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2.5">
                                <p className="text-xs font-medium text-alloy-midnight/75 mb-1.5">Unmapped revenue categories ({unmappedCount})</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {revenueCats.filter(c => !c.mapped_gl_account_id).map(c => (
                                        <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-alloy-ember/30 bg-white px-2 py-0.5 text-[11px] text-alloy-midnight/70">
                                            {c.label} <span className="text-alloy-midnight/45">· {productCountFor(c)} product{productCountFor(c) !== 1 ? "s" : ""}</span>
                                        </span>
                                    ))}
                                </div>
                                <p className="text-[10px] text-alloy-midnight/55 mt-1.5">Map these on the Revenue Categories tab so their revenue posts to a GL account.</p>
                            </div>
                        ) : (
                            <p className="text-xs text-alloy-bend-pine">All revenue categories are mapped to a GL account.</p>
                        )}

                        <div className="rounded-xl border border-alloy-stone/20 overflow-hidden">
                            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 px-4 py-2 bg-alloy-stone/5 border-b border-alloy-stone/15 text-[10px] font-medium text-alloy-midnight/55 uppercase tracking-wide">
                                <span>Revenue category</span>
                                <span className="text-right">Products</span>
                                <span>GL account</span>
                            </div>
                            {revenueCats.map(rc => {
                                const mapped = glLabel(rc.mapped_gl_account_id);
                                return (
                                    <div key={rc.id} className="grid grid-cols-[1fr_auto_1fr] gap-3 px-4 py-2.5 border-b border-alloy-stone/8 last:border-0 items-center">
                                        <span className="text-sm text-alloy-midnight font-medium">{rc.label}</span>
                                        <span className="text-xs text-alloy-midnight/65 text-right tabular-nums">{productCountFor(rc)}</span>
                                        {mapped
                                            ? <span className="text-[11px] text-alloy-midnight/70 font-mono">{mapped}</span>
                                            : <span className="text-[11px] text-alloy-ember/90">Needs accounting mapping</span>}
                                    </div>
                                );
                            })}
                            {revenueCats.length === 0 && (
                                <div className="px-4 py-4 text-xs text-alloy-midnight/55">No revenue categories yet.</div>
                            )}
                        </div>
                    </section>
                )}

                <section className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/3 px-4 py-3">
                    <p className="text-xs font-medium text-alloy-midnight/60 mb-1">What lives here</p>
                    <p className="text-xs text-alloy-midnight/60 leading-relaxed">
                        GL accounts are the shared chart of accounts (owned by Accounting/Financials). Commercial revenue categories map to them by reference — Commercial never stores GL codes directly. Posting itself is a later stage.
                    </p>
                </section>

            </div>
        </div>
    );
}

// ─── CommercialCatalogPanel ────────────────────────────────────────────────────
// Single source of truth: commercial_products. The commercial type selector
// drives which behavior fields appear. Category is chosen from configurable
// commercial_categories. No legacy tables, no internal keys exposed.

function CommercialCatalogPanel({
    products,
    categories,
    revenueCategories,
    locations,
    programs,
    loading,
    onProductCreated,
    onProductUpdated,
    onProductDeleted,
    onCategoryCreated,
}: {
    products: CommercialProduct[];
    categories: CommercialCategory[];
    revenueCategories: CommercialRevenueCategory[];
    locations: { id: string; name: string }[];
    programs: { key: string; label: string; siteCount: number }[];
    loading: boolean;
    onProductCreated: (p: CommercialProduct) => void;
    onProductUpdated: (p: CommercialProduct) => void;
    onProductDeleted: (id: string) => void;
    onCategoryCreated: (c: CommercialCategory) => void;
}) {
    // ── Shared form state ─────────────────────────────────────────────────────────
    const [name, setName] = useState("");
    const [commercialType, setCommercialType] = useState<CommercialType | "">("");
    const [amount, setAmount] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [revCatId, setRevCatId] = useState("");
    const [locId, setLocId] = useState("");
    const [progKey, setProgKey] = useState("");
    const [effStart, setEffStart] = useState("");
    const [effEnd, setEffEnd] = useState("");
    // Fee-specific
    const [feeFreq, setFeeFreq] = useState("");
    const [feeRequired, setFeeRequired] = useState(true);
    // Addon-specific
    const [addonFreq, setAddonFreq] = useState("monthly");
    const [addonIsPkg, setAddonIsPkg] = useState(false);
    const [pkgCount, setPkgCount] = useState("");
    const [pkgUnit, setPkgUnit] = useState("uses");
    const [pkgExpiry, setPkgExpiry] = useState("");
    // Deposit-specific
    const [depositTiming, setDepositTiming] = useState("At enrollment");
    const [depositRefundable, setDepositRefundable] = useState(true);
    const [depositApplyToBalance, setDepositApplyToBalance] = useState(false);
    // Control
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    // Inline "add category"
    const [addingCategory, setAddingCategory] = useState(false);
    const [newCategoryLabel, setNewCategoryLabel] = useState("");
    const [savingCategory, setSavingCategory] = useState(false);

    const catOptions = useMemo(() => activeCategories(categories), [categories]);
    const sorted = useMemo(() => sortProducts(products), [products]);

    function reset() {
        setName(""); setCommercialType(""); setAmount(""); setCategoryId(""); setRevCatId("");
        setLocId(""); setProgKey(""); setEffStart(""); setEffEnd("");
        setFeeFreq(""); setFeeRequired(true);
        setAddonFreq("monthly"); setAddonIsPkg(false);
        setPkgCount(""); setPkgUnit("uses"); setPkgExpiry("");
        setDepositTiming("At enrollment"); setDepositRefundable(true); setDepositApplyToBalance(false);
        setAddingCategory(false); setNewCategoryLabel("");
    }
    function startAdd() { reset(); setEditingId(null); setAdding(true); }
    function cancel() { reset(); setAdding(false); setEditingId(null); }

    function startEdit(p: CommercialProduct) {
        reset();
        setAdding(false);
        setEditingId(p.id);
        setName(p.name);
        setCommercialType(p.commercial_type);
        setAmount(String(p.amount_cents / 100));
        setCategoryId(p.category_id ?? "");
        setRevCatId(p.revenue_category_id ?? "");
        setLocId(p.location_id ?? "");
        setProgKey(p.program_key ?? "");
        setEffStart(p.effective_start ?? "");
        setEffEnd(p.effective_end ?? "");
        if (p.commercial_type === "fee") {
            setFeeFreq(p.cadence_key ?? ""); setFeeRequired(feeIsRequired(p));
        } else if (p.commercial_type === "addon") {
            setAddonFreq(p.cadence_key ?? "monthly");
            const pkg = getPackage(p);
            setAddonIsPkg(!!pkg);
            setPkgCount(pkg?.unit_count != null ? String(pkg.unit_count) : "");
            setPkgUnit(pkg?.unit_type ?? "uses");
            setPkgExpiry(pkg?.expires_days != null ? String(pkg.expires_days) : "");
        } else {
            const b = depositBehavior(p);
            setDepositTiming(b?.due_timing ?? "At enrollment");
            setDepositRefundable(b?.refundable !== false);
            setDepositApplyToBalance(b?.apply_to_balance === true);
        }
    }

    const formValid = name.trim().length > 0 && !!commercialType
        && Number.isFinite(parseFloat(amount)) && parseFloat(amount) >= 0
        && (commercialType !== "addon" || addonFreq.length > 0);

    async function save() {
        if (!formValid || !commercialType) return;
        const cents = Math.round(parseFloat(amount) * 100);
        const cadence_key = commercialType === "fee" ? (feeFreq || null)
            : commercialType === "addon" ? addonFreq
            : null;
        const behavior = buildBehavior(commercialType, {
            required: feeRequired,
            isPackage: addonIsPkg,
            packageCount: pkgCount ? parseInt(pkgCount, 10) : null,
            packageUnit: pkgUnit,
            packageExpiresDays: pkgExpiry ? parseInt(pkgExpiry, 10) : null,
            refundable: depositRefundable,
            applyToBalance: depositApplyToBalance,
            dueTiming: depositTiming,
        });
        const body = {
            name: name.trim(),
            commercial_type: commercialType,
            category_id: categoryId || null,
            amount_cents: cents,
            cadence_key,
            revenue_category_id: revCatId || null,
            location_id: locId || null,
            program_key: progKey || null,
            effective_start: effStart || null,
            effective_end: effEnd || null,
            behavior,
        };
        setSaving(true);
        try {
            if (editingId) {
                const r = await fetch(`/api/admin/commercial/products/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                const j = (await r.json()) as { product?: CommercialProduct };
                if (j.product) { onProductUpdated(j.product); cancel(); }
            } else {
                const r = await fetch("/api/admin/commercial/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                const j = (await r.json()) as { product?: CommercialProduct };
                if (j.product) { onProductCreated(j.product); cancel(); }
            }
        } finally { setSaving(false); }
    }

    async function deleteProduct(p: CommercialProduct) {
        await fetch(`/api/admin/commercial/products/${p.id}`, { method: "DELETE" });
        onProductDeleted(p.id);
    }

    async function saveNewCategory() {
        const label = newCategoryLabel.trim();
        if (!label) return;
        setSavingCategory(true);
        try {
            const r = await fetch("/api/admin/commercial/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
            const j = (await r.json()) as { category?: CommercialCategory };
            if (j.category) { onCategoryCreated(j.category); setCategoryId(j.category.id); setAddingCategory(false); setNewCategoryLabel(""); }
        } finally { setSavingCategory(false); }
    }

    const TYPE_BADGE: Record<CommercialType, string> = {
        fee:     "bg-alloy-bend-pine/8 text-alloy-bend-pine/80",
        addon:   "bg-alloy-stone/12 text-alloy-midnight/60",
        deposit: "bg-alloy-forge/5 text-alloy-midnight/65",
    };
    const TYPE_LABEL: Record<CommercialType, string> = { fee: "Fee", addon: "Add-on", deposit: "Deposit" };

    function formatAmount(cents: number) {
        return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
    }

    const isFormOpen = adding || editingId !== null;

    const categoryField = (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-alloy-midnight/55 uppercase tracking-wide">Category</span>
                {!addingCategory && (
                    <button type="button" onClick={() => setAddingCategory(true)} className="text-[10px] text-alloy-bend-pine/75 hover:text-alloy-bend-pine font-medium">+ New category</button>
                )}
            </div>
            {addingCategory ? (
                <div className="flex items-center gap-2">
                    <input
                        value={newCategoryLabel}
                        onChange={e => setNewCategoryLabel(e.target.value)}
                        placeholder="e.g. After-school"
                        className="flex-1 rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight placeholder:text-alloy-midnight/38 focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20"
                    />
                    <button type="button" onClick={() => void saveNewCategory()} disabled={savingCategory || !newCategoryLabel.trim()} className="rounded bg-alloy-bend-pine px-2.5 py-1 text-xs font-medium text-white hover:bg-alloy-bend-pine/85 disabled:opacity-40">{savingCategory ? "…" : "Add"}</button>
                    <button type="button" onClick={() => { setAddingCategory(false); setNewCategoryLabel(""); }} className="text-xs text-alloy-midnight/45 hover:text-alloy-midnight px-1">Cancel</button>
                </div>
            ) : (
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20 bg-white">
                    <option value="">Uncategorized</option>
                    {catOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
            )}
        </div>
    );

    const formPanel = (
        <div className="rounded-xl border border-alloy-stone/20 bg-white p-6 space-y-5 shadow-sm">
            <div className="flex items-center gap-2 pb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-alloy-bend-pine" />
                <h3 className="text-sm font-semibold text-alloy-midnight">{editingId ? "Edit product" : "New commercial product"}</h3>
            </div>

            <CField label="What are you charging for? *" value={name} onChange={setName} placeholder="e.g. Registration Fee" required />

            {/* Commercial type — guided selection cards (choosing a product behavior) */}
            <div className="space-y-1.5">
                <span className="text-[10px] font-medium text-alloy-midnight/55 uppercase tracking-wide">
                    What kind of product is this?{!editingId && " *"}
                </span>
                <div className="grid grid-cols-3 gap-2">
                    {COMMERCIAL_TYPE_OPTIONS.map(opt => {
                        const selected = commercialType === opt.key;
                        return (
                            <button
                                key={opt.key}
                                type="button"
                                disabled={!!editingId}
                                onClick={() => { if (!editingId) setCommercialType(opt.key); }}
                                className={[
                                    "text-left rounded-xl border p-3.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/40",
                                    selected
                                        ? "border-alloy-bend-pine bg-alloy-bend-pine/8 shadow-sm ring-1 ring-alloy-bend-pine/30"
                                        : "border-alloy-stone/25 bg-white hover:border-alloy-bend-pine/40 hover:shadow-sm",
                                    editingId && !selected ? "opacity-40 cursor-not-allowed" : editingId ? "cursor-not-allowed" : "cursor-pointer",
                                ].join(" ")}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className={`text-sm font-semibold ${selected ? "text-alloy-bend-pine" : "text-alloy-midnight"}`}>{opt.label}</span>
                                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${selected ? "border-alloy-bend-pine bg-alloy-bend-pine" : "border-alloy-stone/35"}`}>
                                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </span>
                                </div>
                                <p className="text-[11px] leading-snug text-alloy-midnight/60">{opt.description}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {commercialType && (
                <>
                    {/* ── Pricing ── */}
                    <FormStep label="Pricing" />
                    <div className="grid grid-cols-2 gap-3">
                        <CField label="Amount ($) *" value={amount} onChange={setAmount} placeholder="0.00" />
                        {commercialType === "fee" && (
                            <CSelect label="Frequency" value={feeFreq} onChange={setFeeFreq} options={FREQUENCY_OPTIONS.map(o => ({ key: o.key, label: o.label }))} />
                        )}
                        {commercialType === "addon" && (
                            <CSelect label="Frequency *" value={addonFreq} onChange={setAddonFreq} options={FREQUENCY_OPTIONS.map(o => ({ key: o.key, label: o.label }))} />
                        )}
                        {commercialType === "deposit" && (
                            <CSelect label="When is it due?" value={depositTiming} onChange={setDepositTiming} options={DUE_TIMING_OPTIONS} />
                        )}
                    </div>

                    {commercialType === "fee" && (
                        <CToggle label="Required" checked={feeRequired} onChange={setFeeRequired} hint="Applied automatically to all enrollments" />
                    )}

                    {commercialType === "addon" && (
                        <>
                            <CToggle label="This is a pass or package" checked={addonIsPkg} onChange={setAddonIsPkg} hint="e.g. 5-session pass valid 30 days" />
                            {addonIsPkg && (
                                <div className="grid grid-cols-3 gap-3 pl-4 border-l-2 border-alloy-bend-pine/25">
                                    <CField label="Count" value={pkgCount} onChange={setPkgCount} placeholder="5" type="number" />
                                    <CSelect label="Unit" value={pkgUnit} onChange={setPkgUnit} options={PACKAGE_UNIT_TYPE_OPTIONS.map(u => ({ key: u, label: u }))} />
                                    <CField label="Expires after (days)" value={pkgExpiry} onChange={setPkgExpiry} placeholder="30" type="number" />
                                </div>
                            )}
                        </>
                    )}

                    {commercialType === "deposit" && (
                        <div className="flex items-center gap-6">
                            <CToggle label="Refundable" checked={depositRefundable} onChange={setDepositRefundable} />
                            <CToggle label="Apply to first balance" checked={depositApplyToBalance} onChange={setDepositApplyToBalance} hint="Credits toward first tuition charge" />
                        </div>
                    )}

                    {/* ── Where it applies ── */}
                    <FormStep label="Where it applies" />
                    <ScopeFields locationId={locId} setLocationId={setLocId} programKey={progKey} setProgramKey={setProgKey} locations={locations} programs={programs} />
                    <div className="grid grid-cols-2 gap-3">
                        <CField label="Activates on (optional)" value={effStart} onChange={setEffStart} type="date" />
                        <CField label="Expires on (optional)" value={effEnd} onChange={setEffEnd} type="date" />
                    </div>

                    {/* ── Revenue ── */}
                    <FormStep label="Revenue" hint="Groups the product for reporting and Accounting" />
                    {categoryField}
                    <label className="block">
                        <span className="text-[10px] font-medium text-alloy-midnight/55 uppercase tracking-wide">Revenue category</span>
                        <select
                            value={revCatId}
                            onChange={e => setRevCatId(e.target.value)}
                            className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-sm text-alloy-midnight focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20 bg-white"
                        >
                            <option value="">None</option>
                            {activeRevenueCategories(revenueCategories).map(rc => (
                                <option key={rc.id} value={rc.id}>{rc.label}</option>
                            ))}
                        </select>
                        {revCatId && (() => {
                            const rc = revenueCategories.find(c => c.id === revCatId);
                            if (rc && !isRevenueCategoryMapped(rc)) {
                                return <span className="mt-1 inline-block text-[10px] text-alloy-ember/90">Needs accounting mapping — map it to a GL account in the Accounting tab.</span>;
                            }
                            return null;
                        })()}
                        {revenueCategories.length === 0 && (
                            <span className="mt-1 inline-block text-[10px] text-alloy-midnight/50">Create revenue categories in the Accounting tab.</span>
                        )}
                    </label>
                </>
            )}

            <SaveBar onSave={() => void save()} onCancel={cancel} saving={saving} disabled={!formValid} />
        </div>
    );

    if (loading) {
        return <div className="flex items-center justify-center flex-1 text-sm text-alloy-midnight/55 py-16">Loading…</div>;
    }

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-alloy-midnight">Commercial Catalog</h2>
                        <p className="text-xs text-alloy-midnight/60 mt-0.5">
                            Everything beyond tuition — {products.length} item{products.length !== 1 ? "s" : ""} configured.
                        </p>
                    </div>
                    {!isFormOpen && (
                        <button
                            type="button"
                            onClick={startAdd}
                            className="flex items-center gap-1.5 rounded-md bg-alloy-bend-pine px-3 py-1.5 text-xs font-medium text-white hover:bg-alloy-bend-pine/85 transition-colors"
                        >
                            <span className="text-sm leading-none">+</span> Add item
                        </button>
                    )}
                </div>

                {adding && formPanel}

                {sorted.length === 0 && !adding ? (
                    <EmptySlate label="Nothing configured yet. Add your first fee, add-on, or deposit." onAdd={startAdd} />
                ) : sorted.length > 0 ? (
                    <div className="space-y-2">
                        {sorted.map(p => (
                            <div key={p.id}>
                                {editingId === p.id ? formPanel : (
                                    <CommercialCard onClick={() => startEdit(p)}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1 space-y-0.5">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-medium text-alloy-midnight">{p.name}</span>
                                                    <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${TYPE_BADGE[p.commercial_type]}`}>{TYPE_LABEL[p.commercial_type]}</span>
                                                    {p.category_id && categoryLabel(p.category_id, categories) && (
                                                        <span className="text-[10px] text-alloy-midnight/55 bg-alloy-stone/10 rounded px-1.5 py-0.5">{categoryLabel(p.category_id, categories)}</span>
                                                    )}
                                                    {p.commercial_type === "fee" && feeIsRequired(p) && (
                                                        <span className="text-[10px] text-alloy-bend-pine/80 font-medium">Required</span>
                                                    )}
                                                    {p.commercial_type === "addon" && isPackageProduct(p) && (
                                                        <span className="text-[10px] text-alloy-midnight/55 bg-alloy-stone/8 rounded px-1.5 py-0.5">{describePackage(p)}</span>
                                                    )}
                                                    {p.commercial_type === "deposit" && depositBehavior(p)?.refundable && (
                                                        <span className="text-[10px] text-alloy-midnight/55 bg-alloy-stone/10 rounded px-1.5 py-0.5">Refundable</span>
                                                    )}
                                                    {p.commercial_type === "deposit" && depositBehavior(p)?.apply_to_balance && (
                                                        <span className="text-[10px] text-alloy-bend-pine/70 bg-alloy-bend-pine/6 rounded px-1.5 py-0.5">Credits balance</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-semibold text-alloy-midnight">{formatAmount(p.amount_cents)}</span>
                                                    {p.commercial_type !== "deposit" ? (
                                                        <span className="text-[10px] text-alloy-bend-pine/70 bg-alloy-bend-pine/6 rounded px-1.5 py-0.5 whitespace-nowrap font-medium">{frequencyLabel(p.cadence_key)}</span>
                                                    ) : (
                                                        <span className="text-[10px] text-alloy-midnight/60 bg-alloy-stone/8 rounded px-1.5 py-0.5">Due: {depositBehavior(p)?.due_timing}</span>
                                                    )}
                                                    <ScopeBadge locationId={p.location_id} programKey={p.program_key} locations={locations} programs={programs} />
                                                    {(() => {
                                                        const rc = p.revenue_category_id ? revenueCategories.find(c => c.id === p.revenue_category_id) : null;
                                                        if (rc) {
                                                            return isRevenueCategoryMapped(rc)
                                                                ? <span className="text-[10px] text-alloy-midnight/55 italic">{rc.label}</span>
                                                                : <span className="text-[10px] text-alloy-ember/90">{rc.label} · needs mapping</span>;
                                                        }
                                                        if (p.revenue_category) return <span className="text-[10px] text-alloy-midnight/45 italic">{p.revenue_category}</span>;
                                                        return null;
                                                    })()}
                                                </div>
                                                {(p.effective_start || p.effective_end) && (
                                                    <p className="text-[10px] text-alloy-midnight/55">
                                                        {p.effective_start ? `Active from ${p.effective_start}` : ""}
                                                        {p.effective_end ? ` · expires ${p.effective_end}` : ""}
                                                    </p>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); void deleteProduct(p); }}
                                                className="opacity-0 group-hover:opacity-100 text-[11px] text-alloy-midnight/35 hover:text-red-400 transition-all flex-shrink-0 px-1"
                                                title="Remove from catalog"
                                            >✕</button>
                                        </div>
                                    </CommercialCard>
                                )}
                            </div>
                        ))}
                    </div>
                ) : null}

                <section className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/3 px-4 py-3">
                    <p className="text-xs font-medium text-alloy-midnight/60 mb-1">Revenue mapping</p>
                    <p className="text-xs text-alloy-midnight/55 leading-relaxed">
                        <span className="font-medium text-alloy-midnight/65">Category</span> groups products for your team. <span className="font-medium text-alloy-midnight/65">Revenue category</span> is the reference Accounting maps to a GL code — Commercial defines what a charge is; Accounting decides where it posts.
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

    // Commercial Catalog state (lazy-loaded when the Catalog tab is first activated)
    const [products, setProducts] = useState<CommercialProduct[]>([]);
    const [commercialCategories, setCommercialCategories] = useState<CommercialCategory[]>([]);
    const [revenueCategories, setRevenueCategories] = useState<CommercialRevenueCategory[]>([]);
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
            const [productsRes, catsRes, revCatsRes] = await Promise.all([
                fetch("/api/admin/commercial/products"),
                fetch("/api/admin/commercial/categories?include_inactive=true"),
                fetch("/api/admin/commercial/revenue-categories"),
            ]);
            const productsJson = (await productsRes.json()) as { products?: CommercialProduct[] };
            const catsJson = (await catsRes.json()) as { categories?: CommercialCategory[] };
            const revCatsJson = (await revCatsRes.json()) as { revenue_categories?: CommercialRevenueCategory[] };
            setProducts(productsJson.products ?? []);
            setCommercialCategories(catsJson.categories ?? []);
            setRevenueCategories(revCatsJson.revenue_categories ?? []);
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
        if (activeSection === "fees" || activeSection === "accounting") void loadFeesData();
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
                        onClick={() => { if (tab.available && (tab.key === "programs_tuition" || tab.key === "fees" || tab.key === "accounting")) setActiveSection(tab.key); }}
                        className={`px-4 py-3 text-sm -mb-px border-b-2 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/40 rounded-sm ${activeSection === tab.key ? "border-alloy-bend-pine text-alloy-bend-pine font-medium" : tab.available ? "border-transparent text-alloy-midnight/60 hover:text-alloy-midnight" : "border-transparent text-alloy-midnight/45 cursor-not-allowed"}`}
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

            {activeSection === "accounting" ? (
                <AccountingReferencePanel products={products} loading={feesLoading} />
            ) : activeSection === "fees" ? (
                <CommercialCatalogPanel
                    products={products}
                    categories={commercialCategories}
                    revenueCategories={revenueCategories}
                    locations={locations}
                    programs={programs}
                    loading={feesLoading}
                    onProductCreated={(p) => setProducts((prev) => sortProducts([...prev, p]))}
                    onProductUpdated={(p) => setProducts((prev) => sortProducts(prev.map((x) => x.id === p.id ? p : x)))}
                    onProductDeleted={(id) => setProducts((prev) => prev.filter((x) => x.id !== id))}
                    onCategoryCreated={(c) => setCommercialCategories((prev) => [...prev, c])}
                />
            ) : (
                <ConfigurationShell queueColumn={programQueueColumn}>
                    {selectedProgram ? (
                        <div className="flex flex-col min-h-0 flex-1">
                            <div className="flex border-b border-alloy-stone/15 px-6 bg-white flex-shrink-0">
                                {(["programs", "tuition"] as const).map((tab) => (
                                    <button key={tab} type="button" onClick={() => setSecondaryTab(tab)} className={`px-3 py-2.5 text-sm capitalize -mb-px border-b-2 transition-colors ${secondaryTab === tab ? "border-alloy-bend-pine text-alloy-bend-pine font-medium" : "border-transparent text-alloy-midnight/55 hover:text-alloy-midnight"}`}>
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

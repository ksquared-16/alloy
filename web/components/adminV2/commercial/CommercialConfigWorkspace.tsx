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
type OnSave = (variantId: string, cadenceKey: string, payload: { rate_cents?: number; not_offered?: boolean }) => Promise<void>;

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

// ─── CadenceRateRow ─────────────────────────────────────────────────────────────

function CadenceRateRow({ variant, cadence, rateRow, locationId, onSave, onClear }: {
    variant: ProgramOfferingVariant;
    cadence: BillingCadence;
    rateRow: TuitionRateRow;
    locationId: string | null;
    onSave: OnSave;
    onClear: (id: string) => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const isLocationView = locationId !== null;
    const isLocOverride = isLocationView && rateRow.location_id === locationId;
    const isInherited = isLocationView && rateRow.location_id === null;
    const isNotOffered = rateRow.not_offered === true;

    function startEdit() {
        if (isNotOffered) return;
        setDraft(rateRow.rate_cents > 0 ? String(rateRow.rate_cents / 100) : "");
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    }

    async function commitEdit() {
        const cents = parseDollarsToCents(draft);
        if (cents === null) { setEditing(false); return; }
        setSaving(true);
        await onSave(variant.id, cadence.item_key, { rate_cents: cents });
        setSaving(false);
        setEditing(false);
    }

    async function toggleNotOffered() {
        setSaving(true);
        await onSave(variant.id, cadence.item_key, { not_offered: !isNotOffered });
        setSaving(false);
    }

    async function handleRemove() {
        if (!rateRow.id || isInherited) return;
        setSaving(true);
        await onClear(rateRow.id);
        setSaving(false);
    }

    return (
        <div className={`flex items-center gap-3 px-4 py-2.5 group border-b border-alloy-stone/10 last:border-0 ${saving ? "opacity-50" : ""}`}>
            <span className="text-sm text-alloy-midnight/50 w-24 shrink-0">{cadence.label}</span>
            <div className="flex-1">
                {editing ? (
                    <input
                        ref={inputRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => void commitEdit()}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void commitEdit();
                            if (e.key === "Escape") setEditing(false);
                        }}
                        className="w-28 rounded border border-alloy-pine/50 bg-white px-2 py-0.5 text-sm text-right focus:outline-none"
                        placeholder="0.00"
                    />
                ) : isNotOffered ? (
                    <span className="text-sm text-alloy-midnight/30 line-through">N/A</span>
                ) : rateRow.rate_cents > 0 ? (
                    <button
                        type="button"
                        onClick={startEdit}
                        className={`text-sm font-medium hover:text-alloy-pine transition-colors flex items-center gap-1.5 ${isInherited ? "text-alloy-midnight/40 italic font-normal" : "text-alloy-midnight"}`}
                    >
                        {isLocOverride && <span className="w-1.5 h-1.5 rounded-full bg-alloy-pine/70 shrink-0" />}
                        {formatRateCents(rateRow.rate_cents)}
                        {isInherited && <span className="ml-1 text-xs text-alloy-midnight/30 font-normal not-italic">(org default)</span>}
                    </button>
                ) : (
                    <button type="button" onClick={startEdit} className="text-sm text-alloy-midnight/25 hover:text-alloy-pine transition-colors">Set price…</button>
                )}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                    type="button"
                    onClick={() => void toggleNotOffered()}
                    className={`rounded px-1.5 py-0.5 text-xs transition-colors ${isNotOffered ? "bg-alloy-stone/25 text-alloy-midnight/50 hover:bg-alloy-stone/40" : "text-alloy-midnight/30 hover:text-alloy-midnight/60 hover:bg-alloy-stone/15"}`}
                >
                    {isNotOffered ? "↩ offered" : "N/A"}
                </button>
                {!isInherited && (
                    <button type="button" onClick={() => void handleRemove()} className="text-alloy-midnight/20 hover:text-red-400 text-sm px-1 transition-colors" title={isLocOverride ? "Remove location override" : "Remove rate basis"}>×</button>
                )}
            </div>
        </div>
    );
}

// ─── AddCadenceRow ─────────────────────────────────────────────────────────────

function AddCadenceRow({ variantId, availableCadences, onSave }: {
    variantId: string;
    availableCadences: BillingCadence[];
    onSave: OnSave;
}) {
    const [expanded, setExpanded] = useState(false);
    const [selectedKey, setSelectedKey] = useState(availableCadences[0]?.item_key ?? "");
    const [draft, setDraft] = useState("");
    const [notOffered, setNotOffered] = useState(false);
    const [adding, setAdding] = useState(false);

    async function handleAdd() {
        if (!selectedKey) return;
        setAdding(true);
        if (notOffered) {
            await onSave(variantId, selectedKey, { not_offered: true });
        } else {
            const cents = parseDollarsToCents(draft);
            if (cents === null) { setAdding(false); return; }
            await onSave(variantId, selectedKey, { rate_cents: cents });
        }
        setAdding(false);
        setExpanded(false);
        setDraft("");
        setNotOffered(false);
    }

    if (!expanded) {
        return (
            <div className="px-4 py-2">
                <button type="button" onClick={() => setExpanded(true)} className="text-xs text-alloy-pine/70 hover:text-alloy-pine transition-colors flex items-center gap-1">
                    <span className="text-base leading-none">+</span> Add rate basis
                </button>
            </div>
        );
    }

    return (
        <div className="px-4 py-2.5 bg-alloy-stone/5 border-t border-alloy-stone/10">
            <div className="flex items-center gap-2 flex-wrap">
                <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} className={inputCls}>
                    {availableCadences.map((c) => <option key={c.item_key} value={c.item_key}>{c.label}</option>)}
                </select>
                {!notOffered && (
                    <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }} placeholder="$0.00" className={`${inputCls} w-24 text-right`} autoFocus />
                )}
                <label className="flex items-center gap-1 text-xs text-alloy-midnight/50 cursor-pointer">
                    <input type="checkbox" checked={notOffered} onChange={(e) => setNotOffered(e.target.checked)} className="rounded" />
                    Not offered
                </label>
                <button type="button" onClick={() => void handleAdd()} disabled={adding || (!notOffered && !draft.trim())} className="rounded border border-alloy-pine/30 bg-alloy-pine/8 px-2.5 py-1 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/12 disabled:opacity-50 transition-colors">
                    {adding ? "Adding…" : "Add"}
                </button>
                <button type="button" onClick={() => { setExpanded(false); setDraft(""); setNotOffered(false); }} className="text-xs text-alloy-midnight/40 hover:text-alloy-midnight">Cancel</button>
            </div>
        </div>
    );
}

// ─── VariantRateSection ─────────────────────────────────────────────────────────

function VariantRateSection({ variant, cadences, rateMap, locationId, onSave, onClear, transparent }: {
    variant: ProgramOfferingVariant;
    cadences: BillingCadence[];
    rateMap: Map<string, TuitionRateRow>;
    locationId: string | null;
    onSave: OnSave;
    onClear: (id: string) => Promise<void>;
    transparent: boolean;
}) {
    const configured = cadences
        .map((c) => { const key = tuitionRateCellKey(variant.id, c.item_key); const r = rateMap.get(key); return r ? { cadence: c, rateRow: r } : null; })
        .filter(Boolean) as { cadence: BillingCadence; rateRow: TuitionRateRow }[];
    const configuredKeys = new Set(configured.map((x) => x.cadence.item_key));
    const available = cadences.filter((c) => !configuredKeys.has(c.item_key));

    const rows = (
        <>
            {configured.map(({ cadence, rateRow }) => (
                <CadenceRateRow key={cadence.item_key} variant={variant} cadence={cadence} rateRow={rateRow} locationId={locationId} onSave={onSave} onClear={onClear} />
            ))}
            {available.length > 0 && <AddCadenceRow variantId={variant.id} availableCadences={available} onSave={onSave} />}
        </>
    );

    if (transparent) return <>{rows}</>;

    return (
        <div className="border-t border-alloy-stone/10">
            <div className="px-4 py-2 bg-alloy-stone/5">
                <span className="text-xs font-medium text-alloy-midnight/60">{describeVariant(variant)}</span>
            </div>
            {rows}
        </div>
    );
}

// ─── OfferingRateSection ───────────────────────────────────────────────────────

function OfferingRateSection({ offering, variants, cadences, rateMap, orgOnlyMap, locationId, onSave, onClear }: {
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
    const hasAnyRates = sorted.some((v) => cadences.some((c) => rateMap.has(tuitionRateCellKey(v.id, c.item_key))));

    return (
        <div className="border border-alloy-stone/20 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-alloy-stone/5 border-b border-alloy-stone/15">
                <span className="text-sm font-medium text-alloy-midnight">{offering.label}</span>
                {!hasAnyRates && <span className="text-xs text-alloy-midnight/30">No rates configured</span>}
            </div>
            {sorted.map((v) => (
                <VariantRateSection key={v.id} variant={v} cadences={cadences} rateMap={rateMap} locationId={locationId} onSave={onSave} onClear={onClear} transparent={isDefaultVariant(v)} />
            ))}
            {sorted.length === 0 && <p className="px-4 py-3 text-xs text-alloy-midnight/35">No active variants.</p>}
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
    const [expanded, setExpanded] = useState(true);
    return (
        <div className="border border-alloy-stone/20 rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-alloy-stone/5 group">
                <button type="button" onClick={() => setExpanded((v) => !v)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <span className={`text-alloy-midnight/30 text-xs transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
                    <span className="text-sm font-medium text-alloy-midnight">{offering.label}</span>
                    <span className="text-xs text-alloy-midnight/35">{ATTENDANCE_TYPE_LABELS[offering.attendance_type]}</span>
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

                <ConfigurationDetailCard title="Location availability">
                    {locations.length === 0 ? (
                        <p className="text-sm text-alloy-midnight/40">No site locations configured. <Link href="/settings/locations" className="text-alloy-pine hover:underline">Add locations →</Link></p>
                    ) : (
                        <>
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-alloy-midnight/55">Offered at <strong className="text-alloy-midnight">{offeredCount}</strong> of <strong className="text-alloy-midnight">{locations.length}</strong> site{locations.length !== 1 ? "s" : ""}</p>
                                <button type="button" onClick={() => setLocExpanded((v) => !v)} className="text-xs text-alloy-pine hover:underline">{locExpanded ? "Collapse" : "Configure →"}</button>
                            </div>
                            {locExpanded && (
                                <div className="-mx-4 mt-3 border-t border-alloy-stone/10">
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
                        </>
                    )}
                </ConfigurationDetailCard>

                <ConfigurationDetailCard title="Rooms">
                    <p className="text-sm text-alloy-midnight/55 leading-relaxed">Rooms are operational children of programs. Room assignment does not affect pricing — tuition is set at the variant level, not the room level.</p>
                    <Link href="/settings/locations" className="mt-2 inline-block text-xs text-alloy-pine hover:underline">Manage rooms in Locations →</Link>
                </ConfigurationDetailCard>
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
                            <strong className="font-medium text-alloy-midnight">{selectedLocName}</strong> — <span className="inline-flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-alloy-pine/70" /> green dot = override.</span> Italic = inherited org default.
                        </p>
                        <button type="button" disabled={bulkCopying} onClick={() => void onCopyOrgToLocation(selectedScopeId)} className="shrink-0 text-xs font-medium text-alloy-pine hover:underline disabled:opacity-50">
                            {bulkCopying ? "Copying…" : "Copy org rates →"}
                        </button>
                    </div>
                )}

                <div className="flex border-b border-alloy-stone/20">
                    {PAYER_TABS.map((tab) => (
                        <button key={tab.key} type="button" disabled={!tab.available} onClick={() => { if (tab.available) onPayerTabChange(tab.key); }} className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${payerTab === tab.key ? "border-alloy-pine text-alloy-pine font-medium" : tab.available ? "border-transparent text-alloy-midnight/50 hover:text-alloy-midnight" : "border-transparent text-alloy-midnight/25 cursor-not-allowed"}`}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {offerings.length === 0 ? (
                    <p className="py-8 text-center text-sm text-alloy-midnight/40">No offerings configured. Add offerings in the Programs tab.</p>
                ) : (
                    <div className="space-y-3">
                        {offerings.map((o) => (
                            <OfferingRateSection key={o.id} offering={o} variants={variantsByOffering.get(o.id) ?? []} cadences={cadences} rateMap={rateMap} orgOnlyMap={orgOnlyMap} locationId={locationId} onSave={onSave} onClear={onClear} />
                        ))}
                        <p className="text-xs text-alloy-midnight/30 pt-1">Click any rate to edit inline. Use "+ Add rate basis" to configure billing cadences per variant.</p>
                    </div>
                )}

                <ConfigurationDetailCard title={`Where does ${program.label} revenue land?`}>
                    <p className="text-sm text-alloy-midnight/50 leading-relaxed">Revenue category mapping is set in Accounting configuration.</p>
                    <Link href="/settings/financials" className="mt-2 inline-block text-xs text-alloy-pine hover:underline">Manage in Accounting →</Link>
                </ConfigurationDetailCard>
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

    const [secondaryTab, setSecondaryTab] = useState<SecondaryTab>("programs");
    const [selectedProgramKey, setSelectedProgramKey] = useState<string | null>(null);
    const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
    const [payerTab, setPayerTab] = useState<PayerTab>("private");

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

    async function saveCell(variantId: string, cadenceKey: string, payload: { rate_cents?: number; not_offered?: boolean }) {
        setSaving(true);
        try {
            const res = await fetch("/api/admin/commercial/tuition-rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variant_id: variantId, cadence_key: cadenceKey, location_id: locationId, payer_type: "private_pay", ...payload }) });
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
                    <button key={tab.key} type="button" disabled={!tab.available} className={`px-4 py-3 text-sm -mb-px border-b-2 transition-colors whitespace-nowrap ${tab.key === "programs_tuition" ? "border-alloy-pine text-alloy-pine font-medium" : "border-transparent text-alloy-midnight/28 cursor-not-allowed"}`}>
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

            {saving && <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-alloy-midnight px-3 py-2 text-xs text-white shadow-lg">Saving…</div>}
        </div>
    );
}

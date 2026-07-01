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
    type QuantityType,
    ATTENDANCE_TYPE_LABELS,
    QUANTITY_TYPE_LABELS,
    describeOffering,
    sortOfferings,
} from "@/lib/programs/programOfferings";
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

type OnSave = (
    offeringId: string,
    cadenceKey: string,
    payload: { rate_cents?: number; not_offered?: boolean },
) => Promise<void>;

type OfferingUpdateFields = {
    label?: string;
    attendance_type?: AttendanceType;
    quantity_type?: QuantityType | null;
    quantity_value?: number | null;
    status?: string;
};

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
    "full_time",
    "part_time",
    "drop_in",
    "before_school",
    "after_school",
    "hourly",
    "custom",
];

const QUANTITY_OPTIONS: QuantityType[] = ["days", "hours", "sessions", "weeks", "months"];

// Attendance types that take a quantity value
const QUANTITY_ATTENDANCE_TYPES = new Set<AttendanceType>([
    "full_time",
    "part_time",
    "hourly",
    "custom",
]);

// Preset count chips per unit
const BULK_PRESETS: Record<string, number[]> = {
    days: [1, 2, 3, 4, 5],
    hours: [2, 4, 6, 8, 10],
    sessions: [5, 10, 15, 20],
    weeks: [1, 2, 4],
    months: [1, 3, 6, 12],
};

// ─── CadenceRateRow ─────────────────────────────────────────────────────────────
// Horizontal row showing one cadence + its rate for an offering.

type CadenceRateRowProps = {
    offering: ProgramOffering;
    cadence: BillingCadence;
    rateRow: TuitionRateRow;
    orgDefaultRow: TuitionRateRow | undefined;
    locationId: string | null;
    onSave: OnSave;
    onClear: (id: string) => Promise<void>;
};

function CadenceRateRow({
    offering,
    cadence,
    rateRow,
    locationId,
    onSave,
    onClear,
}: CadenceRateRowProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const isLocationView = locationId !== null;
    const isLocOverride = isLocationView && rateRow.location_id === locationId;
    const isInherited = isLocationView && rateRow.location_id === null;
    const isNotOffered = rateRow.not_offered === true;
    const displayRate = !isNotOffered ? rateRow.rate_cents : null;

    function startEdit() {
        if (isNotOffered) return;
        setDraft(displayRate != null ? String(displayRate / 100) : "");
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
        await onSave(offering.id, cadence.item_key, { rate_cents: cents });
        setSaving(false);
        setEditing(false);
    }

    async function toggleNotOffered() {
        setSaving(true);
        await onSave(offering.id, cadence.item_key, { not_offered: !isNotOffered });
        setSaving(false);
    }

    async function handleRemove() {
        if (!rateRow.id || isInherited) return;
        setSaving(true);
        await onClear(rateRow.id);
        setSaving(false);
    }

    return (
        <div
            className={[
                "flex items-center gap-3 px-4 py-2.5 group border-b border-alloy-stone/10 last:border-0",
                saving ? "opacity-50" : "",
            ].join(" ")}
        >
            {/* Cadence label */}
            <span className="text-sm text-alloy-midnight/50 w-24 shrink-0">{cadence.label}</span>

            {/* Rate / edit */}
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
                        className="w-28 rounded border border-alloy-pine/50 bg-white px-2 py-0.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-alloy-pine/30"
                        placeholder="0.00"
                    />
                ) : isNotOffered ? (
                    <span className="text-sm text-alloy-midnight/30 line-through">N/A</span>
                ) : displayRate != null ? (
                    <button
                        type="button"
                        onClick={startEdit}
                        className={[
                            "text-sm font-medium hover:text-alloy-pine transition-colors flex items-center gap-1.5",
                            isInherited ? "text-alloy-midnight/40 italic font-normal" : "text-alloy-midnight",
                        ].join(" ")}
                    >
                        {isLocOverride && (
                            <span className="w-1.5 h-1.5 rounded-full bg-alloy-pine/70 shrink-0" />
                        )}
                        {formatRateCents(displayRate)}
                        {isInherited && (
                            <span className="ml-1 text-xs text-alloy-midnight/30 font-normal not-italic">
                                (org default)
                            </span>
                        )}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={startEdit}
                        className="text-sm text-alloy-midnight/25 hover:text-alloy-pine transition-colors"
                    >
                        Set price…
                    </button>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                    type="button"
                    onClick={() => void toggleNotOffered()}
                    className={[
                        "rounded px-1.5 py-0.5 text-xs transition-colors",
                        isNotOffered
                            ? "bg-alloy-stone/25 text-alloy-midnight/50 hover:bg-alloy-stone/40"
                            : "text-alloy-midnight/30 hover:text-alloy-midnight/60 hover:bg-alloy-stone/15",
                    ].join(" ")}
                    title={isNotOffered ? "Mark as offered" : "Mark as not offered"}
                >
                    {isNotOffered ? "↩ offered" : "N/A"}
                </button>

                {!isInherited && (
                    <button
                        type="button"
                        onClick={() => void handleRemove()}
                        className="text-alloy-midnight/20 hover:text-red-400 text-sm px-1 transition-colors"
                        title={isLocOverride ? "Remove location override" : "Remove rate"}
                    >
                        ×
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── AddCadenceRow ─────────────────────────────────────────────────────────────

type AddCadenceRowProps = {
    offeringId: string;
    availableCadences: BillingCadence[];
    onSave: OnSave;
};

function AddCadenceRow({ offeringId, availableCadences, onSave }: AddCadenceRowProps) {
    const [expanded, setExpanded] = useState(false);
    const [selectedKey, setSelectedKey] = useState(availableCadences[0]?.item_key ?? "");
    const [draft, setDraft] = useState("");
    const [notOffered, setNotOffered] = useState(false);
    const [adding, setAdding] = useState(false);

    const inputCls =
        "rounded border border-alloy-forge/15 bg-white px-2 py-1 text-xs text-alloy-midnight focus:border-alloy-pine/40 focus:outline-none";

    async function handleAdd() {
        if (!selectedKey) return;
        setAdding(true);
        if (notOffered) {
            await onSave(offeringId, selectedKey, { not_offered: true });
        } else {
            const cents = parseDollarsToCents(draft);
            if (cents === null) { setAdding(false); return; }
            await onSave(offeringId, selectedKey, { rate_cents: cents });
        }
        setAdding(false);
        setExpanded(false);
        setDraft("");
        setNotOffered(false);
    }

    if (!expanded) {
        return (
            <div className="px-4 py-2">
                <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="text-xs text-alloy-pine/70 hover:text-alloy-pine transition-colors flex items-center gap-1"
                >
                    <span className="text-base leading-none">+</span> Add rate basis
                </button>
            </div>
        );
    }

    return (
        <div className="px-4 py-2.5 bg-alloy-stone/5 border-t border-alloy-stone/10">
            <div className="flex items-center gap-2 flex-wrap">
                <select
                    value={selectedKey}
                    onChange={(e) => setSelectedKey(e.target.value)}
                    className={inputCls}
                >
                    {availableCadences.map((c) => (
                        <option key={c.item_key} value={c.item_key}>
                            {c.label}
                        </option>
                    ))}
                </select>

                {!notOffered && (
                    <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
                        placeholder="$0.00"
                        className={`${inputCls} w-24 text-right`}
                        autoFocus
                    />
                )}

                <label className="flex items-center gap-1 text-xs text-alloy-midnight/50 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={notOffered}
                        onChange={(e) => setNotOffered(e.target.checked)}
                        className="rounded"
                    />
                    Not offered
                </label>

                <button
                    type="button"
                    onClick={() => void handleAdd()}
                    disabled={adding || (!notOffered && !draft.trim())}
                    className="rounded border border-alloy-pine/30 bg-alloy-pine/8 px-2.5 py-1 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/12 disabled:opacity-50 transition-colors"
                >
                    {adding ? "Adding…" : "Add"}
                </button>
                <button
                    type="button"
                    onClick={() => { setExpanded(false); setDraft(""); setNotOffered(false); }}
                    className="text-xs text-alloy-midnight/40 hover:text-alloy-midnight"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ─── OfferingRateSection ───────────────────────────────────────────────────────

type OfferingRateSectionProps = {
    offering: ProgramOffering;
    cadences: BillingCadence[];
    rateMap: Map<string, TuitionRateRow>;
    orgOnlyMap: Map<string, TuitionRateRow>;
    locationId: string | null;
    onSave: OnSave;
    onClear: (id: string) => Promise<void>;
};

function OfferingRateSection({
    offering,
    cadences,
    rateMap,
    orgOnlyMap,
    locationId,
    onSave,
    onClear,
}: OfferingRateSectionProps) {
    // Only cadences that have a rate row in the current scope (includes inherited org rows)
    const configuredCadences = cadences
        .map((c) => {
            const cellKey = tuitionRateCellKey(offering.id, c.item_key);
            const rateRow = rateMap.get(cellKey);
            return rateRow ? { cadence: c, cellKey, rateRow } : null;
        })
        .filter(Boolean) as { cadence: BillingCadence; cellKey: string; rateRow: TuitionRateRow }[];

    const configuredKeys = new Set(configuredCadences.map((x) => x.cadence.item_key));
    const availableCadences = cadences.filter((c) => !configuredKeys.has(c.item_key));

    return (
        <div className="border border-alloy-stone/20 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-alloy-stone/5 border-b border-alloy-stone/15">
                <span className="text-sm font-medium text-alloy-midnight">{offering.label}</span>
                {configuredCadences.length === 0 && (
                    <span className="text-xs text-alloy-midnight/30">No rates configured</span>
                )}
            </div>

            {configuredCadences.map(({ cadence, cellKey, rateRow }) => (
                <CadenceRateRow
                    key={cadence.item_key}
                    offering={offering}
                    cadence={cadence}
                    rateRow={rateRow}
                    orgDefaultRow={orgOnlyMap.get(cellKey)}
                    locationId={locationId}
                    onSave={onSave}
                    onClear={onClear}
                />
            ))}

            {availableCadences.length > 0 && (
                <AddCadenceRow
                    offeringId={offering.id}
                    availableCadences={availableCadences}
                    onSave={onSave}
                />
            )}
        </div>
    );
}

// ─── OfferingsBuilderCard ──────────────────────────────────────────────────────

type OfferingsBuilderCardProps = {
    offerings: ProgramOffering[];
    onAdd: (fields: {
        attendance_type: AttendanceType;
        quantity_type: QuantityType | null;
        quantity_value: number | null;
        label: string;
    }) => Promise<void>;
    onUpdate: (id: string, fields: OfferingUpdateFields) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    hasRatesForOffering: (id: string) => boolean;
};

function OfferingsBuilderCard({
    offerings,
    onAdd,
    onUpdate,
    onDelete,
    hasRatesForOffering,
}: OfferingsBuilderCardProps) {
    const [attendanceType, setAttendanceType] = useState<AttendanceType>("full_time");
    const [quantityType, setQuantityType] = useState<QuantityType>("days");
    const [selectedCounts, setSelectedCounts] = useState<Set<number>>(new Set());
    const [customCount, setCustomCount] = useState("");
    const [adding, setAdding] = useState(false);

    // Inline edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState({
        label: "",
        attendance_type: "full_time" as AttendanceType,
        quantity_type: "days" as QuantityType | null,
        quantity_value: "",
        status: "active",
    });
    const [savingEdit, setSavingEdit] = useState(false);

    const inputCls =
        "rounded border border-alloy-forge/15 bg-white px-2 py-1 text-xs text-alloy-midnight focus:border-alloy-pine/40 focus:outline-none";

    const needsQuantity = QUANTITY_ATTENDANCE_TYPES.has(attendanceType);
    const presets = BULK_PRESETS[quantityType] ?? [];

    function countExists(count: number): boolean {
        return offerings.some(
            (o) =>
                o.attendance_type === attendanceType &&
                o.quantity_type === quantityType &&
                Number(o.quantity_value) === count,
        );
    }

    function toggleCount(count: number) {
        setSelectedCounts((prev) => {
            const next = new Set(prev);
            if (next.has(count)) next.delete(count);
            else next.add(count);
            return next;
        });
    }

    function addCustomCount() {
        const n = parseFloat(customCount);
        if (!n || n <= 0) return;
        setSelectedCounts((prev) => new Set([...prev, n]));
        setCustomCount("");
    }

    // Singular form: "day" not "days" for count=1
    function offeringLabel(count: number): string {
        const base = ATTENDANCE_TYPE_LABELS[attendanceType] ?? attendanceType;
        const unit = QUANTITY_TYPE_LABELS[quantityType] ?? quantityType;
        const unitSingular = count === 1 ? unit.replace(/s$/, "") : unit;
        return `${base} — ${count} ${unitSingular}`;
    }

    async function handleBulkAdd() {
        const newCounts = Array.from(selectedCounts)
            .sort((a, b) => a - b)
            .filter((n) => !countExists(n));
        if (newCounts.length === 0) return;
        setAdding(true);
        for (const count of newCounts) {
            await onAdd({
                attendance_type: attendanceType,
                quantity_type: quantityType,
                quantity_value: count,
                label: offeringLabel(count),
            });
        }
        setSelectedCounts(new Set());
        setAdding(false);
    }

    async function handleSingleAdd() {
        const base = ATTENDANCE_TYPE_LABELS[attendanceType] ?? attendanceType;
        setAdding(true);
        await onAdd({
            attendance_type: attendanceType,
            quantity_type: null,
            quantity_value: null,
            label: base,
        });
        setAdding(false);
    }

    function startEdit(o: ProgramOffering) {
        setEditingId(o.id);
        setEditDraft({
            label: o.label,
            attendance_type: o.attendance_type,
            quantity_type: o.quantity_type ?? null,
            quantity_value: o.quantity_value != null ? String(o.quantity_value) : "",
            status: o.status,
        });
    }

    async function saveEdit() {
        if (!editingId) return;
        setSavingEdit(true);
        await onUpdate(editingId, {
            label: editDraft.label,
            attendance_type: editDraft.attendance_type,
            quantity_type: editDraft.quantity_type,
            quantity_value: editDraft.quantity_value ? parseFloat(editDraft.quantity_value) : null,
            status: editDraft.status,
        });
        setSavingEdit(false);
        setEditingId(null);
    }

    const newlySelected = Array.from(selectedCounts)
        .sort((a, b) => a - b)
        .filter((n) => !countExists(n));

    return (
        <ConfigurationDetailCard title="Program offerings">
            {/* Existing offerings list */}
            {offerings.length > 0 && (
                <div className="mb-5 overflow-hidden rounded-lg border border-alloy-stone/20">
                    {offerings.map((o, i) => {
                        if (editingId === o.id) {
                            return (
                                <div
                                    key={o.id}
                                    className="px-3 py-3 bg-alloy-pine/5 border-b border-alloy-stone/15 space-y-2.5"
                                >
                                    <div className="flex flex-wrap gap-2 items-end">
                                        <label className="flex flex-col gap-0.5 min-w-[140px] flex-1">
                                            <span className="text-[10px] text-alloy-midnight/45">Label</span>
                                            <input
                                                type="text"
                                                value={editDraft.label}
                                                onChange={(e) =>
                                                    setEditDraft((d) => ({ ...d, label: e.target.value }))
                                                }
                                                onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(); }}
                                                className={inputCls}
                                                autoFocus
                                            />
                                        </label>
                                        <label className="flex flex-col gap-0.5">
                                            <span className="text-[10px] text-alloy-midnight/45">Type</span>
                                            <select
                                                value={editDraft.attendance_type}
                                                onChange={(e) =>
                                                    setEditDraft((d) => ({
                                                        ...d,
                                                        attendance_type: e.target.value as AttendanceType,
                                                    }))
                                                }
                                                className={inputCls}
                                            >
                                                {ATTENDANCE_OPTIONS.map((t) => (
                                                    <option key={t} value={t}>
                                                        {ATTENDANCE_TYPE_LABELS[t]}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        {QUANTITY_ATTENDANCE_TYPES.has(editDraft.attendance_type) && (
                                            <>
                                                <label className="flex flex-col gap-0.5 w-16">
                                                    <span className="text-[10px] text-alloy-midnight/45">Count</span>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        step="0.5"
                                                        value={editDraft.quantity_value}
                                                        onChange={(e) =>
                                                            setEditDraft((d) => ({
                                                                ...d,
                                                                quantity_value: e.target.value,
                                                            }))
                                                        }
                                                        className={inputCls}
                                                        placeholder="5"
                                                    />
                                                </label>
                                                <label className="flex flex-col gap-0.5">
                                                    <span className="text-[10px] text-alloy-midnight/45">Unit</span>
                                                    <select
                                                        value={editDraft.quantity_type ?? "days"}
                                                        onChange={(e) =>
                                                            setEditDraft((d) => ({
                                                                ...d,
                                                                quantity_type: e.target.value as QuantityType,
                                                            }))
                                                        }
                                                        className={inputCls}
                                                    >
                                                        {QUANTITY_OPTIONS.map((q) => (
                                                            <option key={q} value={q}>
                                                                {QUANTITY_TYPE_LABELS[q]}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                            </>
                                        )}
                                        <label className="flex flex-col gap-0.5">
                                            <span className="text-[10px] text-alloy-midnight/45">Status</span>
                                            <select
                                                value={editDraft.status}
                                                onChange={(e) =>
                                                    setEditDraft((d) => ({ ...d, status: e.target.value }))
                                                }
                                                className={`${inputCls} text-[10px]`}
                                            >
                                                <option value="active">Active</option>
                                                <option value="coming_soon">Coming soon</option>
                                                <option value="seasonal">Seasonal</option>
                                                <option value="draft">Draft</option>
                                                <option value="retired">Retired</option>
                                                <option value="archived">Archived</option>
                                            </select>
                                        </label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void saveEdit()}
                                            disabled={savingEdit || !editDraft.label.trim()}
                                            className="rounded border border-alloy-pine/30 bg-alloy-pine/8 px-3 py-1 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/12 disabled:opacity-50 transition-colors"
                                        >
                                            {savingEdit ? "Saving…" : "Save"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditingId(null)}
                                            className="text-xs text-alloy-midnight/40 hover:text-alloy-midnight"
                                        >
                                            Cancel
                                        </button>
                                        {hasRatesForOffering(o.id) && (
                                            <span className="text-[10px] text-alloy-midnight/30">
                                                Type/quantity changes require removing rates first.
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div
                                key={o.id}
                                className={[
                                    "flex items-center gap-3 px-3 py-2.5 group",
                                    i < offerings.length - 1 ? "border-b border-alloy-stone/10" : "",
                                ].join(" ")}
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-alloy-midnight truncate">
                                        {o.label}
                                    </p>
                                    <p className="text-[10px] text-alloy-midnight/35 mt-0.5">
                                        {describeOffering(o)}
                                        {o.status !== "active" && (
                                            <span className="ml-2 text-alloy-midnight/25 capitalize">
                                                · {o.status}
                                            </span>
                                        )}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        type="button"
                                        onClick={() => startEdit(o)}
                                        className="text-xs text-alloy-midnight/35 hover:text-alloy-pine transition-colors px-1"
                                        title="Edit offering"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void onDelete(o.id)}
                                        className="text-alloy-midnight/20 hover:text-red-400 text-xs px-1 transition-colors"
                                        title={
                                            hasRatesForOffering(o.id)
                                                ? "Has rates — will archive"
                                                : "Remove offering"
                                        }
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Builder */}
            <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                    Add offerings
                </p>

                <div className="flex gap-2 flex-wrap items-end">
                    <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-alloy-midnight/45">Attendance type</span>
                        <select
                            value={attendanceType}
                            onChange={(e) => {
                                setAttendanceType(e.target.value as AttendanceType);
                                setSelectedCounts(new Set());
                            }}
                            className={inputCls}
                        >
                            {ATTENDANCE_OPTIONS.map((t) => (
                                <option key={t} value={t}>
                                    {ATTENDANCE_TYPE_LABELS[t]}
                                </option>
                            ))}
                        </select>
                    </label>

                    {needsQuantity && (
                        <label className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-alloy-midnight/45">Unit</span>
                            <select
                                value={quantityType}
                                onChange={(e) => {
                                    setQuantityType(e.target.value as QuantityType);
                                    setSelectedCounts(new Set());
                                }}
                                className={inputCls}
                            >
                                {QUANTITY_OPTIONS.map((q) => (
                                    <option key={q} value={q}>
                                        {QUANTITY_TYPE_LABELS[q]}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                </div>

                {needsQuantity ? (
                    <div className="space-y-2">
                        {/* Count chips */}
                        <div className="flex flex-wrap gap-1.5 items-center">
                            {presets.map((count) => {
                                const exists = countExists(count);
                                const selected = selectedCounts.has(count);
                                return (
                                    <button
                                        key={count}
                                        type="button"
                                        disabled={exists}
                                        onClick={() => toggleCount(count)}
                                        className={[
                                            "rounded-full px-2.5 py-1 text-xs font-medium border transition-colors",
                                            exists
                                                ? "border-alloy-stone/15 bg-alloy-stone/8 text-alloy-midnight/20 cursor-not-allowed line-through"
                                                : selected
                                                  ? "border-alloy-pine bg-alloy-pine text-white"
                                                  : "border-alloy-stone/30 bg-white text-alloy-midnight/55 hover:border-alloy-pine/50 hover:text-alloy-pine",
                                        ].join(" ")}
                                        title={exists ? "Already configured" : undefined}
                                    >
                                        {count}
                                    </button>
                                );
                            })}
                            {/* Custom count */}
                            <div className="flex items-center gap-1">
                                <input
                                    type="number"
                                    min="1"
                                    step="0.5"
                                    value={customCount}
                                    onChange={(e) => setCustomCount(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") addCustomCount(); }}
                                    placeholder="Other"
                                    className={`${inputCls} w-16 text-center`}
                                />
                                <button
                                    type="button"
                                    onClick={addCustomCount}
                                    className="text-xs text-alloy-midnight/40 hover:text-alloy-pine transition-colors"
                                >
                                    +
                                </button>
                            </div>
                        </div>

                        {/* Preview + generate */}
                        {newlySelected.length > 0 && (
                            <div className="rounded-lg bg-alloy-stone/8 border border-alloy-stone/15 px-3 py-2.5 space-y-2">
                                <p className="text-[10px] font-medium text-alloy-midnight/40 uppercase tracking-wide">
                                    Will add {newlySelected.length} offering{newlySelected.length !== 1 ? "s" : ""}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {newlySelected.map((count) => (
                                        <span
                                            key={count}
                                            className="text-xs text-alloy-midnight/60 bg-white rounded border border-alloy-stone/20 px-2 py-0.5"
                                        >
                                            {offeringLabel(count)}
                                        </span>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    disabled={adding}
                                    onClick={() => void handleBulkAdd()}
                                    className="rounded border border-alloy-pine/30 bg-alloy-pine/8 px-3 py-1.5 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/12 disabled:opacity-50 transition-colors"
                                >
                                    {adding
                                        ? "Adding…"
                                        : `Add ${newlySelected.length} offering${newlySelected.length !== 1 ? "s" : ""}`}
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Non-quantity types: single add */
                    <button
                        type="button"
                        disabled={adding}
                        onClick={() => void handleSingleAdd()}
                        className="rounded border border-alloy-pine/30 bg-alloy-pine/8 px-3 py-1.5 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/12 disabled:opacity-50 transition-colors"
                    >
                        {adding
                            ? "Adding…"
                            : `Add ${ATTENDANCE_TYPE_LABELS[attendanceType] ?? attendanceType}`}
                    </button>
                )}
            </div>
        </ConfigurationDetailCard>
    );
}

// ─── ProgramsPanel ─────────────────────────────────────────────────────────────

type ProgramsPanelProps = {
    program: ProgramEntry;
    locations: SiteLocation[];
    categories: LocationProgramCategoryRow[];
    offerings: ProgramOffering[];
    rates: TuitionRateRow[];
    onToggleSite: (siteId: string) => Promise<void>;
    onAddOffering: (fields: {
        attendance_type: AttendanceType;
        quantity_type: QuantityType | null;
        quantity_value: number | null;
        label: string;
    }) => Promise<void>;
    onUpdateOffering: (id: string, fields: OfferingUpdateFields) => Promise<void>;
    onDeleteOffering: (id: string) => Promise<void>;
};

function ProgramsPanel({
    program,
    locations,
    categories,
    offerings,
    rates,
    onToggleSite,
    onAddOffering,
    onUpdateOffering,
    onDeleteOffering,
}: ProgramsPanelProps) {
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [locExpanded, setLocExpanded] = useState(false);
    const programCats = categories.filter((c) => c.key === program.key);

    function siteStatus(siteId: string) {
        const row = programCats.find((c) => c.location_id === siteId);
        return { active: row?.is_active !== false };
    }

    async function handleToggle(siteId: string) {
        setTogglingId(siteId);
        await onToggleSite(siteId);
        setTogglingId(null);
    }

    function hasRatesForOffering(id: string) {
        return rates.some((r) => r.offering_id === id);
    }

    const offeredCount = locations.filter((l) => siteStatus(l.id).active).length;

    return (
        <div className="flex flex-col min-h-0 overflow-y-auto">
            <div className="p-6 space-y-5">
                <div>
                    <h2 className="config-typo-workspace-title text-xl">{program.label}</h2>
                </div>

                {/* Offerings — primary configuration */}
                <OfferingsBuilderCard
                    offerings={offerings}
                    onAdd={onAddOffering}
                    onUpdate={onUpdateOffering}
                    onDelete={onDeleteOffering}
                    hasRatesForOffering={hasRatesForOffering}
                />

                {/* Location availability — compact summary, expandable */}
                <ConfigurationDetailCard title="Location availability">
                    {locations.length === 0 ? (
                        <p className="text-sm text-alloy-midnight/40">
                            No site locations configured.{" "}
                            <Link href="/settings/locations" className="text-alloy-pine hover:underline">
                                Add locations →
                            </Link>
                        </p>
                    ) : (
                        <>
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-alloy-midnight/55">
                                    Offered at{" "}
                                    <strong className="text-alloy-midnight">{offeredCount}</strong>
                                    {" "}of{" "}
                                    <strong className="text-alloy-midnight">{locations.length}</strong>
                                    {" "}site{locations.length !== 1 ? "s" : ""}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setLocExpanded((v) => !v)}
                                    className="text-xs text-alloy-pine hover:underline"
                                >
                                    {locExpanded ? "Collapse" : "Configure →"}
                                </button>
                            </div>
                            {locExpanded && (
                                <div className="-mx-4 mt-3 border-t border-alloy-stone/10">
                                    {locations.map((site) => {
                                        const { active } = siteStatus(site.id);
                                        const toggling = togglingId === site.id;
                                        return (
                                            <div
                                                key={site.id}
                                                className="flex items-center justify-between gap-3 border-b border-alloy-stone/10 last:border-0 px-4 py-2.5"
                                            >
                                                <span className="text-sm text-alloy-midnight">
                                                    {site.name}
                                                </span>
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
                        </>
                    )}
                </ConfigurationDetailCard>

                {/* Rooms — operational future, not a pricing owner */}
                <ConfigurationDetailCard title="Rooms">
                    <p className="text-sm text-alloy-midnight/55 leading-relaxed">
                        Rooms are operational children of programs — a Toddler room belongs under
                        the Toddler program for scheduling and headcount. Room assignment does not
                        affect pricing: tuition is set at the offering level, not the room level.
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
    offerings: ProgramOffering[];
    cadences: BillingCadence[];
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
    offerings,
    cadences,
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

    return (
        <div className="flex flex-col min-h-0 overflow-y-auto">
            <div className="p-6 space-y-5">
                <div>
                    <h2 className="config-typo-workspace-title text-xl">{program.label}</h2>
                </div>

                {/* Scope selector */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-alloy-midnight/45 shrink-0">
                        Viewing:
                    </span>
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
                            Viewing{" "}
                            <strong className="font-medium text-alloy-midnight">
                                {selectedLocName}
                            </strong>
                            .{" "}
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
                            {bulkCopying ? "Copying…" : "Copy org rates →"}
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
                            onClick={() => { if (tab.available) onPayerTabChange(tab.key); }}
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

                {/* Offering-centric rate sections */}
                {offerings.length === 0 ? (
                    <div className="py-8 text-center">
                        <p className="text-sm text-alloy-midnight/40">No offerings configured yet.</p>
                        <p className="text-xs text-alloy-midnight/30 mt-1">
                            Add offerings in the Programs tab to set up rates.
                        </p>
                    </div>
                ) : cadences.length === 0 ? (
                    <div className="py-8 text-center">
                        <p className="text-sm text-alloy-midnight/40">
                            No billing cadences available.
                        </p>
                        <p className="text-xs text-alloy-midnight/30 mt-1">
                            Run database migrations to seed billing cadences.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {offerings.map((offering) => (
                            <OfferingRateSection
                                key={offering.id}
                                offering={offering}
                                cadences={cadences}
                                rateMap={rateMap}
                                orgOnlyMap={orgOnlyMap}
                                locationId={locationId}
                                onSave={onSave}
                                onClear={onClear}
                            />
                        ))}
                        <p className="text-xs text-alloy-midnight/30 pt-1">
                            Click any rate to edit. Use "+ Add rate basis" to set which billing
                            cadences apply to each offering.
                        </p>
                    </div>
                )}

                {/* Revenue mapping reference */}
                <ConfigurationDetailCard title={`Where does ${program.label} revenue land?`}>
                    <div className="flex items-start justify-between gap-4">
                        <p className="text-sm text-alloy-midnight/50 leading-relaxed">
                            Revenue category mapping is inherited from Accounting configuration. GL
                            codes and revenue categories are set there.
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
    const [adding, setAdding] = useState(false);

    const inputCls =
        "rounded border border-alloy-forge/15 bg-white px-2 py-1 text-xs text-alloy-midnight focus:border-alloy-pine/40 focus:outline-none";

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
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                Add program
            </p>
            <div className="flex items-end gap-2">
                <label className="flex flex-col gap-0.5 min-w-[160px] flex-1">
                    <span className="text-[10px] text-alloy-midnight/40">Name</span>
                    <input
                        type="text"
                        value={label}
                        placeholder="e.g. Summer Camp"
                        disabled={adding}
                        onChange={(e) => setLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
                        className={inputCls}
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
    const [offerings, setOfferings] = useState<ProgramOffering[]>([]);
    const [cadences, setCadences] = useState<BillingCadence[]>([]);
    const [rates, setRates] = useState<TuitionRateRow[]>([]);

    // Navigation
    const [secondaryTab, setSecondaryTab] = useState<SecondaryTab>("programs");
    const [selectedProgramKey, setSelectedProgramKey] = useState<string | null>(null);
    const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
    const [payerTab, setPayerTab] = useState<PayerTab>("private");

    // ── Loaders ───────────────────────────────────────────────────────────────

    const reloadRates = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/commercial/tuition-rates");
            const json = (await res.json()) as { rates?: TuitionRateRow[] };
            setRates(json.rates ?? []);
        } catch {
            // retain existing on network error
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

    const reloadOfferings = useCallback(async (programKey: string) => {
        try {
            const res = await fetch(
                `/api/admin/programs/offerings?program_key=${encodeURIComponent(programKey)}`,
            );
            const json = (await res.json()) as { offerings?: ProgramOffering[] };
            setOfferings(sortOfferings(json.offerings ?? []));
        } catch {
            // silent
        }
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

                const locJson = (await locRes.json()) as {
                    locations?: Record<string, unknown>[];
                };
                const locs: SiteLocation[] = (locJson.locations ?? [])
                    .filter((l) => String(l.location_type ?? "") === "site")
                    .map((l) => ({
                        id: String(l.id ?? ""),
                        name: String(l.name ?? l.label ?? "Unnamed site"),
                    }));
                setLocations(locs);

                const catJson = (await catRes.json()) as {
                    categories?: LocationProgramCategoryRow[];
                };
                const cats = catJson.categories ?? [];
                setCategories(cats);

                const cadenceJson = (await cadenceRes.json()) as { cadences?: BillingCadence[] };
                setCadences(cadenceJson.cadences ?? []);

                const ratesJson = (await ratesRes.json()) as { rates?: TuitionRateRow[] };
                setRates(ratesJson.rates ?? []);

                // Auto-select first program and load its offerings
                const byKey = new Map<string, string>();
                for (const c of cats) {
                    if (!byKey.has(c.key)) byKey.set(c.key, c.label);
                }
                const firstKey = Array.from(byKey.keys())[0] ?? null;
                if (firstKey) {
                    setSelectedProgramKey(firstKey);
                    const offerRes = await fetch(
                        `/api/admin/programs/offerings?program_key=${encodeURIComponent(firstKey)}`,
                    );
                    const offerJson = (await offerRes.json()) as { offerings?: ProgramOffering[] };
                    setOfferings(sortOfferings(offerJson.offerings ?? []));
                }
            } catch (e) {
                setError(String(e));
            } finally {
                setLoading(false);
            }
        }
        void boot();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selectedProgramKey) void reloadOfferings(selectedProgramKey);
    }, [selectedProgramKey, reloadOfferings]);

    // ── Derived ────────────────────────────────────────────────────────────────

    const programs: ProgramEntry[] = (() => {
        const allByKey = new Map<string, { label: string; siteCount: number }>();
        for (const c of categories) {
            if (!allByKey.has(c.key)) allByKey.set(c.key, { label: c.label, siteCount: 0 });
            if (c.is_active !== false) allByKey.get(c.key)!.siteCount++;
        }
        return Array.from(allByKey.entries()).map(([key, v]) => ({
            key,
            label: v.label,
            siteCount: v.siteCount,
        }));
    })();

    const selectedProgram = programs.find((p) => p.key === selectedProgramKey) ?? null;
    const locationId: string | null = selectedScopeId;

    const programOfferings = offerings;
    const offeringIds = programOfferings.map((o) => o.id);
    const offeringRates = rates.filter((r) => offeringIds.includes(r.offering_id));
    const orgOnlyRates = offeringRates.filter((r) => r.location_id === null);
    const visibleRates = locationId
        ? offeringRates.filter(
              (r) => r.location_id === null || r.location_id === locationId,
          )
        : orgOnlyRates;

    const rateMap = buildTuitionRateMap(visibleRates, locationId);
    const orgOnlyMap = buildTuitionRateMap(orgOnlyRates, null);

    // ── Program mutations ─────────────────────────────────────────────────────

    async function addProgram(label: string, key: string) {
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

    async function addOffering(fields: {
        attendance_type: AttendanceType;
        quantity_type: QuantityType | null;
        quantity_value: number | null;
        label: string;
    }) {
        if (!selectedProgramKey) return;
        const res = await fetch("/api/admin/programs/offerings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                program_key: selectedProgramKey,
                ...fields,
                sort_order: offerings.length > 0 ? offerings.length * 10 + 10 : 10,
            }),
        });
        if (!res.ok) {
            const j = (await res.json()) as { error?: string };
            setError(j.error ?? "Failed to add offering");
            return;
        }
        if (selectedProgramKey) await reloadOfferings(selectedProgramKey);
    }

    async function updateOffering(id: string, fields: OfferingUpdateFields) {
        const res = await fetch(`/api/admin/programs/offerings/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fields),
        });
        if (!res.ok) {
            const j = (await res.json()) as { error?: string };
            setError(j.error ?? "Failed to update offering");
            return;
        }
        if (selectedProgramKey) await reloadOfferings(selectedProgramKey);
    }

    async function deleteOffering(id: string) {
        const hasRates = rates.some((r) => r.offering_id === id);
        if (hasRates) {
            const ok = window.confirm(
                "This offering has existing tuition rates. It will be archived rather than deleted. Continue?",
            );
            if (!ok) return;
        }
        const res = await fetch(`/api/admin/programs/offerings/${id}`, { method: "DELETE" });
        if (!res.ok) {
            const j = (await res.json()) as { error?: string };
            setError(j.error ?? "Failed to delete offering");
            return;
        }
        if (selectedProgramKey) await reloadOfferings(selectedProgramKey);
    }

    // ── Tuition mutations ─────────────────────────────────────────────────────

    async function saveCell(
        offeringId: string,
        cadenceKey: string,
        payload: { rate_cents?: number; not_offered?: boolean },
    ) {
        setSaving(true);
        try {
            const res = await fetch("/api/admin/commercial/tuition-rates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    offering_id: offeringId,
                    cadence_key: cadenceKey,
                    location_id: locationId,
                    payer_type: "private_pay",
                    ...payload,
                }),
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
                (r) => r.location_id === null && offeringIds.includes(r.offering_id),
            );
            await Promise.all(
                orgRates.map((r) =>
                    fetch("/api/admin/commercial/tuition-rates", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            offering_id: r.offering_id,
                            cadence_key: r.cadence_key,
                            location_id: locId,
                            payer_type: r.payer_type,
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
                                offerings={programOfferings}
                                rates={rates}
                                onToggleSite={toggleSiteForProgram}
                                onAddOffering={addOffering}
                                onUpdateOffering={updateOffering}
                                onDeleteOffering={deleteOffering}
                            />
                        ) : (
                            <TuitionPanel
                                program={selectedProgram}
                                offerings={programOfferings}
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

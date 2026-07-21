"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { mutationResponseContainsPatch } from "@/lib/locations/mutationPersistenceContract";

type LocationOpt = { id: string; label: string | null };

type RuleRow = {
    id: string;
    location_id: string | null;
    user_id: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    timezone: string;
    slot_duration_minutes: number;
    buffer_minutes: number;
    max_bookings_per_slot: number;
    approval_required: boolean;
    is_active: boolean;
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function TourAvailabilitySettingsClient({
    locationId = null,
    locationLabel = null,
    embedded = false,
    onMutationCommitted,
}: {
    locationId?: string | null;
    locationLabel?: string | null;
    embedded?: boolean;
    onMutationCommitted?: () => void | Promise<void>;
}) {
    const [locations, setLocations] = useState<LocationOpt[]>([]);
    const [locFilter, setLocFilter] = useState(locationId ?? "");
    const [rules, setRules] = useState<RuleRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [adding, setAdding] = useState(false);
    const [editingRule, setEditingRule] = useState<RuleRow | null>(null);
    const hasRulesRef = useRef(false);

    // Embedded Locations keepalive may remount via key, but also sync when locationId changes
    // without remount — stale locFilter caused false empties after Location switches.
    useEffect(() => {
        const next = String(locationId ?? "").trim();
        setLocFilter(next);
    }, [locationId]);

    const loadRules = useCallback(async () => {
        const hadRules = hasRulesRef.current;
        if (hadRules) setRefreshing(true);
        else setLoading(true);
        setErr(null);
        try {
            const qs = locFilter.trim() ? `?location_id=${encodeURIComponent(locFilter.trim())}` : "";
            const res = await fetch(`/api/admin/tours/availability-rules${qs}`, {
                credentials: "include",
            });
            const j = (await res.json()) as { rules?: RuleRow[]; error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            const loadedRules = j.rules ?? [];
            const nextRules = locationId
                ? loadedRules.filter((rule) => rule.location_id === locationId)
                : loadedRules;
            setRules(nextRules);
            hasRulesRef.current = nextRules.length > 0;
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
            if (!hadRules) {
                setRules([]);
                hasRulesRef.current = false;
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [locFilter, locationId]);

    useEffect(() => {
        if (embedded && locationId) return;
        void (async () => {
            try {
                const res = await fetch("/api/admin/locations", {
                    credentials: "include",
                });
                const j = (await res.json()) as { locations?: LocationOpt[] };
                if (res.ok) setLocations(j.locations ?? []);
            } catch {
                /* non-fatal */
            }
        })();
    }, [embedded, locationId]);

    useEffect(() => {
        void loadRules();
    }, [loadRules]);

    const toggle = async (r: RuleRow) => {
        setSaving(true);
        try {
            const res = await fetch(`/api/admin/tours/availability-rules/${encodeURIComponent(r.id)}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: !r.is_active }),
            });
            const j = (await res.json()) as { rule?: RuleRow; error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            if (!j.rule || !mutationResponseContainsPatch(j.rule as unknown as Record<string, unknown>, { is_active: !r.is_active })) {
                throw new Error("Tour availability save was not confirmed by the authoritative response.");
            }
            await loadRules();
            await onMutationCommitted?.();
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string) => {
        if (!confirm("Delete this availability rule?")) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/admin/tours/availability-rules/${encodeURIComponent(id)}`, {
                method: "DELETE",
                credentials: "include",
            });
            const j = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            await loadRules();
            await onMutationCommitted?.();
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="w-full min-w-0 space-y-4">
            {!embedded ?
                <header>
                    <h1 className="text-lg font-semibold text-alloy-midnight">Tour availability</h1>
                    <p className="mt-1 text-xs text-alloy-midnight/60">
                        Set recurring windows and booking limits for family visits.
                    </p>
                </header>
            :   null}
            {err ?
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>
            :   null}
            {!locationId ?
                <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs font-medium text-alloy-midnight/70">
                        Filter by location
                        <select
                            className="mt-1 block w-56 rounded border border-alloy-stone/25 bg-white px-2 py-1.5 text-sm"
                            value={locFilter}
                            onChange={(e) => setLocFilter(e.target.value)}
                        >
                            <option value="">All locations</option>
                            {locations.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.label ?? l.id.slice(0, 8)}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            :   null}
            {loading && !refreshing ?
                <p className="text-sm text-alloy-midnight/55">Loading…</p>
            :   null}
            {refreshing ?
                <p className="text-sm text-alloy-midnight/45" data-testid="tours-availability-refreshing">
                    Refreshing…
                </p>
            :   null}
            {!loading && !refreshing && rules.length === 0 ?
                <div className="rounded-xl border border-dashed border-alloy-forge/15 p-4">
                    <p className="text-sm font-medium text-alloy-midnight/80">No tour availability set</p>
                    <p className="config-typo-sublabel mt-1">
                        Add a recurring window when families can visit {locationLabel ?? "this location"}.
                    </p>
                </div>
            :   null}
            <ul className="space-y-2">
                {rules.map((r) => (
                    <li key={r.id} className="rounded-lg border border-alloy-stone/15 bg-white px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <span className="font-semibold">
                                    {DOW[r.day_of_week] ?? r.day_of_week} {r.start_time}–{r.end_time}
                                </span>
                                <span className="ml-2 text-alloy-midnight/55">{r.timezone}</span>
                                {r.approval_required ?
                                    <span className="ml-2 rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900">
                                        approval
                                    </span>
                                :   <span className="ml-2 rounded bg-alloy-pine/15 px-1.5 text-[11px] font-semibold text-alloy-pine">
                                        auto-confirm
                                    </span>
                                }
                                {!r.is_active ?
                                    <span className="ml-2 text-xs text-alloy-midnight/45">inactive</span>
                                :   null}
                            </div>
                            <div className="flex gap-2">
                                <ConfigurationSecondaryButton
                                    className="px-2 py-1"
                                    disabled={saving}
                                    onClick={() => {
                                        setAdding(false);
                                        setEditingRule(r);
                                    }}
                                    data-testid={`locations-tour-edit-${r.id}`}
                                >
                                    Edit
                                </ConfigurationSecondaryButton>
                                <ConfigurationSecondaryButton
                                    className="px-2 py-1"
                                    disabled={saving}
                                    onClick={() => void toggle(r)}
                                >
                                    {r.is_active ? "Deactivate" : "Activate"}
                                </ConfigurationSecondaryButton>
                                <button
                                    type="button"
                                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-800"
                                    disabled={saving}
                                    onClick={() => void remove(r.id)}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                        <div className="mt-1 text-[11px] text-alloy-midnight/50">
                            {r.slot_duration_minutes} minute tours · {r.buffer_minutes} minute buffer · up to{" "}
                            {r.max_bookings_per_slot} per window
                        </div>
                        {editingRule?.id === r.id ?
                            <TourWindowForm
                                locations={locations}
                                locationId={locationId}
                                locationLabel={locationLabel}
                                existingRule={r}
                                onSaved={async () => {
                                    await loadRules();
                                    await onMutationCommitted?.();
                                    setEditingRule(null);
                                }}
                                onCancel={() => setEditingRule(null)}
                                disabled={saving}
                            />
                        :   null}
                    </li>
                ))}
            </ul>
            {adding ?
                <TourWindowForm
                    locations={locations}
                    locationId={locationId}
                    locationLabel={locationLabel}
                    onSaved={async () => {
                        await loadRules();
                        await onMutationCommitted?.();
                        setAdding(false);
                    }}
                    onCancel={() => setAdding(false)}
                    disabled={saving}
                />
            : editingRule ?
                null
            :   <ConfigurationPrimaryButton
                    onClick={() => {
                        setEditingRule(null);
                        setAdding(true);
                    }}
                    data-testid="locations-tour-add-window"
                >
                    Add tour window
                </ConfigurationPrimaryButton>
            }
        </div>
    );
}

function TourWindowForm({
    locations,
    locationId,
    locationLabel,
    existingRule,
    onSaved,
    onCancel,
    disabled,
}: {
    locations: LocationOpt[];
    locationId: string | null;
    locationLabel: string | null;
    existingRule?: RuleRow;
    onSaved: () => Promise<void>;
    onCancel: () => void;
    disabled: boolean;
}) {
    const [location_id, setLocationId] = useState(existingRule?.location_id ?? locationId ?? "");
    const [day_of_week, setDayOfWeek] = useState(existingRule?.day_of_week ?? 1);
    const [start_time, setStartTime] = useState(existingRule?.start_time.slice(0, 5) ?? "09:00");
    const [end_time, setEndTime] = useState(existingRule?.end_time.slice(0, 5) ?? "12:00");
    const [timezone, setTimezone] = useState(existingRule?.timezone ?? "America/Los_Angeles");
    const [slot_duration_minutes, setSlot] = useState(existingRule?.slot_duration_minutes ?? 60);
    const [buffer_minutes, setBuf] = useState(existingRule?.buffer_minutes ?? 0);
    const [max_bookings_per_slot, setMax] = useState(existingRule?.max_bookings_per_slot ?? 1);
    const [approval_required, setAppr] = useState(existingRule?.approval_required ?? false);
    const [is_active, setIsActive] = useState(existingRule?.is_active ?? true);
    const [msg, setMsg] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const submit = async () => {
        setMsg(null);
        if (!location_id.trim()) {
            setMsg("Choose a location");
            return;
        }
        setSubmitting(true);
        try {
            const editable = {
                day_of_week,
                start_time: `${start_time}:00`,
                end_time: `${end_time}:00`,
                timezone: timezone.trim(),
                slot_duration_minutes,
                buffer_minutes,
                max_bookings_per_slot,
                approval_required,
                is_active,
            };
            const payload = existingRule ? editable : { location_id: location_id.trim(), ...editable };
            const endpoint =
                existingRule ?
                    `/api/admin/tours/availability-rules/${encodeURIComponent(existingRule.id)}`
                :   "/api/admin/tours/availability-rules";
            const res = await fetch(endpoint, {
                method: existingRule ? "PATCH" : "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const j = (await res.json().catch(() => ({}))) as { rule?: RuleRow; error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            if (
                !j.rule ||
                !mutationResponseContainsPatch(j.rule as unknown as Record<string, unknown>, payload)
            ) {
                throw new Error(
                    existingRule ?
                        "Tour availability save was not confirmed by the authoritative response."
                    :   "Tour availability creation was not confirmed by the authoritative response.",
                );
            }
            await onSaved();
        } catch (cause) {
            setMsg(cause instanceof Error ? cause.message : "Tour availability could not be saved.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="mt-3 rounded-lg border border-alloy-stone/20 bg-alloy-stone/5 p-3"
            data-testid={existingRule ? "locations-tour-edit-form" : "locations-tour-create-form"}
        >
            <div className="text-xs font-semibold text-alloy-midnight/75">
                {existingRule ? "Edit tour window" : "Add tour window"}
            </div>
            {msg ?
                <p className="mt-1 text-xs text-red-700">{msg}</p>
            :   null}
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {locationId ?
                    <div className="text-xs">
                        <span className="config-typo-field-label">Location</span>
                        <p className="config-typo-sublabel mt-1">{locationLabel ?? "Selected location"}</p>
                    </div>
                :   <label className="text-xs">
                        Location
                        <select
                            className="config-runtime-select mt-1"
                            value={location_id}
                            onChange={(e) => setLocationId(e.target.value)}
                        >
                            <option value="">—</option>
                            {locations.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.label ?? l.id.slice(0, 8)}
                                </option>
                            ))}
                        </select>
                    </label>
                }
                <label className="text-xs">
                    Day
                    <select
                        className="config-runtime-select mt-1"
                        value={day_of_week}
                        onChange={(e) => setDayOfWeek(Number(e.target.value))}
                        data-testid="locations-tour-day"
                    >
                        {DOW.map((day, index) => (
                            <option key={day} value={index}>
                                {day}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-xs">
                    Start (HH:MM)
                    <input
                        type="time"
                        className="config-runtime-input mt-1"
                        value={start_time}
                        onChange={(e) => setStartTime(e.target.value)}
                        data-testid="locations-tour-start"
                    />
                </label>
                <label className="text-xs">
                    End (HH:MM)
                    <input
                        type="time"
                        className="config-runtime-input mt-1"
                        value={end_time}
                        onChange={(e) => setEndTime(e.target.value)}
                        data-testid="locations-tour-end"
                    />
                </label>
                <label className="text-xs sm:col-span-2">
                    Time zone
                    <input
                        className="config-runtime-input mt-1"
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        data-testid="locations-tour-timezone"
                    />
                </label>
                <label className="text-xs">
                    Slot minutes
                    <input
                        type="number"
                        min={1}
                        className="config-runtime-input mt-1"
                        value={slot_duration_minutes}
                        onChange={(e) => setSlot(Number(e.target.value))}
                        data-testid="locations-tour-duration"
                    />
                </label>
                <label className="text-xs">
                    Buffer minutes
                    <input
                        type="number"
                        min={0}
                        className="config-runtime-input mt-1"
                        value={buffer_minutes}
                        onChange={(e) => setBuf(Number(e.target.value))}
                        data-testid="locations-tour-buffer"
                    />
                </label>
                <label className="text-xs">
                    Max / slot
                    <input
                        type="number"
                        min={1}
                        className="config-runtime-input mt-1"
                        value={max_bookings_per_slot}
                        onChange={(e) => setMax(Number(e.target.value))}
                        data-testid="locations-tour-max-bookings"
                    />
                </label>
                <label className="flex items-center gap-2 text-xs sm:col-span-2">
                    <input
                        type="checkbox"
                        checked={approval_required}
                        onChange={(e) => setAppr(e.target.checked)}
                        data-testid="locations-tour-approval"
                    />
                    Require approval for bookings matching this rule
                </label>
                <label className="flex items-center gap-2 text-xs sm:col-span-2">
                    <input
                        type="checkbox"
                        checked={is_active}
                        onChange={(e) => setIsActive(e.target.checked)}
                        data-testid="locations-tour-active"
                    />
                    Active tour window
                </label>
            </div>
            <div className="mt-3 flex gap-2">
                <ConfigurationPrimaryButton
                    disabled={disabled || submitting}
                    onClick={() => void submit()}
                    data-testid="locations-tour-save"
                >
                    {submitting ? "Saving…" : existingRule ? "Save tour window" : "Add tour window"}
                </ConfigurationPrimaryButton>
                <ConfigurationSecondaryButton
                    disabled={disabled || submitting}
                    onClick={onCancel}
                >
                    Cancel
                </ConfigurationSecondaryButton>
            </div>
        </div>
    );
}

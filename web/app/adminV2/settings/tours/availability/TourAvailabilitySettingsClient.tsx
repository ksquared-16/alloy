"use client";

import { useCallback, useEffect, useState } from "react";

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

export default function TourAvailabilitySettingsClient() {
    const [locations, setLocations] = useState<LocationOpt[]>([]);
    const [locFilter, setLocFilter] = useState("");
    const [rules, setRules] = useState<RuleRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const loadRules = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const qs = locFilter.trim() ? `?location_id=${encodeURIComponent(locFilter.trim())}` : "";
            const res = await fetch(`/api/admin/tours/availability-rules${qs}`, { credentials: "include" });
            const j = (await res.json()) as { rules?: RuleRow[]; error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            setRules(j.rules ?? []);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [locFilter]);

    useEffect(() => {
        void (async () => {
            try {
                const res = await fetch("/api/admin/locations", { credentials: "include" });
                const j = (await res.json()) as { locations?: LocationOpt[] };
                if (res.ok) setLocations(j.locations ?? []);
            } catch {
                /* non-fatal */
            }
        })();
    }, []);

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
            const j = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            await loadRules();
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
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="w-full min-w-0 space-y-4">
            <header>
                <h1 className="text-lg font-semibold text-alloy-midnight">Tour availability</h1>
                <p className="mt-1 text-xs text-alloy-midnight/60">
                    Recurring windows for public and admin slot pickers. Day of week is 0=Sunday … 6=Saturday (matches rules engine).
                </p>
            </header>
            {err ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
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
            {loading ? <p className="text-sm text-alloy-midnight/55">Loading…</p> : null}
            <ul className="space-y-2">
                {rules.map((r) => (
                    <li key={r.id} className="rounded-lg border border-alloy-stone/15 bg-white px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <span className="font-semibold">
                                    {DOW[r.day_of_week] ?? r.day_of_week} {r.start_time}–{r.end_time}
                                </span>
                                <span className="ml-2 text-alloy-midnight/55">{r.timezone}</span>
                                {r.approval_required ? (
                                    <span className="ml-2 rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900">approval</span>
                                ) : (
                                    <span className="ml-2 rounded bg-alloy-pine/15 px-1.5 text-[11px] font-semibold text-alloy-pine">auto-confirm</span>
                                )}
                                {!r.is_active ? <span className="ml-2 text-xs text-alloy-midnight/45">inactive</span> : null}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    className="rounded border px-2 py-1 text-xs"
                                    disabled={saving}
                                    onClick={() => void toggle(r)}
                                >
                                    {r.is_active ? "Deactivate" : "Activate"}
                                </button>
                                <button type="button" className="rounded border border-red-200 px-2 py-1 text-xs text-red-800" disabled={saving} onClick={() => void remove(r.id)}>
                                    Delete
                                </button>
                            </div>
                        </div>
                        <div className="mt-1 text-[11px] text-alloy-midnight/50">
                            slot {r.slot_duration_minutes}m · buffer {r.buffer_minutes}m · max {r.max_bookings_per_slot}/slot · loc{" "}
                            {r.location_id?.slice(0, 8) ?? "—"}
                        </div>
                    </li>
                ))}
            </ul>
            <NewRuleForm
                locations={locations}
                onCreated={async () => {
                    await loadRules();
                }}
                disabled={saving}
            />
        </div>
    );
}

function NewRuleForm({
    locations,
    onCreated,
    disabled,
}: {
    locations: LocationOpt[];
    onCreated: () => Promise<void>;
    disabled: boolean;
}) {
    const [location_id, setLocationId] = useState("");
    const [day_of_week, setDayOfWeek] = useState(1);
    const [start_time, setStartTime] = useState("09:00");
    const [end_time, setEndTime] = useState("12:00");
    const [timezone, setTimezone] = useState("America/Los_Angeles");
    const [slot_duration_minutes, setSlot] = useState(60);
    const [buffer_minutes, setBuf] = useState(0);
    const [max_bookings_per_slot, setMax] = useState(1);
    const [approval_required, setAppr] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const submit = async () => {
        setMsg(null);
        if (!location_id.trim()) {
            setMsg("Choose a location");
            return;
        }
        const res = await fetch("/api/admin/tours/availability-rules", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                location_id: location_id.trim(),
                day_of_week,
                start_time: `${start_time}:00`,
                end_time: `${end_time}:00`,
                timezone: timezone.trim(),
                slot_duration_minutes,
                buffer_minutes,
                max_bookings_per_slot,
                approval_required,
            }),
        });
        const j = (await res.json()) as { error?: string };
        if (!res.ok) {
            setMsg(j.error ?? res.statusText);
            return;
        }
        await onCreated();
    };

    return (
        <div className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/5 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">Add rule</div>
            {msg ? <p className="mt-1 text-xs text-red-700">{msg}</p> : null}
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-xs">
                    Location
                    <select className="mt-1 w-full rounded border px-2 py-1 text-sm" value={location_id} onChange={(e) => setLocationId(e.target.value)}>
                        <option value="">—</option>
                        {locations.map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.label ?? l.id.slice(0, 8)}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-xs">
                    Day (0–6)
                    <input type="number" min={0} max={6} className="mt-1 w-full rounded border px-2 py-1 text-sm" value={day_of_week} onChange={(e) => setDayOfWeek(Number(e.target.value))} />
                </label>
                <label className="text-xs">
                    Start (HH:MM)
                    <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={start_time} onChange={(e) => setStartTime(e.target.value)} />
                </label>
                <label className="text-xs">
                    End (HH:MM)
                    <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={end_time} onChange={(e) => setEndTime(e.target.value)} />
                </label>
                <label className="text-xs sm:col-span-2">
                    IANA timezone
                    <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
                </label>
                <label className="text-xs">
                    Slot minutes
                    <input type="number" className="mt-1 w-full rounded border px-2 py-1 text-sm" value={slot_duration_minutes} onChange={(e) => setSlot(Number(e.target.value))} />
                </label>
                <label className="text-xs">
                    Buffer minutes
                    <input type="number" className="mt-1 w-full rounded border px-2 py-1 text-sm" value={buffer_minutes} onChange={(e) => setBuf(Number(e.target.value))} />
                </label>
                <label className="text-xs">
                    Max / slot
                    <input type="number" className="mt-1 w-full rounded border px-2 py-1 text-sm" value={max_bookings_per_slot} onChange={(e) => setMax(Number(e.target.value))} />
                </label>
                <label className="flex items-center gap-2 text-xs sm:col-span-2">
                    <input type="checkbox" checked={approval_required} onChange={(e) => setAppr(e.target.checked)} />
                    Require approval for bookings matching this rule
                </label>
            </div>
            <button type="button" className="mt-3 rounded-lg bg-alloy-midnight px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={disabled} onClick={() => void submit()}>
                Create rule
            </button>
        </div>
    );
}

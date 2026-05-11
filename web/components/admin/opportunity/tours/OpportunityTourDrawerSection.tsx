"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";
import type { AvailableTourSlot } from "@/lib/tours/availability/types";

const ACTIVE = new Set<string>(TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS);

type Props = {
    opportunityId: string;
    locationId: string;
    canMutate: boolean;
    onRefresh: () => void | Promise<void>;
    viewerTimezone: string | null;
};

function statusLabel(sk: string): string {
    const m: Record<string, string> = {
        requested: "Requested",
        pending_approval: "Pending approval",
        confirmed: "Confirmed",
        rescheduled: "Rescheduled",
        canceled: "Canceled",
        completed: "Completed",
        no_show: "No-show",
    };
    return m[sk] ?? sk;
}

function formatBookingWhen(row: TourBookingRow, viewerTz: string | null): string {
    try {
        const d = new Date(row.start_at);
        if (Number.isNaN(d.getTime())) return row.start_at;
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: row.timezone || viewerTz || undefined,
        }).format(d);
    } catch {
        return row.start_at;
    }
}

export function OpportunityTourDrawerSection(props: Props) {
    const { opportunityId, locationId, canMutate, onRefresh, viewerTimezone } = props;
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [bookings, setBookings] = useState<TourBookingRow[]>([]);
    const [active, setActive] = useState<TourBookingRow[]>([]);
    const [rulesById, setRulesById] = useState<Record<string, { approval_required: boolean }>>({});
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [scheduleMode, setScheduleMode] = useState<"schedule" | "reschedule">("schedule");
    const [slots, setSlots] = useState<AvailableTourSlot[]>([]);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [slotsErr, setSlotsErr] = useState<string | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<AvailableTourSlot | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/tours/opportunities/${encodeURIComponent(opportunityId)}/bookings`, {
                credentials: "include",
            });
            const j = (await res.json().catch(() => ({}))) as { bookings?: TourBookingRow[]; active_bookings?: TourBookingRow[]; error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            setBookings(j.bookings ?? []);
            setActive(j.active_bookings ?? []);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [opportunityId]);

    useEffect(() => {
        void load();
    }, [load]);

    const primary = useMemo(() => active[0] ?? null, [active]);

    const loadRules = useCallback(async () => {
        const res = await fetch(`/api/admin/tours/availability-rules?location_id=${encodeURIComponent(locationId)}`, {
            credentials: "include",
        });
        const j = (await res.json()) as { rules?: { id: string; approval_required: boolean }[] };
        const map: Record<string, { approval_required: boolean }> = {};
        for (const r of j.rules ?? []) {
            map[r.id] = { approval_required: Boolean(r.approval_required) };
        }
        setRulesById(map);
    }, [locationId]);

    const openSchedule = async (mode: "schedule" | "reschedule") => {
        if (!locationId) return;
        setScheduleMode(mode);
        setScheduleOpen(true);
        setSlotsErr(null);
        setSelectedSlot(null);
        setSlotsLoading(true);
        if (mode === "schedule") {
            await loadRules();
        }
        const from = new Date();
        from.setUTCHours(0, 0, 0, 0);
        const to = new Date(from);
        to.setUTCDate(to.getUTCDate() + 21);
        try {
            const qs = new URLSearchParams({
                location_id: locationId,
                from: from.toISOString(),
                to: to.toISOString(),
            });
            const res = await fetch(`/api/admin/tours/slots?${qs.toString()}`, { credentials: "include" });
            const j = (await res.json()) as { slots?: AvailableTourSlot[]; error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            setSlots(j.slots ?? []);
        } catch (e) {
            setSlotsErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSlotsLoading(false);
        }
    };

    const createFromSlot = async () => {
        if (!selectedSlot) return;
        setSaving(true);
        setSlotsErr(null);
        try {
            if (scheduleMode === "reschedule" && primary && !["canceled", "completed", "no_show"].includes(primary.status_key)) {
                const res = await fetch(`/api/admin/tours/bookings/${encodeURIComponent(primary.id)}/reschedule`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        start_at: selectedSlot.startAt,
                        end_at: selectedSlot.endAt,
                        timezone: selectedSlot.timezone,
                    }),
                });
                const j = (await res.json()) as { error?: string };
                if (!res.ok) throw new Error(j.error ?? res.statusText);
            } else {
                const rule = rulesById[selectedSlot.ruleId];
                const approvalRequired = Boolean(rule?.approval_required);
                const res = await fetch("/api/admin/tours/bookings", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        opportunity_id: opportunityId,
                        location_id: locationId,
                        start_at: selectedSlot.startAt,
                        end_at: selectedSlot.endAt,
                        timezone: selectedSlot.timezone,
                        approval_required: approvalRequired,
                    }),
                });
                const j = (await res.json()) as { error?: string };
                if (!res.ok) throw new Error(j.error ?? res.statusText);
            }
            setScheduleOpen(false);
            await load();
            await onRefresh();
        } catch (e) {
            setSlotsErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    const postBookingAction = async (path: string, body?: Record<string, unknown>) => {
        if (!primary) return;
        setSaving(true);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/tours/bookings/${encodeURIComponent(primary.id)}${path}`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: body ? JSON.stringify(body) : "{}",
            });
            const j = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            await load();
            await onRefresh();
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    if (!locationId) {
        return (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Set an opportunity <strong>location</strong> before scheduling tours from this section.
            </div>
        );
    }

    return (
        <div className="space-y-3 text-sm text-alloy-midnight">
            <p className="text-xs leading-relaxed text-alloy-midnight/60">
                Scheduling source of truth: <code className="rounded bg-alloy-stone/10 px-1 text-[11px]">tour_bookings</code>. The legacy
                Schedule tour action still works for workflow-driven metadata capture.
            </p>
            {loading ? <p className="text-alloy-midnight/55">Loading tour bookings…</p> : null}
            {err ? <p className="text-red-700">{err}</p> : null}
            {!loading && !primary ? <p className="text-alloy-midnight/60">No active tour booking.</p> : null}
            {primary ? (
                <div className="rounded-lg border border-alloy-stone/20 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">Status</div>
                            <div className="font-medium">{statusLabel(primary.status_key)}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">Start (site TZ)</div>
                            <div className="font-mono text-[13px]">{formatBookingWhen(primary, viewerTimezone)}</div>
                            <div className="text-[11px] text-alloy-midnight/50">{primary.timezone}</div>
                        </div>
                    </div>
                    {bookings.filter((b) => !ACTIVE.has(b.status_key)).length > 0 ? (
                        <div className="mt-2 border-t border-alloy-stone/10 pt-2 text-xs text-alloy-midnight/55">
                            Recent:{" "}
                            {bookings
                                .filter((b) => !ACTIVE.has(b.status_key))
                                .slice(0, 3)
                                .map((b) => `${statusLabel(b.status_key)} @ ${formatBookingWhen(b, viewerTimezone)}`)
                                .join(" · ")}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {canMutate ? (
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="rounded-lg bg-alloy-midnight px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={saving || !!primary}
                        onClick={() => void openSchedule("schedule")}
                    >
                        Schedule
                    </button>
                    <button
                        type="button"
                        className="rounded-lg border border-alloy-stone/25 px-3 py-1.5 text-xs font-semibold text-alloy-midnight disabled:opacity-50"
                        disabled={saving || !primary || ["canceled", "completed", "no_show"].includes(primary.status_key)}
                        onClick={() => void openSchedule("reschedule")}
                    >
                        Reschedule
                    </button>
                    <button
                        type="button"
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-800 disabled:opacity-50"
                        disabled={saving || !primary || ["canceled", "completed", "no_show"].includes(primary.status_key)}
                        onClick={() => void postBookingAction("/cancel", { canceled_by: "admin" })}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded-lg border border-alloy-stone/25 px-3 py-1.5 text-xs font-semibold text-alloy-midnight disabled:opacity-50"
                        disabled={saving || !primary || !["confirmed", "rescheduled"].includes(primary.status_key)}
                        onClick={() => void postBookingAction("/complete")}
                    >
                        Complete
                    </button>
                    <button
                        type="button"
                        className="rounded-lg border border-alloy-stone/25 px-3 py-1.5 text-xs font-semibold text-alloy-midnight disabled:opacity-50"
                        disabled={saving || !primary || !["confirmed", "rescheduled"].includes(primary.status_key)}
                        onClick={() => void postBookingAction("/no-show")}
                    >
                        No-show
                    </button>
                    {primary?.status_key === "pending_approval" ? (
                        <button
                            type="button"
                            className="rounded-lg border border-alloy-pine/40 bg-alloy-pine/10 px-3 py-1.5 text-xs font-semibold text-alloy-pine disabled:opacity-50"
                            disabled={saving}
                            onClick={() => void postBookingAction("/confirm")}
                        >
                            Confirm
                        </button>
                    ) : null}
                </div>
            ) : null}

            {scheduleOpen ? (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30 p-4" onClick={() => setScheduleOpen(false)}>
                    <div
                        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl border border-alloy-stone/20 bg-white p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="text-sm font-semibold text-alloy-midnight">
                            {scheduleMode === "reschedule" ? "Reschedule tour" : "Pick a slot"}
                        </div>
                        {slotsLoading ? <p className="mt-2 text-xs text-alloy-midnight/55">Loading slots…</p> : null}
                        {slotsErr ? <p className="mt-2 text-xs text-red-700">{slotsErr}</p> : null}
                        {!slotsLoading && slots.length === 0 ? <p className="mt-2 text-xs text-alloy-midnight/60">No slots in range.</p> : null}
                        <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-xs">
                            {slots.map((s) => (
                                <li key={`${s.startAt}-${s.ruleId}`}>
                                    <button
                                        type="button"
                                        className={`w-full rounded border px-2 py-1.5 text-left ${
                                            selectedSlot?.startAt === s.startAt && selectedSlot?.ruleId === s.ruleId
                                                ? "border-alloy-midnight bg-alloy-midnight/5"
                                                : "border-alloy-stone/15 hover:bg-alloy-stone/5"
                                        }`}
                                        onClick={() => setSelectedSlot(s)}
                                    >
                                        {new Date(s.startAt).toLocaleString(undefined, { timeZone: s.timezone })} —{" "}
                                        {new Date(s.endAt).toLocaleString(undefined, { timeZone: s.timezone })}{" "}
                                        <span className="text-alloy-midnight/50">({s.timezone})</span>
                                        {rulesById[s.ruleId]?.approval_required ? (
                                            <span className="ml-1 text-amber-700"> · needs approval</span>
                                        ) : null}
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-3 flex justify-end gap-2">
                            <button type="button" className="rounded-lg border px-3 py-1.5 text-xs" onClick={() => setScheduleOpen(false)}>
                                Close
                            </button>
                            <button
                                type="button"
                                className="rounded-lg bg-alloy-midnight px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                disabled={!selectedSlot || saving}
                                onClick={() => void createFromSlot()}
                            >
                                {scheduleMode === "reschedule" ? "Save reschedule" : "Book"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

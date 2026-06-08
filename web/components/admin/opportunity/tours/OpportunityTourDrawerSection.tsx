"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";

const ACTIVE = new Set<string>(TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS);

type Props = {
    opportunityId: string;
    locationId: string;
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

/**
 * Passive summary of `tour_bookings` for the layout-driven `tour_scheduling` drawer section.
 * Scheduling and lifecycle actions live on the header "Schedule tour" action and under Tour date (inquiry summary).
 */
export function OpportunityTourDrawerSection(props: Props) {
    const { opportunityId, locationId, viewerTimezone } = props;
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [bookings, setBookings] = useState<TourBookingRow[]>([]);
    const [active, setActive] = useState<TourBookingRow[]>([]);

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

    useEffect(() => {
        const onEvt = (ev: Event) => {
            const ce = ev as CustomEvent<{ id?: string }>;
            if (ce.detail?.id === opportunityId) void load();
        };
        window.addEventListener("adminv2:opportunity-updated", onEvt as EventListener);
        return () => window.removeEventListener("adminv2:opportunity-updated", onEvt as EventListener);
    }, [opportunityId, load]);

    const primary = useMemo(() => active[0] ?? null, [active]);

    if (!locationId) {
        return (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Set an opportunity <strong>location</strong> before scheduling tours. Use the <strong>Schedule tour</strong> header action
                when a site is set.
            </div>
        );
    }

    return (
        <div className="space-y-2 text-sm text-alloy-midnight">
            <p className="text-xs leading-relaxed text-alloy-midnight/60">
                Source of truth: <code className="rounded bg-alloy-stone/10 px-1 text-[11px]">tour_bookings</code>. Schedule or change
                tours from the <strong>Schedule tour</strong> button above, or use the actions under <strong>Tour date</strong> in the
                inquiry summary when a booking exists.
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
        </div>
    );
}

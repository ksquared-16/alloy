"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";
import { OpportunityTourSlotSchedulePanel } from "@/components/admin/opportunity/tours/OpportunityTourSlotSchedulePanel";

const ACTIVE = new Set<string>(TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS);

type Props = {
    opportunityId: string;
    locationId: string;
    canMutate: boolean;
    onRefresh: () => void | Promise<void>;
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

/** Inline actions below inquiry "Tour date" — uses tour_bookings APIs only (no duplicate Schedule entry point). */
export function OpportunityTourBookingLifecycleBar(props: Props) {
    const { opportunityId, locationId, canMutate, onRefresh } = props;
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [active, setActive] = useState<TourBookingRow[]>([]);
    const [saving, setSaving] = useState(false);
    const [rescheduleOpen, setRescheduleOpen] = useState(false);

    const load = useCallback(async () => {
        if (!locationId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/tours/opportunities/${encodeURIComponent(opportunityId)}/bookings`, {
                credentials: "include",
            });
            const j = (await res.json().catch(() => ({}))) as { active_bookings?: TourBookingRow[]; error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            setActive(j.active_bookings ?? []);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [opportunityId, locationId]);

    useEffect(() => {
        void load();
    }, [load]);

    const primary = useMemo(() => active[0] ?? null, [active]);

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
            window.dispatchEvent(
                new CustomEvent("adminv2:opportunity-updated", { detail: { id: opportunityId, action_key: "tour_booking" } })
            );
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    if (!locationId) return null;

    if (loading) {
        return <div className="mt-1 text-[11px] text-alloy-midnight/45">Loading tour booking…</div>;
    }
    if (err) {
        return <div className="mt-1 text-[11px] text-red-700">{err}</div>;
    }
    if (!primary) {
        return null;
    }

    const terminal = ["canceled", "completed", "no_show"].includes(primary.status_key);
    const canReschedule = canMutate && !terminal;
    const canComplete = canMutate && ["confirmed", "rescheduled"].includes(primary.status_key);

    return (
        <div className="mt-1.5 space-y-1">
            <div className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">Tour booking</div>
            <div className="text-[11px] text-alloy-midnight/75">
                {statusLabel(primary.status_key)}
                {ACTIVE.has(primary.status_key) ? (
                    <span className="text-alloy-midnight/45"> · Tour date above follows this booking.</span>
                ) : null}
            </div>
            {canMutate ? (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <button
                        type="button"
                        className="rounded border border-alloy-stone/25 bg-white px-2 py-1 text-[11px] font-semibold text-alloy-midnight disabled:opacity-50"
                        disabled={saving || !canReschedule}
                        onClick={() => setRescheduleOpen(true)}
                    >
                        Reschedule
                    </button>
                    <button
                        type="button"
                        className="rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-800 disabled:opacity-50"
                        disabled={saving || !canReschedule}
                        onClick={() => void postBookingAction("/cancel", { canceled_by: "admin" })}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded border border-alloy-stone/25 bg-white px-2 py-1 text-[11px] font-semibold text-alloy-midnight disabled:opacity-50"
                        disabled={saving || !canComplete}
                        onClick={() => void postBookingAction("/complete")}
                    >
                        Complete
                    </button>
                    <button
                        type="button"
                        className="rounded border border-alloy-stone/25 bg-white px-2 py-1 text-[11px] font-semibold text-alloy-midnight disabled:opacity-50"
                        disabled={saving || !canComplete}
                        onClick={() => void postBookingAction("/no-show")}
                    >
                        No-show
                    </button>
                    {primary.status_key === "pending_approval" ? (
                        <button
                            type="button"
                            className="rounded border border-alloy-pine/40 bg-alloy-pine/10 px-2 py-1 text-[11px] font-semibold text-alloy-pine disabled:opacity-50"
                            disabled={saving}
                            onClick={() => void postBookingAction("/confirm")}
                        >
                            Confirm
                        </button>
                    ) : null}
                </div>
            ) : null}

            {rescheduleOpen && primary ? (
                <div
                    className="fixed inset-0 z-[998] flex items-center justify-center bg-black/30 p-4"
                    onClick={() => setRescheduleOpen(false)}
                >
                    <div
                        className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <OpportunityTourSlotSchedulePanel
                            opportunityId={opportunityId}
                            locationId={locationId}
                            mode="reschedule"
                            primaryBooking={primary}
                            onCancel={() => setRescheduleOpen(false)}
                            onSuccess={async () => {
                                setRescheduleOpen(false);
                                await load();
                                await onRefresh();
                                window.dispatchEvent(
                                    new CustomEvent("adminv2:opportunity-updated", {
                                        detail: { id: opportunityId, action_key: "tour_booking" },
                                    })
                                );
                            }}
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

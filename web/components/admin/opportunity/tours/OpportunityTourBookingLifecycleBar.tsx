"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";
import { resolveTourDrawerBookingUiState } from "@/lib/tours/opportunity/resolveTourDrawerBookingUiState";
import { OpportunityTourSlotSchedulePanel } from "@/components/admin/opportunity/tours/OpportunityTourSlotSchedulePanel";

const ACTIVE = new Set<string>(TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS);

function statusLabel(statusKey: string | null | undefined): string {
    if (!statusKey) return "Unknown";
    const m: Record<string, string> = {
        requested: "Requested",
        pending_approval: "Pending approval",
        confirmed: "Confirmed",
        rescheduled: "Rescheduled",
        canceled: "Canceled",
        completed: "Completed",
        no_show: "No-show",
    };
    if (m[statusKey]) return m[statusKey]!;
    return statusKey
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

type Props = {
    opportunityId: string;
    locationId: string;
    statusKey?: string | null;
    metadata?: unknown;
    canMutate: boolean;
    onRefresh: () => void | Promise<void>;
    /** Shared bookings from parent — avoids duplicate GET when tour date block already loaded. */
    activeBookings?: TourBookingRow[];
    fetchEnabled?: boolean;
};

/** Inline actions below inquiry "Tour date" — uses tour_bookings APIs only (no duplicate Schedule entry point). */
export function OpportunityTourBookingLifecycleBar(props: Props) {
    const {
        opportunityId,
        locationId,
        statusKey = null,
        metadata = null,
        canMutate,
        onRefresh,
        activeBookings,
        fetchEnabled = true,
    } = props;
    const useSharedBookings = activeBookings != null;
    const [loading, setLoading] = useState(!useSharedBookings);
    const [err, setErr] = useState<string | null>(null);
    const [active, setActive] = useState<TourBookingRow[]>(activeBookings ?? []);
    const [saving, setSaving] = useState(false);
    const [rescheduleOpen, setRescheduleOpen] = useState(false);

    const load = useCallback(async () => {
        if (useSharedBookings || !fetchEnabled) {
            setLoading(false);
            return;
        }
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
    }, [fetchEnabled, opportunityId, locationId, useSharedBookings]);

    useEffect(() => {
        if (useSharedBookings) {
            setActive(activeBookings);
            setLoading(false);
            return;
        }
        void load();
    }, [activeBookings, load, useSharedBookings]);

    const uiState = useMemo(
        () =>
            resolveTourDrawerBookingUiState({
                statusKey,
                metadata,
                locationId,
                activeBookings: active,
            }),
        [active, locationId, metadata, statusKey]
    );

    const primary = uiState.kind === "active_booking" ? uiState.primary : null;

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

    if (uiState.kind === "missing_location") {
        return (
            <div className="mt-1 text-[11px] text-alloy-midnight/60" data-tour-booking-ui-state="missing_location">
                Add a location to this inquiry to manage tour bookings.
            </div>
        );
    }

    if (loading) {
        return (
            <div
                className="mt-1.5 min-h-[2.25rem] space-y-1"
                data-tour-booking-ui-state="loading"
                aria-busy="true"
            >
                <div className="h-3 w-[min(12rem,55vw)] skeleton-pulse rounded bg-alloy-stone/10" aria-hidden />
                <div className="flex min-h-[2.25rem] flex-wrap gap-1.5 pt-0.5">
                    <div className="h-7 w-[5.5rem] skeleton-pulse rounded border border-alloy-stone/15 bg-alloy-stone/8" aria-hidden />
                    <div className="h-7 w-[4.5rem] skeleton-pulse rounded border border-alloy-stone/15 bg-alloy-stone/8" aria-hidden />
                    <div className="h-7 w-[5.25rem] skeleton-pulse rounded border border-alloy-stone/15 bg-alloy-stone/8" aria-hidden />
                </div>
            </div>
        );
    }
    if (err) {
        return <div className="mt-1 text-[11px] text-red-700">{err}</div>;
    }

    if (uiState.kind === "metadata_only") {
        return (
            <div
                className="mt-1.5 rounded-md border border-amber-200/70 bg-amber-50/40 px-2 py-1.5 text-[11px] leading-snug text-alloy-midnight/78"
                data-tour-booking-ui-state="metadata_only"
            >
                <p className="font-medium text-alloy-midnight/88">Tour scheduled on file — no active booking found</p>
                <p className="mt-0.5">
                    {uiState.legacyMetadataOnly
                        ? "This record was scheduled with the legacy date/time path (metadata only). Use Schedule tour to create a booking-backed tour."
                        : "Status shows Tour Scheduled, but there is no active tour_bookings row. Use Schedule tour to repair or create the booking."}
                </p>
            </div>
        );
    }

    if (!primary) {
        return null;
    }

    const terminal = ["canceled", "completed", "no_show"].includes(primary.status_key);
    const canReschedule = canMutate && !terminal;
    const canComplete = canMutate && ["confirmed", "rescheduled"].includes(primary.status_key);

    return (
        <div className="mt-1.5 space-y-1" data-tour-booking-ui-state="active_booking">
            <p className="text-[11px] text-alloy-midnight/70">
                Status: {statusLabel(primary.status_key)}
                {ACTIVE.has(primary.status_key) ? (
                    <span className="text-alloy-midnight/50"> · Inquiry tour date reflects this booking.</span>
                ) : null}
            </p>
            <div className="flex min-h-[2.25rem] flex-wrap gap-1.5 pt-0.5">
                <button
                    type="button"
                    className="rounded border border-alloy-stone/25 bg-white px-2 py-1 text-[11px] font-semibold text-alloy-midnight disabled:opacity-50"
                    disabled={saving || !canMutate || !canReschedule}
                    onClick={() => setRescheduleOpen(true)}
                >
                    Reschedule
                </button>
                <button
                    type="button"
                    className="rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-800 disabled:opacity-50"
                    disabled={saving || !canMutate || !canReschedule}
                    onClick={() => void postBookingAction("/cancel", { canceled_by: "admin" })}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    className="rounded border border-alloy-stone/25 bg-white px-2 py-1 text-[11px] font-semibold text-alloy-midnight disabled:opacity-50"
                    disabled={saving || !canMutate || !canComplete}
                    onClick={() => void postBookingAction("/complete")}
                >
                    Complete
                </button>
                <button
                    type="button"
                    className="rounded border border-alloy-stone/25 bg-white px-2 py-1 text-[11px] font-semibold text-alloy-midnight disabled:opacity-50"
                    disabled={saving || !canMutate || !canComplete}
                    onClick={() => void postBookingAction("/no-show")}
                >
                    No-show
                </button>
                {primary.status_key === "pending_approval" ? (
                    <button
                        type="button"
                        className="rounded border border-alloy-pine/40 bg-alloy-pine/10 px-2 py-1 text-[11px] font-semibold text-alloy-pine disabled:opacity-50"
                        disabled={saving || !canMutate}
                        onClick={() => void postBookingAction("/confirm")}
                    >
                        Confirm
                    </button>
                ) : null}
            </div>

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

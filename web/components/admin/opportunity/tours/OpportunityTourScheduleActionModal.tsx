"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { ScheduleTourActionFormModal } from "@/components/admin/opportunity/actions/ScheduleTourActionFormModal";
import { OpportunityTourSlotSchedulePanel } from "@/components/admin/opportunity/tours/OpportunityTourSlotSchedulePanel";
import { ActionModalStatusMessage } from "@/components/admin/opportunity/actions/ActionModalStatusMessage";

export type OpportunityTourScheduleActionModalProps = {
    open: boolean;
    onClose: () => void;
    title?: string;
    submitLabel?: string;
    opportunityId: string;
    locationId: string | null | undefined;
    initialTourDate?: string | null;
    initialTourTime?: string | null;
    onSlotBooked: (result?: { booking?: TourBookingRow }) => void | Promise<void>;
    onLegacySubmit: (payload: { tour_date: string; tour_time: string }) => Promise<void>;
};

type SlotPhase = "bootstrapping" | "duplicate_guard" | "schedule" | "reschedule";

const SUCCESS_DISMISS_MS = 2000;

function formatBookingWhen(row: TourBookingRow, viewerTz: string | null | undefined): string {
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

/**
 * Primary "Schedule tour" header action: slot-based `tour_bookings` flow when the opportunity
 * has a site (`location_id`). Falls back to legacy date/time + executeAdminAction when no site.
 * If an active non-terminal booking already exists, the create path is blocked in favor of reschedule.
 */
export function OpportunityTourScheduleActionModal(props: OpportunityTourScheduleActionModalProps) {
    const {
        open,
        onClose,
        title = "Schedule tour",
        submitLabel = "Save",
        opportunityId,
        locationId,
        initialTourDate,
        initialTourTime,
        onSlotBooked,
        onLegacySubmit,
    } = props;

    const loc = String(locationId ?? "").trim();
    const hasSite = Boolean(loc);
    const oid = String(opportunityId ?? "").trim();

    const [panel, setPanel] = useState<"slots" | "legacy">("slots");
    const [slotPhase, setSlotPhase] = useState<SlotPhase>("bootstrapping");
    const [activeBookings, setActiveBookings] = useState<TourBookingRow[]>([]);
    const [bootstrapErr, setBootstrapErr] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const defaultSuccessMessage = useMemo(() => {
        const label = (submitLabel ?? title ?? "").toLowerCase();
        return label.includes("reschedule") ? "Tour rescheduled." : "Tour scheduled.";
    }, [submitLabel, title]);

    const completeWithSuccess = useCallback(
        async (result: { booking?: TourBookingRow } | undefined, message: string) => {
            await onSlotBooked(result);
            setSuccessMessage(message);
            window.setTimeout(() => onClose(), SUCCESS_DISMISS_MS);
        },
        [onClose, onSlotBooked]
    );

    const loadActiveBookings = useCallback(async () => {
        if (!oid) {
            setActiveBookings([]);
            setSlotPhase("schedule");
            setBootstrapErr(null);
            return;
        }
        setBootstrapErr(null);
        try {
            const res = await fetch(`/api/admin/tours/opportunities/${encodeURIComponent(oid)}/bookings`, {
                credentials: "include",
            });
            const j = (await res.json().catch(() => ({}))) as {
                active_bookings?: TourBookingRow[];
                error?: string;
            };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            const act = j.active_bookings ?? [];
            setActiveBookings(act);
            setSlotPhase(act.length > 0 ? "duplicate_guard" : "schedule");
        } catch (e) {
            setActiveBookings([]);
            setBootstrapErr(e instanceof Error ? e.message : String(e));
            setSlotPhase("schedule");
        }
    }, [oid]);

    useEffect(() => {
        if (!open) {
            setPanel(hasSite ? "slots" : "legacy");
            setSlotPhase("bootstrapping");
            setActiveBookings([]);
            setBootstrapErr(null);
            setSuccessMessage(null);
            return;
        }
        setPanel(hasSite ? "slots" : "legacy");
        if (!hasSite || !oid) {
            setSlotPhase("schedule");
            setActiveBookings([]);
            setBootstrapErr(null);
            return;
        }
        setSlotPhase("bootstrapping");
        void loadActiveBookings();
    }, [open, hasSite, oid, loadActiveBookings]);

    const primaryActive = useMemo(() => activeBookings[0] ?? null, [activeBookings]);

    if (!open) return null;

    if (successMessage) {
        return (
            <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
                <div
                    className="w-full max-w-md overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white p-5 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="text-base font-semibold text-alloy-midnight">{title}</div>
                    <div className="mt-4 space-y-3">
                        <ActionModalStatusMessage type="success" message={successMessage} />
                        <p className="text-xs text-alloy-midnight/65">
                            Tour date in the inquiry summary has been updated.
                        </p>
                        <div className="flex justify-end pt-1">
                            <button
                                type="button"
                                className="rounded-lg bg-alloy-midnight px-3 py-2 text-sm font-medium text-white"
                                onClick={onClose}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const showSlotChrome = hasSite && panel === "slots";

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
            <div
                className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {showSlotChrome && slotPhase === "bootstrapping" ? (
                    <div className="px-5 py-10 text-center text-sm text-alloy-midnight/70" aria-busy="true">
                        Checking existing tour bookings…
                    </div>
                ) : null}

                {showSlotChrome && slotPhase === "duplicate_guard" && primaryActive ? (
                    <div className="text-sm text-alloy-midnight" onClick={(e) => e.stopPropagation()}>
                        <div className="border-b border-alloy-stone/15 px-5 py-4">
                            <div className="text-base font-semibold">{title}</div>
                            <p className="mt-2 text-xs leading-relaxed text-alloy-midnight/70">
                                An active tour booking already exists for this opportunity. Pick a new time with{" "}
                                <strong>Reschedule</strong>, or use <strong>Cancel</strong> under <strong>Tour date</strong> in the inquiry
                                summary before scheduling again.
                            </p>
                        </div>
                        <div className="space-y-3 px-5 py-4">
                            {bootstrapErr ? (
                                <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
                                    Could not verify existing bookings ({bootstrapErr}). If you continue with reschedule, duplicate
                                    scheduling is still blocked by the server.
                                </p>
                            ) : null}
                            <div className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-2 text-xs">
                                <div className="font-semibold text-alloy-midnight/80">{statusLabel(primaryActive.status_key)}</div>
                                <div className="mt-0.5 font-mono text-[13px] text-alloy-midnight">{formatBookingWhen(primaryActive, null)}</div>
                                <div className="mt-0.5 text-[11px] text-alloy-midnight/50">{primaryActive.timezone}</div>
                            </div>
                            <div className="flex flex-wrap justify-end gap-2 border-t border-alloy-stone/10 pt-3">
                                <button type="button" className="rounded-lg border px-3 py-1.5 text-xs" onClick={onClose}>
                                    Close
                                </button>
                                <button
                                    type="button"
                                    className="rounded-lg bg-alloy-midnight px-3 py-1.5 text-xs font-semibold text-white"
                                    onClick={() => setSlotPhase("reschedule")}
                                >
                                    Reschedule tour
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}

                {showSlotChrome && slotPhase === "schedule" ? (
                    <OpportunityTourSlotSchedulePanel
                        opportunityId={oid}
                        locationId={loc}
                        mode="schedule"
                        primaryBooking={null}
                        onCancel={onClose}
                        onSuccess={async (result) => {
                            await completeWithSuccess(result, defaultSuccessMessage);
                        }}
                        footerSlot={
                            <div className="space-y-1">
                                {bootstrapErr ? (
                                    <p className="text-[11px] text-amber-900">
                                        Note: existing bookings could not be loaded ({bootstrapErr}). If a booking already exists, use{" "}
                                        <strong>Reschedule</strong> from Tour date instead of booking again.
                                    </p>
                                ) : null}
                                <button
                                    type="button"
                                    className="text-xs font-medium text-alloy-midnight/70 underline hover:text-alloy-midnight"
                                    onClick={() => setPanel("legacy")}
                                >
                                    Enter date and time manually (legacy)
                                </button>
                            </div>
                        }
                    />
                ) : null}

                {showSlotChrome && slotPhase === "reschedule" && primaryActive ? (
                    <OpportunityTourSlotSchedulePanel
                        opportunityId={oid}
                        locationId={String(primaryActive.location_id ?? loc).trim() || loc}
                        mode="reschedule"
                        primaryBooking={primaryActive}
                        onCancel={() => setSlotPhase(activeBookings.length > 0 ? "duplicate_guard" : "schedule")}
                        onSuccess={async (result) => {
                            await completeWithSuccess(result, defaultSuccessMessage);
                        }}
                        footerSlot={
                            <p className="text-[11px] text-alloy-midnight/60">
                                <strong>Legacy manual entry</strong> (link on the schedule screen) creates a{" "}
                                <code className="rounded bg-alloy-stone/10 px-1">tour_booking</code> when a site is set; use slot
                                picker to reschedule this row instead.
                            </p>
                        }
                    />
                ) : null}

                {!showSlotChrome ? (
                    <div className="px-0 py-0">
                        {hasSite ? (
                            <div className="border-b border-alloy-stone/12 px-5 py-2">
                                <button
                                    type="button"
                                    className="text-xs font-medium text-alloy-midnight/70 underline hover:text-alloy-midnight"
                                    onClick={() => {
                                        setPanel("slots");
                                        setSlotPhase("bootstrapping");
                                        void loadActiveBookings();
                                    }}
                                >
                                    ← Pick a time slot
                                </button>
                            </div>
                        ) : (
                            <div className="border-b border-amber-100 bg-amber-50/80 px-5 py-2 text-xs text-amber-950">
                                This opportunity has no site (location). Add a location to use slot-based scheduling, or use manual entry
                                below.
                            </div>
                        )}
                        <ScheduleTourActionFormModal
                            open
                            variant="embedded"
                            title={title}
                            subtitle={
                                hasSite
                                    ? "Manual entry creates a tour_booking using the site timezone (same as slot scheduling)."
                                    : "Manual entry updates metadata via the existing action workflow (does not create a tour_booking row)."
                            }
                            submitLabel={submitLabel}
                            successMessage={defaultSuccessMessage}
                            initialTourDate={initialTourDate}
                            initialTourTime={initialTourTime}
                            onClose={onClose}
                            onCancel={hasSite ? () => setPanel("slots") : onClose}
                            onSubmit={onLegacySubmit}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
}

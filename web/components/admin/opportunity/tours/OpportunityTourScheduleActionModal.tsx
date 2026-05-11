"use client";

import { useEffect, useState } from "react";
import { ScheduleTourActionFormModal } from "@/components/admin/opportunity/actions/ScheduleTourActionFormModal";
import { OpportunityTourSlotSchedulePanel } from "@/components/admin/opportunity/tours/OpportunityTourSlotSchedulePanel";

export type OpportunityTourScheduleActionModalProps = {
    open: boolean;
    onClose: () => void;
    title?: string;
    submitLabel?: string;
    opportunityId: string;
    locationId: string | null | undefined;
    initialTourDate?: string | null;
    initialTourTime?: string | null;
    onSlotBooked: () => void | Promise<void>;
    onLegacySubmit: (payload: { tour_date: string; tour_time: string }) => Promise<void>;
};

/**
 * Primary "Schedule tour" header action: slot-based `tour_bookings` flow when the opportunity
 * has a site (`location_id`). Falls back to legacy date/time + executeAdminAction when no site.
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

    const [panel, setPanel] = useState<"slots" | "legacy">("slots");

    useEffect(() => {
        if (!open) return;
        setPanel(hasSite ? "slots" : "legacy");
    }, [open, hasSite]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
            <div
                className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {hasSite && panel === "slots" ? (
                    <OpportunityTourSlotSchedulePanel
                        opportunityId={opportunityId}
                        locationId={loc}
                        mode="schedule"
                        primaryBooking={null}
                        onCancel={onClose}
                        onSuccess={async () => {
                            await onSlotBooked();
                            onClose();
                        }}
                        footerSlot={
                            <button
                                type="button"
                                className="text-xs font-medium text-alloy-midnight/70 underline hover:text-alloy-midnight"
                                onClick={() => setPanel("legacy")}
                            >
                                Enter date and time manually (legacy)
                            </button>
                        }
                    />
                ) : (
                    <div className="px-0 py-0">
                        {hasSite ? (
                            <div className="border-b border-alloy-stone/12 px-5 py-2">
                                <button
                                    type="button"
                                    className="text-xs font-medium text-alloy-midnight/70 underline hover:text-alloy-midnight"
                                    onClick={() => setPanel("slots")}
                                >
                                    ← Pick a time slot
                                </button>
                            </div>
                        ) : (
                            <div className="border-b border-amber-100 bg-amber-50/80 px-5 py-2 text-xs text-amber-950">
                                This opportunity has no site (location). Add a location to use slot-based scheduling, or use manual
                                entry below.
                            </div>
                        )}
                        <ScheduleTourActionFormModal
                            open
                            variant="embedded"
                            title={title}
                            subtitle="Manual entry updates metadata via the existing action workflow (does not create a tour_booking row)."
                            submitLabel={submitLabel}
                            initialTourDate={initialTourDate}
                            initialTourTime={initialTourTime}
                            onClose={onClose}
                            onCancel={hasSite ? () => setPanel("slots") : onClose}
                            onSubmit={onLegacySubmit}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

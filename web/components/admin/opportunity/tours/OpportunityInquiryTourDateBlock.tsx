"use client";

import { formatTourDateTime } from "@/lib/enrollment/formatTourDateTime";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { useOpportunityActiveTourBookings } from "@/lib/tours/hooks/useOpportunityActiveTourBookings";
import { formatTourBookingInstantSiteLocal } from "@/lib/tours/opportunity/formatTourBookingSiteLocalDisplay";
import { resolveOpportunityInquiryTourDateDisplay } from "@/lib/tours/opportunity/resolveOpportunityInquiryTourDateDisplay";
import { OpportunityTourBookingLifecycleBar } from "@/components/admin/opportunity/tours/OpportunityTourBookingLifecycleBar";

export type OpportunityInquiryTourDateBlockProps = {
    opportunityId: string;
    locationId: string;
    statusKey?: string | null;
    metadata: unknown;
    viewerTimezone: string | null | undefined;
    canMutate: boolean;
    onRefresh: () => void | Promise<void>;
    labelClassName: string;
    readonlyFieldClassName: string;
    /** When false, skips tour_bookings GET until section is visible and full hydrate has applied. */
    fetchEnabled?: boolean;
    /** Parent-owned bookings — avoids duplicate GET with drawer header hook. */
    sharedActiveBookings?: TourBookingRow[];
};

/**
 * Inquiry summary: Tour date readout (active `tour_bookings` first, then metadata mirror)
 * plus the booking lifecycle bar — single surface, no separate `tour_scheduling` section.
 */
export function OpportunityInquiryTourDateBlock(props: OpportunityInquiryTourDateBlockProps) {
    const {
        opportunityId,
        locationId,
        statusKey = null,
        metadata,
        viewerTimezone,
        canMutate,
        onRefresh,
        labelClassName,
        readonlyFieldClassName,
        fetchEnabled = true,
        sharedActiveBookings,
    } = props;

    const hookBookings = useOpportunityActiveTourBookings(
        opportunityId,
        fetchEnabled && sharedActiveBookings == null
    );
    const activeBookings = sharedActiveBookings ?? hookBookings.activeBookings;

    const primary = activeBookings[0];
    const bookingBacked = Boolean(primary && typeof primary.start_at === "string" && primary.start_at.trim());
    let tourDisplay: string;
    if (bookingBacked && primary) {
        tourDisplay = formatTourBookingInstantSiteLocal(primary.start_at, primary.timezone);
    } else {
        const { tourDate, tourTime, displayTimeZoneIana } = resolveOpportunityInquiryTourDateDisplay(
            metadata,
            activeBookings
        );
        tourDisplay = formatTourDateTime(tourDate, tourTime, {
            displayTimeZoneIana: displayTimeZoneIana ?? viewerTimezone ?? null,
        }).display;
    }

    return (
        <>
            <div className={labelClassName}>Tour date</div>
            <div className={readonlyFieldClassName} aria-label="Tour date (tour_bookings + metadata mirror)">
                {tourDisplay}
            </div>
            <OpportunityTourBookingLifecycleBar
                opportunityId={opportunityId}
                locationId={locationId}
                statusKey={statusKey}
                metadata={metadata}
                canMutate={canMutate}
                onRefresh={onRefresh}
                activeBookings={activeBookings}
                fetchEnabled={fetchEnabled}
            />
        </>
    );
}

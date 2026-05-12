"use client";

import { formatTourDateTime } from "@/lib/enrollment/formatTourDateTime";
import { useOpportunityActiveTourBookings } from "@/lib/tours/hooks/useOpportunityActiveTourBookings";
import { resolveOpportunityInquiryTourDateDisplay } from "@/lib/tours/opportunity/resolveOpportunityInquiryTourDateDisplay";
import { OpportunityTourBookingLifecycleBar } from "@/components/admin/opportunity/tours/OpportunityTourBookingLifecycleBar";

export type OpportunityInquiryTourDateBlockProps = {
    opportunityId: string;
    locationId: string;
    metadata: unknown;
    viewerTimezone: string | null | undefined;
    canMutate: boolean;
    onRefresh: () => void | Promise<void>;
    labelClassName: string;
    readonlyFieldClassName: string;
};

/**
 * Inquiry summary: Tour date readout (active `tour_bookings` first, then metadata mirror)
 * plus the booking lifecycle bar — single surface, no separate `tour_scheduling` section.
 */
export function OpportunityInquiryTourDateBlock(props: OpportunityInquiryTourDateBlockProps) {
    const { opportunityId, locationId, metadata, viewerTimezone, canMutate, onRefresh, labelClassName, readonlyFieldClassName } = props;

    const { activeBookings } = useOpportunityActiveTourBookings(opportunityId);

    const { tourDate, tourTime } = resolveOpportunityInquiryTourDateDisplay(metadata, activeBookings);
    const primary = activeBookings[0];
    const siteTz =
        primary && typeof primary.timezone === "string" && primary.timezone.trim() ? primary.timezone.trim() : null;
    const fmtTz = siteTz ?? viewerTimezone ?? null;
    const fmt = formatTourDateTime(tourDate, tourTime, { displayTimeZoneIana: fmtTz });
    const siteTimeCaption = siteTz ? `Site time (${siteTz})` : null;

    return (
        <>
            <div className={labelClassName}>Tour date</div>
            <div className={readonlyFieldClassName} aria-label="Tour date (tour_bookings + metadata mirror)">
                {fmt.display}
                {siteTimeCaption ? (
                    <div className="mt-0.5 text-[10px] font-normal text-alloy-midnight/50">{siteTimeCaption}</div>
                ) : null}
            </div>
            <OpportunityTourBookingLifecycleBar
                opportunityId={opportunityId}
                locationId={locationId}
                canMutate={canMutate}
                onRefresh={onRefresh}
            />
        </>
    );
}

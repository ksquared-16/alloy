"use client";

import { useCallback, useEffect, useState } from "react";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { formatTourDateTime } from "@/lib/enrollment/formatTourDateTime";
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
    const {
        opportunityId,
        locationId,
        metadata,
        viewerTimezone,
        canMutate,
        onRefresh,
        labelClassName,
        readonlyFieldClassName,
    } = props;

    const [activeBookings, setActiveBookings] = useState<TourBookingRow[]>([]);

    const load = useCallback(async () => {
        const oid = String(opportunityId ?? "").trim();
        if (!oid || oid === "new") {
            setActiveBookings([]);
            return;
        }
        try {
            const res = await fetch(`/api/admin/tours/opportunities/${encodeURIComponent(oid)}/bookings`, {
                credentials: "include",
            });
            const j = (await res.json().catch(() => ({}))) as { active_bookings?: TourBookingRow[]; error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            setActiveBookings(j.active_bookings ?? []);
        } catch {
            setActiveBookings([]);
        }
    }, [opportunityId]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const oid = String(opportunityId ?? "").trim();
        if (!oid || oid === "new") return;
        const onEvt = (ev: Event) => {
            const ce = ev as CustomEvent<{ id?: string }>;
            if (ce.detail?.id === oid) void load();
        };
        window.addEventListener("adminv2:opportunity-updated", onEvt as EventListener);
        return () => window.removeEventListener("adminv2:opportunity-updated", onEvt as EventListener);
    }, [opportunityId, load]);

    const { tourDate, tourTime } = resolveOpportunityInquiryTourDateDisplay(metadata, activeBookings);
    const fmt = formatTourDateTime(tourDate, tourTime, { displayTimeZoneIana: viewerTimezone ?? null });

    return (
        <>
            <div className={labelClassName}>Tour date</div>
            <div className={readonlyFieldClassName} aria-label="Tour date (tour_bookings + metadata mirror)">
                {fmt.display}
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

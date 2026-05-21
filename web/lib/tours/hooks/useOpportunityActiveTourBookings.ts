import { useCallback, useEffect, useState } from "react";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

/**
 * Active non-terminal `tour_bookings` for an opportunity (admin API). Used by inquiry Tour date
 * and header action label; refetches on `adminv2:opportunity-updated` for the same id.
 */
export function useOpportunityActiveTourBookings(
    opportunityId: string | null | undefined,
    enabled = true
) {
    const oid =
        opportunityId && String(opportunityId).trim() && String(opportunityId).trim() !== "new"
            ? String(opportunityId).trim()
            : "";

    const [activeBookings, setActiveBookings] = useState<TourBookingRow[]>([]);

    const load = useCallback(async () => {
        if (!enabled || !oid) {
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
    }, [enabled, oid]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!oid) return;
        const onEvt = (ev: Event) => {
            const ce = ev as CustomEvent<{ id?: string }>;
            if (ce.detail?.id === oid) void load();
        };
        window.addEventListener("adminv2:opportunity-updated", onEvt as EventListener);
        return () => window.removeEventListener("adminv2:opportunity-updated", onEvt as EventListener);
    }, [oid, load]);

    return { activeBookings, reload: load };
}

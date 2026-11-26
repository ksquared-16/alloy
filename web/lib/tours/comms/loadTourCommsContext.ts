import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveOrgTimezoneFromMetadata } from "@/lib/admin/timezoneContract";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import type { TourCommsTemplateContext } from "@/lib/tours/comms/tourCommsTemplateContext";
import { formatTourCommsDateTimeLabels } from "@/lib/tours/comms/tourCommsTemplateContext";

export type LoadTourCommsContextInput = {
    supabase: SupabaseClient;
    orgId: string;
    bookingId: string;
    opportunityId?: string | null;
    locationId?: string | null;
    /** When provided, skips tour_bookings fetch. */
    booking?: TourBookingRow | null;
};

export type LoadedTourCommsContext = {
    booking: TourBookingRow;
    opportunity: {
        id: string;
        name: string | null;
        primary_person_id: string | null;
        primary_contact_id: string | null;
        location_id: string | null;
        stage_key: string | null;
        status_key: string | null;
    };
    orgName: string | null;
    orgTimezoneIana: string;
    templateContext: TourCommsTemplateContext;
};

function formatLocationAddress(row: Record<string, unknown> | null): string | null {
    if (!row) return null;
    const parts = [
        typeof row.address1 === "string" ? row.address1.trim() : "",
        typeof row.address2 === "string" ? row.address2.trim() : "",
        [row.city, row.state, row.postal_code]
            .map((v) => (typeof v === "string" ? v.trim() : ""))
            .filter(Boolean)
            .join(", "),
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
}

export async function loadTourCommsContext(input: LoadTourCommsContextInput): Promise<LoadedTourCommsContext | null> {
    const orgId = String(input.orgId).trim();
    const bookingId = String(input.bookingId).trim();
    if (!orgId || !bookingId) return null;

    let booking = input.booking ?? null;
    if (!booking) {
        const { data, error } = await input.supabase
            .from("tour_bookings")
            .select("*")
            .eq("org_id", orgId)
            .eq("id", bookingId)
            .maybeSingle();
        if (error || !data) return null;
        booking = data as TourBookingRow;
    }

    const opportunityId = String(input.opportunityId ?? booking.opportunity_id ?? "").trim();
    if (!opportunityId) return null;

    const locationId = String(input.locationId ?? booking.location_id ?? "").trim();

    const [oppRes, locRes, orgRes, orgSettingsRes, personRes] = await Promise.all([
        input.supabase
            .from("opportunities")
            .select("id, name, primary_person_id, primary_contact_id, location_id, stage_key, status_key")
            .eq("org_id", orgId)
            .eq("id", opportunityId)
            .maybeSingle(),
        locationId
            ? input.supabase
                  .from("locations")
                  .select("id, label, address1, address2, city, state, postal_code")
                  .eq("org_id", orgId)
                  .eq("id", locationId)
                  .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        input.supabase.from("orgs").select("name").eq("id", orgId).maybeSingle(),
        input.supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle(),
        (async () => {
            const pid = String(booking!.primary_person_id ?? "").trim();
            if (pid) {
                return input.supabase
                    .from("persons")
                    .select("id, first_name, last_name, full_name")
                    .eq("org_id", orgId)
                    .eq("id", pid)
                    .maybeSingle();
            }
            return { data: null, error: null };
        })(),
    ]);

    if (!oppRes.data) return null;

    const opportunity = oppRes.data as {
        id: string;
        name: string | null;
        primary_person_id: string | null;
        primary_contact_id: string | null;
        location_id: string | null;
        stage_key?: string | null;
        status_key?: string | null;
    };
    const location = locRes.data as Record<string, unknown> | null;
    const orgName =
        orgRes.data && typeof (orgRes.data as { name?: string }).name === "string"
            ? String((orgRes.data as { name: string }).name).trim()
            : null;
    const orgTimezoneIana = resolveOrgTimezoneFromMetadata(
        (orgSettingsRes.data as { metadata?: unknown } | null)?.metadata ?? null
    ).iana;

    const person = personRes.data as Record<string, unknown> | null;
    const parentName =
        person != null
            ? String(person.full_name ?? "").trim() ||
              [person.first_name, person.last_name]
                  .map((v) => (typeof v === "string" ? v.trim() : ""))
                  .filter(Boolean)
                  .join(" ")
            : null;

    const dt = formatTourCommsDateTimeLabels({
        tourStartAt: booking.start_at,
        timezone: booking.timezone,
    });

    const templateContext: TourCommsTemplateContext = {
        orgName,
        locationName: location && typeof location.label === "string" ? location.label.trim() : null,
        locationAddress: formatLocationAddress(location),
        tourStartAt: booking.start_at,
        tourEndAt: booking.end_at,
        timezone: booking.timezone,
        parentName,
        childName: opportunity.name,
        opportunityName: opportunity.name,
        tourDateLabel: dt.tourDateLabel,
        tourTimeLabel: dt.tourTimeLabel,
        tourDisplayLabel: dt.tourDisplayLabel,
    };

    return {
        booking,
        opportunity: {
            id: opportunity.id,
            name: opportunity.name,
            primary_person_id: opportunity.primary_person_id,
            primary_contact_id: opportunity.primary_contact_id,
            location_id: opportunity.location_id,
            stage_key: typeof opportunity.stage_key === "string" ? opportunity.stage_key.trim() || null : null,
            status_key: typeof opportunity.status_key === "string" ? opportunity.status_key.trim() || null : null,
        },
        orgName,
        orgTimezoneIana,
        templateContext,
    };
}

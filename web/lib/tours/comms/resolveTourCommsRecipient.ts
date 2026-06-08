import type { SupabaseClient } from "@supabase/supabase-js";

import { getPersonEmailOrNull, getPersonSmsToOrNull } from "@/lib/communications/drawerEmailRecipients";
import { resolveOpportunityPerson } from "@/lib/opportunityIdentity";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import type { TourCommsChannel } from "@/lib/tours/comms/tourCommsConfig";

export type TourCommsParentRecipient = {
    personId: string;
    displayName: string | null;
    email: string | null;
    smsTo: string | null;
};

function personDisplayName(row: Record<string, unknown> | null): string | null {
    if (!row) return null;
    const full = typeof row.full_name === "string" ? row.full_name.trim() : "";
    if (full) return full;
    const first = typeof row.first_name === "string" ? row.first_name.trim() : "";
    const last = typeof row.last_name === "string" ? row.last_name.trim() : "";
    const joined = [first, last].filter(Boolean).join(" ").trim();
    return joined || null;
}

async function loadPersonContact(
    supabase: SupabaseClient,
    orgId: string,
    personId: string
): Promise<TourCommsParentRecipient | null> {
    const pid = String(personId ?? "").trim();
    if (!pid) return null;
    const { data } = await supabase
        .from("persons")
        .select("id, first_name, last_name, full_name, email, phone")
        .eq("org_id", orgId)
        .eq("id", pid)
        .maybeSingle();
    if (!data) return null;
    const row = data as Record<string, unknown>;
    const [email, smsTo] = await Promise.all([
        getPersonEmailOrNull(supabase, orgId, pid),
        getPersonSmsToOrNull(supabase, orgId, pid),
    ]);
    return {
        personId: pid,
        displayName: personDisplayName(row),
        email,
        smsTo,
    };
}

/**
 * Resolve parent-facing recipient for tour comms.
 * Prefers booking.primary_person_id, then opportunity primary person / legacy contact link.
 */
export async function resolveTourCommsParentRecipient(params: {
    supabase: SupabaseClient;
    orgId: string;
    booking: Pick<TourBookingRow, "primary_person_id" | "primary_contact_id">;
    opportunity: { primary_person_id?: unknown; primary_contact_id?: unknown };
}): Promise<TourCommsParentRecipient | null> {
    const bookingPid = String(params.booking.primary_person_id ?? "").trim();
    if (bookingPid) {
        const rec = await loadPersonContact(params.supabase, params.orgId, bookingPid);
        if (rec) return rec;
    }

    const party = await resolveOpportunityPerson(params.supabase, params.opportunity);
    if (party.kind === "person" && party.primary_person_id) {
        return loadPersonContact(params.supabase, params.orgId, party.primary_person_id);
    }

    return null;
}

export function tourCommsRecipientHasChannel(recipient: TourCommsParentRecipient, channel: TourCommsChannel): boolean {
    if (channel === "email") return Boolean(recipient.email?.trim());
    return Boolean(recipient.smsTo?.trim());
}

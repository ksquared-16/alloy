import type { SupabaseClient } from "@supabase/supabase-js";
import { COMMS_V2_PREFERENCE_TABLES } from "@/lib/communications/v2/preferences";
import { buildConsentByContact, type RawPreferenceRow } from "@/lib/communications/v2/householdCommunicationPreferences";

/** Batch-load per-person communication_preferences for family workspace consent display. */
export async function loadCommunicationPreferencesForPersons(
    supabase: SupabaseClient,
    orgId: string,
    personIds: string[]
): Promise<Record<string, { email: "opted_in" | "opted_out" | "unset"; sms: "opted_in" | "opted_out" | "unset"; marketing: "opted_in" | "opted_out" | "unset" }>> {
    const ids = Array.from(new Set(personIds.filter(Boolean)));
    if (ids.length === 0) return {};
    const { data, error } = await supabase
        .from(COMMS_V2_PREFERENCE_TABLES.preferences)
        .select("person_id, category, state")
        .eq("org_id", orgId)
        .in("person_id", ids);
    if (error) {
        console.error("[loadCommunicationPreferencesForPersons]", error);
        return buildConsentByContact(ids, []);
    }
    const rows = (data ?? []) as RawPreferenceRow[];
    return buildConsentByContact(ids, rows);
}

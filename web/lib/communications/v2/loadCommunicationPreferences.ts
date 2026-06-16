import type { SupabaseClient } from "@supabase/supabase-js";
import { COMMS_V2_PREFERENCE_TABLES } from "@/lib/communications/v2/preferences";
import {
    buildConsentByContact,
    buildPreferenceProfilesByContact,
    type PersonConsentTriplet,
} from "@/lib/communications/v2/householdCommunicationPreferences";
import type { PreferenceFieldKey } from "@/lib/communications/v2/communicationPreferenceLabels";
import type { PersonPreferenceProfile } from "@/lib/communications/v2/familyWorkspace/types";

export type PersonPreferencesBundle = {
    byContact: Record<string, PersonConsentTriplet>;
    profilesByContact: Record<string, PersonPreferenceProfile>;
};

/** Batch-load per-person communication_preferences for family workspace. */
export async function loadPersonCommunicationPreferencesBundle(
    supabase: SupabaseClient,
    orgId: string,
    personIds: string[]
): Promise<PersonPreferencesBundle> {
    const ids = Array.from(new Set(personIds.filter(Boolean)));
    if (ids.length === 0) return { byContact: {}, profilesByContact: {} };
    const { data, error } = await supabase
        .from(COMMS_V2_PREFERENCE_TABLES.preferences)
        .select("person_id, category, state")
        .eq("org_id", orgId)
        .in("person_id", ids);
    if (error) {
        console.error("[loadPersonCommunicationPreferencesBundle]", error);
        return { byContact: buildConsentByContact(ids, []), profilesByContact: buildPreferenceProfilesByContact(ids, []) };
    }
    const rows = (data ?? []) as Array<{ person_id: string; category: string; state: string }>;
    return {
        byContact: buildConsentByContact(ids, rows),
        profilesByContact: buildPreferenceProfilesByContact(ids, rows),
    };
}

/** @deprecated Use loadPersonCommunicationPreferencesBundle */
export async function loadCommunicationPreferencesForPersons(
    supabase: SupabaseClient,
    orgId: string,
    personIds: string[]
): Promise<Record<string, PersonConsentTriplet>> {
    const bundle = await loadPersonCommunicationPreferencesBundle(supabase, orgId, personIds);
    return bundle.byContact;
}

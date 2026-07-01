import type { SupabaseClient } from "@supabase/supabase-js";
import {
    buildPreferenceChange,
    type PreferenceChangeRequest,
} from "@/lib/communications/v2/preferenceMutations";
import { COMMS_V2_PREFERENCE_TABLES } from "@/lib/communications/v2/preferences";

/** Persist one preference change (upsert + audit event). Server-only. */
export async function persistCommunicationPreference(
    supabase: SupabaseClient,
    req: PreferenceChangeRequest
): Promise<{ ok: true; state: string } | { ok: false; message: string }> {
    const { upsert, event } = buildPreferenceChange(req);
    const { error: uErr } = await supabase.from(COMMS_V2_PREFERENCE_TABLES.preferences).upsert(upsert, {
        onConflict: "org_id,person_id,category",
    });
    if (uErr) {
        console.error("[persistCommunicationPreference:upsert]", uErr);
        return { ok: false, message: uErr.message };
    }
    const { error: eErr } = await supabase.from(COMMS_V2_PREFERENCE_TABLES.preferenceEvents).insert(event);
    if (eErr) {
        console.error("[persistCommunicationPreference:event]", eErr);
        return { ok: false, message: eErr.message };
    }
    return { ok: true, state: req.toState };
}

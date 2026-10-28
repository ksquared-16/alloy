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

/**
 * Record an act that leaves the preference as it was (e.g. a repeat public inquiry ticking "Email me
 * news" for a person who has opted out): the audit event only. The state row is NOT rewritten — its
 * `source` / `method` keep naming the act that actually set the current state, so the inquiry can never
 * read as the provenance of an opt-out it did not make. Server-only.
 */
export async function appendCommunicationPreferenceEvent(
    supabase: SupabaseClient,
    req: PreferenceChangeRequest & { fromState: PreferenceChangeRequest["toState"] }
): Promise<{ ok: true; state: string } | { ok: false; message: string }> {
    if (req.fromState !== req.toState) {
        return { ok: false, message: "appendCommunicationPreferenceEvent records no-change acts only; use persistCommunicationPreference." };
    }
    const { event } = buildPreferenceChange(req);
    const { error } = await supabase.from(COMMS_V2_PREFERENCE_TABLES.preferenceEvents).insert(event);
    if (error) {
        console.error("[appendCommunicationPreferenceEvent]", error);
        return { ok: false, message: error.message };
    }
    return { ok: true, state: req.toState };
}

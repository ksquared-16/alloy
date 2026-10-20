/**
 * ONE PERSON'S COMMUNICATION PREFERENCES — what an operator may see and change, and what they may not.
 *
 * Three different things, kept apart because they mean different things:
 *   - LEGAL CONSENT / SUPPRESSION — `communication_preferences` (per person × category), the store every
 *     send path enforces (`evaluateEligibility` at enqueue, `revalidate_for_dispatch` at dispatch). Its
 *     single writer is `persistCommunicationPreference`, which also appends the audit event.
 *   - OPERATOR PREFERENCE — routine (operational) email/SMS: an operator may turn it off, and back on
 *     unless the person turned it off themselves (texting STOP, or an unsubscribe link). Those are the
 *     person's own act and only the person can reverse them.
 *   - CHANNEL PREFERENCE — "prefers text / email / phone": advisory, the person field
 *     `communication_preference`. It changes how staff choose to reach out; it enforces nothing.
 *
 * Marketing needs the person's own opt-in, so an operator may record an opt-OUT but never an opt-in
 * here. Essential (transactional) messages are always allowed by policy and are shown, not edited.
 * No second preference store is created.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { PREFERENCE_FIELD_DEFS, type PreferenceFieldKey } from "./communicationPreferenceLabels";
import { persistCommunicationPreference } from "./persistCommunicationPreference";
import type { PreferenceState } from "./preferences";

/** Sources that record the PERSON's own opt-out; an operator never reverses these. */
export const SELF_SERVICE_OPT_OUT_SOURCES = new Set(["sms_keyword", "recipient_unsubscribe"]);
export const PREFERRED_CHANNEL_FIELD_KEY = "communication_preference";
export const PREFERRED_CHANNEL_OPTIONS = [
    { value: "sms", label: "Text message" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone call" },
] as const;

export type PreferenceRow = {
    key: PreferenceFieldKey;
    label: string;
    description: string;
    channel: "email" | "sms";
    control: "always_allowed" | "opt_out" | "opt_in";
    state: PreferenceState;
    /** What the operator may set it to now. Empty = read-only. */
    allowedChanges: Array<"Allowed" | "Blocked">;
    /** Why a change is not offered, in plain words. */
    lockedReason: string | null;
    lastChange: { source: string | null; method: string | null; at: string; actorUserId: string | null } | null;
};
export type PersonPreferencesView = {
    personId: string;
    preferredChannel: string | null;
    preferredChannelOptions: ReadonlyArray<{ value: string; label: string }>;
    preferences: PreferenceRow[];
};

/** The operator's permitted changes for one category, given its state and who last changed it. Pure. */
export function allowedPreferenceChanges(input: {
    control: PreferenceRow["control"];
    state: PreferenceState;
    lastSource: string | null;
}): { allowed: Array<"Allowed" | "Blocked">; lockedReason: string | null } {
    if (input.control === "always_allowed") {
        return { allowed: [], lockedReason: "Essential messages are always allowed by policy." };
    }
    const selfOptOut = input.state === "opted_out" && input.lastSource != null && SELF_SERVICE_OPT_OUT_SOURCES.has(input.lastSource);
    if (selfOptOut) {
        return {
            allowed: [],
            lockedReason:
                input.lastSource === "sms_keyword"
                    ? "Opted out by texting STOP. Only the person can opt back in (by texting START)."
                    : "Unsubscribed by the person. Only the person can opt back in.",
        };
    }
    if (input.control === "opt_in") {
        return input.state === "opted_out"
            ? { allowed: [], lockedReason: "Marketing needs the person's own opt-in." }
            : { allowed: ["Blocked"], lockedReason: "Marketing needs the person's own opt-in; staff can only turn it off." };
    }
    return { allowed: input.state === "opted_out" ? ["Allowed"] : ["Blocked"], lockedReason: null };
}

async function loadPreferredChannel(supabase: SupabaseClient, orgId: string, personId: string): Promise<{ definitionId: string | null; value: string | null }> {
    const { data: def } = await supabase
        .from("field_definitions")
        .select("id")
        .eq("org_id", orgId)
        .eq("entity_type", "person")
        .eq("field_key", PREFERRED_CHANNEL_FIELD_KEY)
        .maybeSingle();
    const definitionId = (def as { id?: string } | null)?.id ?? null;
    if (!definitionId) return { definitionId: null, value: null };
    const { data: fv } = await supabase
        .from("field_values")
        .select("value_text")
        .eq("org_id", orgId)
        .eq("entity_type", "person")
        .eq("entity_id", personId)
        .eq("field_definition_id", definitionId)
        .maybeSingle();
    const v = (fv as { value_text?: string | null } | null)?.value_text?.trim() || null;
    return { definitionId, value: v };
}

export async function loadPersonPreferencesView(supabase: SupabaseClient, input: { orgId: string; personId: string }): Promise<PersonPreferencesView> {
    const { data: prefRows, error } = await supabase
        .from("communication_preferences")
        .select("category, state")
        .eq("org_id", input.orgId)
        .eq("person_id", input.personId);
    if (error) throw new Error(error.message);
    const stateBy = new Map(((prefRows ?? []) as Array<{ category: string; state: PreferenceState }>).map((r) => [r.category, r.state]));

    const { data: events, error: evError } = await supabase
        .from("communication_preference_events")
        .select("category, source, method, actor_user_id, occurred_at")
        .eq("org_id", input.orgId)
        .eq("person_id", input.personId)
        .order("occurred_at", { ascending: false })
        .limit(200);
    if (evError) throw new Error(evError.message);
    const lastBy = new Map<string, { source: string | null; method: string | null; at: string; actorUserId: string | null }>();
    for (const e of (events ?? []) as Array<{ category: string; source: string | null; method: string | null; actor_user_id: string | null; occurred_at: string }>) {
        if (!lastBy.has(e.category)) lastBy.set(e.category, { source: e.source, method: e.method, at: e.occurred_at, actorUserId: e.actor_user_id });
    }

    const preferences: PreferenceRow[] = PREFERENCE_FIELD_DEFS.map((d) => {
        const state = stateBy.get(d.category) ?? "unset";
        const last = lastBy.get(d.category) ?? null;
        const { allowed, lockedReason } = allowedPreferenceChanges({ control: d.control, state, lastSource: last?.source ?? null });
        return { key: d.key, label: d.label, description: d.description, channel: d.channel, control: d.control, state, allowedChanges: allowed, lockedReason, lastChange: last };
    });
    const preferred = await loadPreferredChannel(supabase, input.orgId, input.personId);
    return { personId: input.personId, preferredChannel: preferred.value, preferredChannelOptions: PREFERRED_CHANNEL_OPTIONS, preferences };
}

export type PreferenceUpdateResult = { ok: true; view: PersonPreferencesView } | { ok: false; status: number; code: string; message: string };

export async function updatePersonPreference(
    supabase: SupabaseClient,
    input: { orgId: string; personId: string; actorUserId: string | null; field: string; status: string },
): Promise<PreferenceUpdateResult> {
    const def = PREFERENCE_FIELD_DEFS.find((d) => d.key === input.field);
    if (!def) return { ok: false, status: 400, code: "invalid_field", message: "Unknown preference." };
    if (input.status !== "Allowed" && input.status !== "Blocked") return { ok: false, status: 400, code: "invalid_status", message: "Choose Allowed or Opted out." };
    const view = await loadPersonPreferencesView(supabase, { orgId: input.orgId, personId: input.personId });
    const row = view.preferences.find((p) => p.key === def.key)!;
    if (!row.allowedChanges.includes(input.status)) {
        return { ok: false, status: 409, code: "preference_locked", message: row.lockedReason ?? "That change is not allowed here." };
    }
    const toState: PreferenceState = input.status === "Allowed" ? "opted_in" : "opted_out";
    const persisted = await persistCommunicationPreference(supabase, {
        orgId: input.orgId,
        personId: input.personId,
        category: def.category,
        fromState: row.state === "unset" ? null : row.state,
        toState,
        source: "operator_person_record",
        method: "operator_edit",
        actorUserId: input.actorUserId,
    });
    if (!persisted.ok) return { ok: false, status: 500, code: "persist_failed", message: persisted.message };
    return { ok: true, view: await loadPersonPreferencesView(supabase, { orgId: input.orgId, personId: input.personId }) };
}

export async function updatePreferredChannel(
    supabase: SupabaseClient,
    input: { orgId: string; personId: string; value: string | null },
): Promise<PreferenceUpdateResult> {
    const value = input.value?.trim() || null;
    if (value && !PREFERRED_CHANNEL_OPTIONS.some((o) => o.value === value)) {
        return { ok: false, status: 400, code: "invalid_channel", message: "Choose Text message, Email or Phone call." };
    }
    const { definitionId } = await loadPreferredChannel(supabase, input.orgId, input.personId);
    if (!definitionId) return { ok: false, status: 409, code: "field_not_configured", message: "Preferred channel is not configured for people in this organization." };
    const { data: existing } = await supabase
        .from("field_values")
        .select("id")
        .eq("org_id", input.orgId)
        .eq("entity_type", "person")
        .eq("entity_id", input.personId)
        .eq("field_definition_id", definitionId)
        .maybeSingle();
    const now = new Date().toISOString();
    const write = existing
        ? await supabase.from("field_values").update({ value_text: value, updated_at: now }).eq("id", (existing as { id: string }).id)
        : await supabase.from("field_values").insert({ org_id: input.orgId, entity_type: "person", entity_id: input.personId, field_definition_id: definitionId, value_text: value });
    if (write.error) return { ok: false, status: 500, code: "persist_failed", message: write.error.message };
    return { ok: true, view: await loadPersonPreferencesView(supabase, { orgId: input.orgId, personId: input.personId }) };
}

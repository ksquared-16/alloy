/**
 * Add, edit or remove one person in a collection — and write nothing canonical.
 *
 * ## What this is allowed to touch
 *
 * One reserved key in `form_packet_sessions.shared_values`, holding the collection's ordered list.
 * That is the conversation's own answer store, and a list of people is an answer. Nothing here
 * creates a Person, a Child or a relationship: those are written once, by the canonical relationship
 * command, behind the operator-reviewed Processing commit. A parent clicking "+ Add emergency
 * contact" has told us something, not changed the record.
 *
 * ## Identity is the row, not the position
 *
 * Every mutation addresses an entry by `instance_key`. Removing the middle of three entries cannot
 * shift another person's answers onto the wrong row, and editing one person cannot replace them —
 * the failure a numbered `contact_2_name` model makes almost inevitable.
 *
 * ## What the family may not remove
 *
 * An entry Alloy already knows (`origin: "existing"`) is refused. Taking a known emergency contact
 * off a form is the family saying they do not belong on THIS paperwork; it is not an instruction to
 * delete a person, and a form that treated it as one would quietly destroy canonical data.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    partyCollectionSettledKey,
    partyCollectionStateKey,
    readPartyEntries,
    type ParticipantPartyEntry,
} from "@/lib/enrollment/informationNeeds/participantPartyCollection";

export type PartyCollectionResponse =
    | { readonly action: "add"; readonly group_field_id: string; readonly values: Record<string, unknown> }
    | { readonly action: "edit"; readonly group_field_id: string; readonly instance_key: string; readonly values: Record<string, unknown> }
    | { readonly action: "remove"; readonly group_field_id: string; readonly instance_key: string }
    /** "That is everyone" — the family saying the list is finished, not that it is merely valid. */
    | { readonly action: "settle"; readonly group_field_id: string };

export type ApplyPartyCollectionResult =
    | {
          readonly ok: true;
          readonly outcome: "added" | "edited" | "removed" | "settled";
          readonly instance_key: string;
          /**
           * The session's shared values AFTER the write.
           *
           * Returned because the objective is re-resolved immediately afterwards, and a
           * packet-anchored objective is resolved against a session the caller supplies. Handing
           * back the pre-write row would redraw the collection without the person just added — the
           * parent would click Add, watch the card refresh, and see nothing happen.
           */
          readonly sharedValues: Record<string, unknown>;
      }
    | { readonly ok: false; readonly error: string };

export function parsePartyCollectionResponse(raw: unknown): PartyCollectionResponse | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const groupFieldId = typeof r.group_field_id === "string" ? r.group_field_id.trim() : "";
    if (!groupFieldId) return null;
    const values = r.values && typeof r.values === "object" && !Array.isArray(r.values)
        ? (r.values as Record<string, unknown>)
        : {};
    const instanceKey = typeof r.instance_key === "string" ? r.instance_key.trim() : "";
    if (r.action === "add") return { action: "add", group_field_id: groupFieldId, values };
    if (r.action === "edit" && instanceKey) return { action: "edit", group_field_id: groupFieldId, instance_key: instanceKey, values };
    if (r.action === "remove" && instanceKey) return { action: "remove", group_field_id: groupFieldId, instance_key: instanceKey };
    if (r.action === "settle") return { action: "settle", group_field_id: groupFieldId };
    return null;
}

function newInstanceKey(): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `i_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function applyPartyCollectionResponse(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly sessionId: string;
        readonly formDefinitionId: string;
        readonly response: PartyCollectionResponse;
        /** Known entries, so a correction to someone Alloy knows keeps their canonical id. */
        readonly knownEntries?: readonly ParticipantPartyEntry[];
        /** The Form's minimum, so a settle below it is refused server-side and not only hidden. */
        readonly minimumEntries?: number;
    },
): Promise<ApplyPartyCollectionResult> {
    const key = partyCollectionStateKey(input.formDefinitionId, input.response.group_field_id);

    /*
     * Read-modify-write over the row, mirroring how a turn writes a shared value. Re-read rather
     * than trusting a caller's copy: a resumed tab can be several turns behind, and a stale list
     * would silently drop the person added in between.
     */
    const { data: row, error } = await supabase
        .from("form_packet_sessions")
        .select("shared_values")
        .eq("id", input.sessionId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    if (error || !row) return { ok: false, error: "Session not found" };

    const sharedValues = ((row as { shared_values?: Record<string, unknown> }).shared_values ?? {}) as Record<string, unknown>;
    const entries = readPartyEntries(sharedValues, input.formDefinitionId, input.response.group_field_id);
    const knownByInstance = new Map((input.knownEntries ?? []).map((e) => [e.instance_key, e]));

    let next: ParticipantPartyEntry[];
    let outcome: "added" | "edited" | "removed" | "settled";
    let touched: string;

    const settledKey = partyCollectionSettledKey(input.formDefinitionId, input.response.group_field_id);

    if (input.response.action === "settle") {
        /*
         * Settling is a claim about the LIST, so it is refused unless the list is one the Form would
         * accept. Nothing else validates it: a family cannot finish a collection that is still short
         * of its minimum, and the card does not offer the action there either.
         */
        const usable = entries.filter((e) => e.origin === "existing" || Object.values(e.values).some((v) => String(v ?? "").trim() !== ""));
        const known = (input.knownEntries ?? []).filter((k) => !entries.some((e) => e.item_id && e.item_id === k.item_id));
        if (usable.length + known.length < (input.minimumEntries ?? 0)) {
            return { ok: false, error: "There is still someone to add before we can move on" };
        }
        const { error: settleError } = await supabase
            .from("form_packet_sessions")
            .update({ shared_values: { ...sharedValues, [settledKey]: true } })
            .eq("id", input.sessionId)
            .eq("org_id", input.orgId);
        if (settleError) return { ok: false, error: "Could not save that just now" };
        return { ok: true, outcome: "settled", instance_key: "", sharedValues: { ...sharedValues, [settledKey]: true } };
    }

    if (input.response.action === "add") {
        touched = newInstanceKey();
        next = [...entries, { instance_key: touched, origin: "respondent_added", values: input.response.values }];
        outcome = "added";
    } else if (input.response.action === "edit") {
        touched = input.response.instance_key;
        const existingRow = entries.find((e) => e.instance_key === touched);
        const knownRow = knownByInstance.get(touched);
        if (!existingRow && !knownRow) return { ok: false, error: "That entry is no longer part of this form" };
        /*
         * Correcting someone Alloy already knows KEEPS their canonical id. The correction becomes
         * one amended proposal for that person rather than a proposal to create a second one.
         */
        const base: ParticipantPartyEntry = existingRow ?? {
            instance_key: touched,
            origin: knownRow!.origin,
            values: knownRow!.values,
            ...(knownRow!.item_id ? { item_id: knownRow!.item_id } : {}),
        };
        const updated: ParticipantPartyEntry = { ...base, values: { ...base.values, ...input.response.values } };
        next = existingRow
            ? entries.map((e) => (e.instance_key === touched ? updated : e))
            : [...entries, updated];
        outcome = "edited";
    } else {
        touched = input.response.instance_key;
        const target = entries.find((e) => e.instance_key === touched) ?? knownByInstance.get(touched);
        if (!target) return { ok: false, error: "That entry is no longer part of this form" };
        if (target.origin === "existing") {
            return { ok: false, error: "This person is already on file and cannot be removed here" };
        }
        next = entries.filter((e) => e.instance_key !== touched);
        outcome = "removed";
    }

    /*
     * CHANGING THE LIST REOPENS IT.
     *
     * A family who said "that is everyone" and then adds, corrects or removes someone has changed
     * what they were finishing. Leaving the marker set would advance the conversation off the back
     * of an answer they have since revised, so any mutation clears it and they confirm again.
     */
    const written = { ...sharedValues, [key]: next, [settledKey]: false };
    const { error: writeError } = await supabase
        .from("form_packet_sessions")
        .update({ shared_values: written })
        .eq("id", input.sessionId)
        .eq("org_id", input.orgId);
    if (writeError) return { ok: false, error: "Could not save that just now" };

    return { ok: true, outcome, instance_key: touched, sharedValues: written };
}

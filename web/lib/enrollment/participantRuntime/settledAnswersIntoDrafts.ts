/**
 * A NEWER ANSWER TO THE SAME QUESTION REPLACES THE OLDER ONE — everywhere the paperwork reads it.
 *
 * Family B (deployed): a controlling question already had an answer in the form's draft. The parent
 * answered it again, differently, in the conversation. The conversation writes the session's shared
 * values — and only those — while review, the rendered document, a reload and submission all read
 * the DRAFT, where a held answer outranks the session's. So the old answer survived: the conversation
 * followed the new one, the paperwork the old, and the conditions it controls disagreed between them.
 *
 * Save semantics, now: when a conversation write CHANGES a session value, the same value is written
 * into the session's still-open drafts — through the very mappers that seed a draft from the session
 * (`sharedValuesToFieldIds` / `processScopedAnswersToFieldIds`), so only the destinations bound to
 * THAT question move. Unrelated answers are untouched; a submitted form is never rewritten; the
 * session keeps its own provenance record of the change.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { safeParseFormSchema } from "@/lib/forms/schema";
import { processScopedAnswersToFieldIds, sharedValuesToFieldIds } from "@/lib/forms/packets/sharedValuesToFieldIds";

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The session values a write actually changed (added or replaced). Removals are not answers. */
export function changedSessionValues(
    before: Readonly<Record<string, unknown>> | null | undefined,
    after: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(after ?? {})) {
        if (value === undefined) continue;
        if (!same((before ?? {})[key], value)) out[key] = value;
    }
    return out;
}

/** submission id → the field values that were written into it. */
export type DraftValueUpdates = Record<string, Record<string, unknown>>;

/**
 * Write changed session answers into the session's open drafts. Returns what moved, per draft, so the
 * browser holding one of those drafts can take the same values (and never autosave the old one back).
 */
export async function writeSettledAnswersIntoDrafts(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly sessionId: string; readonly changed: Readonly<Record<string, unknown>> },
): Promise<DraftValueUpdates> {
    const updates: DraftValueUpdates = {};
    if (Object.keys(input.changed).length === 0) return updates;

    const { data: items, error: itemError } = await supabase
        .from("form_packet_session_items")
        .select("form_submission_id")
        .eq("org_id", input.orgId)
        .eq("packet_session_id", input.sessionId);
    if (itemError) throw new Error(itemError.message);
    const ids = [...new Set(((items ?? []) as { form_submission_id: string | null }[]).map((i) => i.form_submission_id).filter((x): x is string => Boolean(x)))];
    if (ids.length === 0) return updates;

    const { data: subs, error: subError } = await supabase
        .from("form_submissions")
        .select("id, payload, form_definition_id, form_definition_version_id, status")
        .eq("org_id", input.orgId)
        .eq("status", "draft")
        .in("id", ids);
    if (subError) throw new Error(subError.message);
    const drafts = (subs ?? []) as Array<{ id: string; payload: Record<string, unknown> | null; form_definition_id: string | null; form_definition_version_id: string | null }>;
    if (drafts.length === 0) return updates;

    const versionIds = [...new Set(drafts.map((d) => d.form_definition_version_id).filter((x): x is string => Boolean(x)))];
    const { data: versions, error: verError } = await supabase
        .from("form_definition_versions")
        .select("id, schema_json")
        .eq("org_id", input.orgId)
        .in("id", versionIds.length ? versionIds : ["-"]);
    if (verError) throw new Error(verError.message);
    const schemaById = new Map(((versions ?? []) as Array<{ id: string; schema_json: unknown }>).map((v) => [v.id, v.schema_json]));

    for (const draft of drafts) {
        const parsed = safeParseFormSchema(schemaById.get(draft.form_definition_version_id ?? "") ?? null);
        if (!parsed.success) continue;
        const mapped = {
            ...sharedValuesToFieldIds(parsed.data, input.changed),
            ...(draft.form_definition_id ? processScopedAnswersToFieldIds(parsed.data, input.changed, draft.form_definition_id) : {}),
        };
        const payload = (draft.payload ?? {}) as Record<string, unknown>;
        const values = (payload.values && typeof payload.values === "object" ? payload.values : {}) as Record<string, unknown>;
        const moved = Object.fromEntries(Object.entries(mapped).filter(([fieldId, value]) => !same(values[fieldId], value)));
        if (Object.keys(moved).length === 0) continue;
        const { error } = await supabase
            .from("form_submissions")
            .update({ payload: { ...payload, values: { ...values, ...moved } } })
            .eq("org_id", input.orgId)
            .eq("id", draft.id)
            .eq("status", "draft");
        if (error) throw new Error(error.message);
        updates[draft.id] = moved;
    }
    return updates;
}

/**
 * Forms adapter — read-time org boundary checks for existing collection item ids (diagnostics only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { extractFormCollectionEnvelope } from "@/lib/forms/processing/extractFormCollectionEnvelope";

export async function loadAccessibleExistingCollectionItemIds(
    supabase: SupabaseClient,
    orgId: string,
    payload: FormPayload | null | undefined,
): Promise<Set<string>> {
    const accessible = new Set<string>();
    const envelope = extractFormCollectionEnvelope(payload);
    const memberIds: string[] = [];
    const personIds: string[] = [];

    for (const rows of Object.values(envelope.byGroup)) {
        for (const row of rows) {
            if (row.origin !== "existing" || !row.item_id) continue;
            if (row.iteration_entity_type === "customer_member") memberIds.push(row.item_id);
            else if (row.iteration_entity_type === "person") personIds.push(row.item_id);
        }
    }

    if (memberIds.length > 0) {
        const { data } = await supabase
            .from("customer_members")
            .select("id")
            .eq("org_id", orgId)
            .in("id", [...new Set(memberIds)]);
        for (const row of (data ?? []) as { id: string }[]) accessible.add(row.id);
    }

    if (personIds.length > 0) {
        const { data } = await supabase
            .from("persons")
            .select("id")
            .eq("org_id", orgId)
            .in("id", [...new Set(personIds)]);
        for (const row of (data ?? []) as { id: string }[]) accessible.add(row.id);
    }

    return accessible;
}

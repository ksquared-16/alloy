/**
 * Canonical mutation patch for Person ↔ Child relationship instances.
 */

import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    isPersonChildRelationshipConfigFieldKey,
    isPersonChildRelationshipNativeColumnKey,
    PERSON_CHILD_RELATIONSHIP_NATIVE_COLUMN_KEYS,
} from "./personChildRelationshipFieldRegistry";

export type PersonChildRelationshipPatchBody = Record<string, unknown>;

const NATIVE_PATCH_KEYS = new Set<string>(["relationship_type", "priority", "status"]);

export function partitionPersonChildRelationshipPatchBody(body: PersonChildRelationshipPatchBody): {
    native: Record<string, unknown>;
    config: Record<string, unknown>;
} {
    const native: Record<string, unknown> = {};
    const config: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
        if (value === undefined) continue;
        if (isPersonChildRelationshipNativeColumnKey(key) && NATIVE_PATCH_KEYS.has(key)) {
            native[key] = value;
        } else if (isPersonChildRelationshipConfigFieldKey(key)) {
            config[key] = value;
        }
    }
    return { native, config };
}

export async function applyPersonChildRelationshipMutationPatch(args: {
    supabase: SupabaseClient;
    orgId: string;
    relationshipId: string;
    body: PersonChildRelationshipPatchBody;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const { native, config } = partitionPersonChildRelationshipPatchBody(args.body);
    if (Object.keys(native).length > 0) {
        const { error } = await args.supabase
            .from("person_child_relationships")
            .update({ ...native, updated_at: new Date().toISOString() })
            .eq("org_id", args.orgId)
            .eq("id", args.relationshipId);
        if (error) return { ok: false, error: error.message };
    }
    if (Object.keys(config).length > 0) {
        await upsertFieldValuesFromBody(
            args.supabase,
            args.orgId,
            "person_child_relationship",
            args.relationshipId,
            config,
            PERSON_CHILD_RELATIONSHIP_NATIVE_COLUMN_KEYS as unknown as readonly string[],
        );
    }
    return { ok: true };
}

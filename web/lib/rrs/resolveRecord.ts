import { createAdminClient } from "@/lib/supabaseAdmin";
import { UnsupportedEntityTypeError, type ResolveRecordInput, type ResolvedRecordPayload } from "@/lib/rrs/types";
import { resolveJobRecord } from "@/lib/rrs/entities/job";

type AdminSupabase = ReturnType<typeof createAdminClient>;

/**
 * Record Resolver v0 entry: dispatches on entity_type. Job is the first supported entity.
 * Returns null when the record does not exist (caller maps to 404).
 */
export async function resolveRecord(input: ResolveRecordInput, supabase: AdminSupabase): Promise<ResolvedRecordPayload | null> {
    if (input.entity_type === "jobs") {
        const r = await resolveJobRecord(supabase, input.org_id, input.entity_id, input.surface);
        if (!r.ok) {
            return null;
        }
        return r.rrs;
    }
    throw new UnsupportedEntityTypeError(input.entity_type);
}

export { resolveJobRecord } from "@/lib/rrs/entities/job";

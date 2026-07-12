import type { SupabaseClient } from "@supabase/supabase-js";
import { generateHouseholdGraphCandidates } from "@/lib/identity";
import { makeMatchCandidateId } from "@/lib/intake/resolve/buildProposals";
import { resolveIntakeRecordResolution } from "@/lib/intake/resolve/resolveIntakeRecordResolution";
import type { ResolveIntakeRecordResolutionInput } from "@/lib/intake/resolve/types";

/**
 * B1b bridge — canonical household graph candidate generation delegates to lib/identity.
 * Legacy intake resolution assembly remains authoritative for proposals until cutover.
 */
export async function resolveIntakeRecordResolutionWithCanonicalCandidates(
    supabase: SupabaseClient,
    input: ResolveIntakeRecordResolutionInput,
) {
    await generateHouseholdGraphCandidates(supabase, {
        orgId: input.orgId,
        household: input.household,
        locationId: input.location_id ?? input.household.location?.resolved_value ?? null,
    });
    return resolveIntakeRecordResolution(supabase, input);
}

export function canonicalGraphEntityRef(entityType: string, recordId: string): string {
    return makeMatchCandidateId(entityType, recordId);
}

/**
 * Org-scoped read-only fetchers for General Ledger configuration
 * (gl_accounts / gl_account_mappings).
 *
 * Read-only by design (Operational Configuration V1, Batch 0): exposes the GL
 * Codes + GL Mappings that posting will eventually target. This module never
 * writes accounts, mappings, journals, or ledger lines and never posts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import type {
    GlAccountMappingRow,
    GlAccountRow,
    GlConfigBundle,
} from "@/lib/financials/gl/glConfigTypes";

function unwrap<T>(data: T[] | null, error: { message: string } | null): T[] {
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return data ?? [];
}

export async function listGlAccounts(
    supabase: SupabaseClient,
    orgId: string,
): Promise<GlAccountRow[]> {
    const { data, error } = await supabase
        .from("gl_accounts")
        .select("*")
        .eq("org_id", orgId)
        .order("code", { ascending: true });
    return unwrap(data as GlAccountRow[] | null, error);
}

export async function listGlAccountMappings(
    supabase: SupabaseClient,
    orgId: string,
): Promise<GlAccountMappingRow[]> {
    const { data, error } = await supabase
        .from("gl_account_mappings")
        .select("*")
        .eq("org_id", orgId)
        .order("key", { ascending: true });
    return unwrap(data as GlAccountMappingRow[] | null, error);
}

/** Load GL Codes + GL Mappings for an org (read-only configuration surface). */
export async function loadGlConfigBundle(
    supabase: SupabaseClient,
    orgId: string,
): Promise<GlConfigBundle> {
    const [glAccounts, glAccountMappings] = await Promise.all([
        listGlAccounts(supabase, orgId),
        listGlAccountMappings(supabase, orgId),
    ]);
    return { glAccounts, glAccountMappings };
}

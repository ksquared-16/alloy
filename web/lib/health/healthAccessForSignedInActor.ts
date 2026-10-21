/**
 * THE SIGNED-IN OPERATOR'S HEALTH GRANTS, for server code that reads child profiles on a request
 * but was never handed an access context (drawer shells, durable record composition).
 *
 * Server-only. No signed-in actor, or a failed grant read, is `permissionKeys: null` — Health
 * closes on failure, so medical fields are withheld rather than guessed open.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getCachedAuthUserId } from "@/lib/admin/cachedAuthSession";
import type { HealthAccessSubject } from "@/lib/health/healthAccess";
import { resolveHealthAccessForActor } from "@/lib/health/healthAccessForAction";

export async function resolveHealthAccessForSignedInActor(supabase: SupabaseClient, orgId: string): Promise<HealthAccessSubject> {
    try {
        const userId = await getCachedAuthUserId();
        if (!userId) return { permissionKeys: null };
        return await resolveHealthAccessForActor(supabase, orgId, userId);
    } catch {
        return { permissionKeys: null };
    }
}

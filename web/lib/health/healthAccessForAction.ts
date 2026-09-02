/**
 * THE CALLER'S HEALTH GRANTS.
 *
 * The resolution itself is not Health's — it is "what permissions does this actor hold in this
 * org", which Enrollment requirement exceptions ask identically. It moved to
 * `lib/access/actorPermissionGrants` so there is one answer; this module remains the Health-shaped
 * name callers already use, and keeps the reasons for the shape where Health can see them:
 *
 *   - not `getAdminAccessContextCached`, which is server-only and pulls `next/headers` into the
 *     client graph through `actionRegistry`;
 *   - `null` means the grant read FAILED and is not the same answer as "holds no grants" (W-43).
 *     Health closes on failure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import type { HealthAccessSubject } from "@/lib/health/healthAccess";

export async function resolveHealthAccessForActor(
    supabase: SupabaseClient,
    orgId: string,
    actorUserId: string | null | undefined,
): Promise<HealthAccessSubject> {
    return resolveActorPermissionGrants(supabase, orgId, actorUserId);
}

/**
 * The canonical SERVER ENTRY POINT for authoring an Operational Expectation.
 *
 * Split out of `supabaseAuthoringGateway.ts` because it imports the authenticated
 * admin access context, which reaches `supabaseServer` — server-only, and a
 * production-build failure the moment a module in a client bundle can reach it
 * transitively. The gateway factory itself is safe to import anywhere on the
 * server; this entry point is not, and now says so by living apart.
 */

import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { resolveAuthoringContext } from "@/lib/operationalExpectations/intake/authoringServerContext";
import { authorOperationalExpectation } from "@/lib/operationalExpectations/intake/authorOperationalExpectation";
import { createSupabaseAuthoringGateway } from "@/lib/operationalExpectations/intake/supabaseAuthoringGateway";
import type {
    AuthoringInput,
    AuthoringResult,
} from "@/lib/operationalExpectations/intake/authoringTypes";

/**
 * The canonical server entry point. Supported callers pass ONLY `input`; the org,
 * actor, and authoring capability are resolved server-side from the canonical admin
 * access context — a caller can never supply org identity, actor identity, or
 * permission grants. API routes / server actions / imports / future AI proposals
 * all delegate here — no duplicate write path, no manufacturable context.
 */
export async function authorOperationalExpectationServer(
    input: AuthoringInput,
): Promise<AuthoringResult> {
    const resolved = resolveAuthoringContext(await getAdminAccessContextCached());
    if (!resolved.ok) return resolved.result;
    return authorOperationalExpectation(input, resolved.context, createSupabaseAuthoringGateway());
}

/**
 * Is governed provider reasoning permitted for this org's participant conversations? (V1.1)
 *
 * ## Affirmative, never the absence of a denial
 *
 * D-42's rule, applied here: the provider path is reachable only on an explicit positive. Every
 * other outcome — no org row, no `ai_policy`, policy disabled, the feature not allowed, an
 * unreadable value, a read failure — lands on `false`, and the participant continues
 * deterministically.
 *
 * That asymmetry is the design. A bug here can cost a participant a nicer interaction; it cannot
 * cost them their privacy, because the failure direction is "no provider".
 *
 * ## Why this is not `resolveTrustAccessAuthorization`
 *
 * That resolver answers for an OPERATOR acting in a session, and takes identity and portal gates a
 * public participant link does not have. A participant is not a user, holds no role, and cannot be
 * asked to authenticate. The question here is narrower and org-level: has this organization enabled
 * this feature at all?
 *
 * It reads the SAME source of truth — `org_settings.metadata.ai_policy`, through the policy's own
 * parser — so there is no second interpretation of what an org enabled. The decision class's
 * `requires_allowed_feature` remains the binding gate inside Trust; this is the outer check that
 * avoids assembling a package the runtime would refuse anyway.
 *
 * ## The owner is `org_settings`, and a fail-closed gate hid that it was not
 *
 * V1.1 shipped this module reading `metadata` off the `orgs` row. AI policy has never lived there:
 * every other consumer of `parseAiPolicyFromMetadata` reads `org_settings.metadata` (see
 * `app/api/admin/ai/enrich-attention-suggestion/route.ts`), `resolveTrustAuthorization` documents
 * that owner by name, and the hosted `orgs` table carries no `metadata` column at all — the query
 * failed with `42703`, landed on the error branch, and returned `false` for every org on every
 * request. The provider path was therefore unreachable regardless of what an org had enabled.
 *
 * That is the hazard worth naming: a fail-closed contract makes a wrong-table read look exactly
 * like a policy that was never granted. Nothing was observably broken, so nothing was investigated.
 * The correction is one owner, no compatibility read — a fallback to `orgs` would reintroduce the
 * second interpretation this module exists to avoid.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseAiPolicyFromMetadata } from "@/lib/ai/aiPolicy";
import { GOVERNED_REASONING_REQUESTED_PROVIDER_KEY } from "@/lib/ai/trust/governedReasoningProviderPort";

export const PARTICIPANT_CONVERSATION_AI_FEATURE = "participant_conversation_interpretation" as const;

/**
 * The provider identities participant reasoning can actually execute through.
 *
 * Derived from the governed port's own requested key rather than restated, because the port is what
 * would run: `resolveGovernedReasoningProviderPort` constructs one OpenAI-compatible adapter and
 * requests exactly this provider. An org that declares some other provider has declared one this
 * runtime cannot reach, and permitting it would mean assembling a Decision Package for an execution
 * that could never happen — the participant would wait on a refusal instead of getting the
 * deterministic answer immediately.
 *
 * `stub` is deliberately absent. A stub is legitimate for operator-facing enrichment; a parent's own
 * words are not a place to exercise one.
 */
const PARTICIPANT_REASONING_PROVIDER_KEYS: ReadonlySet<string> = new Set([
    GOVERNED_REASONING_REQUESTED_PROVIDER_KEY,
]);

/**
 * Fails closed on every path that is not an explicit permit.
 *
 * The read is wrapped because a public participant request must never fail on an AI policy lookup:
 * whatever went wrong, the answer that keeps Enrollment working is "no provider".
 */
export async function participantProviderReasoningPermitted(
    supabase: SupabaseClient,
    orgId: string,
): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .from("org_settings")
            .select("metadata")
            .eq("org_id", orgId)
            .maybeSingle();
        if (error || !data) return false;

        const policy = parseAiPolicyFromMetadata((data as { metadata?: unknown }).metadata);
        // ALL THREE conditions. `enabled` alone is not permission for this feature; the parser
        // already empties `allowed_features` when the policy is disabled; and a declared provider
        // this runtime cannot execute through is not a provider.
        return (
            policy.enabled &&
            policy.allowed_features.includes(PARTICIPANT_CONVERSATION_AI_FEATURE) &&
            PARTICIPANT_REASONING_PROVIDER_KEYS.has(policy.provider)
        );
    } catch {
        return false;
    }
}

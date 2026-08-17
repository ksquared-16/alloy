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
 * It reads the SAME source of truth — `orgs.metadata.ai_policy`, through the policy's own parser —
 * so there is no second interpretation of what an org enabled. The decision class's
 * `requires_allowed_feature` remains the binding gate inside Trust; this is the outer check that
 * avoids assembling a package the runtime would refuse anyway.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseAiPolicyFromMetadata } from "@/lib/ai/aiPolicy";

export const PARTICIPANT_CONVERSATION_AI_FEATURE = "participant_conversation_interpretation" as const;

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
            .from("orgs")
            .select("metadata")
            .eq("id", orgId)
            .maybeSingle();
        if (error || !data) return false;

        const policy = parseAiPolicyFromMetadata((data as { metadata?: unknown }).metadata);
        // BOTH conditions. `enabled` alone is not permission for this feature, and the parser
        // already empties `allowed_features` when the policy is disabled.
        return policy.enabled && policy.allowed_features.includes(PARTICIPANT_CONVERSATION_AI_FEATURE);
    } catch {
        return false;
    }
}

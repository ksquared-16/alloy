import type { SupabaseClient } from "@supabase/supabase-js";
import {
    buildOperationalIntentFormMetadataPatch,
    readStoredOperationalIntent,
} from "@/lib/forms/operationalIntentTemplates";
import { FORM_LIFECYCLE_USAGE_METADATA_KEY } from "@/lib/forms/lifecycle/formLifecycleUsageMetadata";
import { resolveOrgIntakeRoutingDefaults } from "@/lib/forms/intake/resolveOrgIntakeRoutingDefaults";

/**
 * Seed a new lead-capture form's metadata with the `enrollment_lead` operational
 * intent and (best-effort) the enrollment Business Process context.
 *
 * Why: minting a public link only auto-resolves org intake routing
 * (vertical / location / department) when the form carries a stored operational
 * intent (see {@link readStoredOperationalIntent} → applyOperationalIntentToLinkMetadata).
 * A brand-new form has none, so a lead-capture link minted on it comes out with no
 * `default_vertical_id` and the public submission silently dead-ends
 * (`intake_resolution_path: "skipped_missing_config"`) — no Processing case.
 *
 * Defaulting the intent here makes the operator's happy path work without them
 * having to remember to set Purpose first. The Business Process context is filled
 * best-effort (it needs a resolvable department); the intent alone fixes routing.
 *
 * Only fills what the caller has not already set — an explicit `intake_intent` in
 * `base` always wins, so document/packet flows that pass their own intent are untouched.
 */
export async function applyDefaultLeadCaptureFormMetadata(
    supabase: SupabaseClient,
    orgId: string,
    base: Record<string, unknown>
): Promise<Record<string, unknown>> {
    // Respect an explicitly-provided operational intent.
    if (readStoredOperationalIntent(base)) return base;

    let next = buildOperationalIntentFormMetadataPatch("enrollment_lead", base);

    // Best-effort Business Process context — requires a resolvable department.
    if (!next[FORM_LIFECYCLE_USAGE_METADATA_KEY]) {
        try {
            const routing = await resolveOrgIntakeRoutingDefaults(supabase, orgId, "enrollment_lead");
            if (routing.default_department_id) {
                next = {
                    ...next,
                    [FORM_LIFECYCLE_USAGE_METADATA_KEY]: {
                        department_id: routing.default_department_id,
                        stage_key: "lead",
                        intake_intent: "enrollment_lead",
                    },
                };
            }
        } catch {
            /* Business Process is best-effort; the intent alone fixes intake routing. */
        }
    }

    return next;
}

/**
 * Communications V2 — send-time consent enforcement (PKG-18A). Additive helper.
 *
 * Loads a person's preference for the send's category and runs the platform consent gate
 * (consentGate.evaluateConsent). Used by executeCommunicationsSend ONLY when comms_v2_compliance
 * is enabled — when the flag is off this code path never runs. Default category is the channel's
 * transactional category (operational drawer/composer sends); callers may pass an explicit category
 * + lifecycle + promotional override for marketing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateConsent, type ConsentDecision, type LifecycleStage } from "@/lib/communications/v2/consentGate";
import type { PreferenceCategory, PreferenceState } from "@/lib/communications/v2/preferences";

function transactionalCategoryForChannel(channel: "email" | "sms"): PreferenceCategory {
    return channel === "sms" ? "sms_transactional" : "email_transactional";
}

export async function enforceConsentForSend(opts: {
    supabase: SupabaseClient;
    orgId: string;
    personId: string;
    channel: "email" | "sms";
    category?: PreferenceCategory;
    lifecycleStage?: LifecycleStage;
    promotionalOverride?: boolean;
}): Promise<ConsentDecision> {
    const category = opts.category ?? transactionalCategoryForChannel(opts.channel);
    let preferenceState: PreferenceState | undefined;
    const { data } = await opts.supabase
        .from("communication_preferences")
        .select("state")
        .eq("org_id", opts.orgId)
        .eq("person_id", opts.personId)
        .eq("category", category)
        .maybeSingle();
    if (data && typeof data === "object") {
        const s = (data as { state?: string }).state;
        if (s === "opted_in" || s === "opted_out" || s === "unset") preferenceState = s;
    }
    return evaluateConsent({
        category,
        lifecycleStage: opts.lifecycleStage ?? "unknown",
        preferenceState,
        promotionalOverride: opts.promotionalOverride,
    });
}

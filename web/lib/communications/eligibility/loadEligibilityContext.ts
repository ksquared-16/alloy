/**
 * Communication eligibility — live-input loader.
 *
 * The only I/O in the eligibility path. `evaluateEligibility` stays pure so the
 * TypeScript gate and the Python dispatch revalidation can share golden
 * fixtures; this module supplies the facts it reasons over.
 *
 * FAIL CLOSED: a lookup that errors returns `unknown`, and the caller treats
 * unknown preference/suppression state as blocking for non-exempt categories.
 * A database hiccup must never become an accidental permission to send.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PreferenceCategory } from "@/lib/communications/v2/preferences";
import type { MessageCategory, MessageChannel } from "./types";

/**
 * Which stored preference governs a (category, channel) pair.
 *
 * `emergency` maps to its own preference so an operator can record a genuine
 * emergency-contact preference, but note the evaluator exempts emergency from
 * opt-out regardless — the mapping exists for auditability, not suppression.
 */
export function preferenceCategoryFor(
    category: MessageCategory,
    channel: MessageChannel
): PreferenceCategory | null {
    if (category === "emergency") return "emergency";
    if (channel === "in_app") return null; // internal transport has no external consent surface

    const suffix = category === "transactional" ? "transactional" : category === "operational" ? "operational" : "marketing";
    return channel === "email"
        ? (`email_${suffix}` as PreferenceCategory)
        : (`sms_${suffix}` as PreferenceCategory);
}

export type EligibilityContext = {
    preferenceState: "opted_in" | "opted_out" | "unset";
    /** True when a hard bounce or spam complaint has been recorded for this address. */
    suppressed: boolean;
    /** STOP from this endpoint pair while tenant ownership was unresolved. */
    unresolvedInboundStopHold: boolean;
    /** Set when a lookup failed. The caller must fail closed rather than assume. */
    lookupFailed: boolean;
    /** The preference row consulted, recorded in the snapshot for auditability. */
    consultedPreferenceCategory: PreferenceCategory | null;
};

const UNKNOWN: EligibilityContext = {
    preferenceState: "unset",
    suppressed: false,
    unresolvedInboundStopHold: false,
    lookupFailed: true,
    consultedPreferenceCategory: null,
};

/** Load the live facts the evaluator needs for one (person, category, channel). */
export async function loadEligibilityContext(params: {
    supabase: SupabaseClient;
    orgId: string;
    personId: string | null;
    category: MessageCategory;
    channel: MessageChannel;
    toAddress?: string | null;
    /** Our provider destination — the number the recipient would reply TO. */
    fromAddress?: string | null;
}): Promise<EligibilityContext> {
    const prefCategory = preferenceCategoryFor(params.category, params.channel);

    // Evaluated BEFORE the no-person early return, because the hold belongs to an
    // endpoint pair rather than to a Person. That is the whole point of it: the
    // STOP arrived when nobody knew whose it was, so gating it behind a resolved
    // person would make it unenforceable exactly when it is needed.
    const unresolvedInboundStopHold = await hasUnresolvedInboundStopHold(params);

    if (!params.personId || !prefCategory) {
        return {
            preferenceState: "unset",
            suppressed: false,
            unresolvedInboundStopHold,
            lookupFailed: false,
            consultedPreferenceCategory: prefCategory,
        };
    }

    const { data, error } = await params.supabase
        .from("communication_preferences")
        .select("state")
        .eq("org_id", params.orgId)
        .eq("person_id", params.personId)
        .eq("category", prefCategory)
        .maybeSingle();

    if (error) {
        console.error("[eligibility] preference lookup failed", { code: error.code });
        return { ...UNKNOWN, unresolvedInboundStopHold, consultedPreferenceCategory: prefCategory };
    }

    const rawState = (data as { state?: string } | null)?.state ?? "unset";
    const preferenceState =
        rawState === "opted_in" || rawState === "opted_out" ? rawState : "unset";

    const suppressed = await isAddressSuppressed(params);

    return {
        preferenceState,
        suppressed: suppressed.suppressed,
        unresolvedInboundStopHold,
        lookupFailed: suppressed.lookupFailed,
        consultedPreferenceCategory: prefCategory,
    };
}

/**
 * Did this exact endpoint pair reply STOP while Alloy could not attribute it?
 *
 * Matched on the pair and nothing else: their address is the ingress SENDER, our
 * provider destination is the ingress RECIPIENT — the directions invert because
 * the hold was created by an inbound message and is consulted on an outbound one.
 *
 * Scoped deliberately narrowly. It is not a Person opt-out, not an org-wide
 * suppression, and not a block on that number everywhere: only this pair, and only
 * while the ingress row is still unresolved. Once an operator establishes
 * ownership the row resolves and the hold stops matching, at which point the
 * canonical WS8 preference authority owns the consent.
 *
 * Fails OPEN on lookup error, matching `isAddressSuppressed`. A hold is a safety
 * net over an already-unusual path; hard-failing every send in the org because one
 * query errored would be a worse outage than the risk it guards.
 */
async function hasUnresolvedInboundStopHold(params: {
    supabase: SupabaseClient;
    channel: MessageChannel;
    toAddress?: string | null;
    fromAddress?: string | null;
}): Promise<boolean> {
    const theirAddress = params.toAddress?.trim();
    const ourDestination = params.fromAddress?.trim();
    if (!theirAddress || !ourDestination) return false;
    if (params.channel !== "sms" && params.channel !== "email") return false;

    const { data, error } = await params.supabase
        .from("communication_inbound_ingress")
        .select("id")
        .eq("channel", params.channel)
        .eq("from_address", theirAddress)
        .eq("to_address", ourDestination)
        .eq("compliance_hold_active", true)
        .is("resolved_at", null)
        .limit(1);

    if (error) {
        console.error("[eligibility] inbound stop hold lookup failed", { code: error.code });
        return false;
    }
    return Array.isArray(data) && data.length > 0;
}

/**
 * Has this address hard-bounced or produced a spam complaint?
 *
 * Reads the delivery-event substrate, which is already provider-neutral and
 * idempotent. Deliberately narrow: only `bounced` and `complaint` suppress.
 * A soft failure is a retry concern, not a consent concern.
 */
async function isAddressSuppressed(params: {
    supabase: SupabaseClient;
    orgId: string;
    toAddress?: string | null;
}): Promise<{ suppressed: boolean; lookupFailed: boolean }> {
    const address = params.toAddress?.trim();
    if (!address) return { suppressed: false, lookupFailed: false };

    const { data, error } = await params.supabase
        .from("communication_messages")
        .select("id, communication_delivery_events!inner(event_type)")
        .eq("org_id", params.orgId)
        .eq("to_address", address)
        .in("communication_delivery_events.event_type", ["bounced", "complaint"])
        .limit(1);

    if (error) {
        console.error("[eligibility] suppression lookup failed", { code: error.code });
        return { suppressed: false, lookupFailed: true };
    }

    return { suppressed: Array.isArray(data) && data.length > 0, lookupFailed: false };
}

/**
 * Communications V2 — consent gate (PKG-08).
 *
 * PURE, platform-owned compliance decision. NOT tenant-configurable. Implements the doctrine:
 *   Lead → Marketing · Enrolled customer → Transactional · default to the SAFER classification.
 *   Promotional override is available for an UNSET preference, but NEVER overrides an explicit opt-out.
 *
 * This is the engine only. Wiring it into the live send path (executeCommunicationsSend) is a
 * separate, real-gate-validated step (it edits shipping, tested code); staged behind the
 * comms_v2_compliance flag.
 */

import type { PreferenceCategory, PreferenceState } from "@/lib/communications/v2/preferences";

export type LifecycleStage = "lead" | "enrolled" | "unknown";
export type SendClass = "transactional" | "marketing";

export type ConsentInput = {
    category: PreferenceCategory;
    lifecycleStage: LifecycleStage;
    /** The recipient's current preference state for this category (defaults to "unset"). */
    preferenceState?: PreferenceState;
    /** Operator promotional override — permits a marketing send for an UNSET preference only. */
    promotionalOverride?: boolean;
};

export type ConsentDecision = {
    allowed: boolean;
    reason: string;
    effectiveClass: SendClass;
};

/** Classify a send. Explicit categories win; ambiguous (announcements) follow lifecycle, safer-default marketing. */
export function effectiveSendClass(category: PreferenceCategory, lifecycleStage: LifecycleStage): SendClass {
    if (category === "email_transactional" || category === "sms_transactional" || category === "emergency") {
        return "transactional";
    }
    if (category === "email_marketing" || category === "sms_marketing") {
        return "marketing";
    }
    // announcements: enrolled → transactional; lead/unknown → marketing (safer default)
    return lifecycleStage === "enrolled" ? "transactional" : "marketing";
}

export function evaluateConsent(input: ConsentInput): ConsentDecision {
    const state: PreferenceState = input.preferenceState ?? "unset";
    const effectiveClass = effectiveSendClass(input.category, input.lifecycleStage);

    if (state === "opted_out") {
        return { allowed: false, reason: `Recipient opted out of ${input.category}.`, effectiveClass };
    }
    if (effectiveClass === "transactional") {
        return { allowed: true, reason: "Transactional send permitted (not opted out).", effectiveClass };
    }
    // marketing
    if (state === "opted_in") {
        return { allowed: true, reason: "Marketing send permitted (opted in).", effectiveClass };
    }
    if (input.promotionalOverride) {
        return { allowed: true, reason: "Marketing send permitted via promotional override (preference unset).", effectiveClass };
    }
    return { allowed: false, reason: "Marketing send blocked: requires opt-in (safer default).", effectiveClass };
}

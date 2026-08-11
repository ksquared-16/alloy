/**
 * Communication eligibility — the canonical decision function.
 *
 * PURE. No I/O. Platform-owned. NOT tenant-configurable.
 *
 * This is the single policy contract. The TypeScript enqueue gate calls it with
 * live inputs; the Python dispatch revalidation re-checks only the subset whose
 * inputs can change in the queue→send gap, against the snapshot this produces.
 * Shared golden fixtures keep the two runtimes from drifting.
 *
 * FAIL CLOSED. Every ambiguous or missing input blocks. The prior gate failed
 * open in four separate ways (see PHASE-0-CONTRACT.md §0.1); none of those
 * shapes may recur here.
 */

import {
    MESSAGE_AUDIENCES,
    MESSAGE_CATEGORIES,
    type EligibilityDecision,
    type EligibilityInput,
    type MessageCategory,
    type QuietHoursWindow,
} from "./types";

/** Bump when the decision semantics change. Recorded in every snapshot. */
export const ELIGIBILITY_POLICY_VERSION = "2026-07-31.1";

const ALLOWED: EligibilityDecision = { allowed: true, code: null, reason: "Eligible." };

function block(code: EligibilityDecision["code"], reason: string): EligibilityDecision {
    return { allowed: false, code, reason };
}

/** Categories that a recipient opt-out cannot suppress. */
function isOptOutExempt(category: MessageCategory): boolean {
    return category === "transactional" || category === "emergency";
}

/** Categories exempt from quiet hours. */
function isQuietHoursExempt(category: MessageCategory): boolean {
    return category === "transactional" || category === "emergency";
}

/** Minutes since local midnight for `iso` in `timeZone`. */
function localMinutes(iso: string, timeZone: string): number | null {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return null;
    try {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).formatToParts(at);
        const hour = Number(parts.find((p) => p.type === "hour")?.value);
        const minute = Number(parts.find((p) => p.type === "minute")?.value);
        if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
        return (hour % 24) * 60 + minute;
    } catch {
        // Unknown timezone — cannot evaluate, so the caller must fail closed.
        return null;
    }
}

function parseHhMm(value: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!m) return null;
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
}

/**
 * Is `nowIso` inside the window? Handles overnight windows (21:00–08:00).
 * Returns null when the window or instant cannot be interpreted — the caller
 * treats null as "cannot determine" and fails closed.
 */
export function isWithinQuietHours(window: QuietHoursWindow, nowIso: string): boolean | null {
    const now = localMinutes(nowIso, window.timezone);
    const start = parseHhMm(window.start);
    const end = parseHhMm(window.end);
    if (now === null || start === null || end === null) return null;
    if (start === end) return false; // zero-length window suppresses nothing
    return start < end ? now >= start && now < end : now >= start || now < end;
}

/**
 * Evaluate eligibility for one message on one channel to one recipient.
 *
 * Order is deliberate: structural validity, then audience, then authorization,
 * then recipient resolution, then hard suppression, then channel usability,
 * then consent, then time-of-day. Cheaper and more absolute checks first, so a
 * blocked send reports the most fundamental reason rather than an incidental one.
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityDecision {
    // 1. Structural validity. A row inserted directly by SQL may carry nothing.
    if (!input.category) {
        return block("CATEGORY_MISSING", "Message has no category. Every send must be explicitly classified.");
    }
    if (!MESSAGE_CATEGORIES.includes(input.category)) {
        return block("CATEGORY_INVALID", `Unknown category "${input.category}".`);
    }
    if (!input.audience || !MESSAGE_AUDIENCES.includes(input.audience)) {
        return block("AUDIENCE_INVALID", `Unknown audience "${input.audience}".`);
    }

    // 2. Internal audience: a staff note is not a communication to a data
    //    subject, so recipient consent is not evaluated at all. It must never
    //    reach an external provider — enforced at dispatch, where the channel
    //    is known to be a provider channel.
    if (input.audience === "internal") {
        if (input.channel !== "in_app") {
            return block(
                "INTERNAL_TO_PROVIDER",
                "Internal messages may only use the in-app channel; they must never reach an external provider."
            );
        }
        return ALLOWED;
    }

    // 3. Emergency is permissioned. It bypasses opt-out and quiet hours, so the
    //    permission is the only thing standing between it and every other rule.
    if (input.category === "emergency" && input.emergencyPermitted !== true) {
        return block(
            "EMERGENCY_NOT_PERMITTED",
            "Emergency classification requires an explicit permission and is audited."
        );
    }

    // 4. External sends require a resolved recipient. The previous gate skipped
    //    itself when recipient_person_id was absent, which made a free-text `to`
    //    a complete bypass. Fail closed instead.
    if (!input.recipientPersonId && input.verifiedThreadEndpoint !== true) {
        return block(
            "RECIPIENT_UNRESOLVED",
            "External send has no resolved recipient identity; eligibility cannot be established."
        );
    }

    // 5. Hard suppression (bounce / complaint). Emergency overrides.
    if (input.suppressed === true && input.category !== "emergency") {
        return block("SUPPRESSED", "Recipient address is suppressed after a bounce or complaint.");
    }

    // 5b. A STOP arrived from this exact endpoint pair while Alloy could not tell
    //     which organization owned it, so no Person preference could be written.
    //     The consent is real even though its owner is unknown, and continuing to
    //     send over the same pair would ignore it.
    //
    //     Every non-emergency category is blocked, transactional included. The
    //     usual per-category nuance depends on knowing who the recipient is, and
    //     that is precisely what is missing here, so the narrow reading is the
    //     only safe one.
    //
    //     Deliberately NOT reported as OPTED_OUT: nobody knows whose opt-out this
    //     is, and recording it as a Person's consent decision would put a claim in
    //     the audit trail that Alloy cannot support.
    if (input.unresolvedInboundStopHold === true && input.category !== "emergency") {
        return block(
            "UNRESOLVED_INBOUND_STOP_HOLD",
            "This number replied STOP to a destination Alloy could not attribute to an organization. Sending is held until ownership is resolved."
        );
    }

    // 6. Channel usability applies to EVERY category, including transactional
    //    and emergency: an unusable channel cannot deliver regardless of class.
    if (input.channelUsable === false) {
        return block("CHANNEL_UNAVAILABLE", `The ${input.channel} channel is not usable for this recipient.`);
    }

    // 7. Consent.
    //
    // Preference is per Person. On a thread-bound reply there is no Person, so
    // consent is genuinely unevaluable — and an unevaluable policy must not be
    // reported as a policy that passed. The send is still permitted here because
    // everything that COULD be checked was: the endpoint is one this org verifiably
    // received a message from, suppression and channel usability were enforced
    // above, and an unresolved STOP hold would already have blocked it.
    //
    // Marketing is the exception. It requires affirmative opt-in, and "we could
    // not check" is the opposite of affirmative, so it stays blocked.
    const consentUnevaluable = !input.recipientPersonId && input.verifiedThreadEndpoint === true;
    if (consentUnevaluable) {
        if (input.category === "marketing") {
            return block(
                "MARKETING_REQUIRES_OPT_IN",
                "Marketing requires explicit opt-in, which cannot be established for an unidentified sender."
            );
        }
        // Falls through to quiet hours DELIBERATELY. Quiet hours derive from the
        // location/organization window, not from the recipient, so they remain
        // fully evaluable here — an early return would have skipped a policy that
        // still applies.
    } else {
        const state = input.preferenceState ?? "unset";
        if (state === "opted_out" && !isOptOutExempt(input.category)) {
            return block("OPTED_OUT", `Recipient opted out of ${input.category} messages.`);
        }
        if (input.category === "marketing" && state !== "opted_in") {
            return block("MARKETING_REQUIRES_OPT_IN", "Marketing sends require explicit opt-in.");
        }
    }

    // 8. Quiet hours — time-dependent, so this is the check most likely to flip
    //    between enqueue and dispatch.
    if (input.quietHours && !isQuietHoursExempt(input.category)) {
        const nowIso = input.nowIso ?? new Date().toISOString();
        const within = isWithinQuietHours(input.quietHours, nowIso);
        if (within === null) {
            return block("QUIET_HOURS", "Quiet-hours window could not be evaluated; refusing to send.");
        }
        if (within) {
            return block("QUIET_HOURS", "Within the recipient's quiet hours.");
        }
    }

    return ALLOWED;
}

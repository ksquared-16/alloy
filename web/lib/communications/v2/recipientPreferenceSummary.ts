/**
 * What an operator needs to know about a recipient, in one line per channel.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS DERIVED FROM THE EVALUATOR'S RULES, NOT FROM THE ROWS
 * ---------------------------------------------------------------------------
 *
 * A preference row says `opted_out`. Whether that BLOCKS anything is a different question,
 * and the answer lives in `evaluateEligibility`: transactional and emergency are exempt from
 * opt-out, and marketing is blocked until someone explicitly opts in. A summary built by
 * reading rows and reporting them literally would tell an operator that essential email is
 * "blocked" when the platform will send it anyway — which is the same class of untruth as
 * the old "Email messages" control, just pointed the other way.
 *
 * So the rules are restated here ONCE, alongside the categories they apply to, and the
 * summary reports the consequence rather than the row. `recipientPreferenceSummary.test.ts`
 * pins them against `evaluateEligibility` so the two cannot drift.
 *
 * Pure. No I/O, no React, no copy that belongs to a component.
 */

import type { ConsentState, PersonPreferenceProfile } from "@/lib/communications/v2/familyWorkspace/types";

export type PreferenceSummaryState = "available" | "restricted" | "blocked";

export type ChannelPreferenceSummary = {
    channel: "email" | "sms";
    state: PreferenceSummaryState;
    /** One operator-safe sentence. Never names a category key or a person. */
    reason: string;
    /** True when routine communication is refused — the case operators most need to see. */
    routineBlocked: boolean;
    /** True when marketing cannot send for want of an opt-in. */
    marketingRequiresOptIn: boolean;
};

const isOut = (s: ConsentState | undefined) => s === "opted_out";
const isIn = (s: ConsentState | undefined) => s === "opted_in";

/**
 * Summarise one channel.
 *
 * Order matters and mirrors the evaluator: an essential-category opt-out is reported first
 * for SMS because a recipient's STOP writes all three categories and means total
 * suppression — carrier semantics override category semantics, and an operator reading
 * "routine blocked" would understate it. Email has no equivalent, because
 * `email_transactional` is exempt and nothing a recipient does can suppress it.
 */
export function summarizeChannelPreference(
    channel: "email" | "sms",
    profile: PersonPreferenceProfile | null,
): ChannelPreferenceSummary {
    const essential = channel === "email" ? profile?.email_transactional : profile?.sms_transactional;
    const routine = channel === "email" ? profile?.email_operational : profile?.sms_operational;
    const marketing = channel === "email" ? profile?.email_marketing : profile?.sms_marketing;

    const marketingRequiresOptIn = !isIn(marketing);

    // SMS only. A STOP suppresses every category including essential, and saying anything
    // softer would misrepresent a compliance state.
    if (channel === "sms" && isOut(essential)) {
        return {
            channel,
            state: "blocked",
            reason: "Recipient texted STOP. All text messages are blocked until they text START.",
            routineBlocked: true,
            marketingRequiresOptIn,
        };
    }

    if (isOut(routine)) {
        return {
            channel,
            state: "blocked",
            reason:
                channel === "email" ?
                    "Routine email is opted out. Only essential email will send."
                :   "Routine text messages are opted out. Only essential texts will send.",
            routineBlocked: true,
            marketingRequiresOptIn,
        };
    }

    if (marketingRequiresOptIn) {
        return {
            channel,
            state: "restricted",
            reason:
                channel === "email" ?
                    "Marketing email requires opt-in. Essential and routine email will send."
                :   "Marketing texts require opt-in. Essential and routine texts will send.",
            routineBlocked: false,
            marketingRequiresOptIn,
        };
    }

    return {
        channel,
        state: "available",
        reason: channel === "email" ? "Email available." : "Text messages available.",
        routineBlocked: false,
        marketingRequiresOptIn,
    };
}

export type RecipientPreferenceSummary = {
    email: ChannelPreferenceSummary;
    sms: ChannelPreferenceSummary;
    /** Channels whose routine communication is refused. The count worth showing unprompted. */
    blockedChannelCount: number;
};

export function summarizeRecipientPreferences(
    profile: PersonPreferenceProfile | null,
): RecipientPreferenceSummary {
    const email = summarizeChannelPreference("email", profile);
    const sms = summarizeChannelPreference("sms", profile);
    return {
        email,
        sms,
        // `restricted` is deliberately NOT counted. Marketing needing an opt-in is the
        // resting state of almost every recipient; counting it would make the badge
        // permanently lit and therefore ignored, which is how a real block gets missed.
        blockedChannelCount: [email, sms].filter((c) => c.state === "blocked").length,
    };
}

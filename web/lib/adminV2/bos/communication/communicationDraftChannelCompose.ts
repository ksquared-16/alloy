/**
 * Channel-specific composition for operational communication drafts.
 * Email and SMS share objectives and grounded facts — not paragraph structure.
 */

import type { OperationalCommunicationObjective } from "@/lib/adminV2/bos/communication/communicationObjectives";
import {
    formatRecipientGreetingLine,
    type ResolvedRecipientGreeting,
} from "@/lib/adminV2/bos/communication/resolveRecipientGreeting";

export type ChannelComposeFacts = {
    recipientFirstName: string | null;
    recipientHouseholdGreeting: string | null;
    siteOrOrgName: string | null;
    operatorDisplayName: string | null;
};

export type ChannelComposedDraft = {
    subject: string | null;
    emailBody: string;
    smsBody: string;
};

const SMS_MAX = 480;

function resolvedGreeting(facts: ChannelComposeFacts): ResolvedRecipientGreeting {
    return {
        firstName: facts.recipientFirstName?.trim() || null,
        householdGreeting: facts.recipientHouseholdGreeting?.trim() || null,
    };
}

function site(facts: ChannelComposeFacts): string | null {
    return facts.siteOrOrgName?.trim() || null;
}

function operatorFirstName(facts: ChannelComposeFacts): string | null {
    const raw = facts.operatorDisplayName?.trim();
    if (!raw) return null;
    return raw.split(/\s+/)[0] || null;
}

function clipSms(text: string): string {
    return text.replace(/\s+/g, " ").trim().slice(0, SMS_MAX);
}

/** Email: "Hi Sarah," */
function emailGreeting(facts: ChannelComposeFacts): string {
    return formatRecipientGreetingLine(resolvedGreeting(facts));
}

/** SMS: "Hi Sarah —" */
function smsGreeting(facts: ChannelComposeFacts): string {
    const g = resolvedGreeting(facts);
    if (g.firstName) return `Hi ${g.firstName} —`;
    if (g.householdGreeting) return `Hi ${g.householdGreeting} —`;
    return "Hi —";
}

function emailSignOff(facts: ChannelComposeFacts): string {
    const name = facts.operatorDisplayName?.trim();
    return name ? `Thank you,\n${name}` : "Thank you";
}

/** SMS: "this is Kelly from West Campus" when grounded. */
function smsOperatorSiteIntro(facts: ChannelComposeFacts): string | null {
    const op = operatorFirstName(facts);
    const s = site(facts);
    if (op && s) return `this is ${op} from ${s}`;
    if (op) return `this is ${op}`;
    if (s) return `this is ${s}`;
    return null;
}

function joinEmailParagraphs(paragraphs: string[], facts: ChannelComposeFacts): string {
    const parts = [emailGreeting(facts), ...paragraphs.filter(Boolean), emailSignOff(facts)];
    return parts.join("\n\n");
}

function joinSms(parts: string[], facts: ChannelComposeFacts): string {
    const intro = smsOperatorSiteIntro(facts);
    const segments = [smsGreeting(facts), intro, ...parts.filter(Boolean)].filter(Boolean);
    const sentence = segments
        .map((seg, i) => {
            const t = seg.trim();
            if (i === 0) return t;
            if (t.endsWith(".")) return t;
            return `${t}.`;
        })
        .join(" ");
    return clipSms(sentence);
}

function composeInitialOutreach(facts: ChannelComposeFacts): ChannelComposedDraft {
    const s = site(facts);
    const emailCore = s
        ? `Thank you for your interest in ${s}. I wanted to follow up regarding your inquiry and see whether you're still exploring enrollment options for your family.`
        : "Thank you for your interest and for reaching out about enrollment. I wanted to follow up regarding your inquiry and see whether you're still exploring options for your family.";
    const emailBody = joinEmailParagraphs(
        [
            emailCore,
            "I'd be happy to answer questions, discuss availability, or help schedule a tour if helpful.",
            "Reply here when convenient and we can help with next steps.",
        ],
        facts
    );
    const smsCore = s
        ? `I wanted to follow up on your enrollment inquiry at ${s} and see if you're still exploring options`
        : "I wanted to follow up on your enrollment inquiry and see if you're still exploring options";
    const smsBody = joinSms(
        [smsCore, "Happy to answer questions or schedule a tour if helpful"],
        facts
    );
    return {
        subject: s ? `Welcome to ${s} — next steps for your inquiry` : "Next steps for your inquiry",
        emailBody,
        smsBody,
    };
}

function composeFollowUp(facts: ChannelComposeFacts): ChannelComposedDraft {
    const s = site(facts);
    const emailReconnect = s
        ? `I wanted to reconnect regarding your inquiry with ${s}. We haven't had a chance to connect recently, and I'd like to help with any questions or next steps for your family.`
        : "I wanted to reconnect regarding your inquiry. We haven't had a chance to connect recently, and I'd like to help with any questions or next steps for your family.";
    const emailBody = joinEmailParagraphs(
        [emailReconnect, "Let me know when a good time to talk would be, or reply here with any updates."],
        facts
    );
    const smsCore = s
        ? `following up on your inquiry with ${s} — let me know if you have questions or want to talk through next steps`
        : "following up on your inquiry — let me know if you have questions or want to talk through next steps";
    const smsBody = joinSms([smsCore], facts);
    return {
        subject: s ? `Following up on your inquiry — ${s}` : "Following up on your inquiry",
        emailBody,
        smsBody,
    };
}

function composeScheduleTour(facts: ChannelComposeFacts): ChannelComposedDraft {
    const s = site(facts);
    const emailThanks = s
        ? `Thank you again for your interest in ${s}. I'd love to help schedule a tour or share what the next steps look like for enrollment.`
        : "Thank you again for your interest. I'd love to help schedule a tour or share what the next steps look like for enrollment.";
    const emailBody = joinEmailParagraphs(
        [emailThanks, "Reply with a few times that work for you, or let me know if a phone call is easier."],
        facts
    );
    const smsCore = s
        ? `I'd love to help schedule a tour at ${s}`
        : "I'd love to help schedule a tour";
    const smsBody = joinSms([smsCore, "Reply with times that work or if a call is easier"], facts);
    return {
        subject: s ? `Scheduling a tour — ${s}` : "Scheduling a tour",
        emailBody,
        smsBody,
    };
}

function composeReengagement(facts: ChannelComposeFacts): ChannelComposedDraft {
    const s = site(facts);
    const emailReach = s
        ? `I'm reaching out from ${s} to see whether you're still considering enrollment for your family.`
        : "I'm reaching out to see whether you're still considering enrollment for your family.";
    const emailBody = joinEmailParagraphs(
        [
            emailReach,
            "If your plans have changed, no worries — just let us know. If you're still interested, I'd be glad to help with next steps.",
        ],
        facts
    );
    const smsCore = s
        ? `checking whether you're still exploring enrollment at ${s}`
        : "checking whether you're still exploring enrollment";
    const smsBody = joinSms([smsCore, "Reply anytime if you'd like help with next steps"], facts);
    return {
        subject: s ?? "Checking in",
        emailBody,
        smsBody,
    };
}

function composeMissingInformation(facts: ChannelComposeFacts): ChannelComposedDraft {
    const s = site(facts);
    const emailFollow = s
        ? `I'm following up from ${s} about your enrollment inquiry. When you have a moment, could you share the outstanding information we need to keep your application moving?`
        : "I'm following up about your enrollment inquiry. When you have a moment, could you share the outstanding information we need to keep your application moving?";
    const emailBody = joinEmailParagraphs(
        [emailFollow, "Reply here if you have questions about what's needed — happy to help."],
        facts
    );
    const smsCore = s
        ? `we need a few more details to keep your inquiry moving at ${s}`
        : "we need a few more details to keep your inquiry moving";
    const smsBody = joinSms([smsCore, "Reply if you have questions about what's needed"], facts);
    return {
        subject: s ? `Information needed — ${s}` : "Information needed",
        emailBody,
        smsBody,
    };
}

function composePaymentFollowup(facts: ChannelComposeFacts): ChannelComposedDraft {
    const s = site(facts);
    const emailFollow = s
        ? `I'm following up from ${s} regarding payment for your enrollment inquiry. If you have questions about the amount or how to submit payment, I'm happy to help.`
        : "I'm following up regarding payment for your enrollment inquiry. If you have questions about the amount or how to submit payment, I'm happy to help.";
    const emailBody = joinEmailParagraphs(
        [emailFollow, "Reply here or let us know if you need a different arrangement."],
        facts
    );
    const smsCore = s ? `following up on payment for your inquiry at ${s}` : "following up on payment for your inquiry";
    const smsBody = joinSms([smsCore, "Reply if you have questions"], facts);
    return {
        subject: s ? `Payment follow-up — ${s}` : "Payment follow-up",
        emailBody,
        smsBody,
    };
}

function composeEnrollmentNextSteps(facts: ChannelComposeFacts): ChannelComposedDraft {
    const s = site(facts);
    const emailThanks = s
        ? `Thank you for continuing with ${s}. I wanted to check in on your enrollment next steps and see whether you have any questions about moving forward.`
        : "Thank you for continuing with us. I wanted to check in on your enrollment next steps and see whether you have any questions about moving forward.";
    const emailBody = joinEmailParagraphs(
        [emailThanks, "Reply here and we can clarify timelines, paperwork, or scheduling."],
        facts
    );
    const smsCore = s
        ? `checking in on enrollment next steps at ${s}`
        : "checking in on enrollment next steps";
    const smsBody = joinSms([smsCore, "Reply with any questions"], facts);
    return {
        subject: s ? `Next steps for enrollment — ${s}` : "Next steps for enrollment",
        emailBody,
        smsBody,
    };
}

export function composeOperationalCommunicationByChannel(
    objective: OperationalCommunicationObjective,
    facts: ChannelComposeFacts
): ChannelComposedDraft {
    switch (objective) {
        case "initial_outreach":
            return composeInitialOutreach(facts);
        case "schedule_tour":
            return composeScheduleTour(facts);
        case "reengagement":
            return composeReengagement(facts);
        case "missing_information":
            return composeMissingInformation(facts);
        case "payment_followup":
            return composePaymentFollowup(facts);
        case "enrollment_next_steps":
            return composeEnrollmentNextSteps(facts);
        case "follow_up":
        default:
            return composeFollowUp(facts);
    }
}

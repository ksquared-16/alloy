/**
 * What the family reads when enrollment paperwork is sent.
 *
 * Pure. No I/O, no ids resolved here — the caller supplies the child's name and the participant
 * access URL, which keeps this testable against the one thing that actually matters: that the
 * message carries product meaning and nothing from the machine room.
 *
 * ── THE VOCABULARY RULE ──
 *
 * A packet definition id, a session id and a public-link id are all real, and none of them is a
 * sentence a parent can act on. The message says whose paperwork it is and gives one link. It does
 * not say "packet", "session", "objective" or "requirement" — those are how Alloy arranges the work,
 * not what the family was asked to do.
 *
 * ── WHY THIS IS NOT A TEMPLATE SYSTEM ──
 *
 * Tour invitations render through `renderTourCommsTemplate` with org overrides, because tour comms
 * already owns a configured template library. Enrollment has no such owner, and inventing a second
 * templating system for one message would be exactly the "second communications system" this work is
 * meant to avoid. The draft this produces is a SEED: it lands in the operator's composer, editable,
 * and is sent through the canonical Communications path like any other message. When enrollment
 * templates get a canonical owner, this becomes its default rather than its replacement.
 */

export type EnrollmentPaperworkMessage = {
    subject: string;
    emailBody: string;
    smsBody: string;
};

export function buildEnrollmentPaperworkMessage(input: {
    /** The child's operator-facing name. A first name is enough and is what a parent expects. */
    childName: string;
    /** The participant access URL — already absolute, from the canonical origin authority. */
    accessUrl: string;
    /** The organization's operator-facing name, when one is known. */
    organizationName?: string | null;
}): EnrollmentPaperworkMessage {
    const child = input.childName.trim() || "your child";
    const url = input.accessUrl.trim();
    const org = input.organizationName?.trim();
    const from = org ? ` at ${org}` : "";

    return {
        subject: `Enrollment paperwork for ${child}`,
        emailBody:
            `Enrollment paperwork for ${child} is ready.\n\n`
            + `Open the link below to complete it. You can answer in your own words, and anything `
            + `already on file is filled in for you — you only need to confirm or add what is missing. `
            + `You can stop and come back to the same link at any time.\n\n`
            + `${url}\n\n`
            + `If anything looks wrong, reply to this message and we will sort it out${from}.`,
        smsBody: `Enrollment paperwork for ${child} is ready. Complete it here: ${url}`,
    };
}

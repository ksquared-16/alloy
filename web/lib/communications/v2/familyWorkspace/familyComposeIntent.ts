/**
 * Communications compose entry intent — distinguishes command-driven New Message
 * from Activity/history browsing (which may open Reply on an existing thread).
 */

export type FamilyComposeIntent = "new_message" | "browse";

export type FamilyComposeDraftSeed = {
    subject?: string | null;
    body?: string | null;
    /** SMS body when channel switches; falls back to `body` when absent. */
    smsBody?: string | null;
    channel?: "email" | "sms" | null;
    recipientPersonIds?: readonly string[] | null;
    /** When set, confirmed send activates this Tour invitation via mark_sent. */
    tourInvitationId?: string | null;
    /**
     * When set, a confirmed send records the operator-intent audit for this child's enrollment
     * paperwork against this participant episode. The SESSION id rather than a fresh delivery id:
     * a resend is the same episode reached again, and keying on the episode is what makes a second
     * delivery legible as a resend instead of a second enrollment.
     */
    enrollmentPaperworkSessionId?: string | null;
    /** The durable child the paperwork is about — the subject the send action takes. */
    enrollmentPaperworkChildId?: string | null;
};

export function resolveFamilyComposeIntent(
    intent: FamilyComposeIntent | null | undefined,
): FamilyComposeIntent {
    return intent === "new_message" ? "new_message" : "browse";
}

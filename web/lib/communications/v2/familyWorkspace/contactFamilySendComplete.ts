/**
 * Contact Family / Current Work send-complete signal.
 * Fired after a confirmed family-send from the Current Work composer entry so
 * What's Next can acknowledge success, close the composer, and refresh work.
 */

export const ADMIN_V2_CONTACT_FAMILY_SEND_COMPLETE = "adminv2:contact-family-send-complete" as const;

export type ContactFamilySendCompleteDetail = {
    opportunity_id: string;
    channel: "email" | "sms";
    recipient_label: string | null;
    success_message: string;
    task_id?: string | null;
    associated?: boolean;
    /** Outcome key written on association (e.g. left_message) — presentation only. */
    outcome_key?: string | null;
};

/**
 * Operator-facing follow-on line after a successful Current Work send.
 * Send → left_message keeps Contact Family open by configured Lead Work Template sufficiency.
 */
export function buildContactFamilySendFollowOnNotice(detail: {
    associated?: boolean;
    outcome_key?: string | null;
}): string | null {
    if (!detail.associated) return null;
    const outcome = String(detail.outcome_key ?? "").trim().toLowerCase();
    if (outcome === "left_message" || !outcome) {
        return "Contact attempt recorded. Contact Family stays open until a result is recorded.";
    }
    return "Contact attempt recorded.";
}

export function dispatchContactFamilySendComplete(detail: ContactFamilySendCompleteDetail): void {
    if (typeof window === "undefined") return;
    const opportunityId = detail.opportunity_id.trim();
    if (!opportunityId) return;
    window.dispatchEvent(
        new CustomEvent(ADMIN_V2_CONTACT_FAMILY_SEND_COMPLETE, {
            detail: {
                ...detail,
                opportunity_id: opportunityId,
            },
        }),
    );
}

export function buildContactFamilySendSuccessMessage(input: {
    channel: "email" | "sms";
    recipientLabel: string | null;
}): string {
    const channelLabel = input.channel === "sms" ? "SMS" : "Email";
    const to = input.recipientLabel?.trim();
    return to ? `${channelLabel} sent to ${to}` : `${channelLabel} sent`;
}

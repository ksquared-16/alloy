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
};

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

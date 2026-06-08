/** Client events for enrollment canonical actions — reuse existing drawer/modal flows. */

export const ADMINV2_OPEN_ENROLLMENT_PACKET_REVIEW = "adminv2:open-enrollment-packet-review" as const;

export const ADMINV2_OPPORTUNITY_FOCUS_INQUIRY_CHILDREN = "adminv2:opportunity-focus-inquiry-children" as const;

export type InquiryChildrenFocusField =
    | "program_room_cohort_key"
    | "desired_schedule_type"
    | "desired_start_date";

export function dispatchOpenEnrollmentPacketReview(opportunityId: string): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent(ADMINV2_OPEN_ENROLLMENT_PACKET_REVIEW, {
            detail: { opportunity_id: opportunityId },
        })
    );
}

export function dispatchFocusInquiryChildren(
    opportunityId: string,
    field?: InquiryChildrenFocusField
): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent(ADMINV2_OPPORTUNITY_FOCUS_INQUIRY_CHILDREN, {
            detail: { opportunity_id: opportunityId, field: field ?? null },
        })
    );
}

export function scrollToInquiryChildrenSection(field?: InquiryChildrenFocusField | null): void {
    if (typeof document === "undefined") return;
    const root = document.querySelector('[data-inquiry-children-section="OpportunityInquiryChildrenSection"]');
    if (root && "scrollIntoView" in root) {
        (root as HTMLElement).scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (field) {
        const target = document.querySelector(`[data-inquiry-field="${field}"]`);
        if (target && "scrollIntoView" in target) {
            (target as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }
}

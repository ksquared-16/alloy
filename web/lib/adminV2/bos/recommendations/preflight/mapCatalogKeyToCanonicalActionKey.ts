/**
 * Map BOS catalog / legacy attention action keys to canonical action_definitions.key.
 */

const CATALOG_TO_CANONICAL: Record<string, string> = {
    send_first_response: "send_email",
    complete_follow_up: "create_task",
    complete_scheduled_event_follow_up: "record_tour_outcome",
    request_documents: "request_missing_information",
    request_missing_information: "request_missing_information",
    confirm_payment_status: "collect_registration_fee",
    reengage_priority_record: "send_email",
    reply_to_inbound: "send_email",
    escalate_operational_review: "create_task",
    approve_enrollment: "approve_enrollment",
    assign_classroom: "assign_classroom",
    assign_schedule: "assign_schedule",
    set_start_date: "set_start_date",
    schedule_tour: "schedule_tour",
    record_tour_outcome: "record_tour_outcome",
    send_enrollment_packet: "send_enrollment_packet",
    review_enrollment_packet: "review_enrollment_packet",
    move_to_waitlist: "move_to_waitlist",
};

export function mapCatalogKeyToCanonicalActionKey(key: string | null | undefined): string | null {
    const k = key?.trim();
    if (!k) return null;
    return CATALOG_TO_CANONICAL[k] ?? k;
}

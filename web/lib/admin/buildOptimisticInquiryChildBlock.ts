import type { AddInquiryChildSubmitPayload } from "@/lib/admin/actions/submitAddInquiryChildFromDrawer";
import type { SubmitAddInquiryChildResult } from "@/lib/admin/actions/submitAddInquiryChildFromDrawer";

/** Minimal `_inquiry_children` block for immediate drawer/queue paint after Add Child. */
export function buildOptimisticInquiryChildBlock(
    result: SubmitAddInquiryChildResult,
    payload: AddInquiryChildSubmitPayload,
): Record<string, unknown> {
    const first = payload.first_name.trim();
    const last = payload.last_name.trim();
    const display_name = [first, last].filter(Boolean).join(" ").trim();
    const dob = payload.date_of_birth?.trim().slice(0, 10) ?? null;

    return {
        id: result.ocm_id,
        ocm_id: result.ocm_id,
        customer_member_id: result.customer_member_id,
        person_id: null,
        display_name,
        first_name: first,
        last_name: last,
        dob,
        desired_program_type: payload.program?.trim() || null,
        desired_program_label: payload.program?.trim() || null,
        desired_schedule_type: payload.desired_schedule_type?.trim() || null,
        desired_start_date: payload.desired_start_date?.trim().slice(0, 10) ?? null,
        linked_on_inquiry: true,
        custom_fields: payload.age_group?.trim() ? { age_group: payload.age_group.trim() } : {},
    };
}

/** Append one optimistic inquiry child row to an existing VM record slice. */
export function appendOptimisticInquiryChildToRecord(
    prev: Record<string, unknown>,
    result: SubmitAddInquiryChildResult,
    payload: AddInquiryChildSubmitPayload,
): Record<string, unknown> {
    const existing = Array.isArray(prev._inquiry_children) ? prev._inquiry_children : [];
    return {
        ...prev,
        _inquiry_children: [...existing, buildOptimisticInquiryChildBlock(result, payload)],
    };
}

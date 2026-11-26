import {
    dispatchFocusInquiryChildren,
    type InquiryChildrenFocusField,
} from "@/lib/admin/actions/enrollmentActionClient";
import { ADMINV2_OPEN_TOUR_OUTCOME_MODAL, ADMINV2_OPEN_TOUR_SCHEDULE_MODAL } from "@/lib/tours/actions/tourBookingActionClient";

export type ActionPreflightFieldGuidance =
    | { kind: "inquiry_children"; field?: InquiryChildrenFocusField | null }
    | { kind: "tour_outcome_modal" }
    | { kind: "tour_schedule_modal" };

const INQUIRY_FIELD_MAP: Record<string, InquiryChildrenFocusField> = {
    program_room_cohort_key: "program_room_cohort_key",
    schedule_type: "schedule_type",
    start_date: "start_date",
    program_category_id: "program_room_cohort_key",
    classroom: "program_room_cohort_key",
    schedule: "schedule_type",
};

export function resolveActionPreflightFieldGuidance(
    fieldKey: string,
    actionKey?: string
): ActionPreflightFieldGuidance | null {
    const key = fieldKey.trim();
    if (!key) return null;

    if (key === "outcome" || (actionKey === "record_tour_outcome" && key === "tour_outcome")) {
        return { kind: "tour_outcome_modal" };
    }
    if (key === "tour_date" || key === "tour_time") {
        return { kind: "tour_schedule_modal" };
    }
    if (
        key === "inquiry_children" ||
        key === "person_id" ||
        key.startsWith("inquiry_child") ||
        INQUIRY_FIELD_MAP[key]
    ) {
        return { kind: "inquiry_children", field: INQUIRY_FIELD_MAP[key] ?? null };
    }
    if (key in INQUIRY_FIELD_MAP) {
        return { kind: "inquiry_children", field: INQUIRY_FIELD_MAP[key] };
    }
    return { kind: "inquiry_children", field: null };
}

export function applyActionPreflightFieldGuidance(
    opportunityId: string,
    fieldKey: string,
    actionKey?: string
): void {
    const guidance = resolveActionPreflightFieldGuidance(fieldKey, actionKey);
    if (!guidance) return;
    if (guidance.kind === "inquiry_children") {
        dispatchFocusInquiryChildren(opportunityId, guidance.field ?? undefined);
        return;
    }
    if (typeof window === "undefined") return;
    if (guidance.kind === "tour_outcome_modal") {
        window.dispatchEvent(
            new CustomEvent(ADMINV2_OPEN_TOUR_OUTCOME_MODAL, { detail: { opportunity_id: opportunityId } })
        );
        return;
    }
    window.dispatchEvent(
        new CustomEvent(ADMINV2_OPEN_TOUR_SCHEDULE_MODAL, { detail: { opportunity_id: opportunityId } })
    );
}

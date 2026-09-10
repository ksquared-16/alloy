import {
    dispatchFocusInquiryChildren,
    type InquiryChildrenFocusField,
} from "@/lib/admin/actions/enrollmentActionClient";
import { ADMINV2_OPEN_TOUR_OUTCOME_MODAL, ADMINV2_OPEN_TOUR_SCHEDULE_MODAL } from "@/lib/tours/actions/tourBookingActionClient";
import { ADMINV2_OPEN_CHANGE_LEAD_LOCATION_MODAL } from "@/lib/admin/actions/changeLeadLocationActionClient";
import { dispatchOpenRequiredFieldsModal } from "@/lib/admin/actions/requiredFieldsActionClient";
import { OPPORTUNITY_ENFORCEABLE_NATIVE_FIELD_KEYS } from "@/lib/fields/drawerFieldPolicyAdapter";

export type ActionPreflightFieldGuidance =
    | { kind: "inquiry_children"; field?: InquiryChildrenFocusField | null }
    | { kind: "tour_outcome_modal" }
    | { kind: "tour_schedule_modal" }
    | { kind: "change_lead_location" }
    | { kind: "record_field"; field_key: string };

/**
 * Opportunity scalars the canonical field editor can collect.
 *
 * `location_id` is excluded on purpose: Center already has a canonical product flow (Change lead
 * location) that owns the relationship and its side effects. Routing it to a generic scalar editor
 * would be a second, worse answer to a solved question.
 */
const RECORD_FIELD_EDITOR_KEYS = new Set(
    OPPORTUNITY_ENFORCEABLE_NATIVE_FIELD_KEYS.filter((key) => key !== "location_id")
);

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
    if (key === "location_id" || key === "location" || key === "center") {
        return { kind: "change_lead_location" };
    }
    if (RECORD_FIELD_EDITOR_KEYS.has(key)) {
        return { kind: "record_field", field_key: key };
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
    if (guidance.kind === "record_field") {
        dispatchOpenRequiredFieldsModal(opportunityId, [guidance.field_key]);
        return;
    }
    if (typeof window === "undefined") return;
    if (guidance.kind === "change_lead_location") {
        window.dispatchEvent(
            new CustomEvent(ADMINV2_OPEN_CHANGE_LEAD_LOCATION_MODAL, {
                detail: { opportunity_id: opportunityId },
            })
        );
        return;
    }
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

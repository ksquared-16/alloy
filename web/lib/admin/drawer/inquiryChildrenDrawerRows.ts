import type { InquiryChildRow } from "@/components/admin/entity/OpportunityInquiryChildrenSection";
import { filterInquiryChildRowsForDrawer } from "@/lib/admin/drawer/inquiryChildrenDebug";
import { parseInquiryChildrenFromOpportunityMetadata } from "@/components/admin/entity/OpportunityInquiryChildrenMetadataSummary";

export function mapRawInquiryChildrenToDrawerRows(raw: unknown[]): InquiryChildRow[] {
    if (!Array.isArray(raw)) return [];
    const rows: InquiryChildRow[] = raw.map((x) => {
        const r = x as Record<string, unknown>;
        return {
            id: String(r.id ?? ""),
            customer_member_id: String(r.customer_member_id ?? ""),
            person_id: r.person_id != null && String(r.person_id).trim() ? String(r.person_id) : null,
            display_name: r.display_name != null ? String(r.display_name) : null,
            dob: r.dob != null && String(r.dob).trim() ? String(r.dob) : null,
            age: r.age != null && String(r.age).trim() ? String(r.age) : null,
            program_category_id:
                r.program_category_id != null && String(r.program_category_id).trim()
                    ? String(r.program_category_id)
                    : null,
            program_key:
                r.program_key != null && String(r.program_key).trim()
                    ? String(r.program_key)
                    : null,
            desired_program_label: r.desired_program_label != null ? String(r.desired_program_label) : null,
            schedule_type:
                r.schedule_type != null && String(r.schedule_type).trim()
                    ? String(r.schedule_type)
                    : null,
            desired_schedule_label: r.desired_schedule_label != null ? String(r.desired_schedule_label) : null,
            outcome_status_key:
                r.outcome_status_key != null && String(r.outcome_status_key).trim()
                    ? String(r.outcome_status_key)
                    : null,
            /*
             * THE CHILD'S OWN PROCESS STAGE, carried rather than dropped.
             *
             * It was absent here, so every consumer downstream resolved a child's stage from the
             * disposition or from the family it rides — which cannot express a child standing at a
             * different stage than their household. Divergence is precisely what the process rail
             * exists to show, so the identity has to survive this mapping.
             */
            stage_key:
                r.stage_key != null && String(r.stage_key).trim() ? String(r.stage_key) : null,
            outcome_status_label: r.outcome_status_label != null ? String(r.outcome_status_label) : null,
            notes: r.notes != null ? String(r.notes) : null,
            start_date:
                r.start_date != null ? String(r.start_date).slice(0, 10) : null,
            location_id:
                r.location_id != null && String(r.location_id).trim() ? String(r.location_id) : null,
            location_label: r.location_label != null ? String(r.location_label) : null,
            program_room_cohort_key:
                r.program_room_cohort_key != null && String(r.program_room_cohort_key).trim()
                    ? String(r.program_room_cohort_key)
                    : null,
            program_room_cohort_label:
                r.program_room_cohort_label != null ? String(r.program_room_cohort_label) : null,
            custom_fields:
                r.custom_fields && typeof r.custom_fields === "object"
                    ? (r.custom_fields as Record<string, unknown>)
                    : {},
            first_name: r.first_name != null ? String(r.first_name) : null,
            last_name: r.last_name != null ? String(r.last_name) : null,
            linked_on_inquiry: r.linked_on_inquiry === true,
            ocm_id: r.ocm_id != null ? String(r.ocm_id) : null,
        };
    });
    return filterInquiryChildRowsForDrawer(rows).kept;
}

/** Resolved drawer row count for shell chrome (bootstrap + primary). */
export function inquiryChildrenRowCountFromEntity(d: Record<string, unknown>): number {
    const raw = (d._inquiry_children as unknown[]) ?? [];
    const fromApi = mapRawInquiryChildrenToDrawerRows(raw).length;
    if (fromApi > 0) return fromApi;
    return parseInquiryChildrenFromOpportunityMetadata(d.metadata).length;
}

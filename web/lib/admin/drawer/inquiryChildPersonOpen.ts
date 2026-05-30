import { findInquiryChildInOpportunityRecord } from "@/lib/admin/drawer/inquiryChildOpportunityRows";
import { isUnlinkedInquiryChildRowId } from "@/lib/admin/drawer/inquiryChildrenHydration";
import { personDrawerSeedFromInquiryChildRow, type PersonDrawerOpenSeed } from "@/lib/admin/drawer/personDrawerOpenSeed";

export type InquiryChildRowLike = {
    person_id?: string | null;
    customer_member_id?: string | null;
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
    desired_program_label?: string | null;
    location_label?: string | null;
    outcome_status_label?: string | null;
};

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

export { findInquiryChildInOpportunityRecord };

/** Resolve canonical person id for drawer open — row first, then opportunity inquiry block. */
export function resolveInquiryChildOpenPersonId(
    opportunityRecord: Record<string, unknown>,
    row: InquiryChildRowLike
): string | null {
    const direct = trimId(row.person_id);
    if (direct) return direct;

    const cmId = trimId(row.customer_member_id);
    if (!cmId || cmId.startsWith("metadata_child:")) return null;

    const match = findInquiryChildInOpportunityRecord(opportunityRecord, { customerMemberId: cmId });
    return trimId(match?.person_id);
}

export function inquiryChildRowFromOpportunityRecord(
    opportunityRecord: Record<string, unknown>,
    row: InquiryChildRowLike
): InquiryChildRowLike {
    const match = findInquiryChildInOpportunityRecord(opportunityRecord, {
        personId: row.person_id,
        customerMemberId: row.customer_member_id,
    });
    if (!match) return row;
    return {
        person_id: trimId(match.person_id) ?? row.person_id,
        customer_member_id: trimId(match.customer_member_id) ?? row.customer_member_id,
        display_name: trimId(match.display_name) ?? row.display_name,
        first_name: trimId(match.first_name) ?? row.first_name,
        last_name: trimId(match.last_name) ?? row.last_name,
        dob: trimId(match.dob) ?? row.dob,
        desired_program_label: trimId(match.desired_program_label) ?? row.desired_program_label,
        location_label: trimId(match.location_label) ?? row.location_label,
        outcome_status_label: trimId(match.outcome_status_label) ?? row.outcome_status_label,
    };
}

export function buildInquiryChildPersonOpenSeed(
    opportunityRecord: Record<string, unknown>,
    row: InquiryChildRowLike,
    personId: string
): PersonDrawerOpenSeed {
    const merged = inquiryChildRowFromOpportunityRecord(opportunityRecord, row);
    return personDrawerSeedFromInquiryChildRow(merged, personId);
}

export function isSyntheticInquiryChildMemberId(customerMemberId: string | null | undefined): boolean {
    const cm = trimId(customerMemberId);
    if (!cm) return true;
    if (cm.startsWith("metadata_child:")) return true;
    if (isUnlinkedInquiryChildRowId(cm)) return false;
    return false;
}

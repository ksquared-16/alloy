import { assertAddInquiryChildCreationResult } from "@/lib/admin/actions/addInquiryChildActionContract";
import { logAddChildDevTrace } from "@/lib/admin/actions/logAddChildDevTrace";
import { ensureOpportunityCustomerMemberLink } from "@/lib/admin/drawer/inquiryChildFieldEdit";
import type { InquiryChildOcmPatch } from "@/lib/admin/drawer/inquiryChildFieldEdit";
import { patchOpportunityCustomerMemberFromInquiryChild } from "@/lib/admin/drawer/inquiryChildFieldEdit";

export type AddInquiryChildSubmitPayload = {
    first_name: string;
    last_name: string;
    date_of_birth?: string | null;
    program?: string | null;
    location_id?: string | null;
    program_room_cohort_key?: string | null;
    age_group?: string | null;
    desired_schedule_type?: string | null;
    desired_start_date?: string | null;
};

export type InquiryChildRowForDuplicateCheck = {
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
};

export function validateAddInquiryChildSubmitPayload(payload: AddInquiryChildSubmitPayload): string | null {
    const first = payload.first_name.trim();
    const last = payload.last_name.trim();
    if (!first || !last) {
        return "First and last name are required.";
    }
    const dob = payload.date_of_birth?.trim() ?? "";
    const ageGroup = payload.age_group?.trim() ?? "";
    if (!dob && !ageGroup) {
        return "Enter date of birth or age group so we can place the child correctly.";
    }
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        return "Date of birth must be YYYY-MM-DD.";
    }
    const start = payload.desired_start_date?.trim() ?? "";
    if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
        return "Desired start date must be YYYY-MM-DD.";
    }
    return null;
}

function normalizeNamePart(v: string | null | undefined): string {
    return String(v ?? "").trim().toLowerCase();
}

/** Prevent duplicate child rows on the same inquiry when identity matches. */
export function findDuplicateInquiryChild(
    existing: InquiryChildRowForDuplicateCheck[],
    payload: AddInquiryChildSubmitPayload
): boolean {
    const fn = normalizeNamePart(payload.first_name);
    const ln = normalizeNamePart(payload.last_name);
    const dob = payload.date_of_birth?.trim() ?? "";
    return existing.some((row) => {
        if (normalizeNamePart(row.first_name) !== fn || normalizeNamePart(row.last_name) !== ln) {
            return false;
        }
        const rowDob = String(row.dob ?? "").trim().slice(0, 10);
        if (dob && rowDob) return rowDob === dob;
        return true;
    });
}

export type SubmitAddInquiryChildInput = {
    opportunityId: string;
    customerId: string;
    payload: AddInquiryChildSubmitPayload;
    /** Lead/opportunity location — inherited when child form omits location_id. */
    opportunityLocationId?: string | null;
    existingChildren?: InquiryChildRowForDuplicateCheck[];
    fetchFn?: typeof fetch;
};

export type SubmitAddInquiryChildResult = {
    person_id: string;
    customer_member_id: string;
    ocm_id: string;
};

export async function submitAddInquiryChildFromDrawer(
    input: SubmitAddInquiryChildInput
): Promise<SubmitAddInquiryChildResult> {
    const fetchImpl = input.fetchFn ?? fetch;
    const validationError = validateAddInquiryChildSubmitPayload(input.payload);
    if (validationError) throw new Error(validationError);

    if (
        input.existingChildren?.length &&
        findDuplicateInquiryChild(input.existingChildren, input.payload)
    ) {
        throw new Error("A child with this name is already on this inquiry.");
    }

    const first = input.payload.first_name.trim();
    const last = input.payload.last_name.trim();
    const display_name = [first, last].filter(Boolean).join(" ").trim();
    const dob = input.payload.date_of_birth?.trim() || null;
    const program = input.payload.program?.trim() || null;
    const ageGroup = input.payload.age_group?.trim() || null;

    const cmRes = await fetchImpl("/api/admin/customer-members", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            customer_id: input.customerId,
            display_name,
            relationship: "child",
            first_name: first,
            last_name: last,
            dob,
            is_active: true,
            metadata: ageGroup ? { age_group: ageGroup, source: "add_inquiry_child" } : { source: "add_inquiry_child" },
        }),
    });
    const cmJson = (await cmRes.json().catch(() => ({}))) as {
        id?: string;
        person_id?: string | null;
        customer_id?: string;
        relationship?: string | null;
        is_active?: boolean;
        error?: string;
    };
    if (!cmRes.ok || !cmJson.id) {
        throw new Error(cmJson.error ?? "Could not create child record.");
    }
    const customerMemberId = String(cmJson.id);
    const personId = String(cmJson.person_id ?? "").trim();
    if (!personId) {
        throw new Error("Child was saved but is missing a linked person identity.");
    }
    logAddChildDevTrace("[action.add_child:customer_member_created]", {
        opportunityId: input.opportunityId,
        customerMemberId,
        personId,
        customer_id: cmJson.customer_id ?? input.customerId,
        relationship: cmJson.relationship ?? "child",
        is_active: cmJson.is_active ?? true,
        display_name,
        householdMatch: String(cmJson.customer_id ?? input.customerId) === input.customerId,
    });

    const { ocmId } = await ensureOpportunityCustomerMemberLink({
        opportunityId: input.opportunityId,
        customerMemberId,
    });
    logAddChildDevTrace("[action.add_child:ocm_linked]", {
        opportunityId: input.opportunityId,
        customerMemberId,
        ocmId,
    });

    const ocmPatch: InquiryChildOcmPatch = {};
    if (program) ocmPatch.desired_program_type = program;
    const locationId =
        input.payload.location_id?.trim() || input.opportunityLocationId?.trim() || "";
    if (locationId) ocmPatch.location_id = locationId;
    const roomKey = input.payload.program_room_cohort_key?.trim();
    if (roomKey) ocmPatch.program_room_cohort_key = roomKey;
    const schedule = input.payload.desired_schedule_type?.trim();
    if (schedule) ocmPatch.desired_schedule_type = schedule;
    const start = input.payload.desired_start_date?.trim();
    if (start) ocmPatch.desired_start_date = start;

    if (Object.keys(ocmPatch).length > 0) {
        await patchOpportunityCustomerMemberFromInquiryChild(ocmId, ocmPatch);
    }

    return assertAddInquiryChildCreationResult({
        person_id: personId,
        customer_member_id: customerMemberId,
        ocm_id: ocmId,
    });
}

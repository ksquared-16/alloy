import {
    PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY,
    PERSON_DRAWER_CHILD_START_DATE_KEY,
    personDrawerChildDateIsoFromRecord,
} from "@/lib/admin/person/personDrawerChildLifecycleFields";
import {
    personDrawerDobIsoFromRecord,
} from "@/lib/admin/person/patchPersonDrawerFields";
import { personDrawerGenderStoredValue } from "@/lib/admin/person/personDrawerGenderField";
import { resolvePersonDrawerParentSummaryModel } from "@/lib/admin/person/personDrawerParentSummaryModel";

export type ParentSummaryDraft = {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    preferred_contact_method: string;
    communication_opt_out: boolean;
};

export function parentSummaryDraftFromRecord(record: Record<string, unknown>): ParentSummaryDraft {
    const summary = resolvePersonDrawerParentSummaryModel(record);
    return {
        first_name: String(record.first_name ?? "").trim(),
        last_name: String(record.last_name ?? "").trim(),
        email: String(record.email ?? "").trim(),
        phone: String(record.phone ?? "").trim(),
        preferred_contact_method: summary.preferred_contact_method ?? "",
        communication_opt_out: summary.communication_opt_out,
    };
}

export function parentSummaryDraftIsDirty(
    record: Record<string, unknown>,
    draft: ParentSummaryDraft
): boolean {
    const baseline = parentSummaryDraftFromRecord(record);
    return (
        draft.first_name !== baseline.first_name ||
        draft.last_name !== baseline.last_name ||
        draft.email !== baseline.email ||
        draft.phone !== baseline.phone ||
        draft.preferred_contact_method !== baseline.preferred_contact_method ||
        draft.communication_opt_out !== baseline.communication_opt_out
    );
}

export function buildParentSummaryPatch(
    record: Record<string, unknown>,
    draft: ParentSummaryDraft
): Record<string, unknown> {
    const baseline = parentSummaryDraftFromRecord(record);
    const patch: Record<string, unknown> = {};
    if (draft.first_name !== baseline.first_name) patch.first_name = draft.first_name || null;
    if (draft.last_name !== baseline.last_name) patch.last_name = draft.last_name || null;
    if (draft.email !== baseline.email) patch.email = draft.email || null;
    if (draft.phone !== baseline.phone) patch.phone = draft.phone || null;
    if (draft.preferred_contact_method !== baseline.preferred_contact_method) {
        patch.preferred_contact_method = draft.preferred_contact_method || null;
    }
    if (draft.communication_opt_out !== baseline.communication_opt_out) {
        patch.communication_opt_out = draft.communication_opt_out;
    }
    return patch;
}

export type ChildSummaryDraft = {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    gender: string;
    enrollment_date: string;
    start_date: string;
};

export function childSummaryDraftFromRecord(record: Record<string, unknown>): ChildSummaryDraft {
    return {
        first_name: String(record.first_name ?? "").trim(),
        last_name: String(record.last_name ?? "").trim(),
        date_of_birth: personDrawerDobIsoFromRecord(record),
        gender: personDrawerGenderStoredValue(record),
        enrollment_date: personDrawerChildDateIsoFromRecord(record, PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY),
        start_date: personDrawerChildDateIsoFromRecord(record, PERSON_DRAWER_CHILD_START_DATE_KEY),
    };
}

export function childSummaryDraftIsDirty(
    record: Record<string, unknown>,
    draft: ChildSummaryDraft
): boolean {
    const baseline = childSummaryDraftFromRecord(record);
    return (
        draft.first_name !== baseline.first_name ||
        draft.last_name !== baseline.last_name ||
        draft.date_of_birth !== baseline.date_of_birth ||
        draft.gender !== baseline.gender ||
        draft.enrollment_date !== baseline.enrollment_date ||
        draft.start_date !== baseline.start_date
    );
}

export function buildChildSummaryPatch(
    record: Record<string, unknown>,
    draft: ChildSummaryDraft
): Record<string, unknown> {
    const baseline = childSummaryDraftFromRecord(record);
    const patch: Record<string, unknown> = {};
    if (draft.first_name !== baseline.first_name) patch.first_name = draft.first_name || null;
    if (draft.last_name !== baseline.last_name) patch.last_name = draft.last_name || null;
    if (draft.date_of_birth !== baseline.date_of_birth) patch.date_of_birth = draft.date_of_birth || null;
    if (draft.gender !== baseline.gender) patch.gender = draft.gender || null;
    if (draft.enrollment_date !== baseline.enrollment_date) {
        patch[PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY] = draft.enrollment_date || null;
    }
    if (draft.start_date !== baseline.start_date) {
        patch[PERSON_DRAWER_CHILD_START_DATE_KEY] = draft.start_date || null;
    }
    return patch;
}

/**
 * Child focus edit state — pure helpers for inquiry-child save from the Focus Panel.
 */

import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import {
    buildInquiryChildOcmPatchFromEditorLocal,
    buildPersonIdentityPatch,
    buildCustomerMemberPatch,
    inquiryChildIdentityHasChanges,
    resolveInquiryChildIdentityWriteTarget,
    type InquiryChildIdentityPatch,
    type InquiryChildOcmPatch,
} from "@/lib/admin/drawer/inquiryChildFieldEdit";
import type { InquiryChildRow } from "@/components/admin/entity/OpportunityInquiryChildrenSection";
import type {
    ChildFocusEditValueKey,
    ChildFocusEditValues,
} from "@/lib/adminV2/runtime/focusPanel/children/childFocusFieldPolicy";

const VALUE_KEYS: ChildFocusEditValueKey[] = [
    "location_id",
    "program_category_id",
    "program_room_cohort_key",
    "schedule_type",
    "start_date",
    "dob",
];

function trimStr(value: unknown): string {
    if (value == null) return "";
    return String(value).trim();
}

function identityBaselineForRow(row: InquiryChildRow): InquiryChildIdentityPatch {
    const display = (row.display_name ?? "").trim();
    let first = (row.first_name ?? "").trim();
    let last = (row.last_name ?? "").trim();
    if (!first && !last && display) {
        const parts = display.split(/\s+/).filter(Boolean);
        first = parts[0] ?? "";
        last = parts.length > 1 ? parts.slice(1).join(" ") : "";
    }
    return {
        first_name: first,
        last_name: last,
        dob: row.dob ? String(row.dob).slice(0, 10) : "",
    };
}

export type ChildFocusEditSeed = {
    childId: string;
    row: InquiryChildRow;
    values: ChildFocusEditValues;
    identityBaseline: InquiryChildIdentityPatch;
};

export function findInquiryChildRow(
    truth: Record<string, unknown>,
    childId: string,
): InquiryChildRow | null {
    const id = childId.trim();
    if (!id) return null;
    const rows = mapRawInquiryChildrenToDrawerRows((truth._inquiry_children as unknown[]) ?? []);
    return rows.find((r) => r.id === id || (r.person_id ?? "").trim() === id) ?? null;
}

/** Seed editable child focus values from observed inquiry-child truth. */
export function seedChildFocusEditValues(truth: Record<string, unknown>, childId: string): ChildFocusEditSeed | null {
    const row = findInquiryChildRow(truth, childId);
    if (!row?.customer_member_id?.trim()) return null;
    return {
        childId: row.id,
        row,
        identityBaseline: identityBaselineForRow(row),
        values: {
            location_id: trimStr(row.location_id),
            program_category_id: trimStr(row.program_category_id),
            program_room_cohort_key: trimStr(row.program_room_cohort_key),
            schedule_type: trimStr(row.schedule_type),
            start_date: row.start_date ? String(row.start_date).slice(0, 10) : "",
            dob: row.dob ? String(row.dob).slice(0, 10) : "",
        },
    };
}

export function childFocusEditDirtyForPolicy(
    draft: ChildFocusEditValues,
    baseline: ChildFocusEditValues,
    editableKeys: ReadonlySet<ChildFocusEditValueKey>,
): boolean {
    return VALUE_KEYS.some((key) => editableKeys.has(key) && draft[key].trim() !== baseline[key].trim());
}

export type ChildFocusSavePatch = {
    identityPatch: InquiryChildIdentityPatch;
    ocmPatch: InquiryChildOcmPatch;
};

/** Build identity + OCM patches including only editable, changed fields. Pure. */
export function buildChildFocusSavePatch(args: {
    row: InquiryChildRow;
    draft: ChildFocusEditValues;
    baseline: ChildFocusEditValues;
    identityBaseline: InquiryChildIdentityPatch;
    editableKeys: ReadonlySet<ChildFocusEditValueKey>;
    opportunityStartDate?: string | null;
}): ChildFocusSavePatch {
    const identityDraft: InquiryChildIdentityPatch = {
        ...args.identityBaseline,
        dob: args.editableKeys.has("dob") ? args.draft.dob.trim() : args.identityBaseline.dob,
    };

    let identityPatch: InquiryChildIdentityPatch = {};
    if (args.editableKeys.has("dob") && inquiryChildIdentityHasChanges(identityDraft, args.identityBaseline)) {
        identityPatch = { dob: identityDraft.dob || null };
    }

    const local = {
        location_id: args.draft.location_id,
        program_room_cohort_key: args.draft.program_room_cohort_key,
        program_category_id: args.draft.program_category_id,
        schedule_type: args.draft.schedule_type,
        outcome_status_key: "",
        notes: "",
        desired_start_edit: args.draft.start_date,
        custom: {},
    };
    const editorBaseline = {
        location_id: args.baseline.location_id || null,
        program_category_id: args.baseline.program_category_id || null,
        program_room_cohort_key: args.baseline.program_room_cohort_key || null,
        schedule_type: args.baseline.schedule_type || null,
        start_date: args.baseline.start_date || null,
    };

    const fullOcmPatch = buildInquiryChildOcmPatchFromEditorLocal({
        row: editorBaseline,
        local,
        opportunityStartDate: args.opportunityStartDate,
    });

    const ocmPatch: InquiryChildOcmPatch = {};
    if (args.editableKeys.has("location_id") && fullOcmPatch.location_id !== undefined) {
        ocmPatch.location_id = fullOcmPatch.location_id;
    }
    if (args.editableKeys.has("program_category_id") && fullOcmPatch.program_category_id !== undefined) {
        ocmPatch.program_category_id = fullOcmPatch.program_category_id;
    }
    if (args.editableKeys.has("program_room_cohort_key") && fullOcmPatch.program_room_cohort_key !== undefined) {
        ocmPatch.program_room_cohort_key = fullOcmPatch.program_room_cohort_key;
    }
    if (args.editableKeys.has("schedule_type") && fullOcmPatch.schedule_type !== undefined) {
        ocmPatch.schedule_type = fullOcmPatch.schedule_type;
    }
    if (args.editableKeys.has("start_date") && fullOcmPatch.start_date !== undefined) {
        ocmPatch.start_date = fullOcmPatch.start_date;
    }

    return { identityPatch, ocmPatch };
}

/** Canonical write target for DOB on this inquiry row (for tests / diagnostics). */
export function childFocusDobWriteTarget(row: InquiryChildRow): "person" | "customer_member" {
    return resolveInquiryChildIdentityWriteTarget(row);
}

/** Normalize identity patch to API body for person vs customer_member writes. */
export function childFocusIdentityApiPatch(
    row: InquiryChildRow,
    identityPatch: InquiryChildIdentityPatch,
    identityBaseline: InquiryChildIdentityPatch,
): Record<string, unknown> {
    const draft = { ...identityBaseline, ...identityPatch };
    if (resolveInquiryChildIdentityWriteTarget(row) === "person") {
        return buildPersonIdentityPatch(draft, identityBaseline);
    }
    return buildCustomerMemberPatch(draft, identityBaseline);
}

/**
 * Layout runtime child / inquiry_child related-list field edits.
 */

import { normalizeRefKeyOnRead } from "@/lib/layout/layoutRefKeyAliases";
import {
    buildInquiryChildOcmPatchFromEditorLocal,
    patchInquiryChildIdentityFromDrawer,
    patchOpportunityCustomerMemberFromInquiryChild,
    resolveInquiryChildOcmId,
    type InquiryChildIdentityPatch,
    type InquiryChildOcmPatch,
} from "@/lib/admin/drawer/inquiryChildFieldEdit";
import { readLayoutRuntimeRepeaterFieldRaw } from "@/lib/layout/runtime/resolveLayoutRuntimeRepeaterFieldValue";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const CHILD_IDENTITY_REF_KEYS = {
    "child.first_name": "first_name",
    "child.last_name": "last_name",
    "child.date_of_birth": "dob",
} as const;

const INQUIRY_CHILD_OCM_REF_KEYS = {
    "inquiry_child.desired_program_type": "desired_program_type",
    "inquiry_child.desired_schedule_type": "desired_schedule_type",
    "inquiry_child.desired_start_date": "desired_start_date",
    "inquiry_child.outcome_status_key": "outcome_status_key",
    "inquiry_child.location_id": "location_id",
    "inquiry_child.program_room_cohort_key": "program_room_cohort_key",
    "inquiry_child.notes": "notes",
} as const;

export type LayoutRuntimeChildIdentityFieldKey = keyof typeof CHILD_IDENTITY_REF_KEYS;
export type LayoutRuntimeInquiryChildOcmFieldKey = keyof typeof INQUIRY_CHILD_OCM_REF_KEYS;

export const LAYOUT_RUNTIME_CHILD_EDITABLE_REF_KEYS = [
    ...Object.keys(CHILD_IDENTITY_REF_KEYS),
    ...Object.keys(INQUIRY_CHILD_OCM_REF_KEYS),
] as const;

export function isLayoutRuntimeChildIdentityRefKey(refKey: string): refKey is LayoutRuntimeChildIdentityFieldKey {
    return refKey in CHILD_IDENTITY_REF_KEYS;
}

export function isLayoutRuntimeInquiryChildOcmRefKey(refKey: string): refKey is LayoutRuntimeInquiryChildOcmFieldKey {
    return refKey in INQUIRY_CHILD_OCM_REF_KEYS;
}

/** Computed display-only — never editable in layout runtime. */
export function isLayoutRuntimeChildComputedReadOnlyRefKey(refKey: string): boolean {
    return refKey === "child.full_name" || refKey === "child.name" || refKey === "child.display_name";
}

export function isLayoutRuntimeChildEditableRefKey(refKey: string): boolean {
    if (isLayoutRuntimeChildComputedReadOnlyRefKey(refKey)) return false;
    const normalized = normalizeRefKeyOnRead(refKey);
    return (
        isLayoutRuntimeChildIdentityRefKey(normalized as LayoutRuntimeChildIdentityFieldKey)
        || isLayoutRuntimeInquiryChildOcmRefKey(normalized as LayoutRuntimeInquiryChildOcmFieldKey)
    );
}

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

export function layoutRuntimeChildRowSaveContext(row: ProofRuntimeRecord): {
    customerMemberId: string;
    personId: string | null;
    ocmId: string | null;
} | null {
    const customerMemberId =
        trimId(row.customer_member_id)
        ?? trimId(row["child.customer_member_id"]);
    if (!customerMemberId) return null;
    return {
        customerMemberId,
        personId: trimId(row.person_id) ?? trimId(row["child.id"]),
        ocmId: resolveInquiryChildOcmId({
            id: String(row.id ?? row.ocm_id ?? ""),
            customer_member_id: customerMemberId,
            ocm_id: trimId(row.ocm_id),
        }),
    };
}

function identityPatchFromDraft(
    baseline: Record<string, string>,
    draft: Record<string, string>,
    rowKey: string,
): InquiryChildIdentityPatch {
    const read = (refKey: LayoutRuntimeChildIdentityFieldKey) => {
        const key = `${rowKey}::${refKey}`;
        return draft[key] ?? baseline[key] ?? "";
    };
    return {
        first_name: read("child.first_name"),
        last_name: read("child.last_name"),
        dob: read("child.date_of_birth").slice(0, 10),
    };
}

function identityBaselineFromDraftKeys(
    baseline: Record<string, string>,
    rowKey: string,
): InquiryChildIdentityPatch {
    const read = (refKey: LayoutRuntimeChildIdentityFieldKey) => baseline[`${rowKey}::${refKey}`] ?? "";
    return {
        first_name: read("child.first_name"),
        last_name: read("child.last_name"),
        dob: read("child.date_of_birth").slice(0, 10),
    };
}

function ocmPatchFromDraft(
    row: ProofRuntimeRecord,
    baseline: Record<string, string>,
    draft: Record<string, string>,
    rowKey: string,
): InquiryChildOcmPatch {
    const local = {
        location_id: draft[`${rowKey}::inquiry_child.location_id`] ?? baseline[`${rowKey}::inquiry_child.location_id`] ?? "",
        program_room_cohort_key:
            draft[`${rowKey}::inquiry_child.program_room_cohort_key`]
            ?? baseline[`${rowKey}::inquiry_child.program_room_cohort_key`]
            ?? "",
        desired_program_type:
            draft[`${rowKey}::inquiry_child.desired_program_type`]
            ?? baseline[`${rowKey}::inquiry_child.desired_program_type`]
            ?? "",
        desired_schedule_type:
            draft[`${rowKey}::inquiry_child.desired_schedule_type`]
            ?? baseline[`${rowKey}::inquiry_child.desired_schedule_type`]
            ?? "",
        outcome_status_key:
            draft[`${rowKey}::inquiry_child.outcome_status_key`]
            ?? baseline[`${rowKey}::inquiry_child.outcome_status_key`]
            ?? "",
        notes: draft[`${rowKey}::inquiry_child.notes`] ?? baseline[`${rowKey}::inquiry_child.notes`] ?? "",
        desired_start_edit:
            draft[`${rowKey}::inquiry_child.desired_start_date`]
            ?? baseline[`${rowKey}::inquiry_child.desired_start_date`]
            ?? "",
        custom: {},
    };
    const rowBaseline = {
        location_id: baseline[`${rowKey}::inquiry_child.location_id`] ?? readLayoutRuntimeRepeaterFieldRaw(row, "inquiry_child.location_id"),
        program_room_cohort_key:
            baseline[`${rowKey}::inquiry_child.program_room_cohort_key`]
            ?? readLayoutRuntimeRepeaterFieldRaw(row, "inquiry_child.program_room_cohort_key"),
        desired_program_type:
            baseline[`${rowKey}::inquiry_child.desired_program_type`]
            ?? readLayoutRuntimeRepeaterFieldRaw(row, "inquiry_child.desired_program_type"),
        desired_schedule_type:
            baseline[`${rowKey}::inquiry_child.desired_schedule_type`]
            ?? readLayoutRuntimeRepeaterFieldRaw(row, "inquiry_child.desired_schedule_type"),
        outcome_status_key:
            baseline[`${rowKey}::inquiry_child.outcome_status_key`]
            ?? readLayoutRuntimeRepeaterFieldRaw(row, "inquiry_child.outcome_status_key"),
        notes: baseline[`${rowKey}::inquiry_child.notes`] ?? readLayoutRuntimeRepeaterFieldRaw(row, "inquiry_child.notes"),
        desired_start_date:
            baseline[`${rowKey}::inquiry_child.desired_start_date`]
            ?? readLayoutRuntimeRepeaterFieldRaw(row, "inquiry_child.desired_start_date"),
        custom_fields: {},
    };
    return buildInquiryChildOcmPatchFromEditorLocal({
        row: rowBaseline as Parameters<typeof buildInquiryChildOcmPatchFromEditorLocal>[0]["row"],
        local,
    });
}

function rowHasChildDraftChanges(
    baseline: Record<string, string>,
    draft: Record<string, string>,
    rowKey: string,
): boolean {
    for (const refKey of LAYOUT_RUNTIME_CHILD_EDITABLE_REF_KEYS) {
        const key = `${rowKey}::${refKey}`;
        if ((draft[key] ?? "") !== (baseline[key] ?? "")) return true;
    }
    return false;
}

export async function saveLayoutRuntimeChildRepeaterEdits(input: {
    record: ProofRuntimeRecord;
    rows: ProofRuntimeRecord[];
    rowKeys: string[];
    baseline: Record<string, string>;
    draft: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const dirtyRowKeys = input.rowKeys.filter((rowKey) =>
        rowHasChildDraftChanges(input.baseline, input.draft, rowKey),
    );
    if (dirtyRowKeys.length === 0) return { ok: true };

    for (const rowKey of dirtyRowKeys) {
        const rowIndex = input.rowKeys.indexOf(rowKey);
        const row = input.rows[rowIndex];
        if (!row) continue;
        const ctx = layoutRuntimeChildRowSaveContext(row);
        if (!ctx) {
            return { ok: false, error: "Child row is missing customer member identity." };
        }

        const identityDraft = identityPatchFromDraft(input.baseline, input.draft, rowKey);
        const identityBaseline = identityBaselineFromDraftKeys(input.baseline, rowKey);
        try {
            await patchInquiryChildIdentityFromDrawer({
                row: { customer_member_id: ctx.customerMemberId, person_id: ctx.personId },
                draft: identityDraft,
                baseline: identityBaseline,
            });
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : "Child identity save failed" };
        }

        const ocmPatch = ocmPatchFromDraft(row, input.baseline, input.draft, rowKey);
        if (Object.keys(ocmPatch).length > 0) {
            if (!ctx.ocmId) {
                return { ok: false, error: "Enrollment participation row is not linked for OCM field save." };
            }
            try {
                await patchOpportunityCustomerMemberFromInquiryChild(ctx.ocmId, ocmPatch);
            } catch (err) {
                return { ok: false, error: err instanceof Error ? err.message : "Enrollment field save failed" };
            }
        }
    }

    return { ok: true };
}

export function collectLayoutRuntimeChildRepeaterBaselines(
    record: ProofRuntimeRecord,
    rowKeys: string[],
    rows: ProofRuntimeRecord[],
): Record<string, string> {
    const out: Record<string, string> = {};
    rows.forEach((row, index) => {
        const rowKey = rowKeys[index];
        if (!rowKey) return;
        for (const refKey of LAYOUT_RUNTIME_CHILD_EDITABLE_REF_KEYS) {
            const raw = readLayoutRuntimeRepeaterFieldRaw(row, refKey);
            out[`${rowKey}::${refKey}`] = raw == null ? "" : String(raw);
        }
    });
    void record;
    return out;
}

/**
 * Inquiry child row inline edits — PATCH canonical identity records (person when linked, else customer_member).
 * OCM join fields PATCH opportunity_customer_members only.
 */

import { patchLinkedPersonFromOpportunityDrawer } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { isUnlinkedInquiryChildRowId } from "@/lib/admin/drawer/inquiryChildrenHydration";

export type InquiryChildIdentityPatch = {
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
};

export type InquiryChildOcmPatch = {
    start_date?: string | null;
    location_id?: string | null;
    program_room_cohort_key?: string | null;
    program_category_id?: string | null;
    schedule_type?: string | null;
    outcome_status_key?: string | null;
    notes?: string | null;
    /** Requested days/week — number; empty clears via null. */
    requested_days_per_week?: number | null;
    tuition_plan_id?: string | null;
    quote_accepted?: boolean | null;
    weekdays?: number[] | null;
    [key: string]: string | number | boolean | number[] | null | undefined;
};

export type InquiryChildIdentityWriteTarget = "person" | "customer_member";

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/** Canonical write owner for child identity fields on an inquiry row. */
export function resolveInquiryChildIdentityWriteTarget(row: {
    person_id?: string | null;
}): InquiryChildIdentityWriteTarget {
    return trimId(row.person_id) ? "person" : "customer_member";
}

export function buildCustomerMemberPatch(
    draft: InquiryChildIdentityPatch,
    baseline: InquiryChildIdentityPatch
): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const key of ["first_name", "last_name", "dob"] as const) {
        const next = draft[key] ?? "";
        const prev = baseline[key] ?? "";
        if (String(next).trim() !== String(prev).trim()) {
            patch[key] = key === "dob" ? (String(next).trim() || null) : String(next).trim() || null;
        }
    }
    if (patch.first_name !== undefined || patch.last_name !== undefined) {
        const fn = String(patch.first_name ?? baseline.first_name ?? "").trim();
        const ln = String(patch.last_name ?? baseline.last_name ?? "").trim();
        patch.display_name = [fn, ln].filter(Boolean).join(" ").trim() || null;
    }
    return patch;
}

/** Person PATCH body for inquiry child identity (DOB stored as date_of_birth field value). */
export function buildPersonIdentityPatch(
    draft: InquiryChildIdentityPatch,
    baseline: InquiryChildIdentityPatch
): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const key of ["first_name", "last_name"] as const) {
        const next = draft[key] ?? "";
        const prev = baseline[key] ?? "";
        if (String(next).trim() !== String(prev).trim()) {
            patch[key] = String(next).trim() || null;
        }
    }
    const nextDob = draft.dob ?? "";
    const prevDob = baseline.dob ?? "";
    if (String(nextDob).trim() !== String(prevDob).trim()) {
        patch.date_of_birth = String(nextDob).trim() || null;
    }
    return patch;
}

/** Reconstruct full identity draft from row baseline + accumulated debounced patch keys. */
export function inquiryChildIdentityDraftFromPatch(
    baseline: InquiryChildIdentityPatch,
    patch: Record<string, unknown>
): InquiryChildIdentityPatch {
    return {
        first_name:
            patch.first_name !== undefined ? String(patch.first_name ?? "") : (baseline.first_name ?? ""),
        last_name: patch.last_name !== undefined ? String(patch.last_name ?? "") : (baseline.last_name ?? ""),
        dob:
            patch.dob !== undefined ?
                patch.dob ? String(patch.dob).slice(0, 10)
                :   ""
            :   (baseline.dob ?? ""),
    };
}

export function inquiryChildIdentityHasChanges(
    draft: InquiryChildIdentityPatch,
    baseline: InquiryChildIdentityPatch
): boolean {
    for (const key of ["first_name", "last_name", "dob"] as const) {
        if (String(draft[key] ?? "").trim() !== String(baseline[key] ?? "").trim()) return true;
    }
    return false;
}

export async function patchCustomerMemberFromInquiryChild(
    customerMemberId: string,
    patch: Record<string, unknown>
): Promise<Record<string, unknown>> {
    const res = await fetch(`/api/admin/customer-members/${encodeURIComponent(customerMemberId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Save failed");
    return json;
}

/**
 * PATCH canonical child identity from Inquiry Children inline edits.
 * Linked person rows write `persons` (+ field_values for DOB); unlinked rows write `customer_members`.
 */
export async function patchInquiryChildIdentityFromDrawer(args: {
    row: { customer_member_id: string; person_id?: string | null };
    draft: InquiryChildIdentityPatch;
    baseline: InquiryChildIdentityPatch;
    fetchFn?: typeof fetch;
}): Promise<{
    writeTarget: InquiryChildIdentityWriteTarget;
    patch: Record<string, unknown>;
    person?: Record<string, unknown>;
}> {
    const fetchImpl = args.fetchFn ?? fetch;
    const personId = trimId(args.row.person_id);
    if (personId) {
        const patch = buildPersonIdentityPatch(args.draft, args.baseline);
        if (Object.keys(patch).length === 0) {
            return { writeTarget: "person", patch: {} };
        }
        const result = await patchLinkedPersonFromOpportunityDrawer({
            personId,
            body: patch,
            fetchFn: fetchImpl,
        });
        if (!result.ok) throw new Error(result.error);
        return { writeTarget: "person", patch, person: result.json };
    }

    const patch = buildCustomerMemberPatch(args.draft, args.baseline);
    if (Object.keys(patch).length === 0) {
        return { writeTarget: "customer_member", patch: {} };
    }
    const res = await fetchImpl(`/api/admin/customer-members/${encodeURIComponent(args.row.customer_member_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Save failed");
    return { writeTarget: "customer_member", patch };
}

export async function ensureOpportunityCustomerMemberLink(args: {
    opportunityId: string;
    customerMemberId: string;
}): Promise<{ ocmId: string }> {
    const res = await fetch("/api/admin/opportunity-customer-members", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            opportunity_id: args.opportunityId,
            customer_member_id: args.customerMemberId,
        }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !json.id) throw new Error(json.error ?? "Could not link child to inquiry");
    return { ocmId: String(json.id) };
}

export async function patchOpportunityCustomerMemberFromInquiryChild(
    ocmId: string,
    patch: InquiryChildOcmPatch
): Promise<void> {
    const res = await fetch(`/api/admin/opportunity-customer-members/${encodeURIComponent(ocmId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Save failed");
}

/**
 * Participation-detail edit routed by lifecycle (process instance pre-materialization, durable model
 * post-materialization). Keyed by the child subject — never creates or writes OCM. Preferred over
 * patchOpportunityCustomerMemberFromInquiryChild for participation facts.
 */
export async function patchChildParticipation(args: {
    customerMemberId: string;
    opportunityId?: string | null;
    patch: InquiryChildOcmPatch;
    fetchFn?: typeof fetch;
}): Promise<void> {
    const res = await (args.fetchFn ?? fetch)("/api/admin/child-participation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            customer_member_id: args.customerMemberId,
            opportunity_id: args.opportunityId ?? null,
            patch: args.patch,
        }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Save failed");
}

export function resolveInquiryChildOcmId(row: {
    id: string;
    customer_member_id?: string;
    ocm_id?: string | null;
    linked_on_inquiry?: boolean;
}): string | null {
    if (row.ocm_id && String(row.ocm_id).trim()) return String(row.ocm_id).trim();
    if (isUnlinkedInquiryChildRowId(row.id)) return null;
    return row.id.trim() || null;
}

function normEditorKey(v: string | null | undefined): string {
    return (v ?? "").trim();
}

export type InquiryChildRowEditorLocal = {
    location_id: string;
    program_room_cohort_key: string;
    /** Program picker value = location_program_categories.id (the stored FK). */
    program_category_id: string;
    schedule_type: string;
    outcome_status_key: string;
    notes: string;
    desired_start_edit: string;
    custom: Record<string, string>;
};

export type InquiryChildRowEditorBaseline = {
    location_id?: string | null;
    program_room_cohort_key?: string | null;
    program_category_id?: string | null;
    schedule_type?: string | null;
    outcome_status_key?: string | null;
    notes?: string | null;
    start_date?: string | null;
    custom_fields?: Record<string, unknown> | null;
};

export function buildInquiryChildOcmPatchFromEditorLocal(args: {
    row: InquiryChildRowEditorBaseline;
    local: InquiryChildRowEditorLocal;
    opportunityStartDate?: string | null;
    customFieldKeys?: string[];
}): InquiryChildOcmPatch {
    const patch: InquiryChildOcmPatch = {};
    const pairs: Array<[keyof InquiryChildOcmPatch, string, string | null | undefined]> = [
        ["location_id", args.local.location_id, args.row.location_id],
        ["program_room_cohort_key", args.local.program_room_cohort_key, args.row.program_room_cohort_key],
        ["program_category_id", args.local.program_category_id, args.row.program_category_id],
        ["schedule_type", args.local.schedule_type, args.row.schedule_type],
        ["outcome_status_key", args.local.outcome_status_key, args.row.outcome_status_key],
        ["notes", args.local.notes, args.row.notes],
    ];
    for (const [key, nextRaw, prevRaw] of pairs) {
        const next = normEditorKey(nextRaw);
        const prev = normEditorKey(prevRaw ?? "");
        if (next !== prev) patch[key] = next || null;
    }

    const oppNorm = normEditorKey(
        args.opportunityStartDate ? String(args.opportunityStartDate).slice(0, 10) : ""
    );
    const nextStart = normEditorKey(args.local.desired_start_edit);
    const prevStart = normEditorKey(
        args.row.start_date ? String(args.row.start_date).slice(0, 10) : ""
    );
    const normalizedNext = !nextStart || nextStart === oppNorm ? null : nextStart;
    const normalizedPrev = !prevStart || prevStart === oppNorm ? null : prevStart;
    if (normalizedNext !== normalizedPrev) {
        patch.start_date = normalizedNext;
    }

    for (const fieldKey of args.customFieldKeys ?? []) {
        const next = normEditorKey(args.local.custom[fieldKey]);
        const prevRaw = args.row.custom_fields?.[fieldKey];
        const prev =
            prevRaw == null ? "" : typeof prevRaw === "string" ? prevRaw.trim() : String(prevRaw).trim();
        if (next !== prev) patch[fieldKey] = next || null;
    }

    return patch;
}

export function inquiryChildEditorRowIsDirty(args: {
    row: InquiryChildRowEditorBaseline;
    local: InquiryChildRowEditorLocal;
    identityDraft: InquiryChildIdentityPatch;
    identityBaseline: InquiryChildIdentityPatch;
    opportunityStartDate?: string | null;
    customFieldKeys?: string[];
}): boolean {
    if (inquiryChildIdentityHasChanges(args.identityDraft, args.identityBaseline)) return true;
    return Object.keys(
        buildInquiryChildOcmPatchFromEditorLocal({
            row: args.row,
            local: args.local,
            opportunityStartDate: args.opportunityStartDate,
            customFieldKeys: args.customFieldKeys,
        })
    ).length > 0;
}

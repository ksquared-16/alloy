/**
 * Inquiry child row inline edits — PATCH true source records (customer_member / person / OCM join).
 */

import { isUnlinkedInquiryChildRowId } from "@/lib/admin/drawer/inquiryChildrenHydration";

export type InquiryChildIdentityPatch = {
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
};

export type InquiryChildOcmPatch = {
    desired_start_date?: string | null;
    desired_program_type?: string | null;
    desired_schedule_type?: string | null;
    outcome_status_key?: string | null;
    notes?: string | null;
    [key: string]: string | null | undefined;
};

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

export async function ensureOpportunityCustomerMemberLink(args: {
    opportunityId: string;
    customerMemberId: string;
}): Promise<{ ocmId: string }> {
    const res = await fetch("/api/admin/opportunity-customer-members", {
        method: "POST",
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

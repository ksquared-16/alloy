import type { InquiryChildRowLike } from "@/lib/admin/drawer/inquiryChildPersonOpen";
import type { OpenDrawerParams } from "@/contexts/AdminDrawerContext";
import {
    buildInquiryChildPersonOpenSeed,
    isSyntheticInquiryChildMemberId,
    resolveInquiryChildOpenPersonId,
} from "@/lib/admin/drawer/inquiryChildPersonOpen";
import { openViewPersonFromOpportunity } from "@/lib/admin/drawer/openViewPersonFromOpportunity";
import {
    cachePersonDrawerChildOpenSeed,
    PERSON_DRAWER_CHILD_OPEN_SOURCE,
    type PersonDrawerOpenSeed,
} from "@/lib/admin/drawer/personDrawerOpenSeed";

export type OpenDrawerFromOpportunityFn = (params: OpenDrawerParams) => void;

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

async function fetchCustomerMemberPersonId(customerMemberId: string): Promise<string | null> {
    const res = await fetch(`/api/admin/customer-members/${encodeURIComponent(customerMemberId)}`, {
        credentials: "include",
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { person_id?: unknown } | null;
    return trimId(json?.person_id);
}

/**
 * Open a child person drawer from an opportunity inquiry child row.
 * Resolves canonical person_id, stamps child-lifecycle seed (even on cache hit), and never falls back to generic person chrome.
 */
export async function openInquiryChildPersonFromOpportunity(args: {
    openDrawer: OpenDrawerFromOpportunityFn;
    opportunityRecord: Record<string, unknown>;
    opportunityId: string;
    row: InquiryChildRowLike;
}): Promise<boolean> {
    const cmId = trimId(args.row.customer_member_id);
    if (!cmId || isSyntheticInquiryChildMemberId(cmId)) {
        return false;
    }

    let personId = resolveInquiryChildOpenPersonId(args.opportunityRecord, args.row);
    if (!personId) {
        personId = await fetchCustomerMemberPersonId(cmId);
    }
    if (!personId) {
        return false;
    }

    const openSeed: PersonDrawerOpenSeed = buildInquiryChildPersonOpenSeed(
        args.opportunityRecord,
        args.row,
        personId
    );

    cachePersonDrawerChildOpenSeed(personId, openSeed);

    return openViewPersonFromOpportunity({
        openDrawer: args.openDrawer,
        personId,
        opportunityId: args.opportunityId,
        source: PERSON_DRAWER_CHILD_OPEN_SOURCE,
        openSeed,
    });
}

/** Fire-and-forget wrapper for click handlers — logs resolution failures in dev only. */
export function openInquiryChildPersonFromOpportunitySync(
    args: Parameters<typeof openInquiryChildPersonFromOpportunity>[0]
): void {
    void openInquiryChildPersonFromOpportunity(args).catch((err) => {
        if (process.env.NODE_ENV !== "production") {
            console.warn("[inquiry-child-open]", err);
        }
    });
}

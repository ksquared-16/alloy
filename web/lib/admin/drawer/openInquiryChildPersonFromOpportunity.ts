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
import { buildPrepareParamsFromOpenDrawer } from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import { prepareDrawerViewModelDeduped } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import {
    DRAWER_LINK_OPEN_FAILED_MESSAGE,
    drawerLinkPendingKeyForChildFromOpportunity,
    drawerLinkPendingKeyForInquiryChildRow,
    type DrawerLinkPendingActions,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerLinkPending";
import { logDrawerHardTrace } from "@/lib/adminV2/drawer/drawerHardTrace";

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
    opportunityWorkspaceContext?: { work_unit_id: string; department_id: string } | null;
    linkPending?: DrawerLinkPendingActions;
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

    const prepareParams = buildPrepareParamsFromOpenDrawer({
        type: "persons",
        id: personId,
        source: PERSON_DRAWER_CHILD_OPEN_SOURCE,
        personDrawerOpenSeed: openSeed,
        opportunityWorkspaceContext: args.opportunityWorkspaceContext ?? null,
    });
    const pendingKey =
        drawerLinkPendingKeyForInquiryChildRow({
            opportunityRecord: args.opportunityRecord,
            row: args.row,
            opportunityId: args.opportunityId,
            opportunityWorkspaceContext: args.opportunityWorkspaceContext ?? null,
        }) ??
        drawerLinkPendingKeyForChildFromOpportunity({
            personId,
            opportunityId: args.opportunityId,
            openSeed,
            opportunityWorkspaceContext: args.opportunityWorkspaceContext ?? null,
        });

    logDrawerHardTrace("child_click", "lib/admin/drawer/openInquiryChildPersonFromOpportunity.ts", {
        person_id: personId,
        opportunity_id: args.opportunityId,
        open_source: PERSON_DRAWER_CHILD_OPEN_SOURCE,
        presentation_emphasis: openSeed.presentation_emphasis ?? null,
        pending_key: pendingKey,
        customer_member_id: cmId,
    });

    void prepareDrawerViewModelDeduped(prepareParams)
        .then((preload) => {
            logDrawerHardTrace("child_open_prepare", "lib/admin/drawer/openInquiryChildPersonFromOpportunity.ts", {
                person_id: personId,
                preload_ready: Boolean(preload),
                cache_key: pendingKey,
            });
        })
        .catch((err) => {
            logDrawerHardTrace("child_open_prepare", "lib/admin/drawer/openInquiryChildPersonFromOpportunity.ts", {
                person_id: personId,
                preload_ready: false,
                error: err instanceof Error ? err.message : String(err),
            });
        });

    const opened = openViewPersonFromOpportunity({
        openDrawer: args.openDrawer,
        personId,
        opportunityId: args.opportunityId,
        source: PERSON_DRAWER_CHILD_OPEN_SOURCE,
        openSeed,
        opportunityWorkspaceContext: args.opportunityWorkspaceContext ?? null,
        linkPending: args.linkPending,
    });
    if (!opened) {
        args.linkPending?.fail(pendingKey, DRAWER_LINK_OPEN_FAILED_MESSAGE);
    }
    return opened;
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

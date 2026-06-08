import type { OpenDrawerParams } from "@/contexts/AdminDrawerContext";
import { buildInquiryChildPersonOpenSeed } from "@/lib/admin/drawer/inquiryChildPersonOpen";
import type { InquiryChildRowLike } from "@/lib/admin/drawer/inquiryChildPersonOpen";
import { resolveInquiryChildOpenPersonId } from "@/lib/admin/drawer/inquiryChildPersonOpen";
import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { drawerViewModelCacheKeyForOpenParams } from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";

export const DRAWER_LINK_OPEN_FAILED_MESSAGE = "Couldn't open record. Try again.";

export type DrawerLinkPendingActions = {
    begin: (pendingKey: string) => void;
    fail: (pendingKey: string, message?: string) => void;
    isPending?: (pendingKey: string) => boolean;
};

export function drawerLinkPendingKeyFromOpenParams(params: OpenDrawerParams): string {
    return (
        drawerViewModelCacheKeyForOpenParams(params) ??
        `${params.type}:${params.id.trim()}:${params.source ?? ""}`
    );
}

export function drawerLinkPendingKeyForPersonFromOpportunity(args: {
    personId: string;
    opportunityId: string;
    source?: string;
    openSeed?: OpenDrawerParams["personDrawerOpenSeed"];
    opportunityWorkspaceContext?: OpenDrawerParams["opportunityWorkspaceContext"];
}): string {
    return drawerLinkPendingKeyFromOpenParams({
        type: "persons",
        id: args.personId.trim(),
        source: args.source ?? "opportunity_primary_contact",
        parent: { type: "opportunities", id: args.opportunityId.trim() },
        personDrawerOpenSeed: args.openSeed ?? null,
        opportunityWorkspaceContext: args.opportunityWorkspaceContext ?? null,
    });
}

export function drawerLinkPendingKeyForChildFromOpportunity(args: {
    personId: string;
    opportunityId: string;
    openSeed?: OpenDrawerParams["personDrawerOpenSeed"];
    opportunityWorkspaceContext?: OpenDrawerParams["opportunityWorkspaceContext"];
}): string {
    return drawerLinkPendingKeyFromOpenParams({
        type: "persons",
        id: args.personId.trim(),
        source: PERSON_DRAWER_CHILD_OPEN_SOURCE,
        parent: { type: "opportunities", id: args.opportunityId.trim() },
        personDrawerOpenSeed: args.openSeed ?? null,
        opportunityWorkspaceContext: args.opportunityWorkspaceContext ?? null,
    });
}

export function drawerLinkPendingKeyForInquiryChildRow(args: {
    opportunityRecord: Record<string, unknown>;
    row: InquiryChildRowLike;
    opportunityId: string;
    opportunityWorkspaceContext?: OpenDrawerParams["opportunityWorkspaceContext"];
}): string | null {
    const opportunityId = args.opportunityId.trim();
    if (!opportunityId) return null;
    const personId =
        resolveInquiryChildOpenPersonId(args.opportunityRecord, args.row) ??
        String(args.row.person_id ?? "").trim();
    if (!personId) return null;
    const openSeed = buildInquiryChildPersonOpenSeed(args.opportunityRecord, args.row, personId);
    return drawerLinkPendingKeyForChildFromOpportunity({
        personId,
        opportunityId,
        openSeed,
        opportunityWorkspaceContext: args.opportunityWorkspaceContext ?? null,
    });
}

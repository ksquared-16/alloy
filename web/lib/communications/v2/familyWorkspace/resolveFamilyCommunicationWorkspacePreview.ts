import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveCustomerStageLabelFromOpportunities } from "@/lib/admin/drawer/resolveOpportunityStatusLabelsBatch";
import { loadFamilyWorkspaceData } from "./loadFamilyWorkspaceData";
import { loadFamilyThreadsData } from "./loadFamilyThreadsData";
import { assembleFamilyWorkspace } from "./assembleFamilyWorkspace";
import { resolveCustomerScopeFromEntity } from "./resolveCustomerScopeFromEntity";
import {
    FAMILY_WORKSPACE_PREVIEW_VERSION,
    type ComposerChannel,
    type FamilyCommunicationWorkspacePreviewVM,
} from "./types";

type AdminSupabase = ReturnType<typeof createAdminClient>;

export type ResolveFamilyCommunicationWorkspacePreviewOptions = {
    customerId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    focusChildId?: string | null;
    focusOpportunityId?: string | null;
    focusPersonId?: string | null;
    composerChannel?: ComposerChannel;
    viewerUserId?: string | null;
    familyStageLabel?: string | null;
};

const PREVIEW_THREAD_CAP = 8;
const PREVIEW_TIMELINE_CAP = 24;

export async function resolveFamilyCommunicationWorkspacePreview(
    supabase: AdminSupabase,
    orgId: string,
    opts: ResolveFamilyCommunicationWorkspacePreviewOptions
): Promise<FamilyCommunicationWorkspacePreviewVM | null> {
    let customerId = opts.customerId?.trim() || null;
    let focusChildId = opts.focusChildId ?? null;
    let focusOpportunityId = opts.focusOpportunityId ?? null;
    let focusPersonId = opts.focusPersonId ?? null;

    if (!customerId && opts.entityType?.trim() && opts.entityId?.trim()) {
        const scope = await resolveCustomerScopeFromEntity(
            supabase,
            orgId,
            opts.entityType.trim(),
            opts.entityId.trim()
        );
        customerId = scope.customerId;
        focusChildId = focusChildId || scope.focusChildId;
        focusOpportunityId = focusOpportunityId || scope.focusOpportunityId;
        focusPersonId = focusPersonId || scope.focusPersonId;
    }
    if (!customerId) return null;

    const raw = await loadFamilyWorkspaceData(supabase, orgId, customerId);
    const personIds = [
        ...raw.members.map((m) => m.person_id),
        ...raw.customerPersons.map((c) => c.person_id),
        ...raw.opportunityPersons.map((o) => o.person_id),
    ].filter((x): x is string => typeof x === "string" && x.length > 0);
    const opportunityIds = raw.opportunities.map((o) => o.id).filter(Boolean);
    const resolvedFocusOpportunityId = focusOpportunityId ?? raw.opportunities[0]?.id ?? null;
    const familyStageLabel =
        opts.familyStageLabel ??
        resolveCustomerStageLabelFromOpportunities(customerId, raw.opportunities, new Map(), resolvedFocusOpportunityId);

    const comms = await loadFamilyThreadsData(supabase, orgId, {
        customerId,
        personIds,
        opportunityIds,
        viewerUserId: opts.viewerUserId ?? null,
    });

    const workspace = assembleFamilyWorkspace(
        raw,
        {
            customerId,
            focusChildId,
            focusOpportunityId: resolvedFocusOpportunityId,
            focusPersonId,
            composerChannel: opts.composerChannel ?? "email",
            viewerUserId: opts.viewerUserId ?? null,
            familyStageLabel,
            relatedTasks: [],
        },
        comms
    );

    return {
        version: FAMILY_WORKSPACE_PREVIEW_VERSION,
        family: workspace.family,
        children: workspace.children,
        recipientGroups: workspace.recipientGroups,
        eligibleRecipients: workspace.eligibleRecipients,
        disabledRecipients: workspace.disabledRecipients,
        selectedRecipients: workspace.selectedRecipients,
        composerDraft: workspace.composerDraft,
        scope: workspace.scope,
        recentThreads: workspace.threads.slice(0, PREVIEW_THREAD_CAP),
        recentTimelineEvents: workspace.timelineEvents.slice(-PREVIEW_TIMELINE_CAP),
    };
}

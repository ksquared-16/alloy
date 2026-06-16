// UI-5A — resolver = load (I/O) + pure assemble.
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    resolveCustomerStageLabelFromOpportunities,
    resolveOpportunityStatusLabelsBatch,
} from "@/lib/admin/drawer/resolveOpportunityStatusLabelsBatch";
import { loadFamilyWorkspaceData } from "./loadFamilyWorkspaceData";
import { loadFamilyThreadsData } from "./loadFamilyThreadsData";
import { assembleFamilyWorkspace, type ResolveFamilyWorkspaceOptions } from "./assembleFamilyWorkspace";
import type { FamilyCommunicationWorkspaceVM } from "./types";

type AdminSupabase = ReturnType<typeof createAdminClient>;

export { assembleFamilyWorkspace, type ResolveFamilyWorkspaceOptions };

export async function resolveFamilyCommunicationWorkspace(
    supabase: AdminSupabase,
    orgId: string,
    opts: ResolveFamilyWorkspaceOptions
): Promise<FamilyCommunicationWorkspaceVM> {
    const raw = await loadFamilyWorkspaceData(supabase, orgId, opts.customerId);
    const personIds = [
        ...raw.members.map((m) => m.person_id),
        ...raw.customerPersons.map((c) => c.person_id),
        ...raw.opportunityPersons.map((o) => o.person_id),
    ].filter((x): x is string => typeof x === "string" && x.length > 0);
    const opportunityIds = raw.opportunities.map((o) => o.id).filter(Boolean);
    const statusByOpportunity = await resolveOpportunityStatusLabelsBatch(supabase, orgId, raw.opportunities);
    const familyStageLabel = resolveCustomerStageLabelFromOpportunities(
        opts.customerId,
        raw.opportunities,
        statusByOpportunity,
        opts.focusOpportunityId ?? raw.opportunities[0]?.id ?? null
    );
    const comms = await loadFamilyThreadsData(supabase, orgId, { customerId: opts.customerId, personIds, opportunityIds, viewerUserId: opts.viewerUserId ?? null });
    return assembleFamilyWorkspace(raw, { ...opts, familyStageLabel }, comms);
}

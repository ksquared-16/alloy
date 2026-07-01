// UI-5A — resolver = load (I/O) + pure assemble.
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    resolveCustomerStageLabelFromOpportunities,
    resolveOpportunityStatusLabelsBatch,
} from "@/lib/admin/drawer/resolveOpportunityStatusLabelsBatch";
import { loadPersonCommunicationPreferencesBundle } from "@/lib/communications/v2/loadCommunicationPreferences";
import { listOperationalTasksForEntity } from "@/lib/admin/operationalTasksService";
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
    const recipientPersonIds = Array.from(
        new Set([
            ...raw.customerPersons.map((c) => c.person_id),
            ...raw.opportunityPersons.map((o) => o.person_id),
        ].filter((x): x is string => typeof x === "string" && x.length > 0))
    );
    const opportunityIds = raw.opportunities.map((o) => o.id).filter(Boolean);
    const focusOpportunityId = opts.focusOpportunityId ?? raw.opportunities[0]?.id ?? null;

    const [statusByOpportunity, preferencesBundle, comms, relatedTasksResult] = await Promise.all([
        resolveOpportunityStatusLabelsBatch(supabase, orgId, raw.opportunities),
        loadPersonCommunicationPreferencesBundle(supabase, orgId, recipientPersonIds),
        loadFamilyThreadsData(supabase, orgId, {
            customerId: opts.customerId,
            personIds,
            opportunityIds,
            viewerUserId: opts.viewerUserId ?? null,
        }),
        focusOpportunityId
            ? listOperationalTasksForEntity({
                  supabase,
                  orgId,
                  entityType: "opportunities",
                  entityId: focusOpportunityId,
              })
            : Promise.resolve({ ok: true as const, rows: [] }),
    ]);

    const familyStageLabel = resolveCustomerStageLabelFromOpportunities(
        opts.customerId,
        raw.opportunities,
        statusByOpportunity,
        focusOpportunityId
    );
    const relatedTasks =
        relatedTasksResult.ok === true
            ? relatedTasksResult.rows
                  .filter((t) => t.status === "open")
                  .slice(0, 10)
                  .map((t) => ({ id: t.id, title: t.title, dueAt: t.due_at, status: t.status }))
            : [];

    return assembleFamilyWorkspace(
        raw,
        {
            ...opts,
            focusOpportunityId,
            familyStageLabel,
            preferencesByContact: preferencesBundle.byContact,
            preferenceProfilesByContact: preferencesBundle.profilesByContact,
            relatedTasks,
        },
        comms
    );
}

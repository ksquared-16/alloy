// UI-5A — resolver = load (I/O) + pure assemble.
import { createAdminClient } from "@/lib/supabaseAdmin";
import { loadFamilyWorkspaceData } from "./loadFamilyWorkspaceData";
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
    return assembleFamilyWorkspace(raw, opts);
}

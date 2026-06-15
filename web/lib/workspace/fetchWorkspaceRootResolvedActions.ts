import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";

/** Client fetch for /workspace root command-rail actions (`surface=workspace`). */
export async function fetchWorkspaceRootResolvedActions(params?: {
    fetchInit?: RequestInit;
}): Promise<ResolvedActionForClient[]> {
    const route = "/api/admin/actions/workspace-root-bundle";
    const res = await dedupeAdminFetchWithTtl(route, params?.fetchInit ?? {}, 8000);
    if (!res.ok) return [];
    const j = (await res.json().catch(() => ({}))) as { actions?: ResolvedActionForClient[] };
    return Array.isArray(j.actions) ? j.actions : [];
}

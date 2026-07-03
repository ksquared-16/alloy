import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";

/**
 * Client fetch for the /workspace root configured actions (`surface=workspace` + shared
 * `right_rail`). Feeds the persistent command rail's "Actions" section on the workspace surface,
 * symmetric to the Work Unit rail. Deduped + TTL-cached.
 */
export async function fetchWorkspaceRootResolvedActions(params?: {
    fetchInit?: RequestInit;
}): Promise<ResolvedActionForClient[]> {
    const route = "/api/admin/actions/workspace-root-bundle";
    const res = await dedupeAdminFetchWithTtl(route, params?.fetchInit ?? {}, 30000);
    if (!res.ok) return [];
    const json = (await res.json().catch(() => ({}))) as { actions?: ResolvedActionForClient[] };
    return Array.isArray(json.actions) ? json.actions : [];
}

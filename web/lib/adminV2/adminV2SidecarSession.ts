import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { isAdminV2SidecarNetworkBlocked } from "@/lib/perf/adminV2PrimarySurfaceGate";
import { recordAdminV2JankBudgetRequest } from "@/lib/perf/adminV2JankBudget";

export const ADMIN_V2_SIDECAR_TTL_MS = 60_000;

export type AdminV2SidecarEndpoint =
    | "operational_tasks_summary"
    | "agent_activity"
    | "workflow_assist_capabilities"
    | "config_layout_assist_capabilities";

const ENDPOINT_URL: Record<AdminV2SidecarEndpoint, string> = {
    operational_tasks_summary: "/api/admin/operational-tasks?scope=workspace&summary=true",
    agent_activity: "/api/admin/agent/v1/activity?limit=3",
    workflow_assist_capabilities: "/api/admin/ai/workflow-assist/capabilities",
    config_layout_assist_capabilities: "/api/admin/ai/config-layout-assist/capabilities",
};

type CacheEntry = {
    atMs: number;
    status: number;
    statusText: string;
    headers: [string, string][];
    bodyText: string;
};

const cache = new Map<AdminV2SidecarEndpoint, CacheEntry>();
const inflight = new Map<AdminV2SidecarEndpoint, Promise<Response>>();

function responseFromEntry(entry: CacheEntry): Response {
    return new Response(entry.bodyText, {
        status: entry.status,
        statusText: entry.statusText,
        headers: entry.headers,
    });
}

async function storeResponse(endpoint: AdminV2SidecarEndpoint, res: Response): Promise<Response> {
    const clone = res.clone();
    const bodyText = await clone.text();
    cache.set(endpoint, {
        atMs: Date.now(),
        status: res.status,
        statusText: res.statusText,
        headers: Array.from(res.headers.entries()),
        bodyText,
    });
    return new Response(bodyText, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
    });
}

/**
 * One in-flight GET per sidecar endpoint; 60s TTL; blocked during WU/drawer primary work.
 */
export async function fetchAdminV2Sidecar(
    endpoint: AdminV2SidecarEndpoint,
    init?: RequestInit
): Promise<Response> {
    const url = ENDPOINT_URL[endpoint];
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") {
        return fetch(url, { ...workspaceDataFetchInit(), ...init });
    }

    if (isAdminV2SidecarNetworkBlocked()) {
        const hit = cache.get(endpoint);
        if (hit && Date.now() - hit.atMs < ADMIN_V2_SIDECAR_TTL_MS) {
            return responseFromEntry(hit);
        }
        recordAdminV2JankBudgetRequest({
            phase: "sidecar_blocked",
            url,
            endpoint,
            note: "primary_surface_pending_no_cache",
        });
        return new Response(JSON.stringify({ ok: false, blocked: true, counts: { open: 0, due_soon: 0, overdue: 0 } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }

    const hit = cache.get(endpoint);
    if (hit && Date.now() - hit.atMs < ADMIN_V2_SIDECAR_TTL_MS) {
        recordAdminV2JankBudgetRequest({ phase: "sidecar_cache_hit", url, endpoint });
        return responseFromEntry(hit);
    }

    let p = inflight.get(endpoint);
    if (!p) {
        recordAdminV2JankBudgetRequest({ phase: "sidecar_fetch", url, endpoint });
        p = fetch(url, { ...workspaceDataFetchInit(), ...init })
            .then((res) => storeResponse(endpoint, res))
            .finally(() => {
                inflight.delete(endpoint);
            });
        inflight.set(endpoint, p);
    } else {
        recordAdminV2JankBudgetRequest({ phase: "sidecar_inflight_join", url, endpoint });
    }

    return p.then((res) => res.clone());
}

export function resetAdminV2SidecarSessionForTests(): void {
    cache.clear();
    inflight.clear();
}

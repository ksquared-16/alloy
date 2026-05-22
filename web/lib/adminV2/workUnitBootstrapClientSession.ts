import { appendWorkspaceSiteToUrl } from "@/lib/adminV2/workspaceSiteFilterClient";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

const BOOTSTRAP_TTL_MS = 12_000;
const completedKeys = new Set<string>();
const inflightKeys = new Set<string>();

export type WorkUnitBootstrapRequestParams = {
    departmentId: string;
    workUnitId: string;
    selectedSiteId: string | null;
    focusQueue?: string;
    attentionBucket?: string;
    /** When true, server skips KPI + right-rail bundle on the critical path. */
    deferBundle?: boolean;
};

export function buildWorkUnitOperationalBootstrapClientUrl(params: WorkUnitBootstrapRequestParams): string {
    const qs = new URLSearchParams({
        department_id: params.departmentId,
        include_previews: "false",
        count_mode: "exact",
        summary_mode: "all",
        limit: "3",
        omit_total_count: "true",
        primary_row_limit: "20",
    });
    const focus = (params.focusQueue ?? "").trim();
    if (focus) qs.set("focus_queue", focus);
    const bucket = (params.attentionBucket ?? "").trim();
    if (bucket) qs.set("attention_bucket", bucket);
    if (params.deferBundle !== false) qs.set("defer_bundle", "true");
    const base = `/api/admin/work-units/${encodeURIComponent(params.workUnitId)}/operational-bootstrap?${qs.toString()}`;
    return appendWorkspaceSiteToUrl(base, params.selectedSiteId);
}

export function workUnitBootstrapSessionKey(params: WorkUnitBootstrapRequestParams): string {
    return [
        params.departmentId,
        params.workUnitId,
        params.selectedSiteId ?? "",
        (params.focusQueue ?? "").trim(),
        (params.attentionBucket ?? "").trim(),
        params.deferBundle === false ? "full" : "critical",
    ].join("|");
}

export function clearWorkUnitBootstrapSessionForEntity(departmentId: string, workUnitId: string): void {
    const prefix = `${departmentId}|${workUnitId}|`;
    for (const key of [...completedKeys]) {
        if (key.startsWith(prefix)) completedKeys.delete(key);
    }
    for (const key of [...inflightKeys]) {
        if (key.startsWith(prefix)) inflightKeys.delete(key);
    }
}

export function resetWorkUnitBootstrapClientSession(): void {
    completedKeys.clear();
    inflightKeys.clear();
}

export type FetchWorkUnitBootstrapResult = {
    response: Response;
    sessionKey: string;
    duplicateSuppressed: boolean;
    cacheHit: boolean;
};

function logWuRoutePerf(event: string, detail: Record<string, unknown>): void {
    if (typeof window === "undefined") return;
    console.info("[wu-route-perf]", { event, ...detail });
}

/**
 * One canonical bootstrap GET per session key (route load). Coalesces StrictMode double-mount,
 * prefetch + page, and overlapping effects via URL TTL dedupe.
 */
export async function fetchWorkUnitOperationalBootstrapSession(
    params: WorkUnitBootstrapRequestParams
): Promise<FetchWorkUnitBootstrapResult> {
    const sessionKey = workUnitBootstrapSessionKey(params);
    const url = buildWorkUnitOperationalBootstrapClientUrl(params);
    const init = workspaceDataFetchInit();

    if (completedKeys.has(sessionKey)) {
        logWuRoutePerf("bootstrap_duplicate_suppressed", { sessionKey, url });
        const response = await dedupeAdminFetchWithTtl(url, init, BOOTSTRAP_TTL_MS);
        return { response, sessionKey, duplicateSuppressed: true, cacheHit: true };
    }

    if (inflightKeys.has(sessionKey)) {
        logWuRoutePerf("bootstrap_inflight_join", { sessionKey, url });
        const response = await dedupeAdminFetchWithTtl(url, init, BOOTSTRAP_TTL_MS);
        return { response, sessionKey, duplicateSuppressed: true, cacheHit: false };
    }

    inflightKeys.add(sessionKey);
    logWuRoutePerf("bootstrap_request_start", { sessionKey, url });
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    try {
        const response = await dedupeAdminFetchWithTtl(url, init, BOOTSTRAP_TTL_MS);
        completedKeys.add(sessionKey);
        logWuRoutePerf("bootstrap_request_end", {
            sessionKey,
            url,
            status: response.status,
            ms: typeof performance !== "undefined" ? Math.round(performance.now() - t0) : null,
        });
        return { response, sessionKey, duplicateSuppressed: false, cacheHit: false };
    } finally {
        inflightKeys.delete(sessionKey);
    }
}

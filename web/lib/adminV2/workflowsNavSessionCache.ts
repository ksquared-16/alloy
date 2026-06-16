import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export const WORKFLOWS_NAV_SESSION_TTL_MS = 60_000;

const SUMMARY_URL = "/api/admin/workflows/summary";
const KPIS_URL = "/api/admin/workflow-runs?list=kpis";
const RUNS_7D_URL = "/api/admin/workflow-runs?range=7d&limit=100";

type CacheEntry = {
    atMs: number;
    status: number;
    bodyText: string;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

function isFresh(entry: CacheEntry | undefined): entry is CacheEntry {
    return Boolean(entry && Date.now() - entry.atMs < WORKFLOWS_NAV_SESSION_TTL_MS);
}

function responseFromEntry(entry: CacheEntry): Response {
    return new Response(entry.bodyText, {
        status: entry.status,
        headers: { "Content-Type": "application/json" },
    });
}

async function fetchAndStore(url: string, init?: RequestInit): Promise<CacheEntry> {
    const res = await fetch(url, { ...workspaceDataFetchInit(), ...init });
    const bodyText = await res.text();
    const entry: CacheEntry = { atMs: Date.now(), status: res.status, bodyText };
    cache.set(url, entry);
    return entry;
}

async function fetchWorkflowsNavEndpoint(
    url: string,
    init?: RequestInit,
    options?: { force?: boolean }
): Promise<Response> {
    if (!options?.force) {
        const hit = cache.get(url);
        if (isFresh(hit)) {
            void fetchAndStore(url, init).catch(() => {
                /* stale-while-revalidate — keep showing cached payload */
            });
            return responseFromEntry(hit);
        }
    }

    const existing = inflight.get(url);
    if (existing && !options?.force) {
        const entry = await existing;
        return responseFromEntry(entry);
    }

    const promise = fetchAndStore(url, init).finally(() => {
        if (inflight.get(url) === promise) inflight.delete(url);
    });
    inflight.set(url, promise);
    const entry = await promise;
    return responseFromEntry(entry);
}

export function peekWorkflowsNavSummaryBody(): string | null {
    const hit = cache.get(SUMMARY_URL);
    return isFresh(hit) ? hit.bodyText : null;
}

export function peekWorkflowsNavKpisBody(): string | null {
    const hit = cache.get(KPIS_URL);
    return isFresh(hit) ? hit.bodyText : null;
}

export function fetchWorkflowsNavSummary(init?: RequestInit, options?: { force?: boolean }): Promise<Response> {
    return fetchWorkflowsNavEndpoint(SUMMARY_URL, init, options);
}

export function fetchWorkflowsNavKpis(init?: RequestInit, options?: { force?: boolean }): Promise<Response> {
    return fetchWorkflowsNavEndpoint(KPIS_URL, init, options);
}

export function fetchWorkflowsNavRuns7d(init?: RequestInit, options?: { force?: boolean }): Promise<Response> {
    return fetchWorkflowsNavEndpoint(RUNS_7D_URL, init, options);
}

/** Test-only reset. */
export function resetWorkflowsNavSessionCacheForTests(): void {
    cache.clear();
    inflight.clear();
}

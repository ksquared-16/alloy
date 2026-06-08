/** Shared timeout for admin workspace client fetches — avoids one stalled request blocking UI forever. */
export const WORKSPACE_DATA_FETCH_MS = 45_000;

export function workspaceDataFetchInit(opts?: { cache?: RequestCache }): RequestInit | undefined {
    const timeout = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
    const cache = opts?.cache;
    if (typeof timeout === "function") {
        return { signal: timeout(WORKSPACE_DATA_FETCH_MS), ...(cache ? { cache } : {}) };
    }
    return cache ? { cache } : undefined;
}

/** Lifecycle catalog must reflect latest department metadata after admin cleanup. */
export function lifecycleCatalogFetchInit(): RequestInit {
    return workspaceDataFetchInit({ cache: "no-store" }) ?? { cache: "no-store" };
}

/** Shared timeout for admin workspace client fetches — avoids one stalled request blocking UI forever. */
export const WORKSPACE_DATA_FETCH_MS = 45_000;

export function workspaceDataFetchInit(): RequestInit | undefined {
    const timeout = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
    if (typeof timeout === "function") {
        return { signal: timeout(WORKSPACE_DATA_FETCH_MS) };
    }
    return undefined;
}

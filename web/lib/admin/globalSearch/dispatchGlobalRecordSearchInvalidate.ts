/** Clears AdminV2 global search dropdown results after record deletion. */
export const ADMINV2_GLOBAL_RECORD_SEARCH_INVALIDATE_EVENT = "adminv2:global-record-search-invalidate";

export function dispatchGlobalRecordSearchInvalidate(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(ADMINV2_GLOBAL_RECORD_SEARCH_INVALIDATE_EVENT));
}

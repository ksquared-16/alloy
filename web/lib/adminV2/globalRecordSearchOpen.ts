import type { GlobalRecordSearchEntityType } from "@/lib/admin/globalSearch/globalRecordSearchTypes";

export const ADMINV2_GLOBAL_SEARCH_OPEN_RECORD_EVENT = "adminv2:global-search-open-record";

export const GLOBAL_RECORD_SEARCH_OPEN_INTENT_KEY = "adminv2_global_search_open_intent";

export type GlobalRecordSearchOpenDetail = {
    entity_type: GlobalRecordSearchEntityType;
    entity_id: string;
};

export type GlobalRecordSearchOpenIntent = GlobalRecordSearchOpenDetail & {
    stored_at: number;
};

const DRAWER_HOST_PREFIXES = ["/adminV2/workspace", "/admin/v2/workspace", "/adminV2/settings", "/admin/v2/settings", "/adminV2/forms", "/admin/v2/forms"];

export function adminV2PathHasDrawerHost(pathname: string): boolean {
    const p = pathname.trim();
    return DRAWER_HOST_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

export function readGlobalRecordSearchOpenIntent(): GlobalRecordSearchOpenIntent | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.sessionStorage.getItem(GLOBAL_RECORD_SEARCH_OPEN_INTENT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as GlobalRecordSearchOpenIntent;
        if (!parsed?.entity_type || !parsed?.entity_id) return null;
        if (Date.now() - (parsed.stored_at ?? 0) > 60_000) {
            window.sessionStorage.removeItem(GLOBAL_RECORD_SEARCH_OPEN_INTENT_KEY);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function storeGlobalRecordSearchOpenIntent(detail: GlobalRecordSearchOpenDetail): void {
    if (typeof window === "undefined") return;
    const payload: GlobalRecordSearchOpenIntent = {
        ...detail,
        stored_at: Date.now(),
    };
    window.sessionStorage.setItem(GLOBAL_RECORD_SEARCH_OPEN_INTENT_KEY, JSON.stringify(payload));
}

export function clearGlobalRecordSearchOpenIntent(): void {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(GLOBAL_RECORD_SEARCH_OPEN_INTENT_KEY);
}

export function dispatchGlobalRecordSearchOpen(detail: GlobalRecordSearchOpenDetail): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent<GlobalRecordSearchOpenDetail>(ADMINV2_GLOBAL_SEARCH_OPEN_RECORD_EVENT, { detail })
    );
}

/** Open a global-search hit — event on drawer hosts, else stash intent and return workspace path. */
export function launchGlobalRecordSearchOpen(detail: GlobalRecordSearchOpenDetail): string | null {
    const entity_id = detail.entity_id.trim();
    const entity_type = detail.entity_type;
    if (!entity_id || typeof window === "undefined") return null;

    const normalized = { entity_type, entity_id };

    if (adminV2PathHasDrawerHost(window.location.pathname)) {
        dispatchGlobalRecordSearchOpen(normalized);
        return null;
    }

    storeGlobalRecordSearchOpenIntent(normalized);
    return "/adminV2/workspace";
}

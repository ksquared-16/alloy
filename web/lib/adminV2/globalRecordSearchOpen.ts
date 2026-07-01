import type { GlobalSearchAdminV2DrawerEntityType } from "@/lib/admin/globalSearch/globalRecordSearchDrawerTarget";
import type { GlobalRecordSearchHit } from "@/lib/admin/globalSearch/globalRecordSearchTypes";
import type { GlobalRecordSearchCluster } from "@/lib/admin/globalSearch/globalRecordSearchTypes";
import type { PersonDrawerOpenSeed } from "@/lib/admin/drawer/personDrawerOpenSeed";
import {
    ADMIN_FORMS_HREF,
    ADMIN_SETTINGS_SUBPATH_PREFIX,
    CANONICAL_ADMIN_WORKSPACE,
    CANONICAL_OPERATOR_BASE,
    canonicalAdminHref,
} from "@/lib/admin/canonicalAdminRoutes";
import { OPERATOR_WORKSPACE_HREF } from "@/lib/admin/canonicalOperatorRoutes";
import { ADMINV2_SHELL_CHROME_Z } from "@/components/admin/Drawer";

export type GlobalRecordSearchOpenDetail = {
    open_entity_type: GlobalSearchAdminV2DrawerEntityType;
    open_entity_id: string;
    personDrawerOpenSeed?: PersonDrawerOpenSeed | null;
};

export const GLOBAL_SEARCH_DRAWER_OPEN_SOURCE = "global_search";

/** Dropdown stacks above portaled drawer panel (70) within shell chrome (100). */
export const GLOBAL_SEARCH_DROPDOWN_Z_INDEX = ADMINV2_SHELL_CHROME_Z + 5;

export const ADMINV2_GLOBAL_SEARCH_OPEN_RECORD_EVENT = "adminv2:global-search-open-record";

export const GLOBAL_RECORD_SEARCH_OPEN_INTENT_KEY = "adminv2_global_search_open_intent";

export type GlobalRecordSearchOpenIntent = GlobalRecordSearchOpenDetail & {
    stored_at: number;
};

const DRAWER_HOST_PREFIXES = [
    CANONICAL_OPERATOR_BASE,
    CANONICAL_ADMIN_WORKSPACE,
    ADMIN_SETTINGS_SUBPATH_PREFIX,
    ADMIN_FORMS_HREF,
    "/admin/v2/workspace",
    "/admin/v2/settings",
    "/adminV2/forms",
    "/admin/v2/forms",
] as const;

export function adminV2PathHasDrawerHost(pathname: string): boolean {
    const raw = pathname.trim();
    if (
        raw === OPERATOR_WORKSPACE_HREF ||
        raw.startsWith(`${OPERATOR_WORKSPACE_HREF}/`) ||
        raw.startsWith("/adminV2/workspace") ||
        raw.startsWith("/admin/v2/workspace") ||
        raw.startsWith(`${CANONICAL_ADMIN_WORKSPACE}/`) ||
        raw === CANONICAL_ADMIN_WORKSPACE
    ) {
        return true;
    }
    const p = canonicalAdminHref(raw);
    return DRAWER_HOST_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

export function readGlobalRecordSearchOpenIntent(): GlobalRecordSearchOpenIntent | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.sessionStorage.getItem(GLOBAL_RECORD_SEARCH_OPEN_INTENT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as GlobalRecordSearchOpenIntent;
        if (!parsed?.open_entity_type || !parsed?.open_entity_id) return null;
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

/** Open resolved AdminV2 drawer target — never legacy member/contact drawers. */
export function launchGlobalRecordSearchOpen(detail: GlobalRecordSearchOpenDetail): string | null {
    const entity_id = detail.open_entity_id.trim();
    const entity_type = detail.open_entity_type;
    if (!entity_id || typeof window === "undefined") return null;

    if (adminV2PathHasDrawerHost(window.location.pathname)) {
        dispatchGlobalRecordSearchOpen(detail);
        return null;
    }

    storeGlobalRecordSearchOpenIntent(detail);
    return OPERATOR_WORKSPACE_HREF;
}

export function flattenGlobalSearchClustersForKeyboard(
    clusters: GlobalRecordSearchCluster[],
    locationHits: GlobalRecordSearchHit[] = []
): GlobalRecordSearchHit[] {
    const out: GlobalRecordSearchHit[] = [];
    for (const cluster of clusters) {
        out.push(...cluster.anchors, ...cluster.children, ...cluster.parents);
    }
    out.push(...locationHits);
    return out;
}

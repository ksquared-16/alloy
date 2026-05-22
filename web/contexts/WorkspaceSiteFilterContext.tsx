"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    clearWorkspaceSiteSession,
    isAllowedWorkspaceSiteId,
    readWorkspaceSiteFromLocationSearch,
    readWorkspaceSiteSession,
    registerWorkspaceSiteFilterPersistenceScope,
    replaceWorkspaceSiteInBrowserUrl,
    resolveStickyWorkspaceSiteId,
    setLiveStickyWorkspaceSiteId,
    writeWorkspaceSiteSession,
    type WorkspaceSiteFilterPersistenceScope,
} from "@/lib/adminV2/workspaceSiteFilterClient";

export type WorkspaceSiteFilterBootstrap = {
    site_scope: string;
    sites: Array<{ id: string; label: string }>;
    show_dropdown: boolean;
    single_site_label: string | null;
};

type WorkspaceSiteFilterContextValue = {
    bootstrap: WorkspaceSiteFilterBootstrap | null;
    loadError: string | null;
    /** null = all allowed sites */
    selectedSiteId: string | null;
    /** False until URL/session sticky site is applied (avoids bootstrap without then with site). */
    siteSelectionReady: boolean;
    setSelectedSiteId: (id: string | null) => void;
};

const WorkspaceSiteFilterContext = createContext<WorkspaceSiteFilterContextValue | null>(null);

export function WorkspaceSiteFilterProvider({ children }: { children: ReactNode }) {
    const [bootstrap, setBootstrap] = useState<WorkspaceSiteFilterBootstrap | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedSiteId, setSelectedSiteIdState] = useState<string | null>(null);
    const [siteSelectionReady, setSiteSelectionReady] = useState(false);
    const hydratedRef = useRef(false);
    const scopeRef = useRef<WorkspaceSiteFilterPersistenceScope | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const init = workspaceDataFetchInit();
                const res = await dedupeAdminFetchWithTtl("/api/admin/workspace/site-filter", init ?? {}, 15000);
                const j = (await res.json().catch(() => ({}))) as WorkspaceSiteFilterBootstrap & { error?: string };
                if (cancelled) return;
                if (!res.ok) {
                    setLoadError(typeof j.error === "string" ? j.error : "Failed to load site filter");
                    setBootstrap(null);
                    setSiteSelectionReady(true);
                    return;
                }
                setLoadError(null);
                setBootstrap({
                    site_scope: j.site_scope ?? "all",
                    sites: Array.isArray(j.sites) ? j.sites : [],
                    show_dropdown: j.show_dropdown === true,
                    single_site_label: typeof j.single_site_label === "string" ? j.single_site_label : null,
                });
            } catch {
                if (!cancelled) {
                    setLoadError("Failed to load site filter");
                    setBootstrap(null);
                    setSiteSelectionReady(true);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const applyValidatedSite = useCallback(
        (siteId: string | null, sites: Array<{ id: string }>, syncUrl: boolean) => {
            const allowed = sites ?? [];
            const valid =
                siteId && isAllowedWorkspaceSiteId(siteId, allowed) ? siteId.trim() : null;
            setSelectedSiteIdState(valid);
            setLiveStickyWorkspaceSiteId(valid);
            const scope = scopeRef.current;
            if (scope?.orgId) {
                if (valid) writeWorkspaceSiteSession(scope, valid);
                else clearWorkspaceSiteSession(scope);
            }
            if (syncUrl) replaceWorkspaceSiteInBrowserUrl(valid);
        },
        []
    );

    const hydrateFromUrlAndSession = useCallback(
        (sites: Array<{ id: string }>, syncUrl: boolean) => {
            if (typeof window === "undefined") return;
            const urlSiteId = readWorkspaceSiteFromLocationSearch(window.location.search);
            const scope = scopeRef.current;
            const sessionSiteId = scope?.orgId ? readWorkspaceSiteSession(scope) : null;
            const resolved = resolveStickyWorkspaceSiteId({
                urlSiteId,
                sessionSiteId,
                allowedSites: sites,
            });
            const urlInvalid = Boolean(urlSiteId?.trim()) && !resolved;
            applyValidatedSite(resolved, sites, syncUrl || urlInvalid);
        },
        [applyValidatedSite]
    );

    useEffect(() => {
        if (!bootstrap?.sites) return;
        hydrateFromUrlAndSession(bootstrap.sites, !hydratedRef.current);
        hydratedRef.current = true;
        setSiteSelectionReady(true);
    }, [bootstrap, hydrateFromUrlAndSession]);

    useEffect(() => {
        if (bootstrap && (!bootstrap.sites || bootstrap.sites.length === 0)) {
            setSiteSelectionReady(true);
        }
    }, [bootstrap]);

    useEffect(() => {
        const onScope = (ev: Event) => {
            const detail = (ev as CustomEvent<WorkspaceSiteFilterPersistenceScope>).detail;
            if (detail) scopeRef.current = detail;
            if (!bootstrap?.sites?.length) return;
            hydrateFromUrlAndSession(bootstrap.sites, false);
        };
        window.addEventListener("alloy-workspace-site-filter-scope", onScope);
        return () => window.removeEventListener("alloy-workspace-site-filter-scope", onScope);
    }, [bootstrap, hydrateFromUrlAndSession]);

    const setSelectedSiteId = useCallback(
        (id: string | null) => {
            const sites = bootstrap?.sites ?? [];
            const trimmed = id?.trim() || "";
            const next =
                trimmed && sites.length && isAllowedWorkspaceSiteId(trimmed, sites) ? trimmed : null;
            applyValidatedSite(next, sites, true);
        },
        [applyValidatedSite, bootstrap?.sites]
    );

    const value = useMemo(
        () => ({
            bootstrap,
            loadError,
            selectedSiteId,
            siteSelectionReady,
            setSelectedSiteId,
        }),
        [bootstrap, loadError, selectedSiteId, siteSelectionReady, setSelectedSiteId]
    );

    return <WorkspaceSiteFilterContext.Provider value={value}>{children}</WorkspaceSiteFilterContext.Provider>;
}

/** Called by layout bridge when org scope is known — re-triggers hydrate with session key. */
export function notifyWorkspaceSiteFilterPersistenceScope(scope: WorkspaceSiteFilterPersistenceScope): void {
    registerWorkspaceSiteFilterPersistenceScope(scope);
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("alloy-workspace-site-filter-scope", { detail: scope }));
    }
}

export function useWorkspaceSiteFilter(): WorkspaceSiteFilterContextValue | null {
    return useContext(WorkspaceSiteFilterContext);
}

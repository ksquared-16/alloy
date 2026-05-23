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
import {
    readWorkspaceSiteFilterBootstrapCache,
    writeWorkspaceSiteFilterBootstrapCache,
    workspaceSiteFilterBootstrapScopeKey,
} from "@/lib/adminV2/workspaceSiteFilterBootstrapCache";
import { logPrefetchAdminV2 } from "@/lib/adminV2/adminV2PrefetchInstrumentation";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    clearWorkspaceSiteSession,
    getRegisteredWorkspaceSiteFilterScope,
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
    /** True while a background refresh is in flight (bootstrap may still be shown from cache). */
    revalidating: boolean;
    /** null = all allowed sites */
    selectedSiteId: string | null;
    siteSelectionReady: boolean;
    setSelectedSiteId: (id: string | null) => void;
};

const WorkspaceSiteFilterContext = createContext<WorkspaceSiteFilterContextValue | null>(null);

const SITE_FILTER_URL = "/api/admin/workspace/site-filter";
const SITE_FILTER_DEDUPE_TTL_MS = 15_000;

function normalizeBootstrap(j: WorkspaceSiteFilterBootstrap & { error?: string }): WorkspaceSiteFilterBootstrap {
    return {
        site_scope: j.site_scope ?? "all",
        sites: Array.isArray(j.sites) ? j.sites : [],
        show_dropdown: j.show_dropdown === true,
        single_site_label: typeof j.single_site_label === "string" ? j.single_site_label : null,
    };
}

/**
 * App-shell-owned site filter — cached per org/principal/scope; stale-while-revalidate.
 * Route reveal gates must not wait on this fetch.
 */
export function WorkspaceSiteFilterProvider({ children }: { children: ReactNode }) {
    const scopeRef = useRef<WorkspaceSiteFilterPersistenceScope | null>(null);
    const hydratedRef = useRef(false);
    const fetchGenRef = useRef(0);

    const [bootstrap, setBootstrap] = useState<WorkspaceSiteFilterBootstrap | null>(() =>
        readWorkspaceSiteFilterBootstrapCache(getRegisteredWorkspaceSiteFilterScope())
    );
    const [loadError, setLoadError] = useState<string | null>(null);
    const [revalidating, setRevalidating] = useState(() => bootstrap == null);
    const [selectedSiteId, setSelectedSiteIdState] = useState<string | null>(null);
    const [siteSelectionReady, setSiteSelectionReady] = useState(
        () => bootstrap != null || getRegisteredWorkspaceSiteFilterScope() != null
    );

    const loadBootstrap = useCallback(async (scope: WorkspaceSiteFilterPersistenceScope | null, reason: string) => {
        const gen = ++fetchGenRef.current;
        const cached = readWorkspaceSiteFilterBootstrapCache(scope);
        if (cached) {
            setBootstrap(cached);
            setSiteSelectionReady(true);
            logPrefetchAdminV2("workspace", "hit", { cache: "site_filter_bootstrap", reason });
        } else {
            logPrefetchAdminV2("workspace", "miss", { cache: "site_filter_bootstrap", reason });
        }
        setRevalidating(true);
        try {
            const init = workspaceDataFetchInit() ?? {};
            const res = await dedupeAdminFetchWithTtl(SITE_FILTER_URL, init, SITE_FILTER_DEDUPE_TTL_MS);
            const j = (await res.json().catch(() => ({}))) as WorkspaceSiteFilterBootstrap & { error?: string };
            if (gen !== fetchGenRef.current) return;
            if (!res.ok) {
                setLoadError(typeof j.error === "string" ? j.error : "Failed to load site filter");
                if (!cached) setBootstrap(null);
                setSiteSelectionReady(true);
                return;
            }
            const next = normalizeBootstrap(j);
            setLoadError(null);
            setBootstrap(next);
            writeWorkspaceSiteFilterBootstrapCache(scope, next);
            logPrefetchAdminV2("workspace", "complete", { cache: "site_filter_bootstrap", reason });
        } catch {
            if (gen !== fetchGenRef.current) return;
            setLoadError("Failed to load site filter");
            if (!cached) setBootstrap(null);
        } finally {
            if (gen === fetchGenRef.current) {
                setRevalidating(false);
                setSiteSelectionReady(true);
            }
        }
    }, []);

    useEffect(() => {
        void loadBootstrap(scopeRef.current, "shell_mount");
    }, [loadBootstrap]);

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
            if (!detail) return;
            const prevKey = workspaceSiteFilterBootstrapScopeKey(scopeRef.current);
            scopeRef.current = detail;
            registerWorkspaceSiteFilterPersistenceScope(detail);
            const nextKey = workspaceSiteFilterBootstrapScopeKey(scopeRef.current);
            const cached = readWorkspaceSiteFilterBootstrapCache(detail);
            if (cached) {
                setBootstrap(cached);
                setSiteSelectionReady(true);
            }
            if (nextKey && nextKey !== prevKey) {
                hydratedRef.current = false;
                void loadBootstrap(detail, "org_scope_change");
            }
            const sites = cached?.sites ?? bootstrap?.sites;
            if (sites?.length) hydrateFromUrlAndSession(sites, false);
        };
        window.addEventListener("alloy-workspace-site-filter-scope", onScope);
        return () => window.removeEventListener("alloy-workspace-site-filter-scope", onScope);
    }, [bootstrap?.sites, hydrateFromUrlAndSession, loadBootstrap]);

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
            revalidating,
            selectedSiteId,
            siteSelectionReady,
            setSelectedSiteId,
        }),
        [bootstrap, loadError, revalidating, selectedSiteId, siteSelectionReady, setSelectedSiteId]
    );

    return <WorkspaceSiteFilterContext.Provider value={value}>{children}</WorkspaceSiteFilterContext.Provider>;
}

export function notifyWorkspaceSiteFilterPersistenceScope(scope: WorkspaceSiteFilterPersistenceScope): void {
    registerWorkspaceSiteFilterPersistenceScope(scope);
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("alloy-workspace-site-filter-scope", { detail: scope }));
    }
}

export function useWorkspaceSiteFilter(): WorkspaceSiteFilterContextValue | null {
    return useContext(WorkspaceSiteFilterContext);
}

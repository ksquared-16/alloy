"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

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
    setSelectedSiteId: (id: string | null) => void;
};

const WorkspaceSiteFilterContext = createContext<WorkspaceSiteFilterContextValue | null>(null);

export function WorkspaceSiteFilterProvider({ children }: { children: ReactNode }) {
    const [bootstrap, setBootstrap] = useState<WorkspaceSiteFilterBootstrap | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedSiteId, setSelectedSiteIdState] = useState<string | null>(null);

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
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const setSelectedSiteId = useCallback((id: string | null) => {
        setSelectedSiteIdState(id);
    }, []);

    const value = useMemo(
        () => ({
            bootstrap,
            loadError,
            selectedSiteId,
            setSelectedSiteId,
        }),
        [bootstrap, loadError, selectedSiteId, setSelectedSiteId]
    );

    return <WorkspaceSiteFilterContext.Provider value={value}>{children}</WorkspaceSiteFilterContext.Provider>;
}

export function useWorkspaceSiteFilter(): WorkspaceSiteFilterContextValue | null {
    return useContext(WorkspaceSiteFilterContext);
}

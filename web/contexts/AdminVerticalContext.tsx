"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { runWhenAdminV2PrimarySurfaceReady } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

const STORAGE_KEY = "admin_selected_vertical_id";

interface Vertical {
    id: string;
    name: string | null;
    slug: string | null;
}

interface AdminVerticalContextValue {
    verticals: Vertical[];
    selectedVerticalId: string | null;
    setSelectedVerticalId: (id: string | null) => void;
    loading: boolean;
}

const AdminVerticalContext = createContext<AdminVerticalContextValue | null>(null);

export function useAdminVertical() {
    const ctx = useContext(AdminVerticalContext);
    if (!ctx) throw new Error("useAdminVertical must be used within AdminVerticalProvider");
    return ctx;
}

export function AdminVerticalProvider({ children }: { children: ReactNode }) {
    const [verticals, setVerticals] = useState<Vertical[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedVerticalId, setSelectedVerticalIdState] = useState<string | null>(null);

    useEffect(() => {
        const init = workspaceDataFetchInit() ?? {};
        return runWhenAdminV2PrimarySurfaceReady(async () => {
            try {
                const res = await dedupeAdminFetchWithTtl("/api/admin/verticals", init, 8000);
                const data = (await (res.ok ? res.json() : [])) as Vertical[];
                setVerticals(Array.isArray(data) ? data : []);
            } catch {
                setVerticals([]);
            } finally {
                setLoading(false);
            }
        }, "admin_verticals");
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const stored = localStorage.getItem(STORAGE_KEY);
        setSelectedVerticalIdState(stored || null);
    }, []);

    const setSelectedVerticalId = useCallback((id: string | null) => {
        setSelectedVerticalIdState(id);
        if (typeof window !== "undefined") {
            if (id) localStorage.setItem(STORAGE_KEY, id);
            else localStorage.removeItem(STORAGE_KEY);
        }
    }, []);

    // Stable value identity — `setSelectedVerticalId` is memoized and the rest are state, so consumers
    // re-render only on a real vertical/selection/loading change, not every parent render.
    const value = useMemo(
        () => ({ verticals, selectedVerticalId, setSelectedVerticalId, loading }),
        [verticals, selectedVerticalId, setSelectedVerticalId, loading],
    );

    return <AdminVerticalContext.Provider value={value}>{children}</AdminVerticalContext.Provider>;
}

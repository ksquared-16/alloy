"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
    fetchOipSettingsSnapshot,
    type OipSettingsSnapshot,
} from "@/lib/metrics/fetchOipSettingsSnapshot";

type OipSettingsContextValue = {
    snapshot: OipSettingsSnapshot | null;
    loading: boolean;
    error: string | null;
    reload: () => Promise<void>;
};

const OipSettingsContext = createContext<OipSettingsContextValue | null>(null);

export function OipSettingsProvider({ children }: { children: ReactNode }) {
    const [snapshot, setSnapshot] = useState<OipSettingsSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchOipSettingsSnapshot();
            setSnapshot(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to load Operational Intelligence data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const value = useMemo(
        () => ({ snapshot, loading, error, reload }),
        [snapshot, loading, error, reload]
    );

    return <OipSettingsContext.Provider value={value}>{children}</OipSettingsContext.Provider>;
}

export function useOipSettings(): OipSettingsContextValue {
    const ctx = useContext(OipSettingsContext);
    if (!ctx) throw new Error("useOipSettings must be used within OipSettingsProvider");
    return ctx;
}

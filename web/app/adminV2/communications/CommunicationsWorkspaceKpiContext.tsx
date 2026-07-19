"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type {
    CommsAnnouncementKpiRow,
    CommsInboxKpiMetrics,
    CommsTemplateKpiRow,
} from "@/lib/communications/v2/communicationsWorkspaceKpiModel";

type InboxSnapshot = {
    metrics: CommsInboxKpiMetrics | null;
    loading: boolean;
};

type TemplatesSnapshot = {
    rows: CommsTemplateKpiRow[];
    listResolved: boolean;
};

type AnnouncementsSnapshot = {
    rows: CommsAnnouncementKpiRow[];
    listResolved: boolean;
};

type CommunicationsWorkspaceKpiContextValue = {
    inbox: InboxSnapshot;
    templates: TemplatesSnapshot;
    announcements: AnnouncementsSnapshot;
    setInboxKpis: (next: InboxSnapshot) => void;
    setTemplatesKpis: (next: TemplatesSnapshot) => void;
    setAnnouncementsKpis: (next: AnnouncementsSnapshot) => void;
};

const CommunicationsWorkspaceKpiContext = createContext<CommunicationsWorkspaceKpiContextValue | null>(null);

/** Shallow per-row, per-field equality — these KPI rows are flat records with no id. Lets the setters
 *  treat a freshly-recomputed-but-unchanged rows array as a no-op (idempotency, no render loop). */
function rowsShallowEqual<T extends object>(a: readonly T[], b: readonly T[]): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const ra = a[i] as Record<string, unknown>;
        const rb = b[i] as Record<string, unknown>;
        const keys = Object.keys(ra);
        if (keys.length !== Object.keys(rb).length) return false;
        for (const k of keys) {
            if (ra[k] !== rb[k]) return false;
        }
    }
    return true;
}

export function CommunicationsWorkspaceKpiProvider({ children }: { children: ReactNode }) {
    const [inbox, setInbox] = useState<InboxSnapshot>({ metrics: null, loading: true });
    const [templates, setTemplates] = useState<TemplatesSnapshot>({ rows: [], listResolved: false });
    const [announcements, setAnnouncements] = useState<AnnouncementsSnapshot>({ rows: [], listResolved: false });

    // IDEMPOTENT setters. Callers (e.g. CommandCenterShell) recompute a fresh snapshot object every
    // render and push it here in an effect. Setting state unconditionally re-rendered this provider,
    // which changed the context value identity, which re-ran those effects (they depend on the context)
    // — a React max-update-depth render loop. Returning the PREVIOUS reference when the values are
    // unchanged keeps the state (and the memoized context value) referentially stable, so a no-op push
    // is a genuine no-op.
    const setInboxKpis = useCallback((next: InboxSnapshot) => {
        setInbox((prev) => {
            const pm = prev.metrics;
            const nm = next.metrics;
            const metricsSame =
                pm === nm ||
                (pm != null &&
                    nm != null &&
                    pm.requiresResponse === nm.requiresResponse &&
                    pm.slaAtRisk === nm.slaAtRisk &&
                    pm.unread === nm.unread &&
                    pm.unclassified === nm.unclassified);
            return prev.loading === next.loading && metricsSame ? prev : next;
        });
    }, []);
    const setTemplatesKpis = useCallback((next: TemplatesSnapshot) => {
        setTemplates((prev) =>
            prev.listResolved === next.listResolved && rowsShallowEqual(prev.rows, next.rows) ? prev : next,
        );
    }, []);
    const setAnnouncementsKpis = useCallback((next: AnnouncementsSnapshot) => {
        setAnnouncements((prev) =>
            prev.listResolved === next.listResolved && rowsShallowEqual(prev.rows, next.rows) ? prev : next,
        );
    }, []);

    const value = useMemo(
        () => ({
            inbox,
            templates,
            announcements,
            setInboxKpis,
            setTemplatesKpis,
            setAnnouncementsKpis,
        }),
        [inbox, templates, announcements, setInboxKpis, setTemplatesKpis, setAnnouncementsKpis]
    );

    return <CommunicationsWorkspaceKpiContext.Provider value={value}>{children}</CommunicationsWorkspaceKpiContext.Provider>;
}

export function useCommunicationsWorkspaceKpi(): CommunicationsWorkspaceKpiContextValue {
    const ctx = useContext(CommunicationsWorkspaceKpiContext);
    if (!ctx) {
        throw new Error("useCommunicationsWorkspaceKpi must be used within CommunicationsWorkspaceKpiProvider");
    }
    return ctx;
}

/** Optional hook for tab panels that may mount outside provider during legacy paths. */
export function useCommunicationsWorkspaceKpiOptional(): CommunicationsWorkspaceKpiContextValue | null {
    return useContext(CommunicationsWorkspaceKpiContext);
}

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

export function CommunicationsWorkspaceKpiProvider({ children }: { children: ReactNode }) {
    const [inbox, setInbox] = useState<InboxSnapshot>({ metrics: null, loading: true });
    const [templates, setTemplates] = useState<TemplatesSnapshot>({ rows: [], listResolved: false });
    const [announcements, setAnnouncements] = useState<AnnouncementsSnapshot>({ rows: [], listResolved: false });

    const setInboxKpis = useCallback((next: InboxSnapshot) => setInbox(next), []);
    const setTemplatesKpis = useCallback((next: TemplatesSnapshot) => setTemplates(next), []);
    const setAnnouncementsKpis = useCallback((next: AnnouncementsSnapshot) => setAnnouncements(next), []);

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

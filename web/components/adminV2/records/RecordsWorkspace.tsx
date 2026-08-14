"use client";

/**
 * Records workspace — Staff and Children, the durable record-management home.
 *
 * Bootstrap (positions, sites, the org's service date) is loaded ONCE here and handed down: both
 * sections need "today", and a section that read the browser clock would disagree with every other
 * surface about which day it is.
 */

import { useCallback, useEffect, useState } from "react";

import RecordsWorkspaceShell from "@/app/adminV2/records/RecordsWorkspaceShell";
import {
    resolveRecordsSection,
    type RecordsSection,
} from "@/app/adminV2/records/recordsSections";
import RecordsStaffSection from "@/components/adminV2/records/RecordsStaffSection";
import RecordsChildrenSection from "@/components/adminV2/records/RecordsChildrenSection";
import {
    ADMIN_V2_OPEN_RECORDS_MODAL,
    RECORDS_WORKSPACE_DEEPLINK_KEY,
    type OpenRecordsModalDetail,
} from "@/lib/adminV2/workspaceModalEvents";

type Bootstrap = {
    positions: { id: string; key: string | null; label: string }[];
    sites: { id: string; label: string }[];
    todayYmd: string;
};

export default function RecordsWorkspace({ onClose }: { onClose?: () => void }) {
    const [section, setSection] = useState<RecordsSection>("staff");
    const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);

    // ── Deep link ────────────────────────────────────────────────────────────
    const applyDeepLink = useCallback((detail: OpenRecordsModalDetail | null) => {
        if (!detail) return;
        const resolved = resolveRecordsSection(detail.section);
        if (resolved) setSection(resolved);
    }, []);

    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(RECORDS_WORKSPACE_DEEPLINK_KEY);
            if (raw) {
                sessionStorage.removeItem(RECORDS_WORKSPACE_DEEPLINK_KEY);
                applyDeepLink(JSON.parse(raw) as OpenRecordsModalDetail);
            }
        } catch {
            // A blocked sessionStorage costs the deep link, never the workspace.
        }
        const onOpen = (event: Event) => {
            applyDeepLink((event as CustomEvent<OpenRecordsModalDetail>).detail ?? null);
        };
        window.addEventListener(ADMIN_V2_OPEN_RECORDS_MODAL, onOpen);
        return () => window.removeEventListener(ADMIN_V2_OPEN_RECORDS_MODAL, onOpen);
    }, [applyDeepLink]);

    useEffect(() => {
        let alive = true;
        void (async () => {
            try {
                const res = await fetch("/api/admin/records/bootstrap", { credentials: "include" });
                const json = (await res.json()) as { ok?: boolean } & Partial<Bootstrap>;
                if (!alive || !json.ok) return;
                setBootstrap({
                    positions: json.positions ?? [],
                    sites: json.sites ?? [],
                    todayYmd: json.todayYmd ?? new Date().toISOString().slice(0, 10),
                });
            } catch {
                if (alive) setBootstrap({ positions: [], sites: [], todayYmd: new Date().toISOString().slice(0, 10) });
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    return (
        <RecordsWorkspaceShell section={section} onSectionChange={setSection} onClose={onClose}>
            {bootstrap == null ? (
                <p className="px-3 py-6 text-[12px] text-alloy-midnight/50">Loading records…</p>
            ) : section === "staff" ? (
                <RecordsStaffSection
                    positions={bootstrap.positions}
                    sites={bootstrap.sites}
                    todayYmd={bootstrap.todayYmd}
                    onClose={onClose}
                />
            ) : (
                <RecordsChildrenSection todayYmd={bootstrap.todayYmd} onClose={onClose} />
            )}
        </RecordsWorkspaceShell>
    );
}

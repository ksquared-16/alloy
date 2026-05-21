"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import OpportunityDrawerOpeningOverlay from "@/components/admin/OpportunityDrawerOpeningOverlay";
import { loadOpportunityDrawerFirstPaintWithOpenPolicy } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import {
    markDrawerOpenOverlayShown,
    reportDrawerOpenCoordinatorCommit,
} from "@/lib/perf/adminV2DrawerPerf";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

/**
 * Runs bootstrap + drawer_primary before AdminDrawerContext commits the drawer.
 * Warm intent prefetch commits immediately; cold path shows overlay only for real network wait (+ ≤200ms floor).
 */
export default function OpportunityDrawerOpenCoordinator() {
    const { openingOpportunity, commitOpportunityDrawerOpen, cancelOpportunityDrawerOpen } = useAdminDrawer();
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const runGenRef = useRef(0);

    useEffect(() => {
        if (!openingOpportunity) {
            setErrorMessage(null);
            return;
        }

        const gen = ++runGenRef.current;
        const ac = new AbortController();
        setErrorMessage(null);
        markDrawerOpenOverlayShown();
        const overlayShownAt = typeof performance !== "undefined" ? performance.now() : 0;

        const run = async () => {
            try {
                const { preload, metrics } = await loadOpportunityDrawerFirstPaintWithOpenPolicy(
                    openingOpportunity.id,
                    openingOpportunity.opportunityWorkspaceContext ?? null,
                    { ...workspaceDataFetchInit(), signal: ac.signal },
                    { overlayShownAt }
                );
                if (gen !== runGenRef.current) return;
                reportDrawerOpenCoordinatorCommit(openingOpportunity.id, metrics);
                commitOpportunityDrawerOpen(openingOpportunity, preload);
            } catch (e) {
                if (gen !== runGenRef.current) return;
                if (e instanceof Error && e.name === "AbortError") return;
                setErrorMessage(
                    e instanceof Error && e.message === "Not found"
                        ? "Record not found."
                        : "Could not open record. Try again."
                );
            }
        };

        void run();

        return () => {
            ac.abort();
        };
    }, [openingOpportunity, commitOpportunityDrawerOpen]);

    if (!openingOpportunity) return null;

    return (
        <OpportunityDrawerOpeningOverlay
            errorMessage={errorMessage}
            onCancel={() => {
                cancelOpportunityDrawerOpen();
                setErrorMessage(null);
            }}
        />
    );
}

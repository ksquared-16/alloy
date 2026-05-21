"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import OpportunityDrawerOpeningOverlay from "@/components/admin/OpportunityDrawerOpeningOverlay";
import {
    raceOpportunityDrawerFirstPaintWithMinDelay,
    OPPORTUNITY_DRAWER_OPEN_MIN_READY_MS,
} from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

/**
 * Runs bootstrap + drawer_primary before AdminDrawerContext commits the drawer.
 * AdminEntityDrawer mounts only after preload is attached (no in-modal loading shell).
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

        const run = async () => {
            try {
                const preload = await raceOpportunityDrawerFirstPaintWithMinDelay(
                    openingOpportunity.id,
                    openingOpportunity.opportunityWorkspaceContext ?? null,
                    { ...workspaceDataFetchInit(), signal: ac.signal },
                    OPPORTUNITY_DRAWER_OPEN_MIN_READY_MS
                );
                if (gen !== runGenRef.current) return;
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

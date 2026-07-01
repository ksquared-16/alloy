"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActionPreflightUiPayload } from "@/lib/admin/actions/actionPreflightPresentation";
import {
    ADMINV2_ACTION_PREFLIGHT_BLOCKED,
    parseActionPreflightBlockedDetail,
} from "@/lib/admin/actions/actionPreflightDrawerEvents";

export function useOpportunityDrawerActionPreflight(opportunityId: string | null | undefined) {
    const [blocked, setBlocked] = useState<ActionPreflightUiPayload | null>(null);

    const clearBlocked = useCallback(() => setBlocked(null), []);

    const applyBlockedFromDetail = useCallback(
        (detail: { opportunity_id: string; action_preflight?: ActionPreflightUiPayload }) => {
            const id = opportunityId?.trim() ?? "";
            if (!id || detail.opportunity_id.trim() !== id) return;
            if (detail.action_preflight) {
                setBlocked(detail.action_preflight);
            }
        },
        [opportunityId]
    );

    useEffect(() => {
        setBlocked(null);
    }, [opportunityId]);

    useEffect(() => {
        if (!opportunityId?.trim()) return;
        const onBlocked = (ev: Event) => {
            const detail = parseActionPreflightBlockedDetail(ev);
            if (!detail) return;
            applyBlockedFromDetail(detail);
        };
        window.addEventListener(ADMINV2_ACTION_PREFLIGHT_BLOCKED, onBlocked);
        return () => window.removeEventListener(ADMINV2_ACTION_PREFLIGHT_BLOCKED, onBlocked);
    }, [opportunityId, applyBlockedFromDetail]);

    return { blocked, clearBlocked, applyBlockedFromDetail, setBlocked };
}

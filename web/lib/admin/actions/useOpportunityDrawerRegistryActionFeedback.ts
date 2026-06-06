"use client";

import { useCallback, useEffect, useState } from "react";

export type OpportunityDrawerRegistryActionFeedback = {
    type: "success" | "error";
    message: string;
    workflow_run_id?: string;
};

const AUTO_DISMISS_MS = 12_000;

export function useOpportunityDrawerRegistryActionFeedback(opportunityId: string | null | undefined) {
    const [feedback, setFeedback] = useState<OpportunityDrawerRegistryActionFeedback | null>(null);

    const clearFeedback = useCallback(() => setFeedback(null), []);

    const showSuccess = useCallback((message: string, opts?: { workflow_run_id?: string }) => {
        const trimmed = message.trim();
        if (!trimmed) return;
        setFeedback({
            type: "success",
            message: trimmed,
            workflow_run_id: opts?.workflow_run_id?.trim() || undefined,
        });
    }, []);

    const showError = useCallback((message: string) => {
        const trimmed = message.trim();
        if (!trimmed) return;
        setFeedback({ type: "error", message: trimmed });
    }, []);

    useEffect(() => {
        setFeedback(null);
    }, [opportunityId]);

    useEffect(() => {
        if (!feedback) return;
        const t = window.setTimeout(() => setFeedback(null), AUTO_DISMISS_MS);
        return () => window.clearTimeout(t);
    }, [feedback]);

    return { feedback, showSuccess, showError, clearFeedback };
}

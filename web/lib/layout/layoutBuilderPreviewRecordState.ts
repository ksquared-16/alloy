"use client";

import { useCallback, useEffect, useState } from "react";
import { LAYOUT_DRAWER_PREVIEW_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const STORAGE_KEY = "layout-builder-preview-opportunity-id";

export type LayoutBuilderPreviewRecordState = {
    opportunityId: string;
    setOpportunityId: (id: string) => void;
    record: ProofRuntimeRecord;
    loading: boolean;
    error: string | null;
    usingSample: boolean;
};

/** Fetch a real opportunity record for Experience Builder preview; falls back to sample data. */
export function useLayoutBuilderPreviewRecord(): LayoutBuilderPreviewRecordState {
    const [opportunityId, setOpportunityIdState] = useState("");
    const [record, setRecord] = useState<ProofRuntimeRecord>(LAYOUT_DRAWER_PREVIEW_RECORD);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [usingSample, setUsingSample] = useState(true);

    useEffect(() => {
        try {
            const stored = sessionStorage.getItem(STORAGE_KEY);
            if (stored) setOpportunityIdState(stored);
        } catch {
            // ignore storage errors
        }
    }, []);

    const setOpportunityId = useCallback((id: string) => {
        setOpportunityIdState(id);
        try {
            const trimmed = id.replace(/^\s+|\s+$/g, "");
            if (trimmed) sessionStorage.setItem(STORAGE_KEY, trimmed);
            else sessionStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore storage errors
        }
    }, []);

    useEffect(() => {
        const trimmed = opportunityId.replace(/^\s+|\s+$/g, "");
        if (!trimmed) {
            setRecord(LAYOUT_DRAWER_PREVIEW_RECORD);
            setUsingSample(true);
            setError(null);
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        void fetch(`/api/admin/layout-runtime/opportunity-drawer-body?opportunityId=${encodeURIComponent(trimmed)}`)
            .then(async (res) => {
                const body = (await res.json().catch(() => ({}))) as { error?: string; record?: ProofRuntimeRecord };
                if (!res.ok) {
                    throw new Error(body.error ?? `Failed to load record (${res.status})`);
                }
                if (!body.record) {
                    throw new Error("No record data returned");
                }
                return body.record;
            })
            .then((loaded) => {
                if (cancelled) return;
                setRecord(loaded);
                setUsingSample(false);
            })
            .catch((e: Error) => {
                if (cancelled) return;
                setRecord(LAYOUT_DRAWER_PREVIEW_RECORD);
                setUsingSample(true);
                setError(e.message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [opportunityId]);

    return { opportunityId, setOpportunityId, record, loading, error, usingSample };
}

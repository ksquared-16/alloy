"use client";

import { useCallback, useEffect, useState } from "react";
import type { LayoutBuilderPreviewRecordSelection } from "@/lib/layout/layoutBuilderPreviewRecordSearch";
import { LAYOUT_DRAWER_PREVIEW_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const STORAGE_KEY = "layout-builder-preview-opportunity-id";
const STORAGE_LABEL_KEY = "layout-builder-preview-opportunity-label";

export type LayoutBuilderPreviewRecordState = {
    selection: LayoutBuilderPreviewRecordSelection | null;
    selectOpportunity: (selection: LayoutBuilderPreviewRecordSelection) => void;
    clearSelection: () => void;
    record: ProofRuntimeRecord;
    loading: boolean;
    error: string | null;
    usingSample: boolean;
};

function readStoredSelection(): LayoutBuilderPreviewRecordSelection | null {
    try {
        const id = sessionStorage.getItem(STORAGE_KEY)?.trim();
        if (!id) return null;
        const label = sessionStorage.getItem(STORAGE_LABEL_KEY)?.trim() || "Selected lead";
        return { opportunityId: id, label };
    } catch {
        return null;
    }
}

function persistSelection(selection: LayoutBuilderPreviewRecordSelection | null): void {
    try {
        if (!selection) {
            sessionStorage.removeItem(STORAGE_KEY);
            sessionStorage.removeItem(STORAGE_LABEL_KEY);
            return;
        }
        sessionStorage.setItem(STORAGE_KEY, selection.opportunityId);
        sessionStorage.setItem(STORAGE_LABEL_KEY, selection.label);
    } catch {
        // ignore storage errors
    }
}

/** Fetch a real opportunity record for Experience Builder preview; falls back to sample data. */
export function useLayoutBuilderPreviewRecord(): LayoutBuilderPreviewRecordState {
    const [selection, setSelection] = useState<LayoutBuilderPreviewRecordSelection | null>(null);
    const [record, setRecord] = useState<ProofRuntimeRecord>(LAYOUT_DRAWER_PREVIEW_RECORD);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [usingSample, setUsingSample] = useState(true);

    useEffect(() => {
        setSelection(readStoredSelection());
    }, []);

    const selectOpportunity = useCallback((next: LayoutBuilderPreviewRecordSelection) => {
        setSelection(next);
        persistSelection(next);
    }, []);

    const clearSelection = useCallback(() => {
        setSelection(null);
        persistSelection(null);
    }, []);

    useEffect(() => {
        const opportunityId = selection?.opportunityId.trim() ?? "";
        if (!opportunityId) {
            setRecord(LAYOUT_DRAWER_PREVIEW_RECORD);
            setUsingSample(true);
            setError(null);
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        void fetch(`/api/admin/layout-runtime/opportunity-drawer-body?opportunityId=${encodeURIComponent(opportunityId)}`)
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
    }, [selection?.opportunityId]);

    return { selection, selectOpportunity, clearSelection, record, loading, error, usingSample };
}

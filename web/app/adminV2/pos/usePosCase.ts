"use client";

/**
 * Shared data hook for a selected Processing case.
 *
 * Single source of truth for the POS case columns (work + decision). Reuses the
 * EXISTING read-only endpoints and the EXISTING approve path — no new backend, no
 * duplicated logic:
 *   • GET  /api/admin/processing/cases/[caseId]               (detail + evidence)
 *   • GET  /api/admin/processing/cases/[caseId]/recommendation (FP8a match-first)
 *   • POST /api/admin/processing/cases/[caseId]/approve        (unchanged handoff)
 */

import { useCallback, useEffect, useState } from "react";
import { dispatchOperationalWorkRefresh } from "@/lib/workItems/operationalWorkRefresh";
import {
    invalidateProcessingCase,
    readCachedProcessingCase,
    writeCachedProcessingCase,
} from "@/lib/pos/processingCasePrefetch";
import type { ProcessingCaseDetail } from "@/lib/pos/processingCase/readModel/types";
import type { SourceEvidence } from "@/lib/pos/processingCase/readModel/resolveSourceEvidence";
import type { HandoffResult } from "@/lib/pos/processingCase/approveHandoff";
import type { CommittedRecordIds } from "@/lib/pos/approvalResultPresentation";
import type { RecommendationView } from "@/app/adminV2/processing/ReviewDecideCard";

/**
 * The full lead-commit result the approve route returns for a form_submission case — the
 * committed records (household / child / person / lead / participation) plus the top-level lead.
 * The minimal non-lead handoff returns a plain HandoffResult, so approveResult is their union.
 */
export interface LeadCommitResult {
    kind: "lead";
    recordType?: string;
    recordId?: string | null;
    created?: boolean;
    records?: CommittedRecordIds;
    attemptId?: string;
}

export type OperationalCommitResult = HandoffResult | LeadCommitResult;

interface DetailResponse {
    data: { detail: ProcessingCaseDetail; evidence: SourceEvidence[]; affectedRecordTypes: string[] };
}

export interface PosCaseState {
    detail: ProcessingCaseDetail | null;
    evidence: SourceEvidence[];
    destinations: string[];
    loading: boolean;
    error: string | null;
    reload: () => Promise<void>;
    rec: RecommendationView | null;
    recLoading: boolean;
    approve: () => Promise<void>;
    approving: boolean;
    approveErr: string | null;
    approveResult: OperationalCommitResult | null;
    isClosed: boolean;
}

export function usePosCase(caseId: string | null): PosCaseState {
    const [data, setData] = useState<DetailResponse["data"] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [approving, setApproving] = useState(false);
    const [approveErr, setApproveErr] = useState<string | null>(null);
    const [approveResult, setApproveResult] = useState<OperationalCommitResult | null>(null);
    const [rec, setRec] = useState<RecommendationView | null>(null);
    const [recLoading, setRecLoading] = useState(false);

    /**
     * `silent` revalidates without flipping `loading` — used when a prefetched case already
     * painted, so opening a warm case never flashes a skeleton.
     */
    const reload = useCallback(
        async (opts?: { silent?: boolean }) => {
            if (!caseId) return;
            if (!opts?.silent) setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/admin/processing/cases/${caseId}`, { credentials: "same-origin" });
                if (!res.ok) throw new Error(res.status === 404 ? "Processing case not found" : `Request failed (${res.status})`);
                const body = (await res.json()) as DetailResponse;
                setData(body.data);
                writeCachedProcessingCase(caseId, { data: body.data });
            } catch (e) {
                if (!opts?.silent) {
                    setError(e instanceof Error ? e.message : "Failed to load");
                    setData(null);
                }
            } finally {
                if (!opts?.silent) setLoading(false);
            }
        },
        [caseId]
    );

    useEffect(() => {
        setApproveResult(null);
        setApproveErr(null);
        // Paint immediately from the prefetch cache when the row was warmed, then revalidate.
        const cached = readCachedProcessingCase(caseId);
        setData(cached?.data ?? null);
        if (caseId) void reload({ silent: Boolean(cached?.data) });
    }, [caseId, reload]);

    useEffect(() => {
        if (!caseId) {
            setRec(null);
            return;
        }
        let cancelled = false;
        const cached = readCachedProcessingCase(caseId);
        setRec(cached?.rec ?? null);
        setRecLoading(!cached?.rec);
        (async () => {
            try {
                const res = await fetch(`/api/admin/processing/cases/${caseId}/recommendation`, { credentials: "same-origin" });
                if (!res.ok) throw new Error(`Request failed (${res.status})`);
                const body = (await res.json()) as { data?: RecommendationView };
                if (!cancelled) {
                    setRec(body.data ?? null);
                    writeCachedProcessingCase(caseId, { rec: body.data ?? null });
                }
            } catch {
                if (!cancelled && !cached?.rec) setRec(null);
            } finally {
                if (!cancelled) setRecLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [caseId]);

    const approve = useCallback(async () => {
        if (!caseId) return;
        setApproving(true);
        setApproveErr(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}/approve`, {
                method: "POST",
                credentials: "same-origin",
            });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as { data?: { operationalResult?: OperationalCommitResult | null } };
            setApproveResult(body.data?.operationalResult ?? null);
            dispatchOperationalWorkRefresh({
                processing_case_id: caseId,
                kind: "complete",
            });
            // The case just changed state — drop the warm copy so nothing repaints pre-commit data.
            invalidateProcessingCase(caseId);
            await reload();
        } catch (e) {
            setApproveErr(e instanceof Error ? e.message : "Approve failed");
        } finally {
            setApproving(false);
        }
    }, [caseId, reload]);

    const detail = data?.detail ?? null;
    return {
        detail,
        evidence: data?.evidence ?? [],
        destinations: data?.affectedRecordTypes ?? [],
        loading,
        error,
        reload,
        rec,
        recLoading,
        approve,
        approving,
        approveErr,
        approveResult,
        isClosed: detail ? detail.status === "completed" || detail.status === "archived" : false,
    };
}

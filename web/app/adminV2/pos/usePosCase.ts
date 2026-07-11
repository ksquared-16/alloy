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
import type { ProcessingCaseDetail } from "@/lib/pos/processingCase/readModel/types";
import type { SourceEvidence } from "@/lib/pos/processingCase/readModel/resolveSourceEvidence";
import type { HandoffResult } from "@/lib/pos/processingCase/approveHandoff";
import type { RecommendationView } from "@/app/adminV2/processing/ReviewDecideCard";

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
    approveResult: HandoffResult | null;
    isClosed: boolean;
}

export function usePosCase(caseId: string | null): PosCaseState {
    const [data, setData] = useState<DetailResponse["data"] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [approving, setApproving] = useState(false);
    const [approveErr, setApproveErr] = useState<string | null>(null);
    const [approveResult, setApproveResult] = useState<HandoffResult | null>(null);
    const [rec, setRec] = useState<RecommendationView | null>(null);
    const [recLoading, setRecLoading] = useState(false);

    const reload = useCallback(async () => {
        if (!caseId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}`, { credentials: "same-origin" });
            if (!res.ok) throw new Error(res.status === 404 ? "Processing case not found" : `Request failed (${res.status})`);
            const body = (await res.json()) as DetailResponse;
            setData(body.data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [caseId]);

    useEffect(() => {
        setData(null);
        setApproveResult(null);
        setApproveErr(null);
        if (caseId) void reload();
    }, [caseId, reload]);

    useEffect(() => {
        if (!caseId) {
            setRec(null);
            return;
        }
        let cancelled = false;
        setRecLoading(true);
        setRec(null);
        (async () => {
            try {
                const res = await fetch(`/api/admin/processing/cases/${caseId}/recommendation`, { credentials: "same-origin" });
                if (!res.ok) throw new Error(`Request failed (${res.status})`);
                const body = (await res.json()) as { data?: RecommendationView };
                if (!cancelled) setRec(body.data ?? null);
            } catch {
                if (!cancelled) setRec(null);
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
            const body = (await res.json()) as { data?: { operationalResult?: HandoffResult | null } };
            setApproveResult(body.data?.operationalResult ?? null);
            dispatchOperationalWorkRefresh({
                processing_case_id: caseId,
                kind: "complete",
            });
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

"use client";

/**
 * C1b — load layout runtime overview body for opportunity drawer (flag-gated).
 *
 * Non-blocking: VM overview remains visible until layout body resolves successfully.
 * Failures fall back to VM body without operator-visible errors.
 */

import { useEffect, useRef, useState } from "react";
import { isLayoutRuntimeOpportunityDrawerBodyEnabledClient } from "@/lib/layout/featureFlag";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type OpportunityLayoutRuntimeBodyPhase = "idle" | "loading" | "ready" | "fallback";

export type UseOpportunityDrawerLayoutRuntimeBodyArgs = {
    opportunityId: string | null | undefined;
    vmReady: boolean;
    departmentId?: string | null;
    workUnitId?: string | null;
};

export type UseOpportunityDrawerLayoutRuntimeBodyResult = {
    cutoverEnabled: boolean;
    phase: OpportunityLayoutRuntimeBodyPhase;
    /** True when operator should see VM overview body. */
    useVmFallback: boolean;
    /** True when layout runtime body should render. */
    bodyReady: boolean;
    doc: LayoutDoc | null;
    record: ProofRuntimeRecord | null;
    layoutSource: string | null;
    lastError: string | null;
};

export function resolveOpportunityOverviewBodyPresentation(input: {
    cutoverEnabled: boolean;
    phase: OpportunityLayoutRuntimeBodyPhase;
}): "vm" | "layout" {
    if (!input.cutoverEnabled) return "vm";
    if (input.phase === "ready") return "layout";
    return "vm";
}

export function useOpportunityDrawerLayoutRuntimeBody(
    args: UseOpportunityDrawerLayoutRuntimeBodyArgs,
): UseOpportunityDrawerLayoutRuntimeBodyResult {
    const cutoverEnabled = isLayoutRuntimeOpportunityDrawerBodyEnabledClient();

    const [phase, setPhase] = useState<OpportunityLayoutRuntimeBodyPhase>("idle");
    const [doc, setDoc] = useState<LayoutDoc | null>(null);
    const [record, setRecord] = useState<ProofRuntimeRecord | null>(null);
    const [layoutSource, setLayoutSource] = useState<string | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const lastLoadedIdRef = useRef<string | null>(null);
    const readyIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!cutoverEnabled) {
            setPhase("idle");
            setDoc(null);
            setRecord(null);
            setLayoutSource(null);
            setLastError(null);
            lastLoadedIdRef.current = null;
            readyIdRef.current = null;
            return;
        }

        const oid = args.opportunityId?.trim() ?? "";
        if (!oid || !args.vmReady) return;
        if (readyIdRef.current === oid) return;

        let cancelled = false;
        lastLoadedIdRef.current = oid;
        setPhase("loading");
        setLastError(null);

        const run = () => {
            const qs = new URLSearchParams({ opportunityId: oid });
            if (args.departmentId) qs.set("departmentId", String(args.departmentId));
            if (args.workUnitId) qs.set("workUnitId", String(args.workUnitId));

            fetch(`/api/admin/layout-runtime/opportunity-drawer-body?${qs.toString()}`)
                .then(async (res) => {
                    if (cancelled) return;
                    if (!res.ok) {
                        const json = await res.json().catch(() => ({}));
                        const reason = (json as { error?: string }).error ?? `http_${res.status}`;
                        setLastError(reason);
                        setPhase("fallback");
                        if (typeof console !== "undefined") {
                            console.info("[layout_runtime_body:opportunity_drawer_fallback]", {
                                opportunityId: oid,
                                reason,
                            });
                        }
                        return;
                    }

                    const json = (await res.json()) as {
                        doc?: LayoutDoc;
                        record?: ProofRuntimeRecord;
                        layoutSource?: string;
                    };

                    if (!json.doc?.sections?.length || !json.record) {
                        setLastError("layout_body_incomplete");
                        setPhase("fallback");
                        return;
                    }

                    setDoc(json.doc);
                    setRecord(json.record);
                    setLayoutSource(json.layoutSource ?? null);
                    setPhase("ready");
                    readyIdRef.current = oid;
                })
                .catch((err) => {
                    if (cancelled) return;
                    const message = err instanceof Error ? err.message : String(err);
                    setLastError(message);
                    setPhase("fallback");
                    if (typeof console !== "undefined") {
                        console.info("[layout_runtime_body:opportunity_drawer_fallback]", {
                            opportunityId: oid,
                            message,
                        });
                    }
                });
        };

        if (typeof requestIdleCallback === "function") {
            const idleId = requestIdleCallback(run, { timeout: 1500 });
            return () => {
                cancelled = true;
                cancelIdleCallback(idleId);
            };
        }

        const timerId = setTimeout(run, 0);
        return () => {
            cancelled = true;
            clearTimeout(timerId);
        };
    }, [cutoverEnabled, args.opportunityId, args.vmReady, args.departmentId, args.workUnitId]);

    useEffect(() => {
        if (!args.opportunityId?.trim()) {
            lastLoadedIdRef.current = null;
            readyIdRef.current = null;
            setPhase("idle");
            setDoc(null);
            setRecord(null);
            setLayoutSource(null);
            setLastError(null);
        }
    }, [args.opportunityId]);

    const useVmFallback = resolveOpportunityOverviewBodyPresentation({ cutoverEnabled, phase }) === "vm";

    return {
        cutoverEnabled,
        phase,
        useVmFallback,
        bodyReady: phase === "ready" && doc != null && record != null,
        doc,
        record,
        layoutSource,
        lastError,
    };
}

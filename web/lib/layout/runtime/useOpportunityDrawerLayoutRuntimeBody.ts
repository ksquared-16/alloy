"use client";

/**
 * C1b — load layout runtime overview body for opportunity drawer (flag-gated).
 *
 * Coordinated hold while layout body loads — no VM flash when cutover flags are on.
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
    presentation: OpportunityLayoutRuntimeBodyPresentation;
    /** True when operator should see VM overview body (fallback or flags off). */
    useVmFallback: boolean;
    /** True when coordinated hold placeholder should show. */
    showHold: boolean;
    /** True when layout runtime body should render. */
    bodyReady: boolean;
    doc: LayoutDoc | null;
    record: ProofRuntimeRecord | null;
    layoutSource: string | null;
    layoutKey: string | null;
    lastError: string | null;
};

export type OpportunityLayoutRuntimeBodyPresentation = "vm" | "hold" | "layout";

export function resolveOpportunityOverviewBodyPresentation(input: {
    cutoverEnabled: boolean;
    phase: OpportunityLayoutRuntimeBodyPhase;
}): OpportunityLayoutRuntimeBodyPresentation {
    if (!input.cutoverEnabled) return "vm";
    if (input.phase === "ready") return "layout";
    if (input.phase === "fallback") return "vm";
    // idle + loading: hold coordinated placeholder — never flash VM before layout
    return "hold";
}

export function useOpportunityDrawerLayoutRuntimeBody(
    args: UseOpportunityDrawerLayoutRuntimeBodyArgs,
): UseOpportunityDrawerLayoutRuntimeBodyResult {
    const cutoverEnabled = isLayoutRuntimeOpportunityDrawerBodyEnabledClient();

    const [phase, setPhase] = useState<OpportunityLayoutRuntimeBodyPhase>("idle");
    const [doc, setDoc] = useState<LayoutDoc | null>(null);
    const [record, setRecord] = useState<ProofRuntimeRecord | null>(null);
    const [layoutSource, setLayoutSource] = useState<string | null>(null);
    const [layoutKey, setLayoutKey] = useState<string | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const lastLoadedIdRef = useRef<string | null>(null);
    const readyIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!cutoverEnabled) {
            setPhase("idle");
            setDoc(null);
            setRecord(null);
            setLayoutSource(null);
            setLayoutKey(null);
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
                        plan?: { layoutKey?: string };
                    };

                    if (!json.doc?.sections?.length || !json.record) {
                        setLastError("layout_body_incomplete");
                        setPhase("fallback");
                        return;
                    }

                    setDoc(json.doc);
                    setRecord(json.record);
                    setLayoutSource(json.layoutSource ?? null);
                    setLayoutKey(json.plan?.layoutKey ?? null);
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

        run();
        return () => {
            cancelled = true;
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
            setLayoutKey(null);
            setLastError(null);
        }
    }, [args.opportunityId]);

    const presentation = resolveOpportunityOverviewBodyPresentation({ cutoverEnabled, phase });
    const useVmFallback = presentation === "vm";
    const showHold = presentation === "hold";

    return {
        cutoverEnabled,
        phase,
        presentation,
        useVmFallback,
        showHold,
        bodyReady: phase === "ready" && doc != null && record != null,
        doc,
        record,
        layoutSource,
        layoutKey,
        lastError,
    };
}

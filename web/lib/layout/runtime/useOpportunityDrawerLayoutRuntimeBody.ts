"use client";

/**
 * Load the layout-runtime overview body for the opportunity drawer.
 *
 * Capability-gated (NOT feature-flagged): for any workflow_v1-ready opportunity the
 * runtime body is the normal path. The record is built CLIENT-SIDE from the VM the
 * drawer already holds (via {@link OpportunityLayoutRuntimeAdapter}) — no second
 * server compose — and only the resolved LayoutDoc is fetched (compose-free, cached
 * per org/entity/surface/version). The org-level doc is cached on the client too, so
 * drawer-to-drawer navigation reuses it instantly.
 *
 * Capability fallback (classic records, or a doc that cannot drive the production
 * body) renders the VM overview. This is a capability gate, not a silent old-UI
 * fallback for in-scope records.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    createOpportunityLayoutRuntimeAdapter,
    type OpportunityLayoutRuntimeAdapter,
} from "@/lib/layout/runtime/OpportunityLayoutRuntimeAdapter";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type OpportunityLayoutRuntimeBodyPhase = "idle" | "loading" | "ready" | "fallback";

export type UseOpportunityDrawerLayoutRuntimeBodyArgs = {
    opportunityId: string | null | undefined;
    vmReady: boolean;
    /** VM paint record the drawer already loaded (displayVm.above_fold.record). */
    vmRecord: Record<string, unknown> | null | undefined;
    statusDisplay?: string | null;
    summaries?: OpportunityDrawerViewModel["summaries"];
};

export type UseOpportunityDrawerLayoutRuntimeBodyResult = {
    phase: OpportunityLayoutRuntimeBodyPhase;
    /** True when the operator should see the VM overview body. */
    useVmFallback: boolean;
    /** True when the layout runtime body should render. */
    bodyReady: boolean;
    doc: LayoutDoc | null;
    record: ProofRuntimeRecord | null;
    layoutSource: string | null;
    lastError: string | null;
};

/** Render decision: layout body once resolved + record built; VM otherwise. */
export function resolveOpportunityOverviewBodyPresentation(input: {
    phase: OpportunityLayoutRuntimeBodyPhase;
}): "vm" | "layout" {
    return input.phase === "ready" ? "layout" : "vm";
}

type ResolvedDocState = { doc: LayoutDoc; layoutSource: string | null; version: number | null };

const DOC_CACHE_TTL_MS = 30_000;

/** Client-side org-level doc cache (one org per session) for fast drawer-to-drawer reuse. */
let clientDocCache: { value: ResolvedDocState | null; renderable: boolean; expiresAt: number } | null = null;

async function fetchOpportunityDrawerDoc(): Promise<{ renderable: boolean; doc: ResolvedDocState | null }> {
    const now = Date.now();
    if (clientDocCache && clientDocCache.expiresAt > now) {
        return { renderable: clientDocCache.renderable, doc: clientDocCache.value };
    }
    const res = await fetch("/api/admin/layout-runtime/opportunity-drawer-doc");
    if (!res.ok) {
        throw new Error(`doc_http_${res.status}`);
    }
    const json = (await res.json()) as {
        renderable?: boolean;
        doc?: LayoutDoc | null;
        layoutSource?: string | null;
        version?: number | null;
    };
    const renderable = Boolean(json.renderable && json.doc?.sections?.length);
    const value: ResolvedDocState | null = renderable
        ? { doc: json.doc as LayoutDoc, layoutSource: json.layoutSource ?? null, version: json.version ?? null }
        : null;
    clientDocCache = { value, renderable, expiresAt: now + DOC_CACHE_TTL_MS };
    return { renderable, doc: value };
}

/** Test/runtime hook to drop the client doc cache (e.g. after an authored publish). */
export function clearOpportunityDrawerDocClientCache(): void {
    clientDocCache = null;
}

export function useOpportunityDrawerLayoutRuntimeBody(
    args: UseOpportunityDrawerLayoutRuntimeBodyArgs,
): UseOpportunityDrawerLayoutRuntimeBodyResult {
    const [phase, setPhase] = useState<OpportunityLayoutRuntimeBodyPhase>("idle");
    const [resolvedDoc, setResolvedDoc] = useState<ResolvedDocState | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);

    const oid = args.opportunityId?.trim() ?? "";

    // One adapter instance per opportunity open — memoizes the projected record.
    const adapterRef = useRef<{ id: string; adapter: OpportunityLayoutRuntimeAdapter } | null>(null);
    if (!adapterRef.current || adapterRef.current.id !== oid) {
        adapterRef.current = { id: oid, adapter: createOpportunityLayoutRuntimeAdapter() };
    }

    // Build the operator-safe record from the VM the drawer already holds.
    const record = useMemo<ProofRuntimeRecord | null>(() => {
        if (!oid || !args.vmRecord) return null;
        return adapterRef.current!.adapter.adapt({
            vmRecord: args.vmRecord,
            opportunityId: oid,
            statusDisplay: args.statusDisplay,
            summaries: args.summaries,
        });
    }, [oid, args.vmRecord, args.statusDisplay, args.summaries]);

    // Resolve the org-level LayoutDoc (compose-free, cached).
    useEffect(() => {
        if (!oid || !args.vmReady) {
            setPhase("idle");
            setResolvedDoc(null);
            setLastError(null);
            return;
        }

        let cancelled = false;
        setPhase("loading");
        setLastError(null);

        const run = () => {
            fetchOpportunityDrawerDoc()
                .then((result) => {
                    if (cancelled) return;
                    if (!result.renderable || !result.doc) {
                        setResolvedDoc(null);
                        setPhase("fallback");
                        return;
                    }
                    setResolvedDoc(result.doc);
                    setPhase("ready");
                })
                .catch((err) => {
                    if (cancelled) return;
                    setLastError(err instanceof Error ? err.message : String(err));
                    setResolvedDoc(null);
                    setPhase("fallback");
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
    }, [oid, args.vmReady]);

    // Ready requires both a renderable doc AND a built record.
    const effectivePhase: OpportunityLayoutRuntimeBodyPhase =
        phase === "ready" && (!resolvedDoc || !record) ? "fallback" : phase;

    const useVmFallback =
        resolveOpportunityOverviewBodyPresentation({ phase: effectivePhase }) === "vm";

    return {
        phase: effectivePhase,
        useVmFallback,
        bodyReady: effectivePhase === "ready" && resolvedDoc != null && record != null,
        doc: resolvedDoc?.doc ?? null,
        record,
        layoutSource: resolvedDoc?.layoutSource ?? null,
        lastError,
    };
}

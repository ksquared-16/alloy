"use client";

/**
 * Generic drawer layout runtime body fetch hook — hold/layout/VM fallback.
 */

import { useEffect, useRef, useState } from "react";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    DRAWER_LAYOUT_RUNTIME_BODY_MAX_HOLD_MS,
    resolveDrawerLayoutRuntimeBodyPresentation,
    type DrawerLayoutRuntimeBodyPhase,
    type DrawerLayoutRuntimeBodyPresentation,
} from "@/lib/layout/runtime/drawerLayoutRuntimePresentation";

export type UseDrawerLayoutRuntimeBodyArgs = {
    cutoverEnabled: boolean;
    entityId: string | null | undefined;
    vmReady: boolean;
    apiPath: string;
    queryParams?: Record<string, string | null | undefined>;
    logTag: string;
};

export type UseDrawerLayoutRuntimeBodyResult = {
    cutoverEnabled: boolean;
    phase: DrawerLayoutRuntimeBodyPhase;
    presentation: DrawerLayoutRuntimeBodyPresentation;
    useVmFallback: boolean;
    showHold: boolean;
    bodyReady: boolean;
    doc: LayoutDoc | null;
    record: ProofRuntimeRecord | null;
    layoutSource: string | null;
    layoutKey: string | null;
    layoutRecordId: string | null;
    layoutVersion: number | null;
    lastError: string | null;
};

export function useDrawerLayoutRuntimeBody(args: UseDrawerLayoutRuntimeBodyArgs): UseDrawerLayoutRuntimeBodyResult {
    const { cutoverEnabled, entityId, vmReady, apiPath, queryParams, logTag } = args;

    const [phase, setPhase] = useState<DrawerLayoutRuntimeBodyPhase>("idle");
    const [doc, setDoc] = useState<LayoutDoc | null>(null);
    const [record, setRecord] = useState<ProofRuntimeRecord | null>(null);
    const [layoutSource, setLayoutSource] = useState<string | null>(null);
    const [layoutKey, setLayoutKey] = useState<string | null>(null);
    const [layoutRecordId, setLayoutRecordId] = useState<string | null>(null);
    const [layoutVersion, setLayoutVersion] = useState<number | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const readyIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!cutoverEnabled) {
            setPhase("idle");
            setDoc(null);
            setRecord(null);
            setLayoutSource(null);
            setLayoutKey(null);
            setLayoutRecordId(null);
            setLayoutVersion(null);
            setLastError(null);
            readyIdRef.current = null;
            return;
        }

        const id = entityId?.trim() ?? "";
        if (!id || !vmReady) return;
        if (readyIdRef.current === id) return;

        let cancelled = false;
        setPhase("loading");
        setLastError(null);

        const timeoutId = window.setTimeout(() => {
            if (cancelled) return;
            setPhase((current) => {
                if (current !== "loading" && current !== "idle") return current;
                setLastError("layout_fetch_timeout");
                if (typeof console !== "undefined") {
                    console.info(`[layout_runtime_body:${logTag}_fallback]`, {
                        entityId: id,
                        reason: "layout_fetch_timeout",
                        maxHoldMs: DRAWER_LAYOUT_RUNTIME_BODY_MAX_HOLD_MS,
                    });
                }
                return "fallback";
            });
        }, DRAWER_LAYOUT_RUNTIME_BODY_MAX_HOLD_MS);

        const clearHoldTimeout = () => window.clearTimeout(timeoutId);
        const qs = new URLSearchParams();
        qs.set(getPrimaryQueryKey(apiPath), id);
        Object.entries(queryParams ?? {}).forEach(([key, value]) => {
            if (value != null && String(value).trim()) qs.set(key, String(value).trim());
        });

        fetch(`${apiPath}?${qs.toString()}`)
            .then(async (res) => {
                if (cancelled) return;
                clearHoldTimeout();
                if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    const reason = (json as { error?: string }).error ?? `http_${res.status}`;
                    setLastError(reason);
                    setPhase("fallback");
                    return;
                }
                const json = (await res.json()) as {
                    doc?: LayoutDoc;
                    record?: ProofRuntimeRecord;
                    layoutSource?: string;
                    layoutKey?: string;
                    layoutRecordId?: string | null;
                    layoutVersion?: number | null;
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
                setLayoutKey(json.layoutKey ?? json.plan?.layoutKey ?? null);
                setLayoutRecordId(json.layoutRecordId ?? null);
                setLayoutVersion(json.layoutVersion ?? null);
                setPhase("ready");
                readyIdRef.current = id;
            })
            .catch((err) => {
                if (cancelled) return;
                clearHoldTimeout();
                setLastError(err instanceof Error ? err.message : String(err));
                setPhase("fallback");
            });

        return () => {
            cancelled = true;
            clearHoldTimeout();
        };
    }, [cutoverEnabled, entityId, vmReady, apiPath, logTag, queryParams]);

    useEffect(() => {
        if (!entityId?.trim()) {
            readyIdRef.current = null;
            setPhase("idle");
            setDoc(null);
            setRecord(null);
            setLayoutSource(null);
            setLayoutKey(null);
            setLayoutRecordId(null);
            setLayoutVersion(null);
            setLastError(null);
        }
    }, [entityId]);

    const presentation = resolveDrawerLayoutRuntimeBodyPresentation({ cutoverEnabled, phase });

    return {
        cutoverEnabled,
        phase,
        presentation,
        useVmFallback: presentation === "vm",
        showHold: presentation === "hold",
        bodyReady: phase === "ready" && doc != null && record != null,
        doc,
        record,
        layoutSource,
        layoutKey,
        layoutRecordId,
        layoutVersion,
        lastError,
    };
}

function getPrimaryQueryKey(apiPath: string): string {
    if (apiPath.includes("child")) return "childId";
    if (apiPath.includes("person")) return "personId";
    return "opportunityId";
}

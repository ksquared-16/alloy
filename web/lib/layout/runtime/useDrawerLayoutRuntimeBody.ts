"use client";

/**
 * Generic drawer layout runtime body fetch hook — hold/layout/VM fallback.
 */

import { useEffect, useRef, useState } from "react";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { enrichLayoutDocDrawerFieldEditable } from "@/lib/layout/runtime/enrichLayoutDocChildFieldsEditable";
import {
    buildDrawerLayoutRuntimeBodyCacheKey,
    invalidateDrawerLayoutRuntimeBodyCacheForEntity,
    peekDrawerLayoutRuntimeBodyCacheEntry,
    putDrawerLayoutRuntimeBodyCacheEntry,
} from "@/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache";
import { perfCache } from "@/lib/perf/perfNamespaceLog";
import {
    ADMINV2_LAYOUT_RUNTIME_BODY_INVALIDATE,
    parseDrawerLayoutRuntimeBodyInvalidateDetail,
} from "@/lib/layout/runtime/drawerLayoutRuntimeBodyInvalidate";
import {
    ADMINV2_LAYOUT_RUNTIME_BODY_RECORD_PATCH,
    parseDrawerLayoutRuntimeBodyRecordPatchDetail,
} from "@/lib/layout/runtime/drawerLayoutRuntimeBodyRecordPatch";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
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
    // Stable serialization so an inline `queryParams` object from the caller does
    // NOT re-trigger the fetch effect every render (that cancelled the in-flight
    // 5–6s request and looped, leaving the body stuck → blank).
    const queryParamsKey = JSON.stringify(queryParams ?? {});

    const [phase, setPhase] = useState<DrawerLayoutRuntimeBodyPhase>("idle");
    const [doc, setDoc] = useState<LayoutDoc | null>(null);
    const [record, setRecord] = useState<ProofRuntimeRecord | null>(null);
    const [layoutSource, setLayoutSource] = useState<string | null>(null);
    const [layoutKey, setLayoutKey] = useState<string | null>(null);
    const [layoutRecordId, setLayoutRecordId] = useState<string | null>(null);
    const [layoutVersion, setLayoutVersion] = useState<number | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const readyIdRef = useRef<string | null>(null);
    const [invalidationGen, setInvalidationGen] = useState(0);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const onInvalidate = (ev: Event) => {
            const detail = parseDrawerLayoutRuntimeBodyInvalidateDetail(ev);
            const id = entityId?.trim() ?? "";
            if (!detail || !id || detail.entityId !== id) return;
            if (detail.entityType === "opportunities" && !apiPath.includes("opportunity")) return;
            if (detail.entityType === "persons" && !apiPath.includes("person-drawer")) return;
            if (detail.entityType === "child" && !apiPath.includes("child-drawer")) return;
            invalidateDrawerLayoutRuntimeBodyCacheForEntity(apiPath, id);
            readyIdRef.current = null;
            setInvalidationGen((g) => g + 1);
        };
        window.addEventListener(ADMINV2_LAYOUT_RUNTIME_BODY_INVALIDATE, onInvalidate as EventListener);
        return () =>
            window.removeEventListener(ADMINV2_LAYOUT_RUNTIME_BODY_INVALIDATE, onInvalidate as EventListener);
    }, [apiPath, entityId]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const onRecordPatch = (ev: Event) => {
            const detail = parseDrawerLayoutRuntimeBodyRecordPatchDetail(ev);
            const id = entityId?.trim() ?? "";
            if (!detail || !id || detail.entityId !== id) return;
            if (detail.entityType === "opportunities" && !apiPath.includes("opportunity")) return;
            if (detail.entityType === "persons" && !apiPath.includes("person-drawer")) return;
            if (detail.entityType === "child" && !apiPath.includes("child-drawer")) return;
            setRecord(detail.record);
            const cacheKey = buildDrawerLayoutRuntimeBodyCacheKey(apiPath, id, queryParamsKey);
            const cached = peekDrawerLayoutRuntimeBodyCacheEntry(cacheKey);
            if (cached) {
                putDrawerLayoutRuntimeBodyCacheEntry(cacheKey, {
                    doc: cached.doc,
                    record: detail.record,
                    layoutSource: cached.layoutSource,
                    layoutKey: cached.layoutKey,
                    layoutRecordId: cached.layoutRecordId,
                    layoutVersion: cached.layoutVersion,
                });
            }
        };
        window.addEventListener(ADMINV2_LAYOUT_RUNTIME_BODY_RECORD_PATCH, onRecordPatch as EventListener);
        return () =>
            window.removeEventListener(ADMINV2_LAYOUT_RUNTIME_BODY_RECORD_PATCH, onRecordPatch as EventListener);
    }, [apiPath, entityId, queryParamsKey]);

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

        const cacheKey = buildDrawerLayoutRuntimeBodyCacheKey(apiPath, id, queryParamsKey);
        const cached = peekDrawerLayoutRuntimeBodyCacheEntry(cacheKey);
        if (cached && readyIdRef.current !== id) {
            perfCache("drawer_layout_runtime_body", {
                entity_id: id,
                cache_hit: true,
                source: "cache",
            });
            setDoc(cached.doc);
            setRecord(cached.record);
            setLayoutSource(cached.layoutSource);
            setLayoutKey(cached.layoutKey);
            setLayoutVersion(cached.layoutVersion);
            setLayoutRecordId(cached.layoutRecordId);
            setLastError(null);
            setPhase("ready");
            readyIdRef.current = id;
        }

        if (readyIdRef.current === id) return;

        let cancelled = false;
        setPhase("loading");
        setLastError(null);

        // No false timeout flip: while the request is in flight we stay in the
        // coordinated hold/loading state. Only a genuine failure (non-ok /
        // incomplete body / rejection) moves to "fallback". This removes the
        // `layout_fetch_timeout` flicker that appeared before the (slow) response.
        const qs = new URLSearchParams();
        qs.set(getPrimaryQueryKey(apiPath), id);
        Object.entries(queryParams ?? {}).forEach(([key, value]) => {
            if (value != null && String(value).trim()) qs.set(key, String(value).trim());
        });

        fetch(`${apiPath}?${qs.toString()}`)
            .then(async (res) => {
                if (cancelled) return;
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
                const enrichedDoc = enrichLayoutDocDrawerFieldEditable(json.doc);
                setDoc(enrichedDoc);
                setRecord(json.record);
                setLayoutSource(json.layoutSource ?? null);
                setLayoutKey(json.layoutKey ?? json.plan?.layoutKey ?? null);
                setLayoutVersion(json.layoutVersion ?? null);
                setLayoutRecordId(json.layoutRecordId ?? null);
                putDrawerLayoutRuntimeBodyCacheEntry(cacheKey, {
                    doc: enrichedDoc,
                    record: json.record,
                    layoutSource: json.layoutSource ?? null,
                    layoutKey: json.layoutKey ?? json.plan?.layoutKey ?? null,
                    layoutRecordId: json.layoutRecordId ?? null,
                    layoutVersion: json.layoutVersion ?? null,
                });
                // A successful body response clears any stale error from a prior attempt.
                setLastError(null);
                setPhase("ready");
                readyIdRef.current = id;
            })
            .catch((err) => {
                if (cancelled) return;
                setLastError(err instanceof Error ? err.message : String(err));
                setPhase("fallback");
            });

        return () => {
            cancelled = true;
        };
        // queryParams referenced by content via queryParamsKey (stable).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cutoverEnabled, entityId, vmReady, apiPath, logTag, queryParamsKey, invalidationGen]);

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
    if (apiPath.includes("child-drawer-body")) return "personId";
    if (apiPath.includes("child")) return "childId";
    if (apiPath.includes("person")) return "personId";
    return "opportunityId";
}

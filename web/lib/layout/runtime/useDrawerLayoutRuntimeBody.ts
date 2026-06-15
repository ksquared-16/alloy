"use client";

/**
 * Generic drawer layout runtime body fetch hook — hold/layout/VM fallback.
 */

import { useEffect, useRef, useState } from "react";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { enrichLayoutDocDrawerFieldEditable } from "@/lib/layout/runtime/enrichLayoutDocChildFieldsEditable";
import {
    buildDrawerLayoutRuntimeBodyCacheKey,
    fetchDrawerLayoutRuntimeBodyDeduped,
    invalidateDrawerLayoutRuntimeBodyCacheForEntity,
    peekDrawerLayoutRuntimeBodyCacheEntry,
    putDrawerLayoutRuntimeBodyCacheEntry,
    serializeDrawerLayoutRuntimeBodyQueryParams,
} from "@/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache";
import { perfCache, perfDrawer } from "@/lib/perf/perfNamespaceLog";
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
    const queryParamsKey = serializeDrawerLayoutRuntimeBodyQueryParams(queryParams);

    const [phase, setPhase] = useState<DrawerLayoutRuntimeBodyPhase>("idle");
    const [doc, setDoc] = useState<LayoutDoc | null>(null);
    const [record, setRecord] = useState<ProofRuntimeRecord | null>(null);
    const [layoutSource, setLayoutSource] = useState<string | null>(null);
    const [layoutKey, setLayoutKey] = useState<string | null>(null);
    const [layoutRecordId, setLayoutRecordId] = useState<string | null>(null);
    const [layoutVersion, setLayoutVersion] = useState<number | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const readyIdRef = useRef<string | null>(null);
    const fetchGenRef = useRef(0);
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
        if (!id) return;

        const cacheKey = buildDrawerLayoutRuntimeBodyCacheKey(apiPath, id, queryParamsKey);
        const cached = peekDrawerLayoutRuntimeBodyCacheEntry(cacheKey);
        if (cached && readyIdRef.current !== id) {
            perfCache("drawer_layout_runtime_body", {
                entity_id: id,
                cache_hit: true,
                source: "cache",
            });
            if (process.env.NODE_ENV !== "production") {
                perfDrawer("body_fetch_cache_hit", { entity_id: id, api_path: apiPath });
            }
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

        if (!vmReady) return;
        if (readyIdRef.current === id) return;

        let cancelled = false;
        const gen = ++fetchGenRef.current;
        setPhase("loading");
        setLastError(null);
        if (process.env.NODE_ENV !== "production") {
            perfDrawer("body_fetch_start", { entity_id: id, api_path: apiPath });
        }

        fetchDrawerLayoutRuntimeBodyDeduped({
            apiPath,
            entityId: id,
            queryParams,
        })
            .then((payload) => {
                if (cancelled || gen !== fetchGenRef.current) return;
                if (!payload) {
                    setLastError("layout_body_incomplete");
                    setPhase("fallback");
                    return;
                }
                const enrichedDoc = enrichLayoutDocDrawerFieldEditable(payload.doc);
                setDoc(enrichedDoc);
                setRecord(payload.record);
                setLayoutSource(payload.layoutSource);
                setLayoutKey(payload.layoutKey);
                setLayoutVersion(payload.layoutVersion);
                setLayoutRecordId(payload.layoutRecordId);
                putDrawerLayoutRuntimeBodyCacheEntry(cacheKey, {
                    doc: enrichedDoc,
                    record: payload.record,
                    layoutSource: payload.layoutSource,
                    layoutKey: payload.layoutKey,
                    layoutRecordId: payload.layoutRecordId,
                    layoutVersion: payload.layoutVersion,
                });
                setLastError(null);
                setPhase("ready");
                readyIdRef.current = id;
                if (process.env.NODE_ENV !== "production") {
                    perfDrawer("body_fetch_ready", { entity_id: id, api_path: apiPath, cache_hit: false });
                }
            })
            .catch((err) => {
                if (cancelled || gen !== fetchGenRef.current) return;
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

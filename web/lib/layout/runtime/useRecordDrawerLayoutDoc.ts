"use client";

/**
 * Resolve + cache a non-opportunity record drawer LayoutDoc (person / child).
 *
 * Compose-free: fetches only the resolved doc (org-published from /settings/layouts,
 * else curated default) and caches it client-side per entity type so drawer-to-drawer
 * navigation reuses it. The host adapts its VM record to the doc's refKeys and renders
 * LayoutRuntimeDrawerBody. renderable=false → host keeps its capability fallback.
 */

import { useEffect, useState } from "react";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

const DOC_CACHE_TTL_MS = 30_000;

export type RecordDrawerLayoutDocState = {
    doc: LayoutDoc | null;
    renderable: boolean;
    layoutSource: string | null;
};

const EMPTY_STATE: RecordDrawerLayoutDocState = { doc: null, renderable: false, layoutSource: null };

const cache = new Map<string, { value: RecordDrawerLayoutDocState; expiresAt: number }>();

export function clearRecordDrawerLayoutDocCache(): void {
    cache.clear();
}

/** Resolve the drawer doc for an entity type ("person" | "child"), cached. */
export function useRecordDrawerLayoutDoc(
    entityType: "person" | "child" | null,
    enabled = true,
): RecordDrawerLayoutDocState {
    const key = entityType ?? "";
    const [state, setState] = useState<RecordDrawerLayoutDocState>(() => {
        const hit = cache.get(key);
        return hit && hit.expiresAt > Date.now() ? hit.value : EMPTY_STATE;
    });

    useEffect(() => {
        if (!enabled || !entityType) {
            setState(EMPTY_STATE);
            return;
        }
        const hit = cache.get(key);
        if (hit && hit.expiresAt > Date.now()) {
            setState(hit.value);
            return;
        }

        let cancelled = false;
        fetch(`/api/admin/layout-runtime/record-drawer-doc?entityType=${encodeURIComponent(entityType)}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((json: { renderable?: boolean; doc?: LayoutDoc | null; layoutSource?: string | null } | null) => {
                if (cancelled) return;
                const renderable = Boolean(json?.renderable && json?.doc?.sections?.length);
                const value: RecordDrawerLayoutDocState = renderable
                    ? { doc: json!.doc as LayoutDoc, renderable: true, layoutSource: json!.layoutSource ?? null }
                    : EMPTY_STATE;
                cache.set(key, { value, expiresAt: Date.now() + DOC_CACHE_TTL_MS });
                setState(value);
            })
            .catch(() => {
                if (!cancelled) setState(EMPTY_STATE);
            });

        return () => {
            cancelled = true;
        };
    }, [key, entityType, enabled]);

    return state;
}

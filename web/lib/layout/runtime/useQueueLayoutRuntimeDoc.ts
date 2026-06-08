"use client";

/**
 * Resolve + cache the configured opportunity queue LayoutDoc for a queue context.
 *
 * Compose-free: fetches only the resolved doc (org-published from /settings/layouts,
 * else builtin variant) and caches it client-side per context signature so every
 * lane/row reuses it. The host queue adapts each row VM to the doc's refKeys and
 * renders LayoutRuntimeQueueCard. renderable=false → host keeps its existing card.
 */

import { createContext, useContext, useEffect, useState } from "react";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { QueueLayoutContextRequest } from "@/lib/layout/queueLayoutContext";

const DOC_CACHE_TTL_MS = 30_000;

export type QueueLayoutRuntimeDocState = {
    doc: LayoutDoc | null;
    renderable: boolean;
    layoutSource: string | null;
};

const EMPTY_STATE: QueueLayoutRuntimeDocState = { doc: null, renderable: false, layoutSource: null };

const cache = new Map<string, { value: QueueLayoutRuntimeDocState; expiresAt: number }>();

function contextSignature(ctx: QueueLayoutContextRequest | undefined): string {
    if (!ctx) return "";
    return (["lifecycle_key", "stage_key", "work_unit_key", "queue_type", "grain"] as const)
        .map((k) => `${k}=${ctx[k] ?? ""}`)
        .join("&");
}

function toQuery(ctx: QueueLayoutContextRequest | undefined): string {
    const p = new URLSearchParams();
    if (ctx?.lifecycle_key) p.set("lifecycle_key", ctx.lifecycle_key);
    if (ctx?.stage_key) p.set("stage_key", ctx.stage_key);
    if (ctx?.work_unit_key) p.set("work_unit_key", ctx.work_unit_key);
    if (ctx?.queue_type) p.set("queue_type", ctx.queue_type);
    if (ctx?.grain) p.set("grain", ctx.grain);
    return p.toString();
}

export function clearQueueLayoutRuntimeDocCache(): void {
    cache.clear();
}

/** Resolve the queue doc for a context (cached). Returns EMPTY_STATE until loaded. */
export function useQueueLayoutRuntimeDoc(
    ctx: QueueLayoutContextRequest | undefined,
    enabled = true,
): QueueLayoutRuntimeDocState {
    const sig = contextSignature(ctx);
    const [state, setState] = useState<QueueLayoutRuntimeDocState>(() => {
        const hit = cache.get(sig);
        return hit && hit.expiresAt > Date.now() ? hit.value : EMPTY_STATE;
    });

    useEffect(() => {
        if (!enabled) {
            setState(EMPTY_STATE);
            return;
        }
        const hit = cache.get(sig);
        if (hit && hit.expiresAt > Date.now()) {
            setState(hit.value);
            return;
        }

        let cancelled = false;
        const qs = toQuery(ctx);
        fetch(`/api/admin/layout-runtime/queue-doc${qs ? `?${qs}` : ""}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((json: { renderable?: boolean; doc?: LayoutDoc | null; layoutSource?: string | null } | null) => {
                if (cancelled) return;
                const renderable = Boolean(json?.renderable && json?.doc?.sections?.length);
                const value: QueueLayoutRuntimeDocState = renderable
                    ? { doc: json!.doc as LayoutDoc, renderable: true, layoutSource: json!.layoutSource ?? null }
                    : EMPTY_STATE;
                cache.set(sig, { value, expiresAt: Date.now() + DOC_CACHE_TTL_MS });
                setState(value);
            })
            .catch(() => {
                if (!cancelled) setState(EMPTY_STATE);
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sig, enabled]);

    return state;
}

/** Context so deeply-nested card previews can read the lane's resolved queue doc. */
export const QueueLayoutRuntimeDocContext = createContext<QueueLayoutRuntimeDocState>(EMPTY_STATE);

export function useQueueLayoutRuntimeDocContext(): QueueLayoutRuntimeDocState {
    return useContext(QueueLayoutRuntimeDocContext);
}

"use client";

import type { QueueRowSurfaceEnvelope } from "@/lib/presentation/runtime/queueRowSurfaceMetadata";

export type QueueRowSurfaceLoadResult = {
    envelope: QueueRowSurfaceEnvelope;
    placementOverrideEnabled: boolean;
    source: string;
};

export async function loadQueueRowSurfaceConfig(
    surfaceId: string,
    processKey?: string | null,
): Promise<QueueRowSurfaceLoadResult> {
    const qs = processKey?.trim() ? `?processKey=${encodeURIComponent(processKey.trim())}` : "";
    const res = await fetch(`/api/admin/queue-row-layout/${encodeURIComponent(surfaceId)}${qs}`);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
        throw new Error((body.error as string | undefined) ?? `HTTP ${res.status}`);
    }
    const envelope = body.envelope as QueueRowSurfaceEnvelope | undefined;
    if (!envelope?.layout) {
        throw new Error("Invalid queue row surface response");
    }
    return {
        envelope,
        placementOverrideEnabled: body.placementOverrideEnabled === true,
        source: typeof body.source === "string" ? body.source : "unknown",
    };
}

export async function publishQueueRowSurfaceConfig(args: {
    surfaceId: string;
    envelope: QueueRowSurfaceEnvelope;
    placementOverrideEnabled?: boolean;
}): Promise<void> {
    const res = await fetch(`/api/admin/queue-row-layout/${encodeURIComponent(args.surfaceId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            envelope: args.envelope,
            placementOverrideEnabled: args.placementOverrideEnabled ?? false,
        }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
        throw new Error((body.error as string | undefined) ?? `HTTP ${res.status}`);
    }
}

export const QUEUE_ROW_SURFACE_PUBLISHED_EVENT = "alloy:queue-row-surface-published";

export function dispatchQueueRowSurfacePublished(surfaceId: string): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent(QUEUE_ROW_SURFACE_PUBLISHED_EVENT, { detail: { surfaceId } }),
    );
}

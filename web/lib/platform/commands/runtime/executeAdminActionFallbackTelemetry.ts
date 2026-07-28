/**
 * In-process counter for executeAdminAction fallback traffic (P9).
 * Enables drain measurement without Prometheus. Not durable across processes.
 */

import { getExecuteAdminActionFallbackDisposition } from "@/lib/platform/commands/runtime/executeAdminActionFallbackLedger";

export type FallbackTelemetrySample = {
    key: string;
    disposition: string;
    count: number;
};

const counts = new Map<string, number>();

export function recordExecuteAdminActionFallback(actionKey: string): void {
    const key = actionKey.trim() || "(empty)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
}

export function getExecuteAdminActionFallbackCounts(): FallbackTelemetrySample[] {
    const out: FallbackTelemetrySample[] = [];
    for (const [key, count] of counts.entries()) {
        out.push({
            key,
            disposition: getExecuteAdminActionFallbackDisposition(key).disposition,
            count,
        });
    }
    return out.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function resetExecuteAdminActionFallbackCountsForTests(): void {
    counts.clear();
}

export function getExecuteAdminActionFallbackTotal(): number {
    let n = 0;
    for (const c of counts.values()) n += c;
    return n;
}

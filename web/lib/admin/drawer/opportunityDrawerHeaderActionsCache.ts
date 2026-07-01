import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";

const TTL_MS = 120_000;

type HeaderActionsCacheEntry = {
    actions: ResolvedActionsBySlot;
    resolvedSig: string | null;
    capturedAt: number;
};

const cacheByOpportunityId = new Map<string, HeaderActionsCacheEntry>();

export function putOpportunityDrawerHeaderActionsCache(
    opportunityId: string | null | undefined,
    actions: ResolvedActionsBySlot | null | undefined,
    resolvedSig?: string | null
): void {
    const id = String(opportunityId ?? "").trim();
    if (!id || id === "new" || actions == null) return;
    cacheByOpportunityId.set(id, {
        actions,
        resolvedSig: resolvedSig?.trim() ? resolvedSig.trim() : null,
        capturedAt: Date.now(),
    });
}

export function peekOpportunityDrawerHeaderActionsCache(
    opportunityId: string | null | undefined
): HeaderActionsCacheEntry | null {
    const id = String(opportunityId ?? "").trim();
    if (!id || id === "new") return null;
    const ent = cacheByOpportunityId.get(id);
    if (!ent) return null;
    if (Date.now() - ent.capturedAt > TTL_MS) {
        cacheByOpportunityId.delete(id);
        return null;
    }
    return ent;
}

/** @internal test helper */
export function __clearOpportunityDrawerHeaderActionsCacheForTests(): void {
    cacheByOpportunityId.clear();
}

/**
 * Deferred tab payload prefetch for opportunity drawer (documents, activity).
 * Notes ship on VM record — no network warm required.
 */

import { normalizeDocumentRows } from "@/lib/admin/normalizeDocumentRow";
import { opportunityRelatedListPath } from "@/lib/admin/opportunityRelatedApiPaths";
import { perfPrefetch } from "@/lib/perf/perfNamespaceLog";

type DocumentsSnapshot = {
    documents: ReturnType<typeof normalizeDocumentRows>;
    error: string | null;
};

type ActivitySnapshot = {
    events: Array<{
        id: string;
        event_type: string;
        occurred_at: string;
        payload?: unknown;
    }>;
    error: string | null;
};

type TabPrefetchSlot = {
    documents?: Promise<DocumentsSnapshot>;
    activity?: Promise<ActivitySnapshot>;
    documents_snapshot?: DocumentsSnapshot | null;
    activity_snapshot?: ActivitySnapshot | null;
    startedAt: number;
};

const slots = new Map<string, TabPrefetchSlot>();
const controllers = new Map<string, AbortController>();

function slotKey(drawerId: string): string {
    return drawerId.trim();
}

function shouldLog(): boolean {
    if (typeof window === "undefined") return process.env.NODE_ENV !== "production";
    return process.env.NODE_ENV !== "production" || /staging|localhost|127\.0\.0\.1/i.test(window.location.hostname);
}

function log(event: string, payload: Record<string, unknown>): void {
    if (!shouldLog()) return;
    perfPrefetch(`drawer_tab_${event}`, {
        entity_type: "opportunity",
        entity_id: payload.drawer_id ?? payload.opportunity_id,
        tab: payload.tab,
        duration_ms: payload.duration_ms ?? payload.prefetch_ms,
        cache_hit: payload.cache_hit,
        source: payload.cache_hit ? "cache" : "network",
    });
}

async function readJson(res: Response): Promise<unknown> {
    try {
        return await res.json();
    } catch {
        return {};
    }
}

/** Arm documents + activity prefetch after paint — does not block drawer reveal. */
export function scheduleOpportunityDrawerTabPrefetch(drawerId: string): void {
    const id = slotKey(drawerId);
    if (!id) return;
    if (slots.has(id)) {
        log("arm_skip", { opportunity_id: id, reason: "slot_exists" });
        return;
    }

    const ac = new AbortController();
    controllers.set(id, ac);
    const startedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();

    const slot: TabPrefetchSlot = { startedAt };
    slots.set(id, slot);

    log("arm_scheduled", {
        opportunity_id: id,
        tabs: ["documents", "activity", "notes_vm"],
        notes: "notes_on_vm_record",
    });

    const scheduleIdle = (cb: () => void) => {
        if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
            window.requestIdleCallback(() => cb(), { timeout: 450 });
        } else {
            setTimeout(cb, 48);
        }
    };

    const run = () => {
        if (!slots.has(id)) return;
        log("fetch_start", { opportunity_id: id });

        slot.documents = (async (): Promise<DocumentsSnapshot> => {
            try {
                const res = await fetch(opportunityRelatedListPath(id), {
                    credentials: "include",
                    signal: ac.signal,
                });
                const json = (await readJson(res)) as { documents?: unknown[]; error?: string };
                if (!res.ok) {
                    return { documents: [], error: json.error ?? `HTTP ${res.status}` };
                }
                const docs = normalizeDocumentRows(json.documents);
                return { documents: docs, error: null };
            } catch (e) {
                if (ac.signal.aborted) return { documents: [], error: "Aborted" };
                return {
                    documents: [],
                    error: e instanceof Error ? e.message : "Failed to load documents",
                };
            }
        })();

        slot.activity = (async (): Promise<ActivitySnapshot> => {
            try {
                const qs = new URLSearchParams({
                    entity_type: "opportunities",
                    entity_id: id,
                    limit: "100",
                });
                const res = await fetch(`/api/admin/activity?${qs.toString()}`, {
                    credentials: "include",
                    signal: ac.signal,
                });
                const json = (await readJson(res)) as {
                    events?: ActivitySnapshot["events"];
                    error?: string;
                };
                if (!res.ok) {
                    return { events: [], error: json.error ?? `HTTP ${res.status}` };
                }
                return {
                    events: Array.isArray(json.events) ? json.events : [],
                    error: null,
                };
            } catch (e) {
                if (ac.signal.aborted) return { events: [], error: "Aborted" };
                return {
                    events: [],
                    error: e instanceof Error ? e.message : "Failed to load activity",
                };
            }
        })();

        void Promise.allSettled([slot.documents, slot.activity]).then(() => {
            const s = slots.get(id);
            if (!s) return;
            void s.documents?.then((d) => {
                s.documents_snapshot = d;
            });
            void s.activity?.then((a) => {
                s.activity_snapshot = a;
            });
            const ended =
                typeof performance !== "undefined" ? performance.now() : Date.now();
            log("prefetch_settled", {
                opportunity_id: id,
                total_ms: Math.round((ended - startedAt) * 10) / 10,
            });
        });
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => scheduleIdle(run));
    } else {
        scheduleIdle(run);
    }
}

export function takeOpportunityDrawerDocumentsPrefetch(drawerId: string): TabPrefetchSlot | undefined {
    return slots.get(slotKey(drawerId));
}

export function takeOpportunityDrawerActivityPrefetch(drawerId: string): TabPrefetchSlot | undefined {
    return slots.get(slotKey(drawerId));
}

export function invalidateOpportunityDrawerTabPrefetch(drawerId: string): void {
    const id = slotKey(drawerId);
    controllers.get(id)?.abort();
    controllers.delete(id);
    slots.delete(id);
}

export function clearOpportunityDrawerTabPrefetchForTests(): void {
    for (const ac of controllers.values()) ac.abort();
    controllers.clear();
    slots.clear();
}

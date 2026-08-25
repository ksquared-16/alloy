/**
 * Deferred tab payload prefetch for opportunity drawer (documents, activity).
 * Notes ship on VM record — no network warm required.
 */

import { normalizeDocumentRows } from "@/lib/admin/normalizeDocumentRow";
import { opportunityRelatedListPath } from "@/lib/admin/opportunityRelatedApiPaths";
import { perfPrefetch } from "@/lib/perf/perfNamespaceLog";
import { isWorkUnitPrimaryRevealActive } from "@/lib/adminV2/runtime/preload/drawerVmPrewarmScheduler";
import {
    currentDrawerTabPrefetchEpoch,
    isDrawerTabPrefetchEpochCurrent,
    onDrawerTabPrefetchEpochSuperseded,
    type DrawerTabPrefetchEpoch,
} from "@/lib/admin/drawerTabPrefetchEpoch";

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
    /** The epoch this slot was armed in; `null` for callers that declare no owner. */
    epoch: DrawerTabPrefetchEpoch | null;
    /**
     * The operator opened the tab. A speculative hold must never delay a demanded load, and the
     * demanded load must not then be duplicated by the speculation it overtook.
     */
    demanded: boolean;
};

/** Re-check cadence and bound while a Work Unit reveal owns the network. */
export const REVEAL_HOLD_MS = 400;
export const REVEAL_HOLD_ATTEMPTS = 25;

const slots = new Map<string, TabPrefetchSlot>();
const controllers = new Map<string, AbortController>();

/**
 * A superseded epoch takes its work with it: in-flight reads are aborted and the slots are dropped,
 * so the next entry to the same subject re-arms cleanly instead of finding a fossil and skipping.
 * Registered once at module scope — this is the single cleanup site the contract replaces the
 * scattered ones with.
 */
onDrawerTabPrefetchEpochSuperseded((epoch) => {
    for (const [id, slot] of [...slots.entries()]) {
        if (slot.epoch?.id !== epoch.id) continue;
        controllers.get(id)?.abort();
        controllers.delete(id);
        slots.delete(id);
    }
});

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

    const slot: TabPrefetchSlot = { startedAt, epoch: currentDrawerTabPrefetchEpoch(), demanded: false };
    slots.set(id, slot);

    log("arm_scheduled", {
        opportunity_id: id,
        tabs: ["documents", "activity", "notes_vm"],
        notes: "notes_on_vm_record",
    });

    /**
     * AFTER THE REVEAL, NOT DURING IT.
     *
     * These two reads prepare drawer TABS the operator may never open. `requestIdleCallback` with a
     * 450 ms timeout fired them at ~719 ms — inside the Focus Panel's own settlement window — and the
     * documents read is the most expensive request on the whole journey: measured 8,045 ms and
     * 8,842 ms across two runs, returning 2,893 bytes each time. Eight seconds of remote-database
     * work for under 3 KB, started before the cards the operator is actually looking at are truthful.
     *
     * It is NOT on the card critical path — proven by control: on an entry that consumed prepared
     * state, every card was truthful at 376 ms while this request was still running for another eight
     * seconds. So it is not needed for first use, and it is scheduled after primary settlement rather
     * than made to race it. The endpoint's own truthful behaviour is untouched; only when we ask.
     *
     * The gate is re-checked rather than sampled once, so a reveal that starts after arming still
     * defers it. Bounded: after REVEAL_HOLD_ATTEMPTS re-checks it proceeds anyway, because a reveal
     * that never terminates must not silently cancel preparation forever.
     */
    let holdAttempts = 0;
    const scheduleIdle = (cb: () => void) => {
        const attempt = () => {
            const live = slots.get(id);
            // Gone, or armed for a subject the operator has already left. Checked on EVERY wake —
            // an idle callback, a re-check timer, and the bounded fallback all pass through here, so
            // there is no path on which stale work reaches the network.
            if (!live || !isDrawerTabPrefetchEpochCurrent(live.epoch)) return;
            // The operator asked for this tab and it was loaded on demand. Speculating for it now
            // would be a second eight-second read of truth we already have.
            if (live.demanded) return;
            if (isWorkUnitPrimaryRevealActive() && holdAttempts < REVEAL_HOLD_ATTEMPTS) {
                holdAttempts += 1;
                setTimeout(attempt, REVEAL_HOLD_MS);
                return;
            }
            cb();
        };
        if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
            window.requestIdleCallback(() => attempt(), { timeout: 450 });
        } else {
            setTimeout(attempt, 48);
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

/**
 * The operator opened a tab. Marks the slot demanded so any speculative job still holding for the
 * reveal stands down, and returns whatever preparation already exists.
 *
 * A demanded read is NEVER made to wait for the hold: when the speculation has not started, the
 * caller finds no promise here and issues its own request immediately. The flag exists so the
 * speculation cannot fire afterwards and read the same thing twice.
 */
function claim(drawerId: string): TabPrefetchSlot | undefined {
    const slot = slots.get(slotKey(drawerId));
    if (slot) slot.demanded = true;
    return slot;
}

export function takeOpportunityDrawerDocumentsPrefetch(drawerId: string): TabPrefetchSlot | undefined {
    return claim(drawerId);
}

export function takeOpportunityDrawerActivityPrefetch(drawerId: string): TabPrefetchSlot | undefined {
    return claim(drawerId);
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

/**
 * Anticipatory client-side prefetch for Communications drawer payloads.
 * Started when opportunity `drawer_visible` applies; invalidated on record change / drawer teardown.
 */

type ThreadsResult = { threads: unknown[]; error: string | null };
type BindingsResult = { channels: string[]; error: string | null };
type RecipientsResult = { recipients: unknown[]; error: string | null };

type PrefetchConsumeRole = "threads" | "bindings" | "recipients";

export type CommunicationsDrawerPrefetchSlot = {
    threads: Promise<ThreadsResult>;
    bindings: Promise<BindingsResult>;
    recipients: Promise<RecipientsResult>;
    /** True when `arm` found an existing slot (no duplicate network fan-out). */
    prefetch_arm_cache_hit?: boolean;
    consumed: Partial<Record<PrefetchConsumeRole, boolean>>;
};

const slots = new Map<string, CommunicationsDrawerPrefetchSlot>();
const controllers = new Map<string, AbortController>();

function prefetchKey(apiEntityType: string, entityId: string): string {
    return `${apiEntityType}:${entityId}`;
}

async function readJsonSafely(res: Response): Promise<unknown> {
    try {
        return await res.json();
    } catch {
        return {};
    }
}

export function armCommunicationsDrawerPrefetch(apiEntityType: string, entityId: string): void {
    const key = prefetchKey(apiEntityType, entityId);
    if (slots.has(key)) {
        if (shouldLogPrefetch()) {
            console.warn("[perf.drawer.comms_prefetch]", {
                entity_type: apiEntityType,
                entity_id: entityId,
                event: "arm_skip",
                prefetch_arm_cache_hit: true,
            });
        }
        return;
    }

    const ac = new AbortController();
    controllers.set(key, ac);
    const { signal } = ac;
    const logPerf = shouldLogPrefetch();

    let tThreadsEnd = 0;
    let tBindingsEnd = 0;
    let tRecipientsEnd = 0;
    const perfT0 =
        typeof performance !== "undefined" && typeof performance.now === "function"
            ? performance.now()
            : typeof Date !== "undefined"
              ? Date.now()
              : 0;

    const threads: Promise<ThreadsResult> = (async (): Promise<ThreadsResult> => {
        try {
            const qs = new URLSearchParams({ entity_type: apiEntityType, entity_id: entityId, limit: "40" });
            const r = await fetch(`/api/admin/communications/threads?${qs.toString()}`, {
                credentials: "include",
                signal,
            });
            const j = (await readJsonSafely(r)) as { threads?: unknown[]; error?: string };
            tThreadsEnd =
                typeof performance !== "undefined" && typeof performance.now === "function"
                    ? performance.now()
                    : Date.now();
            if (!r.ok) {
                return { threads: [], error: j.error ?? `HTTP ${r.status}` };
            }
            return { threads: Array.isArray(j.threads) ? j.threads : [], error: null };
        } catch (e) {
            tThreadsEnd =
                typeof performance !== "undefined" && typeof performance.now === "function"
                    ? performance.now()
                    : Date.now();
            if (signal.aborted) {
                const err = new Error("Aborted");
                err.name = "AbortError";
                throw err;
            }
            return { threads: [], error: e instanceof Error ? e.message : "Failed to load threads" };
        }
    })();

    const bindings: Promise<BindingsResult> = (async (): Promise<BindingsResult> => {
        try {
            const r = await fetch(`/api/admin/communications/bindings`, { credentials: "include", signal });
            const j = (await readJsonSafely(r)) as { channels_available?: string[]; error?: string };
            tBindingsEnd =
                typeof performance !== "undefined" && typeof performance.now === "function"
                    ? performance.now()
                    : Date.now();
            if (!r.ok) {
                return { channels: [], error: j.error ?? `HTTP ${r.status}` };
            }
            const ch = j.channels_available;
            return { channels: Array.isArray(ch) ? ch : [], error: null };
        } catch (e) {
            tBindingsEnd =
                typeof performance !== "undefined" && typeof performance.now === "function"
                    ? performance.now()
                    : Date.now();
            if (signal.aborted) {
                const err = new Error("Aborted");
                err.name = "AbortError";
                throw err;
            }
            return { channels: [], error: e instanceof Error ? e.message : "Failed to load bindings" };
        }
    })();

    const recipients: Promise<RecipientsResult> = bindings.then(async (b): Promise<RecipientsResult> => {
        if (b.error || !b.channels.includes("email")) {
            tRecipientsEnd =
                typeof performance !== "undefined" && typeof performance.now === "function"
                    ? performance.now()
                    : Date.now();
            return { recipients: [], error: null };
        }
        try {
            const qs = new URLSearchParams({ entity_type: apiEntityType, entity_id: entityId });
            const r = await fetch(`/api/admin/communications/drawer-recipients?${qs}`, {
                credentials: "include",
                signal,
            });
            const j = (await readJsonSafely(r)) as { recipients?: unknown[]; error?: string };
            tRecipientsEnd =
                typeof performance !== "undefined" && typeof performance.now === "function"
                    ? performance.now()
                    : Date.now();
            if (!r.ok) {
                return { recipients: [], error: j.error ?? `HTTP ${r.status}` };
            }
            const list = j.recipients;
            return { recipients: Array.isArray(list) ? list : [], error: null };
        } catch (e) {
            tRecipientsEnd =
                typeof performance !== "undefined" && typeof performance.now === "function"
                    ? performance.now()
                    : Date.now();
            if (signal.aborted) {
                const err = new Error("Aborted");
                err.name = "AbortError";
                throw err;
            }
            return { recipients: [], error: e instanceof Error ? e.message : "Failed to load recipients" };
        }
    });

    const slot: CommunicationsDrawerPrefetchSlot = {
        threads,
        bindings,
        recipients,
        prefetch_arm_cache_hit: false,
        consumed: {},
    };
    slots.set(key, slot);

    if (logPerf) {
        void Promise.allSettled([threads, bindings, recipients]).then(() => {
            const s = slots.get(key);
            const t1 =
                typeof performance !== "undefined" && typeof performance.now === "function"
                    ? performance.now()
                    : Date.now();
            const total_ms = Math.round((t1 - perfT0) * 10) / 10;
            console.warn("[perf.drawer.comms_prefetch]", {
                entity_type: apiEntityType,
                entity_id: entityId,
                event: "prefetch_settled",
                total_ms,
                threads_ms: tThreadsEnd ? Math.round((tThreadsEnd - perfT0) * 10) / 10 : undefined,
                bindings_ms: tBindingsEnd ? Math.round((tBindingsEnd - perfT0) * 10) / 10 : undefined,
                recipients_ms: tRecipientsEnd ? Math.round((tRecipientsEnd - perfT0) * 10) / 10 : undefined,
                prefetch_arm_cache_hit: Boolean(s?.prefetch_arm_cache_hit),
                threads_taken_by_tab: Boolean(s?.consumed.threads),
                bindings_taken_by_tab: Boolean(s?.consumed.bindings),
                recipients_taken_by_tab: Boolean(s?.consumed.recipients),
            });
        });
    }
}

function shouldLogPrefetch(): boolean {
    if (typeof window === "undefined") return process.env.NODE_ENV !== "production";
    return process.env.NODE_ENV !== "production" || /staging|localhost|127\.0\.0\.1/i.test(window.location.hostname);
}

export function takeCommunicationsDrawerPrefetch(
    apiEntityType: string,
    entityId: string,
    consume?: PrefetchConsumeRole
): CommunicationsDrawerPrefetchSlot | undefined {
    const slot = slots.get(prefetchKey(apiEntityType, entityId));
    if (slot && consume) {
        slot.consumed[consume] = true;
    }
    return slot;
}

export function invalidateCommunicationsDrawerPrefetch(apiEntityType: string, entityId: string): void {
    const key = prefetchKey(apiEntityType, entityId);
    controllers.get(key)?.abort();
    controllers.delete(key);
    slots.delete(key);
}

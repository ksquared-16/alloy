/**
 * Deferred client-side prefetch for Communications drawer payloads.
 * The prefetch slot is registered synchronously so child UI can await the same promises
 * (parent useLayoutEffect runs before child useEffects — avoids duplicate network).
 * Actual HTTP work starts after paint (rAF + idle / short timeout) so the drawer does not compete with critical work.
 */

type ThreadsResult = { threads: unknown[]; error: string | null };
type BindingsResult = { channels: string[]; error: string | null };
type RecipientsResult = { recipients: unknown[]; error: string | null };
type MessagesResult = { messages: unknown[]; error: string | null };

type PrefetchConsumeRole = "threads" | "bindings" | "recipients" | "messages";

const MESSAGES_PER_THREAD_LIMIT = 36;
const MAX_MERGE_THREADS = 10;

export type CommunicationsDrawerPrefetchSlot = {
    threads: Promise<ThreadsResult>;
    bindings: Promise<BindingsResult>;
    recipients: Promise<RecipientsResult>;
    messages?: Promise<MessagesResult>;
    threads_snapshot?: ThreadsResult | null;
    bindings_snapshot?: BindingsResult | null;
    recipients_snapshot?: RecipientsResult | null;
    messages_snapshot?: MessagesResult | null;
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

function createPromiseWithResolvers<T>(): {
    promise: Promise<T>;
    resolve: (v: T) => void;
} {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

/**
 * Reserve slot + defer HTTP to after paint / idle. Supported: opportunities, jobs (record comms embed).
 * Idempotent while the same slot exists.
 */
export function scheduleDeferredCommunicationsDrawerPrefetch(apiEntityType: string, entityId: string): void {
    const key = prefetchKey(apiEntityType, entityId);
    if (slots.has(key)) {
        if (shouldLogPrefetch()) {
            console.warn("[perf.comms.prefetch]", {
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

    const threadsDeferred = createPromiseWithResolvers<ThreadsResult>();
    const bindingsDeferred = createPromiseWithResolvers<BindingsResult>();

    const recipients: Promise<RecipientsResult> = bindingsDeferred.promise.then(async (b): Promise<RecipientsResult> => {
        if (b.error || (!b.channels.includes("email") && !b.channels.includes("sms"))) {
            return { recipients: [], error: null };
        }
        try {
            const qs = new URLSearchParams({ entity_type: apiEntityType, entity_id: entityId });
            const r = await fetch(`/api/admin/communications/drawer-recipients?${qs}`, {
                credentials: "include",
                signal,
            });
            const j = (await readJsonSafely(r)) as { recipients?: unknown[]; error?: string };
            if (!r.ok) {
                return { recipients: [], error: j.error ?? `HTTP ${r.status}` };
            }
            const list = j.recipients;
            return { recipients: Array.isArray(list) ? list : [], error: null };
        } catch (e) {
            if (signal.aborted) {
                const err = new Error("Aborted");
                err.name = "AbortError";
                throw err;
            }
            return { recipients: [], error: e instanceof Error ? e.message : "Failed to load recipients" };
        }
    });

    const slot: CommunicationsDrawerPrefetchSlot = {
        threads: threadsDeferred.promise,
        bindings: bindingsDeferred.promise,
        recipients,
        prefetch_arm_cache_hit: false,
        consumed: {},
    };
    slots.set(key, slot);

    if (shouldLogPrefetch()) {
        console.warn("[perf.comms.prefetch]", {
            entity_type: apiEntityType,
            entity_id: entityId,
            event: "arm_scheduled",
            note: "slot_reserved_sync_deferred_fetch",
        });
    }

    let tThreadsEnd = 0;
    let tBindingsEnd = 0;
    let tRecipientsEnd = 0;
    const perfT0 =
        typeof performance !== "undefined" && typeof performance.now === "function"
            ? performance.now()
            : typeof Date !== "undefined"
              ? Date.now()
              : 0;

    let started = false;
    const runFetches = () => {
        if (started) return;
        if (!slots.has(key)) return;
        started = true;

        if (shouldLogPrefetch()) {
            console.warn("[perf.comms.prefetch]", {
                entity_type: apiEntityType,
                entity_id: entityId,
                event: "fetch_start",
            });
        }

        void (async () => {
            try {
                const qs = new URLSearchParams({ entity_type: apiEntityType, entity_id: entityId, limit: "40" });
                const [threadsRes, bindingsRes] = await Promise.all([
                    (async (): Promise<ThreadsResult> => {
                        try {
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
                                return { threads: [], error: "Aborted" };
                            }
                            return { threads: [], error: e instanceof Error ? e.message : "Failed to load threads" };
                        }
                    })(),
                    (async (): Promise<BindingsResult> => {
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
                                return { channels: [], error: "Aborted" };
                            }
                            return { channels: [], error: e instanceof Error ? e.message : "Failed to load bindings" };
                        }
                    })(),
                ]);

                if (!slots.has(key)) return;

                const s0 = slots.get(key);
                if (s0) {
                    s0.threads_snapshot = threadsRes;
                    s0.bindings_snapshot = bindingsRes;
                }
                threadsDeferred.resolve(threadsRes);
                bindingsDeferred.resolve(bindingsRes);

                void prefetchConversationMessages({
                    apiEntityType,
                    entityId,
                    signal,
                    threadsRes,
                    slotKey: key,
                });

                void recipients
                    .then((r) => {
                        tRecipientsEnd =
                            typeof performance !== "undefined" && typeof performance.now === "function"
                                ? performance.now()
                                : Date.now();
                        const s1 = slots.get(key);
                        if (s1) s1.recipients_snapshot = r;
                    })
                    .catch(() => {});

                if (shouldLogPrefetch()) {
                    void Promise.allSettled([threadsDeferred.promise, bindingsDeferred.promise, recipients]).then(() => {
                        const s2 = slots.get(key);
                        const t1 =
                            typeof performance !== "undefined" && typeof performance.now === "function"
                                ? performance.now()
                                : Date.now();
                        const total_ms = Math.round((t1 - perfT0) * 10) / 10;
                        console.warn("[perf.comms.prefetch]", {
                            entity_type: apiEntityType,
                            entity_id: entityId,
                            event: "prefetch_settled",
                            total_ms,
                            threads_ms: tThreadsEnd ? Math.round((tThreadsEnd - perfT0) * 10) / 10 : undefined,
                            bindings_ms: tBindingsEnd ? Math.round((tBindingsEnd - perfT0) * 10) / 10 : undefined,
                            recipients_ms: tRecipientsEnd ? Math.round((tRecipientsEnd - perfT0) * 10) / 10 : undefined,
                            prefetch_arm_cache_hit: Boolean(s2?.prefetch_arm_cache_hit),
                            threads_taken_by_tab: Boolean(s2?.consumed.threads),
                            bindings_taken_by_tab: Boolean(s2?.consumed.bindings),
                            recipients_taken_by_tab: Boolean(s2?.consumed.recipients),
                            messages_taken_by_tab: Boolean(s2?.consumed.messages),
                        });
                    });
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : "prefetch failed";
                threadsDeferred.resolve({ threads: [], error: msg });
                bindingsDeferred.resolve({ channels: [], error: msg });
            }
        })();
    };

    const scheduleIdle = (cb: () => void) => {
        if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
            window.requestIdleCallback(() => cb(), { timeout: 450 });
        } else {
            setTimeout(cb, 48);
        }
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => scheduleIdle(runFetches));
    } else {
        scheduleIdle(runFetches);
    }
}

/** Alias for scheduleDeferredCommunicationsDrawerPrefetch (same deferred behavior). */
export function armCommunicationsDrawerPrefetch(apiEntityType: string, entityId: string): void {
    scheduleDeferredCommunicationsDrawerPrefetch(apiEntityType, entityId);
}

function shouldLogPrefetch(): boolean {
    if (typeof window === "undefined") return process.env.NODE_ENV !== "production";
    return process.env.NODE_ENV !== "production" || /staging|localhost|127\.0\.0\.1/i.test(window.location.hostname);
}

export function takeCommunicationsDrawerPrefetch(
    apiEntityType: string,
    entityId: string,
    consume?: PrefetchConsumeRole,
): CommunicationsDrawerPrefetchSlot | undefined {
    const slot = slots.get(prefetchKey(apiEntityType, entityId));
    if (slot && consume) {
        slot.consumed[consume] = true;
    }
    return slot;
}

/** Consume flag only (snapshot path applies data without awaiting the prefetch promise). */
export function markCommunicationsDrawerPrefetchConsumed(
    apiEntityType: string,
    entityId: string,
    role: PrefetchConsumeRole,
): void {
    const slot = slots.get(prefetchKey(apiEntityType, entityId));
    if (!slot) return;
    slot.consumed[role] = true;
}

export function invalidateCommunicationsDrawerPrefetch(apiEntityType: string, entityId: string): void {
    const key = prefetchKey(apiEntityType, entityId);
    controllers.get(key)?.abort();
    controllers.delete(key);
    slots.delete(key);
}

async function prefetchConversationMessages(params: {
    apiEntityType: string;
    entityId: string;
    signal: AbortSignal;
    threadsRes: ThreadsResult;
    slotKey: string;
}): Promise<void> {
    if (params.threadsRes.error || !Array.isArray(params.threadsRes.threads)) {
        return;
    }
    const threadRows = params.threadsRes.threads as Array<{ id?: string }>;
    const scopeList = threadRows
        .map((t) => (t?.id != null ? String(t.id).trim() : ""))
        .filter(Boolean)
        .slice(0, MAX_MERGE_THREADS);
    if (!scopeList.length) return;

    const slot = slots.get(params.slotKey);
    if (!slot) return;

    const messagesPromise = (async (): Promise<MessagesResult> => {
        try {
            const batches = await Promise.all(
                scopeList.map(async (threadId) => {
                    const r = await fetch(
                        `/api/admin/communications/threads/${encodeURIComponent(threadId)}/messages?limit=${MESSAGES_PER_THREAD_LIMIT}&include_viewer_read=1`,
                        { credentials: "include", signal: params.signal },
                    );
                    const j = (await readJsonSafely(r)) as { messages?: unknown[]; error?: string };
                    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
                    const raw = Array.isArray(j.messages) ? j.messages : [];
                    return raw.map((m) =>
                        m && typeof m === "object" ?
                            { ...(m as Record<string, unknown>), _thread_id: threadId }
                        :   m,
                    );
                }),
            );
            const merged = batches.flat();
            return { messages: merged, error: null };
        } catch (e) {
            if (params.signal.aborted) return { messages: [], error: "Aborted" };
            return {
                messages: [],
                error: e instanceof Error ? e.message : "Failed to load messages",
            };
        }
    })();

    slot.messages = messagesPromise;
    void messagesPromise.then((result) => {
        const s = slots.get(params.slotKey);
        if (s) s.messages_snapshot = result;
        if (shouldLogPrefetch()) {
            console.warn("[perf.comms.prefetch]", {
                entity_type: params.apiEntityType,
                entity_id: params.entityId,
                event: "messages_prefetch_settled",
                message_count: result.messages.length,
                thread_count: scopeList.length,
                error: result.error,
            });
        }
    });
}

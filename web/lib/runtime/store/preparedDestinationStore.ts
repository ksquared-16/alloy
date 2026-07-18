/**
 * Prepared Operational Destination store (Phase B · §2/§5/§11 of
 * docs/platform/runtime/workspace-operational-preparation-runtime.md).
 *
 * The canonical store the whole runtime commits from — the generalization of the 144 ms
 * `workUnitProvisioningPrefetch` (§Relationship to shipped work) from a single URL-keyed promise
 * cache into a {@link DestinationId}-keyed, revision-invalidated, priority-scheduled store of
 * {@link PreparedOperationalDestination}s. **One store, one resource identity** (§Invariant 4):
 * Workspace, Work Unit, queue, Focus Panel, hover, and back/forward all read from here.
 *
 * Guarantees:
 *  - **One preparation per id** (dedup): a fresh `preparing`/`ready` entry for an id is reused; a
 *    concurrent `prepare` returns the in-flight one rather than starting a second (§2.2).
 *  - **Latest-wins**: a resolving preparation only writes back if it is still the current entry for
 *    its key; a superseded preparation is dropped, never committed (§Invariant 2).
 *  - **Revision-coherent**: graph/config revision changes mark entries `invalid` (not committable);
 *    data changes mark them `stale` (still committable, refresh after) — the §11 matrix.
 *  - **Bounded**: an LRU/priority budget caps held destinations; in-flight entries are never evicted.
 *
 * This module is flag-gated at the wiring layer (`preparedDestinationStoreFlag`); the store itself
 * is a pure data structure with an injectable clock, so it is deterministically unit-testable.
 */

import type { DestinationId } from "@/lib/runtime/graph/destinationId";
import { destinationIdKey } from "@/lib/runtime/graph/destinationId";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import {
    type PreparationPriority,
    type PreparedOperationalDestination,
    invalidDestination,
    preparingDestination,
    readyDestination,
    staleDestination,
} from "@/lib/runtime/store/preparedOperationalDestination";

/** How long a prepared destination may serve a commit before it is re-prepared (matches prefetch). */
export const DESTINATION_TTL_MS = 15_000;
/** Default preparation budget — destinations held at once (queue window × modes × adjacent views). */
export const DEFAULT_MAX_PREPARED = 48;

export type PrepareFn = (id: DestinationId) => Promise<ProvisioningAnswer>;

export type PrepareRequest = {
    graphRevisionToken: string;
    configRevision: number;
    priority: PreparationPriority;
    /** Resolves the atomic commit-critical answer for this destination (e.g. the K2 fetch). */
    prepareFn: PrepareFn;
    /** Data-coherence token stamped onto the ready destination (§7/§10); default null. */
    dataRevision?: number | null;
};

export type PreparedDestinationStoreOptions = {
    maxEntries?: number;
    ttlMs?: number;
    /** Clock injection for deterministic tests; defaults to `Date.now`. */
    now?: () => number;
};

export class PreparedDestinationStore {
    private readonly entries = new Map<string, PreparedOperationalDestination>();
    private readonly maxEntries: number;
    private readonly ttlMs: number;
    private readonly now: () => number;

    constructor(options: PreparedDestinationStoreOptions = {}) {
        this.maxEntries = options.maxEntries ?? DEFAULT_MAX_PREPARED;
        this.ttlMs = options.ttlMs ?? DESTINATION_TTL_MS;
        this.now = options.now ?? Date.now;
    }

    size(): number {
        return this.entries.size;
    }

    /** Inspect the current entry for a destination without affecting it. */
    peek(id: DestinationId): PreparedOperationalDestination | null {
        return this.entries.get(destinationIdKey(id)) ?? null;
    }

    private isFresh(entry: PreparedOperationalDestination, now: number): boolean {
        return now - entry.preparedAt < this.ttlMs;
    }

    /**
     * Prepare (or reuse) a destination. Deduped: a fresh, non-invalid entry already `preparing` or
     * `ready` for this id — at the same graph+config revision — is returned as-is. Otherwise a new
     * `preparing` entry is created, its `prepareFn` started, and the answer written back latest-wins.
     */
    prepare(id: DestinationId, req: PrepareRequest): PreparedOperationalDestination {
        const key = destinationIdKey(id);
        const now = this.now();
        const existing = this.entries.get(key);
        if (
            existing &&
            existing.status !== "invalid" &&
            existing.graphRevisionToken === req.graphRevisionToken &&
            existing.configRevision === req.configRevision &&
            this.isFresh(existing, now)
        ) {
            return existing; // one preparation per id — reuse the fresh entry
        }

        const inflight = req.prepareFn(id);
        const preparing = preparingDestination({
            id,
            graphRevisionToken: req.graphRevisionToken,
            configRevision: req.configRevision,
            priority: req.priority,
            inflight,
            preparedAt: now,
        });
        this.entries.set(key, preparing);
        this.enforceBudget();

        const dataRevision = req.dataRevision ?? null;
        void inflight
            .then((answer) => {
                // Latest-wins: only write back if this exact preparation is still current.
                if (this.entries.get(key) === preparing) {
                    this.entries.set(key, readyDestination(preparing, answer, dataRevision));
                }
            })
            .catch(() => {
                // A failed preparation is never cached: drop it so the commit path re-prepares.
                if (this.entries.get(key) === preparing) this.entries.delete(key);
            });

        return preparing;
    }

    /**
     * The commit read (§Invariant 4). Returns the answer promise for a fresh, non-invalid entry —
     * the in-flight promise while `preparing`, the resolved answer once `ready`/`stale`. Returns
     * `null` when nothing committable is held (miss / invalid / expired), so the caller prepares.
     */
    commitRead(id: DestinationId): Promise<ProvisioningAnswer> | null {
        const key = destinationIdKey(id);
        const entry = this.entries.get(key);
        if (!entry || entry.status === "invalid") return null;
        if (!this.isFresh(entry, this.now())) return null;
        if (entry.inflight) return entry.inflight;
        return entry.answer ? Promise.resolve(entry.answer) : null;
    }

    /** Evict a single destination (e.g. removed nav node, §1.6). Returns whether one was held. */
    evict(id: DestinationId): boolean {
        return this.entries.delete(destinationIdKey(id));
    }

    /** Evict every destination matching a predicate. Returns the count evicted. */
    evictWhere(pred: (d: PreparedOperationalDestination) => boolean): number {
        let count = 0;
        for (const [key, entry] of this.entries) {
            if (pred(entry)) {
                this.entries.delete(key);
                count += 1;
            }
        }
        return count;
    }

    /**
     * Graph/scope change (§1.6): every entry whose graph revision no longer matches the current
     * graph is marked `invalid` (not committable). Returns the count invalidated.
     */
    invalidateGraph(currentGraphRevisionToken: string): number {
        let count = 0;
        for (const [key, entry] of this.entries) {
            if (entry.graphRevisionToken !== currentGraphRevisionToken && entry.status !== "invalid") {
                this.entries.set(key, invalidDestination(entry));
                count += 1;
            }
        }
        return count;
    }

    /**
     * Surface publication (§8): every entry composed at an older config revision is `invalid`.
     * Returns the count invalidated.
     */
    invalidateConfig(currentConfigRevision: number): number {
        let count = 0;
        for (const [key, entry] of this.entries) {
            if (entry.configRevision < currentConfigRevision && entry.status !== "invalid") {
                this.entries.set(key, invalidDestination(entry));
                count += 1;
            }
        }
        return count;
    }

    /**
     * Data mutation (§7/§10): matching entries are marked `stale` — still committable, refreshed
     * after commit. Returns the count marked.
     */
    markStale(pred: (d: PreparedOperationalDestination) => boolean): number {
        let count = 0;
        for (const [key, entry] of this.entries) {
            if (pred(entry) && (entry.status === "ready" || entry.status === "preparing")) {
                this.entries.set(key, staleDestination(entry));
                count += 1;
            }
        }
        return count;
    }

    /** Enforce the budget: while over capacity, evict the least-valuable evictable entry. */
    private enforceBudget(): void {
        while (this.entries.size > this.maxEntries) {
            const victim = this.selectEvictionVictim();
            if (!victim) break; // nothing evictable (all in-flight) — allow transient overshoot
            this.entries.delete(victim);
        }
    }

    /**
     * Eviction order (§14): never evict an in-flight `preparing` entry (a commit may be awaiting it).
     * Among the rest, evict lowest priority first (higher band number = more disposable), then the
     * oldest. Invalid entries are the most disposable of all.
     */
    private selectEvictionVictim(): string | null {
        let victimKey: string | null = null;
        let victim: PreparedOperationalDestination | null = null;
        for (const [key, entry] of this.entries) {
            if (entry.status === "preparing") continue; // in use — never evict
            if (!victim) {
                victimKey = key;
                victim = entry;
                continue;
            }
            const entryScore = this.disposability(entry);
            const victimScore = this.disposability(victim);
            if (entryScore > victimScore) {
                victimKey = key;
                victim = entry;
            }
        }
        return victimKey;
    }

    /** Higher = more disposable. Invalid dominates; then lower priority; then older. */
    private disposability(entry: PreparedOperationalDestination): number {
        const invalidBoost = entry.status === "invalid" ? 1_000_000 : 0;
        // priority 0..5 → weight; older preparedAt → larger age term
        const ageTerm = (this.now() - entry.preparedAt) / 1000;
        return invalidBoost + entry.priority * 1000 + ageTerm;
    }

    /** @internal test seam */
    clearForTests(): void {
        this.entries.clear();
    }
}

/** Process-wide singleton — the one canonical store (§Invariant 4). */
let sharedStore: PreparedDestinationStore | null = null;

export function getPreparedDestinationStore(): PreparedDestinationStore {
    if (!sharedStore) sharedStore = new PreparedDestinationStore();
    return sharedStore;
}

/** @internal test seam — reset the singleton between tests. */
export function resetPreparedDestinationStoreForTests(): void {
    sharedStore = null;
}

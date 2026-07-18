import { describe, expect, it } from "vitest";

import { nodeDestinationId, withSubject } from "@/lib/runtime/graph/destinationId";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import {
    PreparedDestinationStore,
    type PrepareRequest,
} from "@/lib/runtime/store/preparedDestinationStore";
import { isCommittable } from "@/lib/runtime/store/preparedOperationalDestination";

/** Minimal operational answer whose Record of Attention is `subjectId`. */
function operationalAnswer(subjectId: string): ProvisioningAnswer {
    return {
        terminal: "operational",
        recordOfAttention: { id: subjectId, strategy: "first_in_page", strategySource: "configured" },
    } as unknown as ProvisioningAnswer;
}

/** A controllable deferred so tests drive preparation resolution deterministically. */
function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function req(overrides: Partial<PrepareRequest> & Pick<PrepareRequest, "prepareFn">): PrepareRequest {
    return {
        graphRevisionToken: "g1",
        configRevision: 1,
        priority: 2,
        ...overrides,
    };
}

const ID = nodeDestinationId("wu-1", "wv-1");

describe("PreparedDestinationStore — preparation lifecycle", () => {
    it("creates a preparing entry then resolves to ready with the subject pinned from the answer", async () => {
        const store = new PreparedDestinationStore();
        const d = deferred<ProvisioningAnswer>();
        const prepared = store.prepare(ID, req({ prepareFn: () => d.promise }));
        expect(prepared.status).toBe("preparing");
        expect(prepared.answer).toBeNull();
        expect(prepared.inflight).not.toBeNull();

        d.resolve(operationalAnswer("subj-42"));
        await d.promise;

        const now = store.peek(ID)!;
        expect(now.status).toBe("ready");
        expect(now.answer).not.toBeNull();
        expect(now.id.subjectId).toBe("subj-42"); // default-subject resolved → pinned (§1.3)
        expect(now.subjectRef.subjectId).toBe("subj-42");
        expect(isCommittable(now)).toBe(true);
    });

    it("dedupes: a second prepare for the same fresh id reuses the in-flight entry (one preparation)", () => {
        const store = new PreparedDestinationStore();
        let calls = 0;
        const prepareFn = () => {
            calls += 1;
            return deferred<ProvisioningAnswer>().promise;
        };
        const a = store.prepare(ID, req({ prepareFn }));
        const b = store.prepare(ID, req({ prepareFn }));
        expect(a).toBe(b);
        expect(calls).toBe(1);
    });

    it("re-prepares when the config revision advanced", () => {
        const store = new PreparedDestinationStore();
        let calls = 0;
        const prepareFn = () => {
            calls += 1;
            return deferred<ProvisioningAnswer>().promise;
        };
        store.prepare(ID, req({ prepareFn, configRevision: 1 }));
        store.prepare(ID, req({ prepareFn, configRevision: 2 }));
        expect(calls).toBe(2);
    });

    it("latest-wins: a superseded preparation never overwrites the current entry", async () => {
        let clock = 1000;
        const store = new PreparedDestinationStore({ now: () => clock });
        const first = deferred<ProvisioningAnswer>();
        store.prepare(ID, req({ prepareFn: () => first.promise, configRevision: 1 }));

        // A newer preparation (advanced config) supersedes the first entry.
        clock = 1001;
        const second = deferred<ProvisioningAnswer>();
        store.prepare(ID, req({ prepareFn: () => second.promise, configRevision: 2 }));

        // The stale first preparation resolves last — it must NOT clobber the current entry.
        first.resolve(operationalAnswer("stale-subject"));
        await first.promise;
        second.resolve(operationalAnswer("fresh-subject"));
        await second.promise;

        expect(store.peek(ID)!.subjectRef.subjectId).toBe("fresh-subject");
    });

    it("never caches a failed preparation", async () => {
        const store = new PreparedDestinationStore();
        const d = deferred<ProvisioningAnswer>();
        store.prepare(ID, req({ prepareFn: () => d.promise }));
        d.reject(new Error("boom"));
        await d.promise.catch(() => {});
        expect(store.peek(ID)).toBeNull();
    });
});

describe("PreparedDestinationStore — commit read", () => {
    it("returns the in-flight promise while preparing, then the resolved answer", async () => {
        const store = new PreparedDestinationStore();
        const d = deferred<ProvisioningAnswer>();
        store.prepare(ID, req({ prepareFn: () => d.promise }));
        expect(store.commitRead(ID)).not.toBeNull();
        d.resolve(operationalAnswer("s"));
        await d.promise;
        const answer = await store.commitRead(ID)!;
        expect(answer.terminal).toBe("operational");
    });

    it("returns null on miss, and after TTL expiry", async () => {
        let clock = 0;
        const store = new PreparedDestinationStore({ ttlMs: 100, now: () => clock });
        expect(store.commitRead(ID)).toBeNull();
        const d = deferred<ProvisioningAnswer>();
        store.prepare(ID, req({ prepareFn: () => d.promise }));
        d.resolve(operationalAnswer("s"));
        await d.promise;
        expect(store.commitRead(ID)).not.toBeNull();
        clock = 200; // past TTL
        expect(store.commitRead(ID)).toBeNull();
    });
});

describe("PreparedDestinationStore — invalidation matrix (§11)", () => {
    async function readyStore() {
        const store = new PreparedDestinationStore();
        const d = deferred<ProvisioningAnswer>();
        store.prepare(ID, req({ prepareFn: () => d.promise, graphRevisionToken: "g1", configRevision: 1 }));
        d.resolve(operationalAnswer("s"));
        await d.promise;
        return store;
    }

    it("graph change → invalid → not committable", async () => {
        const store = await readyStore();
        expect(store.invalidateGraph("g2")).toBe(1);
        expect(store.peek(ID)!.status).toBe("invalid");
        expect(store.commitRead(ID)).toBeNull();
    });

    it("config publication → invalid", async () => {
        const store = await readyStore();
        expect(store.invalidateConfig(2)).toBe(1);
        expect(store.peek(ID)!.status).toBe("invalid");
    });

    it("data mutation → stale but still committable", async () => {
        const store = await readyStore();
        expect(store.markStale(() => true)).toBe(1);
        const entry = store.peek(ID)!;
        expect(entry.status).toBe("stale");
        expect(isCommittable(entry)).toBe(true);
        expect(store.commitRead(ID)).not.toBeNull();
    });

    it("same graph revision is not invalidated", async () => {
        const store = await readyStore();
        expect(store.invalidateGraph("g1")).toBe(0);
        expect(store.peek(ID)!.status).toBe("ready");
    });
});

describe("PreparedDestinationStore — eviction & budget", () => {
    it("evicts a single destination and by predicate", async () => {
        const store = new PreparedDestinationStore();
        const d = deferred<ProvisioningAnswer>();
        store.prepare(ID, req({ prepareFn: () => d.promise }));
        d.resolve(operationalAnswer("s"));
        await d.promise;
        expect(store.evict(ID)).toBe(true);
        expect(store.peek(ID)).toBeNull();
        expect(store.evict(ID)).toBe(false);
    });

    it("enforces the budget, preferring to evict lower-priority ready entries, never in-flight", async () => {
        let clock = 0;
        const store = new PreparedDestinationStore({ maxEntries: 2, now: () => clock });
        // fill with two READY low-priority destinations (await so writeback lands before the next insert)
        for (let i = 0; i < 2; i += 1) {
            clock += 1;
            const d = deferred<ProvisioningAnswer>();
            const id = withSubject(nodeDestinationId("wu", "wv"), `s${i}`);
            store.prepare(id, req({ prepareFn: () => d.promise, priority: 5 }));
            d.resolve(operationalAnswer(`s${i}`));
            await d.promise;
        }
        expect(store.size()).toBe(2);
        // a third, high-priority, in-flight preparation must survive; a low-priority ready one is evicted
        clock += 1;
        const inflight = deferred<ProvisioningAnswer>();
        const hot = withSubject(nodeDestinationId("wu", "wv"), "hot");
        store.prepare(hot, req({ prepareFn: () => inflight.promise, priority: 0 }));
        expect(store.size()).toBeLessThanOrEqual(2);
        expect(store.peek(hot)!.status).toBe("preparing"); // in-flight never evicted
    });

    it("overshoots budget rather than evict in-flight preparations", () => {
        const store = new PreparedDestinationStore({ maxEntries: 1 });
        // three concurrent in-flight preparations — none evictable, so the store holds all three
        for (let i = 0; i < 3; i += 1) {
            const id = withSubject(nodeDestinationId("wu", "wv"), `p${i}`);
            store.prepare(id, req({ prepareFn: () => deferred<ProvisioningAnswer>().promise }));
        }
        expect(store.size()).toBe(3);
    });
});

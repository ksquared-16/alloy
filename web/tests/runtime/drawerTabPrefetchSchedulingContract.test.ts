import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The defects these guard, all measured on a production build:
 *
 *  - the documents leg is the most expensive request on the journey — 7,889–8,982 ms for 2,893
 *    bytes — and it armed on a 450 ms idle timeout, so it entered the network at ~703 ms, inside
 *    the Focus Panel's own settlement window;
 *  - `invalidateOpportunityDrawerTabPrefetch` had ZERO production callers, so a queued job outlived
 *    the subject that armed it and a once-armed slot was never released again;
 *  - a bound that lets stale work through "because we waited long enough" is the same bug with a
 *    timer in front of it.
 *
 * It is NOT on the card critical path — proven by control: on an entry that consumed prepared
 * state, every Focus Panel card was truthful at 376 ms while this read ran for eight more seconds.
 */
const revealActive = vi.fn<() => boolean>(() => false);
vi.mock("@/lib/adminV2/runtime/preload/drawerVmPrewarmScheduler", () => ({
    isWorkUnitPrimaryRevealActive: () => revealActive(),
}));

let fetchCalls: string[] = [];
let aborted = 0;

type Mod = typeof import("@/lib/admin/opportunityDrawerTabPrefetch");
type EpochMod = typeof import("@/lib/admin/drawerTabPrefetchEpoch");

async function load(): Promise<{ mod: Mod; epochs: EpochMod }> {
    const mod = await import("@/lib/admin/opportunityDrawerTabPrefetch");
    const epochs = await import("@/lib/admin/drawerTabPrefetchEpoch");
    return { mod, epochs };
}

beforeEach(() => {
    vi.useFakeTimers();
    fetchCalls = [];
    aborted = 0;
    revealActive.mockReturnValue(false);
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
        fetchCalls.push(String(input));
        init?.signal?.addEventListener?.("abort", () => { aborted += 1; });
        return Promise.resolve(new Response(JSON.stringify({ documents: [], events: [] }), { status: 200 }));
    });
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
});

const related = (id: string) => fetchCalls.filter((u) => u.includes(`/related/opportunity/${id}`));

describe("speculative scheduling — it waits for the reveal", () => {
    it("does not enter the network while a Work Unit reveal owns it", async () => {
        const { mod } = await load();
        revealActive.mockReturnValue(true);
        mod.scheduleOpportunityDrawerTabPrefetch("opp-1");
        await vi.advanceTimersByTimeAsync(3000);
        expect(fetchCalls).toEqual([]);
    });

    it("proceeds once the reveal releases — preparation is deferred, never dropped", async () => {
        const { mod } = await load();
        revealActive.mockReturnValue(true);
        mod.scheduleOpportunityDrawerTabPrefetch("opp-2");
        await vi.advanceTimersByTimeAsync(2000);
        expect(fetchCalls).toEqual([]);
        revealActive.mockReturnValue(false);
        await vi.advanceTimersByTimeAsync(1000);
        expect(related("opp-2")).toHaveLength(1);
        expect(fetchCalls.some((u) => u.includes("/api/admin/activity"))).toBe(true);
    });

    /**
     * Every terminal lifecycle outcome — settled, empty, unavailable, error, cancelled — reports the
     * reveal as no longer active, so none of them can leave the scheduler holding forever.
     */
    it.each(["settled", "empty", "unavailable", "error", "cancelled"])(
        "a %s reveal outcome releases the hold rather than deadlocking it",
        async (outcome) => {
            const { mod } = await load();
            revealActive.mockReturnValue(true);
            mod.scheduleOpportunityDrawerTabPrefetch(`opp-${outcome}`);
            await vi.advanceTimersByTimeAsync(1200);
            expect(fetchCalls).toEqual([]);
            revealActive.mockReturnValue(false);   // the outcome, whichever it was
            await vi.advanceTimersByTimeAsync(1000);
            expect(related(`opp-${outcome}`)).toHaveLength(1);
        },
    );
});

describe("epoch binding — stale work cannot execute", () => {
    it("a subject change stops the queued job the previous subject armed", async () => {
        const { mod, epochs } = await load();
        revealActive.mockReturnValue(true);
        epochs.beginDrawerTabPrefetchEpoch("opp-a");
        mod.scheduleOpportunityDrawerTabPrefetch("opp-a");
        await vi.advanceTimersByTimeAsync(800);
        epochs.beginDrawerTabPrefetchEpoch("opp-b");    // the operator moved on
        revealActive.mockReturnValue(false);
        await vi.advanceTimersByTimeAsync(5000);
        expect(related("opp-a")).toEqual([]);
    });

    it("the owning surface unmounting stops it too", async () => {
        const { mod, epochs } = await load();
        revealActive.mockReturnValue(true);
        const epoch = epochs.beginDrawerTabPrefetchEpoch("opp-c");
        mod.scheduleOpportunityDrawerTabPrefetch("opp-c");
        await vi.advanceTimersByTimeAsync(800);
        epochs.endDrawerTabPrefetchEpoch(epoch);        // returned to the Workspace / unmounted
        revealActive.mockReturnValue(false);
        await vi.advanceTimersByTimeAsync(5000);
        expect(related("opp-c")).toEqual([]);
    });

    /**
     * THE BOUND IS NOT A LICENCE. Waiting long enough must never be what lets superseded work run.
     */
    it("the bounded fallback expiring does not release a stale job", async () => {
        const { mod, epochs } = await load();
        revealActive.mockReturnValue(true);            // never releases
        epochs.beginDrawerTabPrefetchEpoch("opp-d");
        mod.scheduleOpportunityDrawerTabPrefetch("opp-d");
        await vi.advanceTimersByTimeAsync(800);
        epochs.beginDrawerTabPrefetchEpoch("opp-e");
        await vi.advanceTimersByTimeAsync(mod.REVEAL_HOLD_MS * (mod.REVEAL_HOLD_ATTEMPTS + 5));
        expect(related("opp-d")).toEqual([]);
    });

    it("the bounded fallback DOES release while the same owner is still current", async () => {
        const { mod, epochs } = await load();
        revealActive.mockReturnValue(true);            // a reveal that never terminates
        epochs.beginDrawerTabPrefetchEpoch("opp-f");
        mod.scheduleOpportunityDrawerTabPrefetch("opp-f");
        await vi.advanceTimersByTimeAsync(mod.REVEAL_HOLD_MS * (mod.REVEAL_HOLD_ATTEMPTS + 5));
        expect(related("opp-f")).toHaveLength(1);
    });

    it("superseding an epoch aborts work already in flight", async () => {
        const { mod, epochs } = await load();
        epochs.beginDrawerTabPrefetchEpoch("opp-g");
        mod.scheduleOpportunityDrawerTabPrefetch("opp-g");
        await vi.advanceTimersByTimeAsync(200);
        expect(related("opp-g")).toHaveLength(1);
        epochs.beginDrawerTabPrefetchEpoch("opp-h");
        expect(aborted).toBeGreaterThan(0);
    });

    /**
     * The fossil slot: once armed, a subject could never be re-armed because the slot was never
     * released. Re-entering a subject must prepare it again.
     */
    it("re-entering a subject re-arms it instead of skipping forever", async () => {
        const { mod, epochs } = await load();
        const first = epochs.beginDrawerTabPrefetchEpoch("opp-i");
        mod.scheduleOpportunityDrawerTabPrefetch("opp-i");
        await vi.advanceTimersByTimeAsync(500);
        expect(related("opp-i")).toHaveLength(1);
        epochs.endDrawerTabPrefetchEpoch(first);
        epochs.beginDrawerTabPrefetchEpoch("opp-i");
        mod.scheduleOpportunityDrawerTabPrefetch("opp-i");
        await vi.advanceTimersByTimeAsync(500);
        expect(related("opp-i")).toHaveLength(2);
    });

    it("a late teardown from a superseded owner does not cancel the epoch that replaced it", async () => {
        const { mod, epochs } = await load();
        const stale = epochs.beginDrawerTabPrefetchEpoch("opp-j");
        const live = epochs.beginDrawerTabPrefetchEpoch("opp-k");
        epochs.endDrawerTabPrefetchEpoch(stale);       // arrives late, out of order
        expect(epochs.isDrawerTabPrefetchEpochCurrent(live)).toBe(true);
        revealActive.mockReturnValue(true);
        mod.scheduleOpportunityDrawerTabPrefetch("opp-k");
        revealActive.mockReturnValue(false);
        await vi.advanceTimersByTimeAsync(1000);
        expect(related("opp-k")).toHaveLength(1);
    });
});

describe("a demanded tab is never delayed by speculation", () => {
    it("opening the tab during the hold leaves no prefetch promise to wait on", async () => {
        const { mod, epochs } = await load();
        revealActive.mockReturnValue(true);            // still holding
        epochs.beginDrawerTabPrefetchEpoch("opp-m");
        mod.scheduleOpportunityDrawerTabPrefetch("opp-m");
        await vi.advanceTimersByTimeAsync(800);
        const slot = mod.takeOpportunityDrawerDocumentsPrefetch("opp-m");
        // Nothing to await: the consumer issues its own request immediately rather than joining a
        // held speculation. That is what makes a demanded load independent of the hold.
        expect(slot?.documents).toBeUndefined();
        expect(slot?.documents_snapshot).toBeUndefined();
    });

    it("and the speculation it overtook never fires a second identical read", async () => {
        const { mod, epochs } = await load();
        revealActive.mockReturnValue(true);
        epochs.beginDrawerTabPrefetchEpoch("opp-n");
        mod.scheduleOpportunityDrawerTabPrefetch("opp-n");
        await vi.advanceTimersByTimeAsync(800);
        mod.takeOpportunityDrawerDocumentsPrefetch("opp-n");   // the operator opened the tab
        revealActive.mockReturnValue(false);
        await vi.advanceTimersByTimeAsync(5000);
        expect(related("opp-n")).toEqual([]);
    });

    it("a completed speculation is still handed to the tab — preparation is not wasted", async () => {
        const { mod, epochs } = await load();
        epochs.beginDrawerTabPrefetchEpoch("opp-o");
        mod.scheduleOpportunityDrawerTabPrefetch("opp-o");
        await vi.advanceTimersByTimeAsync(500);
        const slot = mod.takeOpportunityDrawerDocumentsPrefetch("opp-o");
        expect(slot?.documents).toBeDefined();
        expect(related("opp-o")).toHaveLength(1);
    });
});

describe("the endpoint contract is untouched", () => {
    it("asks the same path, with credentials, and reports a non-2xx as an error", async () => {
        vi.unstubAllGlobals();
        const seen: Array<{ url: string; credentials?: RequestCredentials }> = [];
        vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
            seen.push({ url: String(input), credentials: init?.credentials });
            return Promise.resolve(new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }));
        });
        const { mod } = await load();
        mod.scheduleOpportunityDrawerTabPrefetch("opp-p");
        await vi.advanceTimersByTimeAsync(500);
        const slot = mod.takeOpportunityDrawerDocumentsPrefetch("opp-p");
        const result = await slot!.documents!;
        expect(seen[0]?.url).toBe("/api/admin/related/opportunity/opp-p");
        expect(seen[0]?.credentials).toBe("include");
        // The access decision is surfaced, never converted into an empty success.
        expect(result.error).toBe("Forbidden");
        expect(result.documents).toEqual([]);
    });
});

/**
 * A CORRECT CONTRACT WITH NO OWNER IS THE BUG IT REPLACES. `invalidateOpportunityDrawerTabPrefetch`
 * was correct and had zero production callers for exactly that reason, so the epoch is only worth
 * anything if a real surface declares and releases it.
 */
describe("the epoch has a production owner", () => {
    const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const read = (rel: string) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { readFileSync } = require("node:fs") as typeof import("node:fs");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { join } = require("node:path") as typeof import("node:path");
        return strip(readFileSync(join(__dirname, "..", "..", rel), "utf8"));
    };
    const panel = read("components/presentation/workUnit/InlineOpportunityFocusPanel.tsx");

    it("the Focus Panel declares the epoch for its subject", () => {
        expect(panel).toMatch(/beginDrawerTabPrefetchEpoch\(/);
    });

    it("and releases it on teardown — that release IS the unmount and return-to-Workspace case", () => {
        expect(panel).toMatch(/return \(\) => endDrawerTabPrefetchEpoch\(/);
    });

    it("the scheduler refuses work from a superseded epoch", () => {
        expect(read("lib/admin/opportunityDrawerTabPrefetch.ts")).toMatch(/isDrawerTabPrefetchEpochCurrent\(/);
    });

    it("POSITIVE CONTROL — the comment stripper does not hide a real call", () => {
        expect(strip("/* beginDrawerTabPrefetchEpoch(x) */\nfoo();")).not.toMatch(/beginDrawerTabPrefetchEpoch\(/);
        expect(strip("/* note */\nbeginDrawerTabPrefetchEpoch(x);")).toMatch(/beginDrawerTabPrefetchEpoch\(/);
    });
});

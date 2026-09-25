/**
 * THE READ-AHEAD F44 ALREADY ASSUMES.
 *
 * F44 forbids rendering a Details destination before its deep read resolves, and tolerates that
 * strictness because the card "reads ahead and is usually ready". Measured, the Accounts workspace
 * never received that read-ahead: the card is keyed by account, so the coalescer that shares an
 * in-flight read mounted and died with every selection and a prewarm had nothing to hand work to.
 *
 * These gates hold the repair. The rule they protect is not "make it fast" — it is ONE canonical
 * request per account load, whoever asks and however early.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    financialsCardQuery,
    financialsCardReadInFlight,
    prewarmFinancialsCard,
    readFinancialsCardVm,
} from "@/lib/adminV2/runtime/focusPanel/financials/financialsCardRead";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const executable = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

/** A fetch that counts calls and settles when told, so concurrency is real rather than simulated. */
function countingFetch() {
    const calls: string[] = [];
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => { release = r; });
    const stub = vi.fn(async (url: string) => {
        calls.push(String(url));
        await gate;
        return { json: async () => ({ ok: true, vm: { marker: String(url) } }) } as unknown as Response;
    });
    return { calls, stub, release: () => release?.() };
}

let original: typeof globalThis.fetch;
beforeEach(() => { original = globalThis.fetch; });
afterEach(() => { globalThis.fetch = original; vi.restoreAllMocks(); });

describe("C/D — one account load, at most one card request", () => {
    it("D: a prewarm and the card's own read issue ONE request, and both get the answer", async () => {
        const f = countingFetch();
        globalThis.fetch = f.stub as unknown as typeof globalThis.fetch;
        const q = financialsCardQuery({ customerId: "cust-A" })!;

        /* The prewarm goes first, as intent precedes the click. */
        const warmed = readFinancialsCardVm(q);
        /* Then the card mounts and asks for the same account. */
        const asked = readFinancialsCardVm(q);
        f.release();
        const [a, b] = await Promise.all([warmed, asked]);

        expect(f.calls.length, "the duplicate-request defect must not return").toBe(1);
        expect(f.calls[0]).toContain("customer_id=cust-A");
        expect(b, "the joining caller RECEIVES the model — a void join would leave the card empty").toEqual(a);
        expect(b).not.toBeNull();
    });

    it("C: the read the card performs is the read the prewarm starts", () => {
        const card = executable(read("components/admin/focusPanel/cards/FinancialsCard.tsx"));
        expect(card, "the card consumes the shared read").toContain("await readFinancialsCardVm(query)");
        expect(card, "and no longer owns a per-instance coalescer").not.toContain("createInFlightCoalescer");
        expect(card, "nor fetches the card route itself").not.toMatch(/fetch\(`\/api\/admin\/financials\/card/);
    });
});

describe("E/F — a prewarm for one account can never satisfy another", () => {
    it("E: two accounts are two operations", async () => {
        const f = countingFetch();
        globalThis.fetch = f.stub as unknown as typeof globalThis.fetch;
        const A = readFinancialsCardVm(financialsCardQuery({ customerId: "cust-A" })!);
        const B = readFinancialsCardVm(financialsCardQuery({ customerId: "cust-B" })!);
        f.release();
        const [a, b] = await Promise.all([A, B]);
        expect(f.calls.length, "one family's answer may not be handed to another's request").toBe(2);
        expect(a).not.toEqual(b);
        expect(JSON.stringify(a)).toContain("cust-A");
        expect(JSON.stringify(b)).toContain("cust-B");
    });

    it("F: identity is the canonical customer id, never a label or a row position", () => {
        expect(financialsCardQuery({ customerId: "cust-A" })).toBe("customer_id=cust-A");
        /*
         * THE KEY IS DERIVED FROM THE CANONICAL ID AND NOTHING ELSE. A first cut of this gate only
         * asserted the happy shape, so planting a `label` fallback beside the id left it green —
         * the plant simply never fired for an input the test supplied. Anything else travelling on
         * the argument must be ignored, and the only way to assert that is to supply some.
         */
        const decoys = { customerId: "cust-A", label: "Certhouse Family", index: 3, rowId: "row-0", displayName: "Certhouse" };
        expect(
            financialsCardQuery(decoys as unknown as { customerId: string }),
            "a display label, a row index or a position may never reach the key",
        ).toBe("customer_id=cust-A");
        expect(
            financialsCardQuery({ label: "Certhouse Family" } as unknown as { customerId?: string }),
            "and with no canonical id there is no key at all, whatever else is offered",
        ).toBeNull();
        expect(financialsCardQuery({ customerId: "  " }), "blank is not an account").toBeNull();
        expect(financialsCardQuery({}), "and neither is nothing").toBeNull();
        /* A member-scoped subject is its own key, not a household's. */
        expect(financialsCardQuery({ customerMemberId: "mem-1" })).toBe("customer_member_id=mem-1");
        const host = executable(read("app/adminV2/financials/sections/FinancialsAccounts.tsx"));
        expect(host, "the host warms by canonical id").toContain("prewarmFinancialsCard(financialsCardQuery({ customerId }))");
    });
});

describe("G/H — a prewarm reads, and does nothing else", () => {
    it("G/H: it returns nothing to its caller, so it cannot commit or select", () => {
        const src = read("lib/adminV2/runtime/focusPanel/financials/financialsCardRead.ts");
        expect(src).toMatch(/export function prewarmFinancialsCard\(query: string \| null\): void/);
        const body = src.slice(src.indexOf("export function prewarmFinancialsCard"));
        expect(body, "GET only — a prewarm that mutates is the defect the tour cache exists to record")
            .not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)/i);
    });

    it("G: intent warms; only the click selects", () => {
        const host = executable(read("app/adminV2/financials/sections/FinancialsAccounts.tsx"));
        expect(host).toContain("onPointerEnter={() => onWarm(account.customerId)}");
        expect(host).toContain("onFocus={() => onWarm(account.customerId)}");
        expect(host, "selection stays with the click").toContain("onClick={() => onSelect(account.customerId)}");
        const rowStart = host.indexOf("function AccountQueueRow");
        const row = host.slice(rowStart, host.indexOf("</button>", rowStart));
        expect(row, "no intent handler may select").not.toMatch(/onPointerEnter=\{\(\) => onSelect|onFocus=\{\(\) => onSelect/);
    });
});

describe("I/J — a failed prediction latches nothing", () => {
    it("I: a failed prewarm does not poison the explicit read that follows", async () => {
        const q = financialsCardQuery({ customerId: "cust-C" })!;
        globalThis.fetch = (async () => { throw new Error("network"); }) as unknown as typeof globalThis.fetch;
        prewarmFinancialsCard(q);
        await new Promise((r) => setTimeout(r, 0));
        expect(financialsCardReadInFlight(), "a settled operation leaves the slot empty").toBeNull();

        const f = countingFetch();
        globalThis.fetch = f.stub as unknown as typeof globalThis.fetch;
        const retry = readFinancialsCardVm(q);
        f.release();
        expect(await retry, "the explicit read starts fresh work under the normal contract").not.toBeNull();
        expect(f.calls.length).toBe(1);
    });

    it("J: nothing survives an operation, so a mutation has nothing to invalidate", async () => {
        const f = countingFetch();
        globalThis.fetch = f.stub as unknown as typeof globalThis.fetch;
        const q = financialsCardQuery({ customerId: "cust-D" })!;
        const first = readFinancialsCardVm(q);
        f.release();
        await first;
        expect(financialsCardReadInFlight(), "cleared the instant it settles").toBeNull();
        /* The next ask is new work — which is the existing re-read doctrine, unchanged. */
        const g = countingFetch();
        globalThis.fetch = g.stub as unknown as typeof globalThis.fetch;
        const second = readFinancialsCardVm(q);
        g.release();
        await second;
        expect(g.calls.length, "a re-read after a mutation is a real read, never a stored answer").toBe(1);
    });
});

describe("A/B/K — the host participates, and F44 is untouched", () => {
    it("A/B: the default selection warms as soon as it is known", () => {
        const host = executable(read("app/adminV2/financials/sections/FinancialsAccounts.tsx"));
        expect(host, "the canonical selection starts the read").toMatch(
            /useEffect\(\(\) => \{\s*if \(selected\) warmAccount\(selected\);/,
        );
    });

    it("K: F44's contract is still asserted, and this repair does not touch it", () => {
        /*
         * The product decision stands: no visible partial Details. This slice makes the strict
         * guard cheap rather than weaker, so the assertion must survive verbatim.
         */
        const f44 = read("tests/financials/accountSurfaceConvergence.test.ts");
        expect(f44).toContain("F44 · no visible partial Details");
        expect(f44).toContain('expect(branches, "one Details branch, not a pending one and a real one").toHaveLength(1)');
        const card = executable(read("components/admin/focusPanel/cards/FinancialsCard.tsx"));
        expect((card.match(/if \(overlay === "detail"[^)]*\)/g) ?? []).length, "still exactly one Details branch").toBe(1);
        expect(card, "and no hydrating Details card is constructed").not.toMatch(/<FinancialsDetailCard\s+hydrating/);
    });
});

// @vitest-environment jsdom
/**
 * THE REAL PLAYWRIGHT DRIVER'S REVEAL SEQUENCE — over a scripted page, never a browser.
 *
 * `createPlaywrightWorkflowDriver` takes its Playwright through `loadPlaywright`, so this drives the production
 * driver code with a fake Chromium whose page is a jsdom document. What it proves is the driver's half of the
 * Financials capture: a reveal that FETCHES what the next reveal opens (Details → its ledger periods) is waited on
 * before the next selector is read. Before, the driver read the next selector immediately and then waited on
 * `networkidle` — a load state Playwright reports as already reached after `goto`, so the wait returned at once.
 */
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it } from "vitest";

import { createPlaywrightWorkflowDriver, trackNetworkQuiet } from "../../scripts/qa/qaWorkflowVerifierPlaywright.mjs";
import { FINANCIALS_HISTORICAL_DRAFT_UI_ADAPTER as A } from "../../scripts/qa/financialsHistoricalDraftUi";

const DRAFT = "7a1b2c3d-0000-4000-8000-00000000d001";
const ORIGIN = "http://127.0.0.1:4411";

/**
 * A page shaped like the record route: a compact card with a Details control; Details issues one read that lands
 * after `readMs` and only then renders a collapsed period; opening the period renders its rows.
 */
function scriptedPage({ readMs, readNeverLands = false }: { readMs: number; readNeverLands?: boolean }) {
    const events = new EventEmitter();
    const order: string[] = [];
    document.body.innerHTML = `<div data-financials-card="true"><button type="button" data-financials-nav="details">Details</button></div>`;
    const details = document.querySelector("[data-financials-nav]") as HTMLButtonElement;
    details.addEventListener("click", () => {
        order.push("details clicked");
        const req = { url: `${ORIGIN}/api/admin/financials/card?customer_id=x` };
        events.emit("request", req);
        if (readNeverLands) return;
        setTimeout(() => {
            document.body.insertAdjacentHTML(
                "beforeend",
                `<div data-financials-card="true" data-financials-overlay="detail"><section><button type="button" aria-expanded="false" data-financials-period-toggle="March 2026">March 2026</button></section></div>`,
            );
            const toggle = document.querySelector("[data-financials-period-toggle]") as HTMLButtonElement;
            toggle.addEventListener("click", () => {
                order.push("period clicked");
                toggle.setAttribute("aria-expanded", "true");
                toggle.insertAdjacentHTML(
                    "afterend",
                    `<div data-financials-ledger-row="${DRAFT}"><span class="alloy-os-billingdetail__amount">$75.00</span><span data-charge-state="scheduled"></span></div>`,
                );
            });
            order.push("read landed");
            events.emit("requestfinished", req);
        }, readMs);
    });
    const page = {
        on: (e: string, fn: (...a: unknown[]) => void) => events.on(e, fn),
        goto: async () => {},
        waitForLoadState: async () => {}, // what Playwright does after goto: already reached
        $$: async (selector: string) => {
            order.push(`read ${selector}`);
            return Array.from(document.querySelectorAll(selector)).map((el) => ({ click: async () => (el as HTMLElement).click() }));
        },
        $$eval: async (selector: string, fn: (els: Element[], s: unknown) => unknown, spec: unknown) => fn(Array.from(document.querySelectorAll(selector)), spec),
        url: () => `${ORIGIN}/workspace/record/child/x?card=financials`,
        content: async () => "",
        close: async () => {},
    };
    const loadPlaywright = async () => ({
        chromium: {
            launch: async () => ({
                newContext: async () => ({ route: async () => {}, newPage: async () => page, close: async () => {} }),
                close: async () => {},
            }),
        },
    });
    return { loadPlaywright, order };
}

const policy = { baseOrigin: ORIGIN, storageStatePath: "/nonexistent", reveal: A.reveal, capture: A.capture, judge: () => ({ ok: true }) };

afterEach(() => {
    document.body.innerHTML = "";
});

describe("the Playwright driver's reveal sequence", () => {
    it("waits for the Details read to land before reading the period disclosures, so the ledger rows are captured", async () => {
        const scene = scriptedPage({ readMs: 120 });
        const session = await createPlaywrightWorkflowDriver({ loadPlaywright: scene.loadPlaywright, timeoutMs: 3_000, quietMs: 40 }).open(policy);
        const visit = await session.visit("/workspace/record/child/x?card=financials");
        await session.close();
        const rows = visit.snapshot.ledger_rows as Array<{ attrs: Record<string, string> }>;
        expect(rows.map((r) => r.attrs["data-financials-ledger-row"])).toEqual([DRAFT]);
        const periodRead = scene.order.indexOf(`read ${A.reveal[1]}`);
        expect(scene.order.indexOf("read landed")).toBeGreaterThan(-1);
        expect(scene.order.indexOf("read landed")).toBeLessThan(periodRead);
        expect(scene.order).toContain("period clicked");
        // And the adapter, judging what the driver captured, sees the draft.
        expect(A.assert("child_financials", visit.snapshot as never, { draftChargeId: DRAFT }).filter((c) => !c.ok)).toEqual([]);
        // The diagnostic stages count what the page reached.
        expect((visit.snapshot.details_surfaces as unknown[]).length).toBe(1);
        expect((visit.snapshot.period_toggles as Array<{ attrs: Record<string, string> }>).map((t) => t.attrs["aria-expanded"])).toEqual(["true"]);
    });

    it("a read that never lands fails the visit at the bound — never a quiet pass over an empty ledger", async () => {
        const scene = scriptedPage({ readMs: 0, readNeverLands: true });
        const session = await createPlaywrightWorkflowDriver({ loadPlaywright: scene.loadPlaywright, timeoutMs: 300, quietMs: 40 }).open(policy);
        await expect(session.visit("/workspace/record/child/x?card=financials")).rejects.toThrow(/network-quiet/);
        expect(scene.order).not.toContain(`read ${A.reveal[1]}`);
        await session.close();
    });

    it("no reveal matched → no wait, and the capture reports what is there (zero rows)", async () => {
        const scene = scriptedPage({ readMs: 0 });
        document.body.innerHTML = `<div data-financials-card="true"></div>`;
        const session = await createPlaywrightWorkflowDriver({ loadPlaywright: scene.loadPlaywright, timeoutMs: 300, quietMs: 40 }).open(policy);
        const visit = await session.visit("/workspace/record/child/x?card=financials");
        await session.close();
        expect(visit.snapshot.ledger_rows).toEqual([]);
        expect((visit.snapshot.details_actions as unknown[]).length).toBe(0);
        expect((visit.snapshot.financials_cards as unknown[]).length).toBe(1);
    });
});

describe("trackNetworkQuiet", () => {
    function clock() {
        let t = 0;
        return { now: () => t, sleep: async (ms: number) => void (t += ms) };
    }
    function pageEvents() {
        const e = new EventEmitter();
        return { e, page: { on: (n: string, fn: (...a: unknown[]) => void) => e.on(n, fn) } };
    }

    it("settles only after nothing has been in flight for the quiet window", async () => {
        const c = clock();
        const { e, page } = pageEvents();
        const q = trackNetworkQuiet(page, { quietMs: 100, ...c });
        e.emit("request");
        let settled = false;
        const p = q.settled(10_000).then(() => (settled = true));
        await Promise.resolve();
        expect(settled).toBe(false);
        e.emit("requestfinished");
        const finishedAt = c.now();
        await p;
        expect(c.now() - finishedAt).toBeGreaterThanOrEqual(100);
    });

    it("a failed request also ends its flight; a stuck one rejects at the deadline", async () => {
        const c = clock();
        const { e, page } = pageEvents();
        const q = trackNetworkQuiet(page, { quietMs: 50, ...c });
        e.emit("request");
        e.emit("requestfailed");
        await expect(q.settled(1_000)).resolves.toBeUndefined();
        e.emit("request");
        await expect(q.settled(1_000)).rejects.toThrow(/network-quiet/);
    });
});

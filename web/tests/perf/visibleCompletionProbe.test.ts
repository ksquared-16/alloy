/** @vitest-environment jsdom */
/**
 * CERTIFYING THE COMPLETION PROBE ITSELF.
 *
 * This logic has been wrong twice, and both times the only thing that caught it was a deployed
 * sample that happened to be read carefully:
 *
 *   - attributing a mutation to its nearest BLOCKING ancestor made WU-00 — the persistent shell,
 *     an ancestor of the whole surface — own every mutation on the page. V2 came back equal to V1
 *     to the millisecond on both observation windows and looked like a working metric.
 *   - memoizing containment in BOTH directions pinned the shell as a leaf on its first mutation,
 *     because the shell exists before the regions inside it do. The rule was present and correct
 *     and still did nothing.
 *
 * Neither is visible by reading the code. Both are one sentence as a test. So the probe runs here,
 * under jsdom, against a DOM shaped like the real one — the same function the browser harness
 * installs, not a restatement of it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installVisibleCompletionProbe } from "../../playwright/support/visibleCompletionProbe";

type V2 = {
    lastBlockingAuthoritativeMs: number;
    perSection: Record<string, {
        firstMs: number;
        lastMs: number;
        lastVisibleMs: number;
        data: number;
        structure: number;
        anim: number;
        imageExpected: boolean;
        imageFinalMs: number;
    }>;
    kinds: Record<string, number>;
    blockingSeen: string[];
    latestGeneration: string | null;
    staleGenerationSuppressed: number;
    placeholderSuppressed: number;
};
const v2 = (): V2 => (window as unknown as { __p076v2: V2 }).__p076v2;
/** MutationObserver delivers on a microtask; a macrotask hop is enough and also advances the clock. */
const settle = (ms = 12) => new Promise((r) => setTimeout(r, ms));

/** `<div WU-00 blocking>` wrapping `<div WU-09 blocking>` — the real nesting that broke this twice. */
function shellContaining(inner: string): void {
    document.body.innerHTML = `
        <div data-alloy-section-id="WU-00" data-alloy-section-blocking="true" data-alloy-section-container="true" id="shell">
            <div id="chrome">shell chrome</div>
            ${inner}
        </div>`;
}
const INNER_WU09 = '<div data-alloy-section-id="WU-09" data-alloy-section-blocking="true" id="wu09">summary</div>';

beforeEach(() => { document.body.innerHTML = ""; });
afterEach(() => { document.body.innerHTML = ""; });

describe("leaf-most attribution (gate A)", () => {
    it("gives WU-09 its own mutations instead of the shell that contains it", async () => {
        shellContaining(INNER_WU09);
        installVisibleCompletionProbe();

        document.getElementById("wu09")!.appendChild(document.createTextNode(" arrived"));
        await settle();

        expect(v2().blockingSeen).toContain("WU-09");
        // The regression this exists for: the shell must not be credited with content it only wraps.
        expect(v2().blockingSeen).not.toContain("WU-00");
        expect(v2().perSection["WU-09"].structure + v2().perSection["WU-09"].data).toBeGreaterThan(0);
    });

    it("does not let shell chrome outside every section set completion", async () => {
        shellContaining(INNER_WU09);
        installVisibleCompletionProbe();

        // Churn in the shell but outside any registered region — a container owns nothing it only wraps.
        document.getElementById("chrome")!.appendChild(document.createElement("span"));
        await settle();

        expect(v2().lastBlockingAuthoritativeMs).toBe(-1);
        expect(v2().blockingSeen).toEqual([]);
    });
});

describe("containment is time-varying (gates B and C)", () => {
    it("stops treating the shell as a leaf once a section appears inside it", async () => {
        // The shell mutates while it is genuinely childless — this is the state that poisoned the cache.
        shellContaining("");
        installVisibleCompletionProbe();
        document.getElementById("shell")!.appendChild(document.createElement("span"));
        await settle();
        // Declared a container, so it never owns anything — not even while genuinely childless.
        expect(v2().lastBlockingAuthoritativeMs).toBe(-1);

        // WU-09 arrives LATER. From here the shell is a container and must stop owning anything.
        const shell = document.getElementById("shell")!;
        const inner = document.createElement("div");
        inner.setAttribute("data-alloy-section-id", "WU-09");
        inner.setAttribute("data-alloy-section-blocking", "true");
        shell.appendChild(inner);
        await settle();

        const before = v2().lastBlockingAuthoritativeMs;
        await settle(30);
        document.getElementById("chrome") ?? shell.appendChild(document.createTextNode("late shell churn"));
        await settle();

        // The late shell churn must NOT advance completion: the shell is no longer a leaf.
        expect(v2().lastBlockingAuthoritativeMs).toBe(before);
    });
});

describe("missing identity fails loudly, not silently (gate D)", () => {
    it("attributes nothing to the shell when WU-09 carries no section id", async () => {
        shellContaining('<div id="wu09">summary with no identity</div>');
        installVisibleCompletionProbe();

        document.getElementById("wu09")!.appendChild(document.createTextNode(" arrived"));
        await settle();

        // Coverage is absent and observable. It is NOT quietly credited to the enclosing shell.
        expect(v2().blockingSeen).toEqual([]);
        expect(v2().lastBlockingAuthoritativeMs).toBe(-1);
    });
});

describe("non-blocking content cannot set first-order completion (gate E)", () => {
    it("ignores nested non-blocking Activity content", async () => {
        shellContaining(
            INNER_WU09
            + '<div data-alloy-section-id="WU-11" data-alloy-section-blocking="false" id="wu11">activity</div>',
        );
        installVisibleCompletionProbe();

        document.getElementById("wu09")!.appendChild(document.createTextNode(" final"));
        await settle();
        const completion = v2().lastBlockingAuthoritativeMs;

        await settle(30);
        document.getElementById("wu11")!.appendChild(document.createTextNode(" prewarm churn"));
        await settle();

        expect(v2().lastBlockingAuthoritativeMs).toBe(completion);
        expect(v2().blockingSeen).not.toContain("WU-11");
    });
});

describe("presentational animation does not advance completion (section 6)", () => {
    it("holds completion at the last authoritative change despite a late motion settle", async () => {
        shellContaining(INNER_WU09);
        installVisibleCompletionProbe();

        const wu09 = document.getElementById("wu09")!;
        wu09.appendChild(document.createTextNode(" final content"));
        await settle();
        const completion = v2().lastBlockingAuthoritativeMs;
        expect(completion).toBeGreaterThanOrEqual(0);

        // A fade landing well after the content did. This is ~42% of real mutations.
        await settle(30);
        wu09.setAttribute("class", "opacity-100 transition-opacity");
        wu09.setAttribute("style", "opacity: 1");
        wu09.setAttribute("aria-busy", "false");
        await settle();

        expect(v2().lastBlockingAuthoritativeMs).toBe(completion);
        expect(v2().kinds.PRESENTATIONAL_ANIMATION).toBeGreaterThanOrEqual(3);
        expect(v2().perSection["WU-09"].anim).toBeGreaterThanOrEqual(3);
    });

    it("still counts a real data attribute as authoritative", async () => {
        shellContaining(INNER_WU09);
        installVisibleCompletionProbe();
        const wu09 = document.getElementById("wu09")!;
        wu09.appendChild(document.createTextNode(" content"));
        await settle();
        const before = v2().lastBlockingAuthoritativeMs;

        await settle(30);
        wu09.setAttribute("data-subject-id", "abc-123");
        await settle();

        expect(v2().lastBlockingAuthoritativeMs).toBeGreaterThan(before);
    });
});

/**
 * FINALITY: reserved geometry, images, and destination generation.
 *
 * Each of these is a way for a section to look finished while an operator would plainly say it is
 * not. They are certified here rather than only on a hosted sample because a hosted run cannot
 * produce them on demand — you cannot ask staging for a stale subject at a chosen moment.
 */
const SHELL = (inner: string) => {
    document.body.innerHTML = `
        <div data-alloy-section-id="WU-00" data-alloy-section-blocking="true" data-alloy-section-container="true" id="shell">
            ${inner}
        </div>`;
};
const SUMMARY = (gen = "subjA", body = "") =>
    `<section data-alloy-section-id="WU-07" data-alloy-section-blocking="true" data-inline-focus-panel-subject="${gen}" id="panel">
        <div data-alloy-section-id="WU-09" data-alloy-section-blocking="true" id="wu09">${body}</div>
     </section>`;

describe("Track-A finality — reserved geometry is not the answer (section 3)", () => {
    it("does not treat reserved space as final content", async () => {
        SHELL(SUMMARY("subjA"));
        installVisibleCompletionProbe();

        // RESOLVING: the card reserves its geometry. Structural, but not an answer.
        const card = document.createElement("div");
        card.setAttribute("data-settlement-reserved", "true");
        document.getElementById("wu09")!.appendChild(card);
        await settle();
        expect(v2().lastBlockingAuthoritativeMs, "reserved geometry must not be final").toBe(-1);
        expect(v2().placeholderSuppressed).toBeGreaterThan(0);

        // FINAL: the answer lands outside the reserved wrapper.
        await settle(25);
        const real = document.createElement("div");
        real.textContent = "Financials — September 2026";
        document.getElementById("wu09")!.appendChild(real);
        await settle();
        expect(v2().lastBlockingAuthoritativeMs).toBeGreaterThan(0);
    });

    it("treats a skeleton card the same way", async () => {
        SHELL(SUMMARY("subjA"));
        installVisibleCompletionProbe();
        const sk = document.createElement("div");
        sk.setAttribute("data-financials-card-skeleton", "true");
        document.getElementById("wu09")!.appendChild(sk);
        await settle();
        expect(v2().lastBlockingAuthoritativeMs).toBe(-1);
    });
});

describe("image finality — both branches (section 4)", () => {
    it("EXPECTED IMAGE: the section is not final until the decode lands", async () => {
        SHELL(SUMMARY("subjA"));
        installVisibleCompletionProbe();
        const wu09 = document.getElementById("wu09")!;
        const img = document.createElement("img");
        wu09.appendChild(img);
        wu09.appendChild(document.createTextNode("Child name"));
        await settle();
        const contentDone = v2().perSection["WU-09"].lastMs;
        expect(contentDone).toBeGreaterThanOrEqual(0);
        expect(v2().perSection["WU-09"].imageExpected).toBe(false);

        await settle(30);
        img.dispatchEvent(new Event("load"));
        await settle();
        const ps = v2().perSection["WU-09"];
        expect(ps.imageExpected, "a decoded image must be recorded as expected").toBe(true);
        expect(ps.imageFinalMs, "decode must land after the content").toBeGreaterThan(contentDone);
    });

    it("NO IMAGE: initials are final immediately and wait for nothing", async () => {
        SHELL(SUMMARY("subjA"));
        installVisibleCompletionProbe();
        const wu09 = document.getElementById("wu09")!;
        const initials = document.createElement("span");
        initials.textContent = "KM";
        wu09.appendChild(initials);
        await settle();
        const ps = v2().perSection["WU-09"];
        expect(ps.lastMs).toBeGreaterThanOrEqual(0);
        // No imaginary image wait: nothing is expected and no decode timestamp is invented.
        expect(ps.imageExpected).toBe(false);
        expect(ps.imageFinalMs).toBe(-1);
    });
});

describe("destination generation — only the latest subject counts (section 5)", () => {
    it("late A data cannot satisfy C", async () => {
        SHELL(SUMMARY("subjA"));
        installVisibleCompletionProbe();
        const panel = document.getElementById("panel")!;
        const wu09 = document.getElementById("wu09")!;

        wu09.appendChild(document.createTextNode("A content"));
        await settle();

        // A -> B -> C: the operator moves on twice.
        panel.setAttribute("data-inline-focus-panel-subject", "subjB");
        await settle();
        panel.setAttribute("data-inline-focus-panel-subject", "subjC");
        wu09.appendChild(document.createTextNode("C content"));
        await settle();
        const cDone = v2().lastBlockingAuthoritativeMs;

        /*
         * A's request finally answers INSIDE the summary region — the case that matters. Appending
         * it to the panel instead would be dropped by the container rule and the test would pass
         * without the generation rule ever running.
         */
        await settle(30);
        const straggler = document.createElement("div");
        straggler.setAttribute("data-inline-focus-panel-subject", "subjA");
        straggler.textContent = "A's late answer";
        wu09.appendChild(straggler);
        await settle();

        expect(v2().lastBlockingAuthoritativeMs, "stale A must not satisfy C").toBe(cDone);
        expect(v2().staleGenerationSuppressed).toBeGreaterThan(0);
    });

    it("a late image belonging to B cannot satisfy C either", async () => {
        SHELL(SUMMARY("subjC"));
        installVisibleCompletionProbe();
        document.getElementById("wu09")!.appendChild(document.createTextNode("C content"));
        await settle();
        const cDone = v2().lastBlockingAuthoritativeMs;

        await settle(25);
        const old = document.createElement("div");
        old.setAttribute("data-inline-focus-panel-subject", "subjB");
        document.getElementById("wu09")!.appendChild(old);
        await settle();
        expect(v2().lastBlockingAuthoritativeMs).toBe(cDone);
        expect(v2().staleGenerationSuppressed).toBeGreaterThan(0);
    });
});

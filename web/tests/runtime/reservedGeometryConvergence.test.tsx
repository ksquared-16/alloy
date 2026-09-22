// @vitest-environment jsdom
/**
 * SLICE 14 — RESERVED GEOMETRY CONVERGENCE.
 *
 * Financials was repaired in Slice 4: a card that clears its truth on subject change must keep the
 * footprint it last settled at, so the panel below it does not jump while the next subject resolves.
 * Three more cards have the same shape — Attendance, Health & Safety and Current Work — and each of
 * them collapsed to a one-line pending body. They now share one expression of that contract,
 * `useReservedCardGeometry`.
 *
 * Two halves, deliberately:
 *
 *  - BEHAVIOUR proves the contract itself: remember the settled footprint, reserve it while pending,
 *    fall back to the shared floor before anything has ever settled, and carry NO content across.
 *  - WIRING proves each adopter actually reaches that behaviour. Slice 4's first attempt failed not
 *    because the hook was wrong but because the `ref` sat on a root the loaded card never returned
 *    through, so the remembered height was never recorded and the reserve silently read the floor.
 *    That is a wiring defect a behavioural test of the hook cannot see, and it is the defect planted
 *    to prove these locks bind.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import {
    FOCUS_PANEL_RESERVED_MIN_HEIGHT,
    useReservedCardGeometry,
} from "@/components/admin/focusPanel/FocusPanelSummarySkeleton";

// jsdom lays nothing out, so height is supplied explicitly — the measurement under test is "what
// did the card read when it was settled", not "can jsdom do layout".
let measuredHeight = 0;
const realRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
    measuredHeight = 0;
    Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element) {
        return { ...realRect.call(this), height: measuredHeight } as DOMRect;
    };
});

afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect;
});

function mount(ui: ReactNode) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(ui);
    });
    return {
        container,
        rerender: (next: ReactNode) => act(() => root.render(next)),
        unmount: () => act(() => root.unmount()),
    };
}

/** A card with ONE root for every state — Current Work's shape. */
function SingleRootCard({ settled }: { settled: boolean }) {
    const g = useReservedCardGeometry(settled);
    return createElement(
        "div",
        {
            ref: g.ref,
            "data-card": "single",
            "data-reserved": g.reserved ? "true" : undefined,
            style: g.style,
        },
        settled ? createElement("p", null, "SETTLED BODY") : createElement("p", null, "Loading…"),
    );
}

/**
 * A card with TWO roots — Attendance's and Health's shape. `refOnSettledRoot` reproduces the Slice 4
 * defect on demand: the loaded card returns through a root with no ref, so nothing is ever measured.
 */
function TwoRootCard({
    settled,
    refOnSettledRoot,
}: {
    settled: boolean;
    refOnSettledRoot: boolean;
}) {
    const g = useReservedCardGeometry(settled);
    if (settled) {
        return createElement(
            "div",
            { ref: refOnSettledRoot ? g.ref : undefined, "data-card": "settled" },
            createElement("p", null, "SETTLED BODY"),
        );
    }
    return createElement(
        "div",
        {
            ref: g.ref,
            "data-card": "pending",
            "data-reserved": g.reserved ? "true" : undefined,
            style: g.style,
        },
        createElement("p", null, "Loading…"),
    );
}

function rootOf(container: HTMLElement): HTMLElement {
    return container.firstElementChild as HTMLElement;
}

describe("reserved geometry — behaviour", () => {
    it("reserves the shared floor before anything has ever settled", () => {
        const { container, unmount } = mount(createElement(SingleRootCard, { settled: false }));
        expect(rootOf(container).style.minHeight).toBe(FOCUS_PANEL_RESERVED_MIN_HEIGHT);
        expect(rootOf(container).getAttribute("data-reserved")).toBe("true");
        unmount();
    });

    it("remembers the settled footprint and reserves it while pending", () => {
        measuredHeight = 224;
        const { container, rerender, unmount } = mount(
            createElement(SingleRootCard, { settled: true }),
        );
        // Settled: nothing reserved, no imposed height.
        expect(rootOf(container).style.minHeight).toBe("");
        expect(rootOf(container).getAttribute("data-reserved")).toBeNull();

        rerender(createElement(SingleRootCard, { settled: false }));
        expect(rootOf(container).style.minHeight).toBe("224px");
        expect(rootOf(container).getAttribute("data-reserved")).toBe("true");
        unmount();
    });

    it("carries no content across — the pending body is the pending body", () => {
        measuredHeight = 224;
        const { container, rerender, unmount } = mount(
            createElement(SingleRootCard, { settled: true }),
        );
        expect(container.textContent).toContain("SETTLED BODY");

        rerender(createElement(SingleRootCard, { settled: false }));
        expect(
            container.textContent,
            "reserving a footprint must never retain the prior subject's content",
        ).not.toContain("SETTLED BODY");
        expect(container.textContent).toContain("Loading…");
        unmount();
    });

    it("the remembered footprint follows the LAST settled height, not the first", () => {
        measuredHeight = 224;
        const { container, rerender, unmount } = mount(
            createElement(SingleRootCard, { settled: true }),
        );
        rerender(createElement(SingleRootCard, { settled: false }));
        expect(rootOf(container).style.minHeight).toBe("224px");

        // The next subject legitimately settles taller; that is the new footprint to hold.
        measuredHeight = 341;
        rerender(createElement(SingleRootCard, { settled: true }));
        rerender(createElement(SingleRootCard, { settled: false }));
        expect(rootOf(container).style.minHeight).toBe("341px");
        unmount();
    });

    it("a zero measurement is not remembered as a footprint", () => {
        measuredHeight = 0; // an unlaid-out or display:none root
        const { container, rerender, unmount } = mount(
            createElement(SingleRootCard, { settled: true }),
        );
        rerender(createElement(SingleRootCard, { settled: false }));
        expect(rootOf(container).style.minHeight).toBe(FOCUS_PANEL_RESERVED_MIN_HEIGHT);
        unmount();
    });

    it("a settled EMPTY card is settled — not reserved, and its footprint is what is remembered", () => {
        measuredHeight = 300;
        const { container, rerender, unmount } = mount(createElement(SingleRootCard, { settled: true }));
        rerender(createElement(SingleRootCard, { settled: false }));
        expect(rootOf(container).style.minHeight).toBe("300px");

        // The next subject has no record at all: one line, and that IS the answer.
        measuredHeight = 118;
        rerender(createElement(SingleRootCard, { settled: true }));
        expect(rootOf(container).style.minHeight, "an answered card is never padded").toBe("");
        expect(rootOf(container).getAttribute("data-reserved")).toBeNull();

        // …and the one line is the footprint now. Holding 300px here would be invented height.
        rerender(createElement(SingleRootCard, { settled: false }));
        expect(rootOf(container).style.minHeight).toBe("118px");
        unmount();
    });

    it("SLICE 4 REGRESSION: a two-root card measures only if the SETTLED root holds the ref", () => {
        measuredHeight = 224;
        const wired = mount(createElement(TwoRootCard, { settled: true, refOnSettledRoot: true }));
        wired.rerender(createElement(TwoRootCard, { settled: false, refOnSettledRoot: true }));
        expect(rootOf(wired.container).style.minHeight).toBe("224px");
        wired.unmount();

        const unwired = mount(
            createElement(TwoRootCard, { settled: true, refOnSettledRoot: false }),
        );
        unwired.rerender(createElement(TwoRootCard, { settled: false, refOnSettledRoot: false }));
        expect(
            rootOf(unwired.container).style.minHeight,
            "this is the Slice 4 failure — it falls back to the floor and looks like it works",
        ).toBe(FOCUS_PANEL_RESERVED_MIN_HEIGHT);
        unwired.unmount();
    });
});

const CARDS = join(process.cwd(), "components/admin/focusPanel/cards");
const read = (f: string) => readFileSync(join(CARDS, f), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The opening tag of the root `<div …>` that immediately precedes `marker` in the source. */
function rootTagBefore(code: string, marker: string): string {
    const at = code.indexOf(marker);
    expect(at, `marker not found: ${marker}`).toBeGreaterThan(-1);
    const open = code.lastIndexOf("<div", at);
    return code.slice(open, code.indexOf(">", code.indexOf("\n", open)) + 1);
}

describe("reserved geometry — adopter wiring", () => {
    it("Attendance holds the ref on BOTH the settled root and the pending root", () => {
        const code = strip(read("AttendanceCard.tsx"));
        expect(rootTagBefore(code, "<ApprovedAttendanceCard")).toContain("ref={reservedGeometry.ref}");
        const pending = rootTagBefore(code, 'data-attendance-reserved');
        expect(pending).toContain("ref={reservedGeometry.ref}");
        expect(pending).toContain("style={reservedGeometry.style}");
    });

    it("Attendance reserves against RESOLVING — its own fetch and the root's projection", () => {
        const code = strip(read("AttendanceCard.tsx"));
        /*
         * WS1 reconciliation. This was `!loading` when the card owned its bootstrap fetch. The
         * attendance producer now runs inside the root provisioning lifecycle, so the card can also
         * be waiting on a projection that has not arrived — which is why it renders "Loading the
         * day…" on `loading || provisioning` rather than asserting an absence. The reserve tracks the
         * same union: reserving against anything narrower leaves the collapse this repair removes,
         * in the window that is now the common one on a cold panel.
         */
        expect(code).toMatch(/useReservedCardGeometry\(!\(loading \|\| provisioning\)\)/);
        /*
         * The intent is that the RESERVE and the pending COPY agree about what "not settled" means.
         * P0-3 split the old single ternary so that a producer failure, a refusal and a genuine
         * absence stop sharing one sentence, so this asserts the agreement rather than the literal
         * expression it used to take: the loading copy is still gated on exactly `loading ||
         * provisioning`, which is the predicate the reserve negates.
         */
        expect(
            code,
            "the reserve and the copy must agree about what 'not settled' means",
        ).toMatch(/loading \|\| provisioning \? \(/);
        expect(code).toMatch(/data-attendance-empty="loading"/);
        // Still not keyed to HAVING DATA: a recordless child is an answer, not a pending state.
        expect(code).not.toMatch(/useReservedCardGeometry\(vm != null\)/);
    });

    it("Health holds the ref on BOTH the settled root and the fallback root", () => {
        const code = strip(read("HealthSafetyCard.tsx"));
        expect(
            rootTagBefore(code, "<ApprovedHealthSafetyCard"),
            "Slice 4's exact defect: the loaded card returns through this root",
        ).toContain("ref={reservedGeometry.ref}");
        const fallback = rootTagBefore(code, "data-health-reserved");
        expect(fallback).toContain("ref={reservedGeometry.ref}");
        expect(fallback).toContain("style={reservedGeometry.style}");
    });

    it("Health reserves against LOADING — a refusal and an unavailable reason are answers", () => {
        const code = strip(read("HealthSafetyCard.tsx"));
        expect(code).toMatch(/useReservedCardGeometry\(!loading\)/);
        // Both settled outcomes render through the fallback root, which is why it holds the ref.
        expect(code).toMatch(/data-health-empty="permission"/);
        expect(code).toMatch(/data-health-empty="unavailable"/);
    });

    it("Current Work reserves on its single root, keyed to the pending perspective", () => {
        const code = strip(read("CurrentWorkCard.tsx"));
        expect(code).toMatch(/useReservedCardGeometry\(!stageWorkPending\)/);
        const root = rootTagBefore(code, "data-work-reserved");
        expect(root).toContain("ref={reservedGeometry.ref}");
        expect(root).toContain("style={reservedGeometry.style}");
        expect(
            [...code.matchAll(/ref=\{reservedGeometry\.ref\}/g)].length,
            "Current Work has one root for every perspective",
        ).toBe(1);
    });

    it("every adopter imports the one shared contract — no second reserved-height primitive", () => {
        for (const file of ["AttendanceCard.tsx", "HealthSafetyCard.tsx", "CurrentWorkCard.tsx"]) {
            const code = read(file);
            expect(code, file).toContain(
                'import { useReservedCardGeometry } from "@/components/admin/focusPanel/FocusPanelSummarySkeleton"',
            );
            expect(code.replace(/\/\*[\s\S]*?\*\//g, ""), `${file} must not hard-code the floor`).not.toContain(
                "7.5rem",
            );
        }
    });

    /**
     * ── THE DOCTRINE THIS LOCK USED TO ENCODE, AND WHY IT CHANGED ────────────────────────────
     *
     * This lock pinned the literal `data-financials-reserved={reservingAccount ? "true" :
     * undefined}`. It went red when the guard was narrowed to `reservesFootprint`, and stayed red
     * for several programmes as EXTERNAL_FINANCIALS_TEST_DEBT, each correctly declining to make it
     * green without deciding whose truth had moved.
     *
     * It was the LOCK that was wrong, and measurably so. Slice 4's certified doctrine is an EFFECT
     * — the card must not collapse to a one-line body and must not jump when the read lands. This
     * lock pinned a MECHANISM instead, so the one change that improved the effect broke it:
     *
     *   Financials → Accounts → selected account committed at 120px and SHRANK to 93px when the
     *   read landed. 120px is FOCUS_PANEL_RESERVED_MIN_HEIGHT exactly, so the shift was the floor,
     *   not the data. The account variant's pending frame is `AccountSummaryPending` — the same
     *   three-stat strip and the same two commands as the resolved summary — so it was already the
     *   right shape and 27px shorter than the floor reserving for it.
     *
     * A floor is for a collapse. The Focus Panel variant's pending state IS a collapse (three
     * skeleton labels in an `__empty` block), so it keeps the floor. The account variant commits
     * its anatomy up front, so it holds its own geometry.
     *
     * The lock is therefore rewritten to the effect rather than the mechanism: the card reserves
     * exactly when it says it is loading, one expression drives both the attribute and the style,
     * and the floor lands only where a collapse is possible. A literal is asserted only where the
     * literal IS the effect — the two roots, and the account identity on them.
     */
    it("Financials reserves exactly when it can collapse, and never over a committed frame", () => {
        // Deliberately NOT refactored onto the hook: reopening a certified repair to make it look
        // like its successors buys nothing and risks the thing that is already proven.
        const code = strip(read("FinancialsCard.tsx"));
        expect([...code.matchAll(/ref=\{shellRef\}/g)].length).toBe(2);
        expect(code).toMatch(/loadedHeightRef/);

        /*
         * ── THE RESERVE IS THE LOADING SENTENCE ──────────────────────────────────────────────
         *
         * The defect class this replaces the literal with: a new vm-less answer added to the
         * loading branch and not to the reserve (or the other way round), so the card either says
         * "Loading the account…" in a collapsed body, or holds a floor over a settled sentence.
         * `awaitingFirstAnswer` was exactly such an addition, and it is why this is a set
         * comparison rather than a pinned string.
         */
        const reserve = /const reservingAccount =\s*!vm && !deniedRead && \(([^)]*)\)/.exec(code);
        expect(reserve, "the reserve condition is still stated in one place").toBeTruthy();
        const sentence = /deniedRead \? \([\s\S]*?\) : ([a-zA-Z|\s]*?) \? \(/.exec(code);
        expect(sentence, "the loading branch is still stated in one place").toBeTruthy();
        const terms = (x: string) => x.split("||").map((t) => t.trim()).filter(Boolean).sort();
        expect(terms(sentence![1]), "the card reserves under exactly the conditions it says it is loading under")
            .toEqual(terms(reserve![1]));

        /*
         * ── ONE EXPRESSION DRIVES THE ATTRIBUTE AND THE STYLE ────────────────────────────────
         *
         * A card that reports `data-financials-reserved="true"` while applying no minHeight — or
         * applies one without saying so — is unmeasurable: every proof of this doctrine reads the
         * attribute and believes it.
         */
        const attr = /data-financials-reserved=\{(\w+) \? "true" : undefined\}/.exec(code);
        const style = /style=\{\s*(\w+)\s*\?\s*\{ minHeight:/.exec(code);
        expect(attr, "the reserve is still declared on the root").toBeTruthy();
        expect(style, "and still applied as a minHeight").toBeTruthy();
        expect(attr![1], "the attribute and the floor are the same decision").toBe(style![1]);

        /*
         * ── THE FLOOR LANDS ONLY WHERE A COLLAPSE IS POSSIBLE ────────────────────────────────
         *
         * Two halves, and both are required: the floor must exclude the variant whose pending
         * frame is already committed, AND that variant must actually render the committed frame.
         * Excluding it while it renders the one-line loader would reintroduce the collapse this
         * whole slice exists to prevent.
         */
        const floor = new RegExp(`const ${attr![1]} = reservingAccount && summaryVariant !== "account"`);
        expect(code, "the committed variant is not given a floor").toMatch(floor);
        expect(code, "and it is committed — the resolved anatomy, not a one-line loader")
            .toMatch(/summaryVariant === "account" \? \(\s*<AccountSummaryPending \/>/);

        // Staging's account identity survives on the same root.
        expect(code).toMatch(/data-financials-account=\{vm\?\.account\?\.customerId \?\? undefined\}/);
    });
});

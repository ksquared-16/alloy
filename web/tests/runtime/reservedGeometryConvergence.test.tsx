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

    it("Financials keeps its own certified Slice 4 geometry on both of its roots", () => {
        // Deliberately NOT refactored onto the hook: reopening a certified repair to make it look
        // like its successors buys nothing and risks the thing that is already proven.
        const code = strip(read("FinancialsCard.tsx"));
        expect([...code.matchAll(/ref=\{shellRef\}/g)].length).toBe(2);
        expect(code).toMatch(/loadedHeightRef/);
        /*
         * WS1 reconciliation. The reserve was `!vm`, when the only way to have no vm was to be
         * loading one. The root lifecycle gave this card three further vm-less answers — a permission
         * refusal, no resolvable subject, no account — each a settled sentence entitled to its own
         * size. So the reserve is exactly the condition under which the card says "Loading the
         * account…", and staging's new answers stay answers.
         */
        expect(code).toMatch(
            /const reservingAccount = !vm && !deniedRead && \(loading \|\| subjectStillResolving \|\| provisioningAccount\)/,
        );
        expect(code).toMatch(/data-financials-reserved=\{reservingAccount \? "true" : undefined\}/);
        // Staging's account identity survives on the same root.
        expect(code).toMatch(/data-financials-account=\{vm\?\.account\?\.customerId \?\? undefined\}/);
    });
});

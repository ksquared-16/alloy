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
function SingleRootCard({ hasContent }: { hasContent: boolean }) {
    const g = useReservedCardGeometry(hasContent);
    return createElement(
        "div",
        {
            ref: g.ref,
            "data-card": "single",
            "data-reserved": g.reserved ? "true" : undefined,
            style: g.style,
        },
        hasContent ? createElement("p", null, "SETTLED BODY") : createElement("p", null, "Loading…"),
    );
}

/**
 * A card with TWO roots — Attendance's and Health's shape. `refOnSettledRoot` reproduces the Slice 4
 * defect on demand: the loaded card returns through a root with no ref, so nothing is ever measured.
 */
function TwoRootCard({
    hasContent,
    refOnSettledRoot,
}: {
    hasContent: boolean;
    refOnSettledRoot: boolean;
}) {
    const g = useReservedCardGeometry(hasContent);
    if (hasContent) {
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
        const { container, unmount } = mount(createElement(SingleRootCard, { hasContent: false }));
        expect(rootOf(container).style.minHeight).toBe(FOCUS_PANEL_RESERVED_MIN_HEIGHT);
        expect(rootOf(container).getAttribute("data-reserved")).toBe("true");
        unmount();
    });

    it("remembers the settled footprint and reserves it while pending", () => {
        measuredHeight = 224;
        const { container, rerender, unmount } = mount(
            createElement(SingleRootCard, { hasContent: true }),
        );
        // Settled: nothing reserved, no imposed height.
        expect(rootOf(container).style.minHeight).toBe("");
        expect(rootOf(container).getAttribute("data-reserved")).toBeNull();

        rerender(createElement(SingleRootCard, { hasContent: false }));
        expect(rootOf(container).style.minHeight).toBe("224px");
        expect(rootOf(container).getAttribute("data-reserved")).toBe("true");
        unmount();
    });

    it("carries no content across — the pending body is the pending body", () => {
        measuredHeight = 224;
        const { container, rerender, unmount } = mount(
            createElement(SingleRootCard, { hasContent: true }),
        );
        expect(container.textContent).toContain("SETTLED BODY");

        rerender(createElement(SingleRootCard, { hasContent: false }));
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
            createElement(SingleRootCard, { hasContent: true }),
        );
        rerender(createElement(SingleRootCard, { hasContent: false }));
        expect(rootOf(container).style.minHeight).toBe("224px");

        // The next subject legitimately settles taller; that is the new footprint to hold.
        measuredHeight = 341;
        rerender(createElement(SingleRootCard, { hasContent: true }));
        rerender(createElement(SingleRootCard, { hasContent: false }));
        expect(rootOf(container).style.minHeight).toBe("341px");
        unmount();
    });

    it("a zero measurement is not remembered as a footprint", () => {
        measuredHeight = 0; // an unlaid-out or display:none root
        const { container, rerender, unmount } = mount(
            createElement(SingleRootCard, { hasContent: true }),
        );
        rerender(createElement(SingleRootCard, { hasContent: false }));
        expect(rootOf(container).style.minHeight).toBe(FOCUS_PANEL_RESERVED_MIN_HEIGHT);
        unmount();
    });

    it("SLICE 4 REGRESSION: a two-root card measures only if the SETTLED root holds the ref", () => {
        measuredHeight = 224;
        const wired = mount(createElement(TwoRootCard, { hasContent: true, refOnSettledRoot: true }));
        wired.rerender(createElement(TwoRootCard, { hasContent: false, refOnSettledRoot: true }));
        expect(rootOf(wired.container).style.minHeight).toBe("224px");
        wired.unmount();

        const unwired = mount(
            createElement(TwoRootCard, { hasContent: true, refOnSettledRoot: false }),
        );
        unwired.rerender(createElement(TwoRootCard, { hasContent: false, refOnSettledRoot: false }));
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

    it("Attendance's content predicate is the settled branch condition", () => {
        const code = strip(read("AttendanceCard.tsx"));
        expect(code).toMatch(/useReservedCardGeometry\(vm != null\)/);
        expect(code, "the settled body renders under `if (vm)`").toMatch(/if \(vm\) \{/);
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

    it("Health's content predicate is its settled branch condition verbatim", () => {
        const code = strip(read("HealthSafetyCard.tsx"));
        // `vm != null` alone would call an unavailable-reason vm "content" — it renders one line.
        expect(code).toMatch(
            /useReservedCardGeometry\(vm != null && !denied && !vm\.unavailableReason\)/,
        );
        expect(code).toMatch(/if \(vm && !denied && !vm\.unavailableReason\) \{/);
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
    });
});

/**
 * THE MICRO NAVIGATION TRANSITION — a presentation enhancement that is forbidden to become a
 * performance architecture.
 *
 * It must acknowledge a Work View switch and a queue-row switch, and it must do so without buying
 * a single millisecond by changing when the operator is allowed to see truth. These gates hold the
 * six ways that could go wrong, all of which are cheap to introduce and invisible in review.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CSS = read("app/globals.css");
const HOOK = codeOf(read("components/presentation/workUnit/useSwapAcknowledgement.ts"));
const SURFACE = codeOf(read("components/presentation/workUnit/WorkUnitSurface.tsx"));
const PANEL = codeOf(read("components/presentation/workUnit/FocusPanelSurface.tsx"));
const PROBE = codeOf(read("playwright/support/visibleCompletionProbe.ts"));

/** The rule block, isolated so a selector elsewhere in a 2,000-line stylesheet cannot satisfy a gate. */
const swapRules = CSS.split("\n").filter((l) => l.includes(".motion-swap-region")).join("\n");

describe("B6/B12 — the transition may not touch Metric V2.1", () => {
    it("the toggle rides the CLASS channel, which V2.1 already classifies as presentational", () => {
        expect(swapRules).toContain(".motion-swap-region.is-swapping");
        expect(SURFACE + PANEL).toContain("is-swapping");
    });

    it("V2.1 still classifies class mutations as PRESENTATIONAL_ANIMATION, which does not advance finality", () => {
        // If this ever stops being true, the acknowledgement starts extending the metric.
        expect(PROBE).toMatch(/ANIMATION_ATTRS\s*=\s*new Set\(\[[^\]]*"class"/);
        expect(PROBE).toMatch(/PRESENTATIONAL_ANIMATION:\s*false/);
    });

    it("the transition is NOT driven by an attribute a stylesheet selects on", () => {
        /*
         * THE DEFECT THIS SLICE ACTUALLY SHIPPED AND CAUGHT. The first implementation toggled
         * `data-swapping` and styled `.motion-swap-region[data-swapping="true"]`. V2.1's semantic
         * authority rule counts an attribute as AUTHORITATIVE when a live stylesheet selects on
         * it — so that selector would have made the acknowledgement advance finality, extending
         * the very metric Part B may not touch. `class` is the presentational channel.
         */
        expect(swapRules).not.toContain("data-swapping");
        expect(PANEL).not.toContain("data-swapping");
    });

    it("Metric V2.1 itself is untouched by this feature", () => {
        expect(PROBE).not.toContain("is-swapping");
        expect(PROBE).not.toContain("motion-swap-region");
    });
});

describe("B7/B12 — the transition may not delay the request", () => {
    it("both handlers call the destination intent BEFORE acknowledging", () => {
        for (const [intent, ack] of [
            ["intents.selectWorkView(id);", "queueSwap.acknowledge();"],
            ["intents.openRecord(row);", "recordSwap.acknowledge();"],
        ]) {
            const i = SURFACE.indexOf(intent);
            const a = SURFACE.indexOf(ack);
            expect(i, `${intent} present`).toBeGreaterThan(-1);
            expect(a, `${ack} present`).toBeGreaterThan(-1);
            expect(i, `${intent} must precede ${ack}`).toBeLessThan(a);
        }
    });

    it("no CLICK -> animation -> request edge: nothing defers the intent", () => {
        // A setTimeout/await/requestAnimationFrame around the intent is the whole failure mode.
        const handlers = SURFACE.slice(SURFACE.indexOf("onSelect={(id)"), SURFACE.indexOf("prefetchRecord={intents.prefetchRecord}"));
        expect(handlers.length).toBeGreaterThan(0);
        for (const deferral of ["setTimeout", "await ", "requestAnimationFrame", "queueMicrotask", ".then("]) {
            expect(handlers, `intent must not be deferred by ${deferral}`).not.toContain(deferral);
        }
    });
});

describe("B8/B12 — rapid switching: newest destination wins", () => {
    it("a new acknowledgement cancels the one still running", () => {
        // Anchored FORWARD from the handler: `useEffect` also appears in the import line, so an
        // unanchored indexOf sliced backwards and the gate asserted against an empty string.
        const start = HOOK.indexOf("const acknowledge");
        const ack = HOOK.slice(start, HOOK.indexOf("useEffect(", start));
        expect(ack).toContain("clearTimeout");
        // The cancel must happen BEFORE the new window opens, or two timers coexist.
        expect(ack.indexOf("clearTimeout")).toBeLessThan(ack.indexOf("setSwapping(true)"));
    });

    it("there is exactly one timer, so no stale window can restore an older destination", () => {
        expect(HOOK.split("setTimeout(").length - 1).toBe(1);
    });
});

describe("B10/B12 — the transition may not change layout geometry", () => {
    it("the swap rules touch opacity and pointer-events only", () => {
        const declarations = swapRules.match(/\{[^}]*\}/g)?.join(" ") ?? "";
        expect(declarations.length).toBeGreaterThan(0);
        for (const layoutProp of ["width", "height", "margin", "padding", "transform", "translate", "display", "position", "flex"]) {
            expect(declarations, `swap must not set ${layoutProp}`).not.toContain(layoutProp);
        }
        expect(declarations).toContain("opacity");
    });

    it("the regions are stamped on EXISTING nodes — no wrapper element is introduced", () => {
        // A new flex child would be a new layout box in the column the gate above protects.
        expect(PANEL).toMatch(/className=\{`motion-swap-region\$\{queueSwapping/);
        expect(PANEL).toMatch(/className=\{`motion-swap-region\$\{recordSwapping/);
    });
});

describe("B11/B12 — stale content may not accept commands for the new selection", () => {
    it("the outgoing region refuses pointer interaction while swapping", () => {
        expect(swapRules).toContain("pointer-events: none");
    });
});

describe("B9/B12 — reduced motion", () => {
    it("the swap region collapses with the rest of the motion family", () => {
        const reduced = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
        const firstBlock = reduced.slice(0, reduced.indexOf("\n}"));
        expect(firstBlock + CSS).toContain(".motion-swap-region > *,");
        // And the collapse is to an effectively-immediate transition, not a retained animation.
        expect(CSS).toMatch(/\.motion-swap-region > \*,[\s\S]{0,200}?transition-duration:\s*1ms/);
    });
});

describe("B2/B3 — the canonical motion language, not a new one", () => {
    it("duration and easing are the existing tokens; no raw values are invented", () => {
        expect(swapRules).toContain("var(--motion-micro)");
        expect(swapRules).toContain("var(--motion-ease-move)");
        expect(swapRules).not.toMatch(/\b\d+ms\b/);
    });

    it("the hook's default matches the canonical micro duration and stays under the 220ms ceiling", () => {
        const ms = Number(/SWAP_ACKNOWLEDGEMENT_MS\s*=\s*(\d+)/.exec(HOOK)?.[1]);
        expect(ms).toBe(160);
        expect(ms).toBeLessThanOrEqual(220);
    });
});

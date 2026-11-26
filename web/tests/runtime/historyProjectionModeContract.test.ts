import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { historyProjectionMode } from "@/lib/experience/surfaceHost/historyProjectionMode";

/**
 * The defect this guards: K3 projected EVERY committed address with `replaceState`, so a whole
 * operator session lived in one history entry. Measured on a production build with CDP
 * `Page.getNavigationHistory` — opening a Work Unit from `/workspace` overwrote the `/workspace`
 * entry in place (currentIndex unmoved), and Back then performed a full document load out of the
 * application. These cases fix the distinction that restores Back without manufacturing an entry per
 * queue row.
 */
describe("history projection mode", () => {
    it("pushes when the operator exchanges the Workspace for a Work Unit", () => {
        expect(
            historyProjectionMode({
                projectedPath: "/workspace/work-unit/waitlist",
                currentPath: "/workspace",
                lastProjectedPath: "/workspace",
            }),
        ).toBe("push");
    });

    it("pushes when returning from a Work Unit to the Workspace", () => {
        expect(
            historyProjectionMode({
                projectedPath: "/workspace",
                currentPath: "/workspace/work-unit/waitlist",
                lastProjectedPath: "/workspace/work-unit/waitlist",
            }),
        ).toBe("push");
    });

    it("pushes when exchanging one Work Unit for another", () => {
        expect(
            historyProjectionMode({
                projectedPath: "/workspace/work-unit/all",
                currentPath: "/workspace/work-unit/waitlist",
                lastProjectedPath: "/workspace/work-unit/waitlist",
            }),
        ).toBe("push");
    });

    /**
     * The reason the rule is the PATH and not the address: a subject movement rewrites the query on
     * the surface the operator is already working in. Seventeen rows must not bury the Workspace
     * under seventeen presses of Back.
     */
    it("replaces for a subject movement inside the same Work Unit", () => {
        expect(
            historyProjectionMode({
                projectedPath: "/workspace/work-unit/waitlist",
                currentPath: "/workspace/work-unit/waitlist",
                lastProjectedPath: "/workspace/work-unit/waitlist",
            }),
        ).toBe("replace");
    });

    /**
     * After Back the browser is ALREADY on the restored entry. Pushing there would duplicate it and
     * destroy the forward entry, so the projection that follows a popstate must rewrite in place —
     * which is exactly what "the browser is already here" expresses.
     */
    it("replaces when the browser is already on the projected path (popstate restoration)", () => {
        expect(
            historyProjectionMode({
                projectedPath: "/workspace",
                currentPath: "/workspace",
                lastProjectedPath: "/workspace/work-unit/waitlist",
            }),
        ).toBe("replace");
    });

    /**
     * A cold direct entry's history entry was created by the document load. The first projection
     * reconciles the address with the committed surface (a slug may normalise) and must not add a
     * second entry for a page the operator only opened once.
     */
    it("replaces on the first projection of a document, even when the path differs", () => {
        expect(
            historyProjectionMode({
                projectedPath: "/workspace/work-unit/waitlist",
                currentPath: "/workspace/work-unit/waitlist-legacy-slug",
                lastProjectedPath: null,
            }),
        ).toBe("replace");
    });

    it("replaces a re-projection of the path it last projected", () => {
        expect(
            historyProjectionMode({
                projectedPath: "/workspace/work-unit/waitlist",
                currentPath: "/workspace/work-unit/waitlist-other",
                lastProjectedPath: "/workspace/work-unit/waitlist",
            }),
        ).toBe("replace");
    });
});

/**
 * A CORRECT POLICY WITH NO CALLERS IS NOT A FIX. The decision above is worthless unless K3's own
 * projection consults it, so this asserts the wiring at the one site that owns the address — and
 * carries a positive control, because a source-inspection guard that can never fail protects
 * nothing.
 */
describe("the surface host actually projects through this decision", () => {
    const src = readFileSync(
        join(__dirname, "..", "..", "lib/experience/surfaceHost/SurfaceHostContext.tsx"),
        "utf8",
    );
    /** Strip comments: prose about the old `replaceState` behaviour must not read as the behaviour. */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    it("consults historyProjectionMode when projecting the committed address", () => {
        expect(code).toMatch(/historyProjectionMode\(/);
    });

    it("can create a history entry — a surface exchange is somewhere to come back from", () => {
        expect(code).toMatch(/history\.pushState\(/);
    });

    it("still rewrites in place for everything else", () => {
        expect(code).toMatch(/history\.replaceState\(/);
    });

    it("POSITIVE CONTROL — the comment stripper does not hide a real call", () => {
        const stripped = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        expect(stripped("/* we used to call history.pushState() */\nfoo();")).not.toMatch(/history\.pushState\(/);
        expect(stripped("/* explanation */\nhistory.pushState(s, '', u);")).toMatch(/history\.pushState\(/);
    });
});

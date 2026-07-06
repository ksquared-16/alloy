import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PR #89 follow-up — Queue Region layout wiring guards (source-level, so a refactor that
 * reintroduces the regressions fails here rather than only in the browser):
 *  - the Queue Region title comes from the SELECTED work-view pill, not the header subtitle;
 *  - the queue column holds a FIXED width at xl (no `flex-1` grow stretching it too wide).
 */

const read = (rel: string) =>
    readFileSync(resolve(__dirname, "../../../components/presentation/workUnit", rel), "utf8");

describe("Queue Region — title tracks the selected work-view pill", () => {
    const src = read("WorkUnitSurface.tsx");

    it("derives the active work view from model.workViews (isActive / activeWorkViewId)", () => {
        expect(src).toMatch(/model\.workViews\.find\(\(view\) => view\.isActive\)/);
        expect(src).toMatch(/view\.id === model\.activeWorkViewId/);
    });

    it("passes the active work view label as the Queue Region title, not the header subtitle", () => {
        expect(src).toMatch(/title=\{activeWorkView\?\.label \?\? null\}/);
        expect(src).not.toMatch(/title=\{model\.header\.subtitle\}/);
    });
});

describe("Queue Region — fixed-width column at xl (no grow regression)", () => {
    const src = read("FocusPanelSurface.tsx");

    it("pins the queue column to a fixed width and cancels the stacked flex-1 grow at xl", () => {
        expect(src).toMatch(/xl:w-\[24rem\]/);
        expect(src).toMatch(/xl:flex-none/);
        expect(src).toMatch(/xl:shrink-0/);
    });
});

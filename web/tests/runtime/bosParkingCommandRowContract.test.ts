/**
 * LAW 20, MEASURED ON A REAL RECORD — the rail parked on the Current Work command row.
 *
 * The forbidden set named the Focus Panel mode switch and the inline panel header, and nothing
 * else. Those are navigation; they are not the only primary controls on the surface. On a Work
 * Unit at 1280x900 the least-bad score winner landed at x=439 y=232 size 400x620,
 * covering 201px of the 300px-wide Current Work action row — and "Contact Family" and "Move to
 * Waitlist" stopped receiving pointer events. document.elementFromPoint at each button centre
 * returned `button.bos-rail-starter-card`, i.e. the rail's own starter list ate the click.
 *
 * That is the SAME defect as the Activity-tab incident this contract was written for, on a
 * different control set, so the answer is the same one: the command row is forbidden, not merely
 * expensive. Scoring cannot express "not here".
 *
 * Obstacles/canvas below are the real measurements captured from the live DOM (slot 4, the
 * Certfree QA record), not invented geometry.
 */
import { describe, expect, it } from "vitest";

import {
    bosParkingCandidates,
    chooseBosParkingGeometry,
    type ObstacleRect,
} from "@/lib/bos/bosFloatingGeometry";

const CANVAS = { left: 0, top: 0, width: 1280, height: 900 };
const RAIL = { width: 400, height: 620 };

/** Every focusable page control measured on the record, exactly as the controller collects them. */
const OBSTACLES: ObstacleRect[] = [{"x": 0, "y": 44, "width": 55, "height": 40}, {"x": 6, "y": 84, "width": 43, "height": 40}, {"x": 6, "y": 128, "width": 43, "height": 40}, {"x": 6, "y": 172, "width": 43, "height": 40}, {"x": 6, "y": 216, "width": 43, "height": 40}, {"x": 6, "y": 260, "width": 43, "height": 40}, {"x": 6, "y": 304, "width": 43, "height": 40}, {"x": 6, "y": 348, "width": 43, "height": 40}, {"x": 6, "y": 852, "width": 43, "height": 40}, {"x": 110, "y": 18.25, "width": 489.95, "height": 22.5}, {"x": 1039.27, "y": 9.25, "width": 128.73, "height": 40.5}, {"x": 1180, "y": 11.5, "width": 36, "height": 36}, {"x": 1228, "y": 11.5, "width": 36, "height": 36}, {"x": 1138.69, "y": 82, "width": 120.31, "height": 34}, {"x": 76, "y": 130.25, "width": 108, "height": 26}, {"x": 192, "y": 130.25, "width": 153.44, "height": 26}, {"x": 353.44, "y": 130.25, "width": 138.33, "height": 26}, {"x": 499.77, "y": 130.25, "width": 110.3, "height": 26}, {"x": 618.06, "y": 130.25, "width": 108, "height": 26}, {"x": 734.06, "y": 130.25, "width": 108, "height": 26}, {"x": 850.06, "y": 130.25, "width": 166.05, "height": 26}, {"x": 89, "y": 169.25, "width": 195.52, "height": 32}, {"x": 292.52, "y": 169.25, "width": 58.48, "height": 32}, {"x": 89, "y": 226.25, "width": 262, "height": 97}, {"x": 89, "y": 331.25, "width": 262, "height": 97}, {"x": 89, "y": 436.25, "width": 262, "height": 97}, {"x": 89, "y": 541.25, "width": 262, "height": 97}, {"x": 1149.75, "y": 171.12, "width": 97.25, "height": 28}, {"x": 393, "y": 215, "width": 51.83, "height": 23.75}, {"x": 448.83, "y": 215, "width": 64.47, "height": 23.75}, {"x": 419.88, "y": 375.47, "width": 116.09, "height": 30.39}, {"x": 541.97, "y": 375.47, "width": 57.52, "height": 30.39}, {"x": 605.48, "y": 375.47, "width": 118.05, "height": 30.39}, {"x": 729.53, "y": 375.47, "width": 80.89, "height": 30.39}, {"x": 816.42, "y": 375.47, "width": 121.58, "height": 30.39}, {"x": 824.55, "y": 490.88, "width": 117.45, "height": 19.39}, {"x": 976, "y": 518.39, "width": 89.16, "height": 22}, {"x": 976, "y": 544.39, "width": 59.41, "height": 22}, {"x": 1132.59, "y": 528.44, "width": 80.41, "height": 40}, {"x": 885, "y": 678.73, "width": 90.08, "height": 18}, {"x": 902, "y": 777.23, "width": 27.44, "height": 17.38}, {"x": 839, "y": 813.61, "width": 100.52, "height": 22}];

/** What the controller forbade before this fix: navigation only. */
const NAVIGATION_ONLY_FORBIDDEN: ObstacleRect[] = [{"x": 393, "y": 215, "width": 120.3, "height": 23.75}, {"x": 381, "y": 161.25, "width": 878, "height": 85.5}];

/** The record's primary command row — Contact Family / Tour / Move to Waitlist / Record outcome. */
const COMMAND_ROW: ObstacleRect = {"x": 638, "y": 375.47, "width": 300, "height": 30.39};

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: ObstacleRect) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe("BOS parking must not cover the Current Work command row", () => {
    it("REPRODUCTION — navigation-only forbidden regions let the rail park on the command row", () => {
        const { geometry } = chooseBosParkingGeometry({
            size: RAIL,
            canvas: CANVAS,
            obstacles: OBSTACLES,
            forbidden: NAVIGATION_ONLY_FORBIDDEN,
        });
        // This is the defect, pinned: it reproduces the measured park.
        expect(overlaps(geometry, COMMAND_ROW)).toBe(true);
    });

    it("FIX — forbidding the command row moves the rail off the record's primary commands", () => {
        const { geometry } = chooseBosParkingGeometry({
            size: RAIL,
            canvas: CANVAS,
            obstacles: OBSTACLES,
            forbidden: [...NAVIGATION_ONLY_FORBIDDEN, COMMAND_ROW],
        });
        expect(overlaps(geometry, COMMAND_ROW)).toBe(false);
        // and it must still be a real, on-canvas placement
        expect(geometry.x).toBeGreaterThanOrEqual(0);
        expect(geometry.y).toBeGreaterThanOrEqual(0);
        expect(geometry.x + RAIL.width).toBeLessThanOrEqual(CANVAS.width + 1);
        expect(geometry.y + RAIL.height).toBeLessThanOrEqual(CANVAS.height + 1);
    });

    it("when no candidate can clear EVERY protected region, the park intrudes on the fewest", () => {
        /*
         * At 1280x900 a 400x620 rail cannot clear everything, and that is geometry, not a bug: the
         * only candidate `y` values are 80/152/232, each spans the sticky header band, and clearing
         * the command row horizontally forces x<=238, which grazes the mode switch. The contract is
         * therefore NOT "overlaps nothing" -- it is "overlaps as little as anything can". That is
         * precisely what the old all-or-nothing fallback could not express, because it discarded the
         * forbidden set wholesale the moment nothing cleared it.
         */
        const forbidden = [...NAVIGATION_ONLY_FORBIDDEN, COMMAND_ROW];
        const { geometry } = chooseBosParkingGeometry({
            size: RAIL,
            canvas: CANVAS,
            obstacles: OBSTACLES,
            forbidden,
        });

        const intrusions = (g: { x: number; y: number; width: number; height: number }) =>
            forbidden.filter((f) => overlaps(g, f)).length;

        const chosen = intrusions(geometry);
        const bestPossible = Math.min(
            ...bosParkingCandidates(RAIL, CANVAS).map((c) => intrusions(c)),
        );
        expect(chosen).toBe(bestPossible);
        // and the command row specifically is one of the ones it gives up
        expect(overlaps(geometry, COMMAND_ROW)).toBe(false);
    });
});

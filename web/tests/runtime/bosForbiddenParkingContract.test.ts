/**
 * LAW 20 — a floating surface may never cover primary navigation.
 *
 * Scoring alone expresses "fewest controls obscured", never "not here". On a dense surface every
 * candidate overlaps something, so the least-bad winner can still land on primary navigation — which
 * is what happened: a re-park moved the rail over the Focus Panel mode tabs and the Activity tab
 * stopped receiving pointer events. That is an interaction defect, not a cosmetic one.
 *
 * Previously browser-verified only. These are the deterministic guards.
 */
import { describe, expect, it } from "vitest";

import { chooseBosParkingGeometry, type ObstacleRect } from "@/lib/bos/bosFloatingGeometry";

const CANVAS = { left: 0, top: 0, width: 1440, height: 900 };
const SIZE = { width: 320, height: 240 };
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: ObstacleRect) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe("BOS forbidden parking", () => {
    it("never parks on a forbidden region when a permitted candidate exists", () => {
        // Forbid the region a naive scorer would otherwise prefer.
        const unforbidden = chooseBosParkingGeometry({ size: SIZE, canvas: CANVAS, obstacles: [] });
        const forbidden: ObstacleRect[] = [
            { x: unforbidden.geometry.x, y: unforbidden.geometry.y, width: SIZE.width, height: SIZE.height },
        ];
        const chosen = chooseBosParkingGeometry({ size: SIZE, canvas: CANVAS, obstacles: [], forbidden });
        expect(overlaps(chosen.geometry, forbidden[0])).toBe(false);
    });

    it("a forbidden region outranks SCORE — the least-obstructed spot loses if it is forbidden", () => {
        // One obstacle everywhere except the forbidden corner, so score alone would pick the corner.
        const obstacles: ObstacleRect[] = [{ x: 0, y: 0, width: 1440, height: 640 }];
        const scoreWinner = chooseBosParkingGeometry({ size: SIZE, canvas: CANVAS, obstacles });
        const forbidden: ObstacleRect[] = [
            { x: scoreWinner.geometry.x, y: scoreWinner.geometry.y, width: SIZE.width, height: SIZE.height },
        ];
        const chosen = chooseBosParkingGeometry({ size: SIZE, canvas: CANVAS, obstacles, forbidden });
        expect(overlaps(chosen.geometry, forbidden[0])).toBe(false);
    });

    it("POSITIVE CONTROL — with no forbidden regions the score winner is still chosen", () => {
        const obstacles: ObstacleRect[] = [{ x: 0, y: 0, width: 1440, height: 640 }];
        const a = chooseBosParkingGeometry({ size: SIZE, canvas: CANVAS, obstacles });
        const b = chooseBosParkingGeometry({ size: SIZE, canvas: CANVAS, obstacles, forbidden: [] });
        expect(b.geometry).toEqual(a.geometry);
    });

    it("when EVERY candidate is forbidden the rail still parks — deterministically, never unplaced", () => {
        const forbidden: ObstacleRect[] = [{ x: -5000, y: -5000, width: 20000, height: 20000 }];
        const first = chooseBosParkingGeometry({ size: SIZE, canvas: CANVAS, obstacles: [], forbidden });
        const second = chooseBosParkingGeometry({ size: SIZE, canvas: CANVAS, obstacles: [], forbidden });
        expect(first.geometry).toBeTruthy();
        expect(Number.isFinite(first.geometry.x)).toBe(true);
        expect(Number.isFinite(first.geometry.y)).toBe(true);
        // Deterministic: the same inputs must not produce a different park.
        expect(second.geometry).toEqual(first.geometry);
    });

    it("the rail stays inside the canvas whether or not regions are forbidden", () => {
        const forbidden: ObstacleRect[] = [{ x: 0, y: 0, width: 700, height: 900 }];
        for (const args of [{ size: SIZE, canvas: CANVAS, obstacles: [] }, { size: SIZE, canvas: CANVAS, obstacles: [], forbidden }]) {
            const { geometry } = chooseBosParkingGeometry(args);
            expect(geometry.x).toBeGreaterThanOrEqual(CANVAS.left - 1);
            expect(geometry.y).toBeGreaterThanOrEqual(CANVAS.top - 1);
            expect(geometry.x + SIZE.width).toBeLessThanOrEqual(CANVAS.left + CANVAS.width + 1);
            expect(geometry.y + SIZE.height).toBeLessThanOrEqual(CANVAS.top + CANVAS.height + 1);
        }
    });
});

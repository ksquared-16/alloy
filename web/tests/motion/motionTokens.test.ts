import { describe, expect, it } from "vitest";
import {
    MOTION_CHOREOGRAPHY,
    MOTION_DURATION,
    MOTION_EASING,
    MOTION_SETTLE,
    motionChoreography,
    motionDurationMs,
    motionTransition,
} from "@/lib/motion/motionTokens";

describe("motionTokens", () => {
    it("exposes exactly four durations in ascending order", () => {
        const values = Object.values(MOTION_DURATION);
        expect(values).toHaveLength(4);
        expect(values).toEqual([...values].sort((a, b) => a - b));
        expect(MOTION_DURATION.instant).toBe(80);
        expect(MOTION_DURATION.expressive).toBe(360);
    });

    it("exposes exactly four easing curves, all cubic-bezier", () => {
        expect(Object.keys(MOTION_EASING)).toEqual(["exit", "enter", "move", "spring"]);
        for (const curve of Object.values(MOTION_EASING)) {
            expect(curve).toMatch(/^cubic-bezier\(/);
        }
    });

    it("maps the five choreographies, in canonical order, to class names", () => {
        expect(Object.keys(MOTION_CHOREOGRAPHY)).toEqual([
            "reveal",
            "navigate",
            "swap",
            "acknowledge",
            "recede",
        ]);
        expect(motionChoreography("reveal")).toBe("motion-reveal");
        expect(motionChoreography("recede")).toBe("motion-recede");
    });

    it("enforces the doctrine: arrivals decelerate, departures accelerate", () => {
        expect(MOTION_CHOREOGRAPHY.reveal.easing).toBe("enter");
        expect(MOTION_CHOREOGRAPHY.recede.easing).toBe("exit");
    });

    it("reserves the spring easing for acknowledgement only", () => {
        const springUsers = Object.entries(MOTION_CHOREOGRAPHY)
            .filter(([, spec]) => spec.easing === "spring")
            .map(([name]) => name);
        expect(springUsers).toEqual(["acknowledge"]);
    });

    it("settle is the imperceptible reveal sub-variant (micro, enter, opacity-only)", () => {
        expect(MOTION_SETTLE.duration).toBe("micro");
        expect(MOTION_SETTLE.easing).toBe("enter");
        expect(MOTION_SETTLE.className).toBe("motion-settle");
    });

    it("composes a CSS transition string from tokens", () => {
        expect(motionTransition("opacity", "standard", "enter")).toBe(
            `opacity 240ms ${MOTION_EASING.enter}`,
        );
    });

    it("returns numeric durations for exit-window coordination", () => {
        expect(motionDurationMs("micro")).toBe(160);
        expect(motionDurationMs("standard")).toBe(240);
    });
});

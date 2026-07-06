import { describe, expect, it } from "vitest";
import { findRawTransitionTimings, findRawComponentTimings, runAudit } from "@/scripts/auditMotionTokens.mjs";

/**
 * Enforces the Operational Motion Doctrine's hard rule #1 on the migrated operator
 * surfaces: no raw duration/easing may reappear where tokens have been adopted.
 * The same logic backs `npm run audit:motion`.
 */
describe("motion-token audit", () => {
    it("flags a raw duration or easing inside a transition", () => {
        expect(findRawTransitionTimings("a { transition: background-color 120ms ease; }")).toHaveLength(1);
        expect(findRawTransitionTimings("a { transition: transform 0.18s ease-out; }")).toHaveLength(1);
    });

    it("accepts a fully tokenized transition", () => {
        const css = "a { transition: background-color var(--motion-instant) var(--motion-ease-move); }";
        expect(findRawTransitionTimings(css)).toHaveLength(0);
    });

    it("ignores animation (ambient loops are an exempt class) and transition: none", () => {
        expect(findRawTransitionTimings("a { animation: orbit 26s linear infinite; }")).toHaveLength(0);
        expect(findRawTransitionTimings("a { transition: none; }")).toHaveLength(0);
    });

    it("ignores timings inside block comments", () => {
        expect(findRawTransitionTimings("a { /* was 300ms ease */ transition: opacity var(--motion-micro) var(--motion-ease-enter); }")).toHaveLength(0);
    });

    it("flags a raw ms literal in component markup", () => {
        expect(findRawComponentTimings('<div style={{ transition: "opacity 200ms" }} />')).toHaveLength(1);
        expect(findRawComponentTimings('<div className="motion-control" />')).toHaveLength(0);
    });

    it("migrated operator surfaces are token-only (no raw timings)", () => {
        const { strict } = runAudit();
        // Any entry here is a regression: a raw duration/easing on a surface already migrated.
        expect(strict).toEqual({});
    });
});

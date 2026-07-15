/**
 * P1 · Wave C · C2 — effective-standing derivation (append-only faithful).
 */

import { describe, expect, it } from "vitest";
import {
    isEffectivelyBinding,
    resolveEffectiveStanding,
} from "@/lib/operationalExpectations/standing/resolveEffectiveStanding";

describe("resolveEffectiveStanding", () => {
    it("proposed + no ratification → proposed (not yet binding)", () => {
        expect(resolveEffectiveStanding("proposed", false)).toBe("proposed");
        expect(isEffectivelyBinding("proposed", false)).toBe(false);
    });
    it("proposed + ratification → binding", () => {
        expect(resolveEffectiveStanding("proposed", true)).toBe("binding");
        expect(isEffectivelyBinding("proposed", true)).toBe(true);
    });
    it("an authored binding stays binding", () => {
        expect(resolveEffectiveStanding("binding", false)).toBe("binding");
    });
    it("model (predicted) NEVER binds, even with a (defensive) ratification flag", () => {
        expect(resolveEffectiveStanding("model", false)).toBe("model");
        expect(resolveEffectiveStanding("model", true)).toBe("model");
        expect(isEffectivelyBinding("model", true)).toBe(false);
    });
});

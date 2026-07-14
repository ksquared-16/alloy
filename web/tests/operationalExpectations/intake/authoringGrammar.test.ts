/**
 * P1 · Wave B — pure grammar validator + fingerprint unit tests.
 */

import { describe, expect, it } from "vitest";
import { validateAuthoringTuple } from "@/lib/operationalExpectations/intake/validateAuthoringTuple";
import { fingerprintAuthoringInput } from "@/lib/operationalExpectations/intake/authoringFingerprint";
import { validCreateInput } from "./authoringFixtures";

describe("validateAuthoringTuple — positive", () => {
    it("accepts a well-formed create tuple", () => {
        expect(validateAuthoringTuple(validCreateInput())).toEqual({ ok: true });
    });

    it("accepts a condition whose params are pure reality parameters (no sensor)", () => {
        const r = validateAuthoringTuple(
            validCreateInput({ condition: { typeKey: "capacity_cap", predicateShape: "at_most", params: { max: 12, unit: "children" } } }),
        );
        expect(r).toEqual({ ok: true });
    });
});

describe("fingerprintAuthoringInput", () => {
    it("is stable across object key ordering", () => {
        const a = validCreateInput({ condition: { typeKey: "t", predicateShape: "s", params: { a: 1, b: 2 } } });
        const b = validCreateInput({ condition: { typeKey: "t", predicateShape: "s", params: { b: 2, a: 1 } } });
        expect(fingerprintAuthoringInput(a)).toBe(fingerprintAuthoringInput(b));
    });

    it("ignores the idempotency key itself (only material content)", () => {
        const a = validCreateInput({ idempotencyKey: "k1" });
        const b = validCreateInput({ idempotencyKey: "k2" });
        expect(fingerprintAuthoringInput(a)).toBe(fingerprintAuthoringInput(b));
    });

    it("changes when material content changes", () => {
        const a = validCreateInput({ condition: { typeKey: "t", predicateShape: "s", params: { min: 3 } } });
        const b = validCreateInput({ condition: { typeKey: "t", predicateShape: "s", params: { min: 4 } } });
        expect(fingerprintAuthoringInput(a)).not.toBe(fingerprintAuthoringInput(b));
    });
});

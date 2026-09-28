/**
 * A FINANCIAL REQUIREMENT IS AUTHORABLE BECAUSE SOMETHING CAN PROVE IT.
 *
 * `stageRequirementsV1` sets an explicit bar: a kind is authorable only when a canonical durable
 * record can prove it was satisfied, and it refuses `document`, `consent`, `acknowledgment` and
 * `signature` by name for failing it. Money passes: charges, payments, their applications and the
 * collectible resolver are the platform's most heavily proven evidence owners, so "is this
 * obligation satisfied" had a canonical answer before this kind existed — exactly as `work` did.
 *
 * These also pin the thing that must never drift: the requirement references a DEFINITION, not an
 * amount.
 */
import { describe, expect, it } from "vitest";

import {
    REQUIREMENT_KINDS_V1,
    REQUIREMENT_KIND_UNSUPPORTED_REASON_V1,
    isAuthorableRequirementKind,
    parseStageRequirementsV1,
    serializeStageRequirementsV1,
} from "@/lib/lifecycle/stageRequirementsV1";

describe("the financial requirement kind", () => {
    it("is declared and authorable", () => {
        expect(REQUIREMENT_KINDS_V1).toContain("financial");
        expect(isAuthorableRequirementKind("financial")).toBe(true);
    });

    it("is not listed among the kinds the platform refuses", () => {
        expect(Object.keys(REQUIREMENT_KIND_UNSUPPORTED_REASON_V1)).not.toContain("financial");
        // The four that genuinely have no evidence owner are untouched.
        expect(Object.keys(REQUIREMENT_KIND_UNSUPPORTED_REASON_V1).sort()).toEqual([
            "acknowledgment",
            "consent",
            "document",
            "signature",
        ]);
    });

    it("round-trips a per-child fee requirement through parse and serialize", () => {
        const stored = {
            version: 1,
            requirements: [
                {
                    requirement_id: "enrollment_fee",
                    kind: "financial",
                    charge_template_key: "registration_fee",
                    level: "required",
                    scope: "each_child",
                    timing: "stage_exit",
                    enforcement: "blocking",
                },
            ],
        };
        const parsed = parseStageRequirementsV1(stored);
        expect(parsed?.requirements[0].ref).toEqual({ kind: "financial", charge_template_key: "registration_fee" });
        expect(parsed?.requirements[0].scope).toBe("each_child");
        expect(serializeStageRequirementsV1(parsed!)).toEqual(stored);
    });

    it("round-trips a per-family fee requirement", () => {
        const stored = {
            version: 1,
            requirements: [
                {
                    requirement_id: "enrollment_fee",
                    kind: "financial",
                    charge_template_key: "registration_fee",
                    level: "required",
                    scope: "record",
                },
            ],
        };
        expect(serializeStageRequirementsV1(parseStageRequirementsV1(stored)!)).toEqual(stored);
    });

    /*
     * A requirement that points at nothing cannot be satisfied and cannot be explained, so the
     * parser drops it — the same rule every other kind follows.
     */
    it("refuses a financial requirement with no charge definition", () => {
        const parsed = parseStageRequirementsV1({
            version: 1,
            requirements: [{ requirement_id: "fee", kind: "financial", level: "required" }],
        });
        expect(parsed?.requirements).toHaveLength(0);
    });

    it("never carries an amount", () => {
        const parsed = parseStageRequirementsV1({
            version: 1,
            requirements: [
                {
                    requirement_id: "fee",
                    kind: "financial",
                    charge_template_key: "registration_fee",
                    amount_cents: 7500,
                    level: "required",
                },
            ],
        });
        // The amount is Financials'. A copy on the requirement would be stale the next time a rate,
        // discount or funding arrangement changed.
        expect(JSON.stringify(parsed)).not.toContain("7500");
        expect(serializeStageRequirementsV1(parsed!).requirements).toEqual([
            {
                requirement_id: "fee",
                kind: "financial",
                charge_template_key: "registration_fee",
                level: "required",
            },
        ]);
    });
});

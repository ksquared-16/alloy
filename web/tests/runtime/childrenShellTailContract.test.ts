import { describe, expect, it } from "vitest";

import { mergeResolvedPhotoOntoProfiledChildren } from "@/lib/admin/opportunityEntityRecord";
import { RESOLVED_PHOTO_URL_KEY } from "@/lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl";

/**
 * The last two legs of the Children shell were awaited in sequence and were its only untimed work:
 * `children_orientation_ms` summed to ~417-491 ms while the leg measured 602-884 ms. Named, they are
 * 177 ms and 153 ms — 330 ms of a 631 ms leg, one after the other.
 *
 * They are independent, and disjointly so. The profile attach keys on `customer_member_id` and
 * writes `gender`, `allergies`, `medical_notes`, `preferred_name`, `special_instructions` and
 * `custom_fields`; the photo projection keys on `person_id` and writes exactly `resolved_photo_url`.
 * Neither reads what the other writes, so ordering never decided the result — only the clock did.
 *
 * Running them together makes the carry-across load-bearing, so it is stated in cases.
 */
describe("children shell tail merge", () => {
    it("carries the photo onto the profiled row without disturbing profile fields", () => {
        const profiled: Array<Record<string, unknown>> = [{ person_id: "p1", gender: "female", custom_fields: { a: 1 } }];
        const photographed = [{ person_id: "p1", [RESOLVED_PHOTO_URL_KEY]: "https://signed/1" }];
        const [row] = mergeResolvedPhotoOntoProfiledChildren(profiled, photographed);
        expect(row.gender).toBe("female");
        expect(row.custom_fields).toEqual({ a: 1 });
        expect(row[RESOLVED_PHOTO_URL_KEY]).toBe("https://signed/1");
    });

    /**
     * An absent photo must stay ABSENT. Writing an explicit null would turn "we did not resolve one"
     * into "this child has no photo on file", which the card renders differently.
     */
    it("leaves a child with no resolved photo untouched", () => {
        const profiled: Array<Record<string, unknown>> = [{ person_id: "p1", gender: "male" }];
        const photographed = [{ person_id: "p1" }];
        const [row] = mergeResolvedPhotoOntoProfiledChildren(profiled, photographed);
        expect(RESOLVED_PHOTO_URL_KEY in row).toBe(false);
        expect(row.gender).toBe("male");
    });

    it("preserves order and length across the whole set", () => {
        const profiled: Array<Record<string, unknown>> = [{ person_id: "a" }, { person_id: "b" }, { person_id: "c" }];
        const photographed = [
            { person_id: "a", [RESOLVED_PHOTO_URL_KEY]: "u-a" },
            { person_id: "b" },
            { person_id: "c", [RESOLVED_PHOTO_URL_KEY]: "u-c" },
        ];
        const out = mergeResolvedPhotoOntoProfiledChildren(profiled, photographed);
        expect(out.map((r) => r.person_id)).toEqual(["a", "b", "c"]);
        expect(out[0][RESOLVED_PHOTO_URL_KEY]).toBe("u-a");
        expect(RESOLVED_PHOTO_URL_KEY in out[1]).toBe(false);
        expect(out[2][RESOLVED_PHOTO_URL_KEY]).toBe("u-c");
    });

    /**
     * The index carry is only sound while both arrays describe the same children. If a future change
     * made one of them filter, the safe answer is the profiled rows WITHOUT photos — a missing avatar
     * — not photos silently attached to the wrong children.
     */
    it("refuses the carry rather than mismatching when the two sets diverge", () => {
        const profiled: Array<Record<string, unknown>> = [{ person_id: "a" }, { person_id: "b" }];
        const photographed = [{ person_id: "b", [RESOLVED_PHOTO_URL_KEY]: "u-b" }];
        const out = mergeResolvedPhotoOntoProfiledChildren(profiled, photographed);
        expect(out).toEqual(profiled);
        expect(out.some((r) => RESOLVED_PHOTO_URL_KEY in r)).toBe(false);
    });

    it("handles the empty set", () => {
        expect(mergeResolvedPhotoOntoProfiledChildren([], [])).toEqual([]);
    });
});

describe("the shell tail actually runs its two legs together", () => {
    const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const src = (() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { readFileSync } = require("node:fs") as typeof import("node:fs");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { join } = require("node:path") as typeof import("node:path");
        const whole = strip(readFileSync(join(__dirname, "..", "..", "lib/admin/opportunityEntityRecord.ts"), "utf8"));
        // Scoped to the SHELL builder the drawer VM composes through. The `surface=full` enrichment
        // path further down carries the same two calls sequentially; it is not on this critical path
        // and was not measured, so this guard must not silently demand a change there.
        const start = whole.indexOf("export async function attachOpportunityInquiryChildrenShell");
        const end = whole.indexOf("export async function attachOpportunityPersonsShell", start);
        return whole.slice(start, end > start ? end : undefined);
    })();

    it("awaits the profile attach and the photo projection concurrently", () => {
        expect(src).toMatch(/await Promise\.all\(\[\s*attachCustomerMemberProfileToInquiryChildren\(/);
    });

    it("no longer awaits the photo projection after the profile attach", () => {
        expect(src).not.toMatch(/inquiryChildrenOut = await attachCustomerMemberProfileToInquiryChildren\(/);
    });

    it("POSITIVE CONTROL — the stripper does not hide a real sequential await", () => {
        expect(strip("/* inquiryChildrenOut = await attachCustomerMemberProfileToInquiryChildren(x) */\nf();"))
            .not.toMatch(/inquiryChildrenOut = await attachCustomerMemberProfileToInquiryChildren\(/);
        expect(strip("/* n */\ninquiryChildrenOut = await attachCustomerMemberProfileToInquiryChildren(x);"))
            .toMatch(/inquiryChildrenOut = await attachCustomerMemberProfileToInquiryChildren\(/);
    });
});

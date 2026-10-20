/**
 * Save's one re-resolve-and-retry depends on reading `stale_resolution` out of the REAL execute
 * envelope. PR 1527 read a top-level `blockers` that the route never sends: on staging every
 * create came back 409 and tuition was silently not recorded. Built with the route's own
 * `apiError`, so a change to the envelope breaks this test rather than the Save.
 */
import { describe, expect, it } from "vitest";

import { apiError } from "@/lib/api/apiResponse";
import { pricingRefusalCode } from "@/lib/enrollment/pricing/pricingRefusal";

describe("pricingRefusalCode", () => {
    it("reads the code the execute route sends for a refused tuition commit", async () => {
        const res = apiError("ACTION_BLOCKED", "This assignment has changed since the tuition was resolved.", 409, {
            blockers: [{ code: "stale_resolution", message: "This assignment has changed since the tuition was resolved." }],
        });
        expect(res.status).toBe(409);
        expect(pricingRefusalCode(await res.json())).toBe("stale_resolution");
    });

    it("still reads a runtime ActionResult's top-level blockers", () => {
        expect(pricingRefusalCode({ ok: false, blockers: [{ code: "stale_resolution" }] })).toBe("stale_resolution");
    });

    it("answers null when there is no code to read", async () => {
        expect(pricingRefusalCode(await apiError("FORBIDDEN", "No.", 403).json())).toBeNull();
        expect(pricingRefusalCode(null)).toBeNull();
        expect(pricingRefusalCode({ error: "plain string" })).toBeNull();
    });
});

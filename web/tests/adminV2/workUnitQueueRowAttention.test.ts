import { describe, expect, it } from "vitest";

import { queueRowHasOperationalAttention } from "@/lib/adminV2/workUnitQueueRowAttention";

describe("queueRowHasOperationalAttention", () => {
    it("is true when row has active needs-attention reason", () => {
        expect(queueRowHasOperationalAttention({ _needs_attention: true })).toBe(true);
    });

    it("is false for normal pipeline rows", () => {
        expect(queueRowHasOperationalAttention({ _needs_attention: false })).toBe(false);
        expect(queueRowHasOperationalAttention({})).toBe(false);
    });
});

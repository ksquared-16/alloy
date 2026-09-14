import { describe, expect, it } from "vitest";

import { assertPacketStepsPublishableCore } from "@/lib/forms/packets/mintPacketPublicLinkForAdmin";

/**
 * An empty packet is a legitimate draft and an illegitimate thing to send.
 *
 * Every packet has no steps for a moment after it is created, so refusing to CREATE one would be
 * wrong. But the publishability check judged each step in a loop, and zero steps passed it
 * vacuously — the same shape of bug as three green readiness rows over an empty list — so a link
 * could be minted to an experience containing nothing.
 */
describe("a packet with no steps cannot be sent", () => {
    const supabaseNeverCalled = {
        from() {
            throw new Error("must refuse before reading anything");
        },
    } as never;

    it("refuses, and says what to do about it", async () => {
        const result = await assertPacketStepsPublishableCore(supabaseNeverCalled, "org", []);

        expect(result.ok).toBe(false);
        expect((result as { message: string }).message).toMatch(/no steps yet/i);
        expect((result as { message: string }).message).toMatch(/add at least one step/i);
    });

    it("refuses before querying, because there is nothing to query", async () => {
        await expect(assertPacketStepsPublishableCore(supabaseNeverCalled, "org", [])).resolves.toMatchObject({ ok: false });
    });
});

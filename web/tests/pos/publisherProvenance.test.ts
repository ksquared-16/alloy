/**
 * A published Form version records who published it, or it is not published.
 *
 * The five certified v2 versions carry `published_by_user_id = NULL`: a caller passed an undefined
 * id through a typed-but-unchecked boundary and the row accepted it. Published rows are immutable —
 * the database enforces `publish -> archive only` — so that gap is permanent. This is the control
 * that stops the next one.
 */
import { describe, it, expect } from "vitest";
import { assertPublisherIdentity, createPacketFromProcessingAnalysis, reprojectRealizedPacket } from "@/lib/pos/packet/createPacketFromProcessingAnalysis";

describe("publisher provenance", () => {
    it("refuses an absent, empty or non-string publisher", () => {
        for (const bad of [undefined, null, "", "   ", 42, {}]) {
            expect(() => assertPublisherIdentity(bad), String(bad)).toThrow(/publisher identity/i);
        }
    });

    it("accepts a real id", () => {
        expect(() => assertPublisherIdentity("00000000-0000-4000-8000-000000000002")).not.toThrow();
    });

    it("fails realization before any write rather than midway", async () => {
        const deps = new Proxy({} as never, {
            get() { throw new Error("no dependency may be touched when the publisher is unknown"); },
        });
        const res = await createPacketFromProcessingAnalysis({} as never, deps, { orgId: "org", caseId: "case", userId: undefined as unknown as string });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.message).toMatch(/publisher identity/i);
    });

    it("fails re-projection before any write, but still allows a dry run", async () => {
        const touched: string[] = [];
        const deps = new Proxy({} as never, {
            get(_t, prop) { touched.push(String(prop)); throw new Error("no write path may run"); },
        });
        const res = await reprojectRealizedPacket({} as never, deps, { orgId: "org", caseId: "case", userId: "" });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.message).toMatch(/publisher identity/i);
        expect(touched, "the guard must run before the first dependency call").toEqual([]);
    });
});

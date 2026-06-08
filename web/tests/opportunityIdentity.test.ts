import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    normalizeOpportunityWritePayload,
    resolveOpportunityIdentityIds,
    trimOpportunityUuid,
} from "@/lib/opportunityIdentity";

function mockSupabaseForContactPersonId(personId: string | null): SupabaseClient {
    const maybeSingle = vi.fn().mockResolvedValue({
        data: personId ? { person_id: personId } : { person_id: null },
        error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    return { from } as unknown as SupabaseClient;
}

describe("opportunityIdentity", () => {
    it("trimOpportunityUuid", () => {
        expect(trimOpportunityUuid(null)).toBeNull();
        expect(trimOpportunityUuid("")).toBeNull();
        expect(trimOpportunityUuid("  abc  ")).toBe("abc");
    });

    it("resolveOpportunityIdentityIds prefers person id", () => {
        expect(
            resolveOpportunityIdentityIds({
                primary_person_id: "p1",
                primary_contact_id: "c1",
            })
        ).toEqual({ primary_person_id: "p1", fallback_contact_id: "c1" });
    });

    it("normalizeOpportunityWritePayload no-op without identity keys", async () => {
        const supabase = mockSupabaseForContactPersonId("should-not-run");
        const patch: Record<string, unknown> = { metadata: { a: 1 }, quote_total: 10 };
        const out = await normalizeOpportunityWritePayload(supabase, patch, "test:metadata-only");
        expect(out).toBe(patch);
        expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
    });

    it("normalizeOpportunityWritePayload resolves person from primary_contact_id", async () => {
        const supabase = mockSupabaseForContactPersonId("person-from-contact");
        const patch: Record<string, unknown> = { primary_contact_id: "contact-uuid-1" };
        await normalizeOpportunityWritePayload(supabase, patch, "test:contact-only");
        expect(patch.primary_person_id).toBe("person-from-contact");
    });

    it("normalizeOpportunityWritePayload keeps person when both ids present", async () => {
        const supabase = mockSupabaseForContactPersonId("wrong-would-resolve");
        const patch: Record<string, unknown> = {
            primary_person_id: "  canonical-person  ",
            primary_contact_id: "contact-2",
        };
        await normalizeOpportunityWritePayload(supabase, patch, "test:both");
        expect(patch.primary_person_id).toBe("canonical-person");
        expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
    });
});

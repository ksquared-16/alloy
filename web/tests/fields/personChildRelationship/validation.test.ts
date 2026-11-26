import { describe, expect, it } from "vitest";
import { validateRelationshipTypeAgainstOptionSet } from "@/lib/fields/personChildRelationship/personChildRelationshipValidation";

describe("relationship type Choice Option validation", () => {
    const items = [
        { item_key: "aunt", label: "Aunt" },
        { item_key: "family_friend", label: "Family Friend" },
    ];

    it("accepts stable option keys", () => {
        expect(validateRelationshipTypeAgainstOptionSet("aunt", items)).toEqual({ ok: true, value: "aunt" });
    });

    it("preserves stored key when tenant label changes", () => {
        const relabeled = [{ item_key: "aunt", label: "Auntie" }];
        expect(validateRelationshipTypeAgainstOptionSet("aunt", relabeled)).toEqual({ ok: true, value: "aunt" });
    });

    it("rejects unknown keys", () => {
        expect(validateRelationshipTypeAgainstOptionSet("cousin", items).ok).toBe(false);
    });
});

import { describe, expect, it } from "vitest";
import { resolveMutationCapability } from "@/lib/fields/mutation/resolveMutationCapability";

describe("resolveMutationCapability person_child_relationship", () => {
    it("resolves native relationship_type mutations", () => {
        const cap = resolveMutationCapability("person_child_relationship.relationship_type");
        expect(cap?.entity_type).toBe("person_child_relationship");
        expect(cap?.field_key).toBe("relationship_type");
        expect(cap?.storage_class).toBe("native");
    });

    it("resolves config relationship field mutations", () => {
        const cap = resolveMutationCapability("person_child_relationship.authorized_pickup");
        expect(cap?.entity_type).toBe("person_child_relationship");
        expect(cap?.storage_class).toBe("config");
    });
});

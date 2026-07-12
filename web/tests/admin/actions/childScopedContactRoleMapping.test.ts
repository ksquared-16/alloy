import { describe, expect, it } from "vitest";
import {
    mapMemberContactRoleToOperational,
    shouldWriteChildScopedRelationshipsToPcr,
} from "@/lib/admin/actions/childScopedContactRoleMapping";

describe("childScopedContactRoleMapping", () => {
    it("maps emergency_contact to PCR operational role", () => {
        expect(mapMemberContactRoleToOperational("emergency_contact")).toBe("emergency_contact");
    });

    it("uses PCR for link_person child-scoped writes", () => {
        expect(
            shouldWriteChildScopedRelationshipsToPcr({
                executorKind: "link_person",
                roleKey: "emergency_contact",
            }),
        ).toBe(true);
    });

    it("does not use PCR for unmapped roles on link_person", () => {
        expect(
            shouldWriteChildScopedRelationshipsToPcr({
                executorKind: "link_person",
                roleKey: "unknown_role",
            }),
        ).toBe(false);
    });
});

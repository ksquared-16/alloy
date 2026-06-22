import { describe, expect, it } from "vitest";
import {
    buildLayoutRuntimePersonContactPatch,
    groupLayoutRuntimePersonContactDraftByPersonId,
    isLayoutRuntimePersonContactRefKey,
    resolveLayoutRuntimePersonId,
} from "@/lib/layout/runtime/layoutRuntimePersonContactEdit";

describe("layoutRuntimePersonContactEdit", () => {
    it("recognizes role-scoped person-contact refKeys", () => {
        expect(isLayoutRuntimePersonContactRefKey("person.first_name")).toBe(true);
        expect(isLayoutRuntimePersonContactRefKey("person.secondary_email")).toBe(true);
        expect(isLayoutRuntimePersonContactRefKey("person.emergency_contact_phone")).toBe(true);
        expect(isLayoutRuntimePersonContactRefKey("opportunity.source")).toBe(false);
    });

    it("resolves primary person id from layout record", () => {
        expect(
            resolveLayoutRuntimePersonId({
                "opportunity.primary_person_id": "person-42",
            }),
        ).toBe("person-42");
    });

    it("builds person PATCH body from draft deltas", () => {
        const patch = buildLayoutRuntimePersonContactPatch(
            { "person.first_name": "Jamie", "person.primary_email": "a@b.com" },
            { "person.first_name": "James", "person.primary_email": "a@b.com" },
        );
        expect(patch).toEqual({ first_name: "James" });
    });

    it("groups secondary email edits under secondary person id when block role is known", () => {
        const grouped = groupLayoutRuntimePersonContactDraftByPersonId({
            record: {
                "person.id": "p1",
                _opportunity_persons: [
                    { person_id: "p1", role_type: "primary_contact", name: "Primary", email: "p@x.com" },
                    { person_id: "p2", role_type: "secondary_contact", name: "Secondary", email: "old@example.com" },
                ],
                _layout_contact_person_ids: {
                    primary: "p1",
                    parents: "p2",
                },
            },
            baseline: { "person.secondary_email": "old@example.com" },
            draft: { "person.secondary_email": "new@example.com" },
            contactRefRoleOverrides: { "person.secondary_email": "secondary" },
        });
        expect(grouped.get("p2")?.draft["person.secondary_email"]).toBe("new@example.com");
        expect(grouped.get("p1")).toBeUndefined();
    });

    it("does not group flat secondary email edits without block role context", () => {
        const grouped = groupLayoutRuntimePersonContactDraftByPersonId({
            record: {
                _layout_contact_person_ids: {
                    primary: "p1",
                    parents: "p2",
                },
            },
            baseline: { "person.secondary_email": "old@example.com" },
            draft: { "person.secondary_email": "new@example.com" },
        });
        expect(grouped.size).toBe(0);
    });
});

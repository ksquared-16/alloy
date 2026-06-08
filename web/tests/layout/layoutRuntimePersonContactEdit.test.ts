import { describe, expect, it } from "vitest";
import {
    buildLayoutRuntimePersonContactPatch,
    isLayoutRuntimePersonContactRefKey,
    resolveLayoutRuntimePersonId,
} from "@/lib/layout/runtime/layoutRuntimePersonContactEdit";

describe("layoutRuntimePersonContactEdit", () => {
    it("recognizes person-contact refKeys", () => {
        expect(isLayoutRuntimePersonContactRefKey("person.first_name")).toBe(true);
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
});

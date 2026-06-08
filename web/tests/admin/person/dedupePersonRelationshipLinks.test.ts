import { describe, expect, it } from "vitest";
import { dedupePersonRelationshipLinks } from "@/lib/admin/person/dedupePersonRelationshipLinks";
import type { PersonRelationshipLink } from "@/lib/admin/person/personDrawerVisibilityTypes";

describe("dedupePersonRelationshipLinks", () => {
    it("merges duplicate guardians by person_id", () => {
        const links: PersonRelationshipLink[] = [
            {
                person_id: "p-1",
                display_name: "Ava Rivera",
                relationship_label: "Parent",
            },
            {
                person_id: "p-1",
                display_name: "Ava Rivera",
                relationship_label: "Guardian",
            },
        ];
        expect(dedupePersonRelationshipLinks(links)).toHaveLength(1);
    });

    it("merges duplicate guardians by normalized display name when person_id is missing", () => {
        const links: PersonRelationshipLink[] = [
            {
                person_id: "p-1",
                display_name: "Ava Rivera",
                relationship_label: "Parent",
            },
            {
                person_id: null,
                display_name: "ava   rivera",
                relationship_label: "Guardian",
            },
            {
                person_id: null,
                display_name: "Ava Rivera",
                relationship_label: "Primary contact",
            },
        ];
        const out = dedupePersonRelationshipLinks(links);
        expect(out).toHaveLength(1);
        expect(out[0]?.person_id).toBe("p-1");
        expect(out[0]?.display_name).toBe("Ava Rivera");
    });

    it("keeps distinct adults when names and ids differ", () => {
        const links: PersonRelationshipLink[] = [
            { person_id: "p-1", display_name: "Ava Rivera", relationship_label: "Parent" },
            { person_id: "p-2", display_name: "Jordan Rivera", relationship_label: "Guardian" },
        ];
        expect(dedupePersonRelationshipLinks(links)).toHaveLength(2);
    });
});

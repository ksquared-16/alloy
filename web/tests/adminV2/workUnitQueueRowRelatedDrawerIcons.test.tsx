import { describe, expect, it } from "vitest";

import {
    buildCrmQueueRowPreviewPresentation,
    parseQueueRowCrmChildrenStructured,
} from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
import { extractQueueRowRelatedDrawerTargets, resolveQueueRowRelatedDrawerPersonIds } from "@/lib/workspace/viewModels/queueRowRelatedDrawerTargets";

describe("queueRowRelatedDrawerTargets", () => {
    it("extracts primary person and first inquiry child person ids", () => {
        const targets = extractQueueRowRelatedDrawerTargets(
            {
                id: "opp-1",
                primary_person_id: "person-parent",
                metadata: {
                    inquiry_children: [{ person_id: "child-1", display_name: "Sam" }],
                },
            },
            "opp-1"
        );
        expect(targets.personId).toBe("person-parent");
        expect(targets.childPersonId).toBe("child-1");
    });

    it("prefers server-enriched child person id and member children", () => {
        const fromMembers = resolveQueueRowRelatedDrawerPersonIds({
            primaryPersonId: "parent-1",
            activeMemberChildren: [{ person_id: "child-member-1" }],
        });
        expect(fromMembers.childPersonId).toBe("child-member-1");

        const fromEnriched = resolveQueueRowRelatedDrawerPersonIds({
            primaryPersonId: "parent-1",
            primaryChildPersonId: "child-enriched",
        });
        expect(fromEnriched.childPersonId).toBe("child-enriched");
    });
});

describe("queue row CRM compact person ids", () => {
    it("parses person_id on structured child lines", () => {
        const lines = parseQueueRowCrmChildrenStructured([
            { primary: "Alex (5y)", person_id: "child-alex" },
            { primary: "Jordan", personId: "child-jordan" },
        ]);
        expect(lines).toHaveLength(2);
        expect(lines[0]?.personId).toBe("child-alex");
        expect(lines[1]?.personId).toBe("child-jordan");
    });

    it("derives contactPersonId from _primary_person_id", () => {
        const presentation = buildCrmQueueRowPreviewPresentation(
            {
                _primary_contact_line: "Ada Lovelace · ada@example.com",
                _primary_person_id: "person-ada",
            },
            (f) => f === "primary_contact" || f === "email"
        );
        expect(presentation.contactPersonId).toBe("person-ada");
        expect(presentation.contactDisplayName).toBe("Ada Lovelace");
    });
});

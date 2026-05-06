import { describe, expect, it } from "vitest";
import { buildFormSubmissionWorkflowPayload } from "@/lib/forms/workflow/formSubmissionEvents";

describe("Form submission workflow event payloads", () => {
    it("includes required ids and omits document_id when absent", () => {
        const p = buildFormSubmissionWorkflowPayload({
            id: "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
            org_id: "11111111-1111-4111-8111-111111111111",
            form_definition_id: "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb",
            form_definition_version_id: "cccccccc-cccc-4ccc-9ccc-cccccccccccc",
            person_id: "dddddddd-dddd-4ddd-9ddd-dddddddddddd",
            customer_id: null,
            customer_member_id: null,
            opportunity_id: null,
            created_via_public_link_id: null,
        });
        expect(p.form_submission_id).toBe("aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee");
        expect(p.form_definition_id).toBe("bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb");
        expect(p.form_definition_version_id).toBe("cccccccc-cccc-4ccc-9ccc-cccccccccccc");
        expect(p.person_id).toBe("dddddddd-dddd-4ddd-9ddd-dddddddddddd");
        expect(p.org_id).toBe("11111111-1111-4111-8111-111111111111");
        expect(p.public_link_id).toBeNull();
        expect(Object.prototype.hasOwnProperty.call(p, "document_id")).toBe(false);
    });

    it("adds document_id when provided", () => {
        const p = buildFormSubmissionWorkflowPayload(
            {
                id: "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
                org_id: "11111111-1111-4111-8111-111111111111",
                form_definition_id: "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb",
                form_definition_version_id: "cccccccc-cccc-4ccc-9ccc-cccccccccccc",
                person_id: null,
                customer_id: null,
                customer_member_id: null,
                opportunity_id: null,
                created_via_public_link_id: "eeeeeeee-eeee-4eee-9eee-eeeeeeeeeeee",
            },
            { document_id: "ffffffff-ffff-4fff-9fff-ffffffffffff" }
        );
        expect(p.public_link_id).toBe("eeeeeeee-eeee-4eee-9eee-eeeeeeeeeeee");
        expect(p.document_id).toBe("ffffffff-ffff-4fff-9fff-ffffffffffff");
    });
});

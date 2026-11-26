import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProcessingCollectionEvidencePanel } from "@/components/pos/ProcessingCollectionEvidencePanel";
import type { ProcessingCollectionGroupEvidence } from "@/lib/pos/processingCase/collection/types";

const childrenGroup: ProcessingCollectionGroupEvidence = {
    group_id: "kids",
    collection_provider_ref: "children",
    collection_label: "Children",
    status: "valid",
    diagnostics: [],
    instances: [
        {
            proposal_id: "rrp:test:existing",
            collection_provider_ref: "children",
            collection_label: "Children",
            iteration_entity_type: "customer_member",
            instance_key: "col:children:cm-1",
            origin: "existing",
            existing_item_id: "cm-1",
            identity_label: "Jeff Smith",
            status: "valid",
            diagnostics: [],
            field_bindings: [
                {
                    field_id: "child_first_name",
                    provider_ref: "child.child_first_name",
                    entity_type: "child",
                    field_key: "child_first_name",
                    label: "First Name",
                    submitted_value: "Jeff",
                    display_value: "Jeff",
                },
            ],
            lineage: {
                processing_case_id: "case-1",
                form_submission_id: "sub-1",
                form_definition_version_id: "v1",
                schema_group_id: "kids",
                collection_provider_ref: "children",
                instance_key: "col:children:cm-1",
                payload_path: "groups.kids[col:children:cm-1]",
            },
        },
        {
            proposal_id: "rrp:test:new",
            collection_provider_ref: "children",
            collection_label: "Children",
            iteration_entity_type: "customer_member",
            instance_key: "client-new",
            origin: "respondent_added",
            existing_item_id: null,
            identity_label: "Jane",
            status: "valid",
            diagnostics: [],
            field_bindings: [
                {
                    field_id: "child_first_name",
                    provider_ref: "child.child_first_name",
                    entity_type: "child",
                    field_key: "child_first_name",
                    label: "First Name",
                    submitted_value: "Jane",
                    display_value: "Jane",
                },
            ],
            lineage: {
                processing_case_id: "case-1",
                form_submission_id: "sub-1",
                form_definition_version_id: "v1",
                schema_group_id: "kids",
                collection_provider_ref: "children",
                instance_key: "client-new",
                payload_path: "groups.kids[client-new]",
            },
        },
    ],
};

describe("ProcessingCollectionEvidencePanel", () => {
    it("renders grouped Children with existing and proposed-new labels", () => {
        const html = renderToStaticMarkup(<ProcessingCollectionEvidencePanel groups={[childrenGroup]} />);
        expect(html).toContain("Children");
        expect(html).toContain("Existing child");
        expect(html).toContain("New child proposed");
        expect(html).toContain("Jeff");
        expect(html).toContain("Jane");
        expect(html).not.toContain("person.contact_role");
        expect(html).not.toContain("Approve");
        expect(html).not.toContain("Commit");
    });

    it("shows existing Child commit controls only when case context is present", () => {
        const html = renderToStaticMarkup(<ProcessingCollectionEvidencePanel groups={[childrenGroup]} caseId="case-1" />);
        expect(html).toContain("Approve all valid fields");
        expect(html).toContain("Commit approved child updates");
        expect(html).toContain("Current:");
        expect(html).toContain("New child proposed");
    });
});

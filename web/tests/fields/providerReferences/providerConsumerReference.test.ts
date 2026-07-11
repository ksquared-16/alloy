import { describe, expect, it } from "vitest";
import { queryProviderConsumerReferences } from "@/lib/fields/providerConsumerReference";
import { providerReferencesFromRelatedRecordProposalBundle } from "@/lib/intake/proposals/providerReferences";
import { providerReferencesFromFormsDocumentsSchema } from "@/lib/forms/collection/formsDocumentsProviderReferences";

describe("provider consumer reference foundation", () => {
    it("indexes Forms draft and published references", () => {
        const schema = { fields: [{ id: "kids", type: "group", label: "Kids", required: false, collection_binding: { collection_provider_ref: "children", iteration_entity_type: "customer_member" }, fields: [{ id: "first", type: "text", label: "First", required: false, field_source: { entity_type: "child", field_key: "child_first_name" } }] }] } as const;
        const refs = [
            ...providerReferencesFromFormsDocumentsSchema({ schema, artifactId: "form-1", artifactVersionId: "v-draft", lifecycleStatus: "draft" }),
            ...providerReferencesFromFormsDocumentsSchema({ schema, artifactId: "form-1", artifactVersionId: "v-published", lifecycleStatus: "published" }),
        ];
        expect(queryProviderConsumerReferences(refs, { provider_ref: "children" })).toHaveLength(2);
        expect(queryProviderConsumerReferences(refs, { provider_ref: "child.child_first_name", lifecycle_status: "draft" })).toHaveLength(1);
    });

    it("indexes related-record proposal collection and field refs", () => {
        const refs = providerReferencesFromRelatedRecordProposalBundle({
            artifactId: "case-1",
            lifecycleStatus: "active",
            bundle: { diagnostics: [], collections: [{ collection_key: "kids", collection_provider_ref: "children", status: "valid", diagnostics: [], instances: [{ proposal_id: "p1", collection_provider_ref: "children", item_entity_type: "customer_member", instance_key: "i1", origin: "existing_record", existing_record_id: "cm-1", field_proposals: [{ provider_ref: "child.child_first_name", submitted_value: "Sam" }], source_lineage: { source_kind: "api", source_record_id: "api-1" }, diagnostics: [], status: "valid" }] }] },
        });
        expect(queryProviderConsumerReferences(refs, { provider_ref: "children", consumer_kind: "related_record_proposal" })).toHaveLength(1);
        expect(queryProviderConsumerReferences(refs, { provider_ref: "child.child_first_name" })).toHaveLength(1);
    });
});

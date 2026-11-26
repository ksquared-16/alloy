import { describe, expect, it } from "vitest";
import { projectRelatedRecordProposalsToEvidence } from "@/lib/pos/processingCase/collection/projectRelatedRecordProposalsToEvidence";
import type { RelatedRecordProposalBundle } from "@/lib/intake/proposals/types";
import { stableRelatedRecordProposalId } from "@/lib/intake/proposals/normalize";

describe("projectRelatedRecordProposalsToEvidence", () => {
    it("projects alternate OCR source identically to Forms-shaped proposals", () => {
        const bundle: RelatedRecordProposalBundle = {
            collections: [{
                collection_key: "kids",
                collection_provider_ref: "children",
                status: "valid",
                diagnostics: [],
                instances: [{
                    proposal_id: stableRelatedRecordProposalId({
                        source_kind: "ocr",
                        source_record_id: "doc-9",
                        collection_provider_ref: "children",
                        instance_key: "ocr-row-1",
                    }),
                    collection_provider_ref: "children",
                    item_entity_type: "customer_member",
                    instance_key: "ocr-row-1",
                    origin: "existing_record",
                    existing_record_id: "cm-1",
                    field_proposals: [{
                        provider_ref: "child.child_first_name",
                        submitted_value: "Sam",
                        source_fact_ref: "child_first_name",
                        label: "First Name",
                    }],
                    source_lineage: { source_kind: "ocr", source_record_id: "doc-9", source_path: "pages[0].rows[1]" },
                    diagnostics: [],
                    status: "valid",
                }],
            }],
            diagnostics: [],
        };
        const evidence = projectRelatedRecordProposalsToEvidence(bundle, { processingCaseId: null });
        expect(evidence.groups[0]?.instances[0]?.origin).toBe("existing");
        expect(evidence.groups[0]?.instances[0]?.field_bindings[0]?.display_value).toBe("Sam");
    });

    it("does not suppress projection when one instance is malformed", () => {
        const bundle: RelatedRecordProposalBundle = {
            collections: [{
                collection_key: "kids",
                collection_provider_ref: "children",
                status: "invalid",
                diagnostics: [],
                instances: [
                    {
                        proposal_id: "bad",
                        collection_provider_ref: "children",
                        item_entity_type: "customer_member",
                        instance_key: "",
                        origin: "proposed_new_record",
                        field_proposals: [],
                        source_lineage: { source_kind: "import", source_record_id: "x" },
                        diagnostics: [{ code: "missing_instance_key", message: "missing" }],
                        status: "invalid",
                    },
                    {
                        proposal_id: "good",
                        collection_provider_ref: "children",
                        item_entity_type: "customer_member",
                        instance_key: "ok",
                        origin: "proposed_new_record",
                        field_proposals: [{ provider_ref: "child.child_first_name", submitted_value: "Pat", label: "First" }],
                        source_lineage: { source_kind: "import", source_record_id: "x" },
                        diagnostics: [],
                        status: "valid",
                    },
                ],
            }],
            diagnostics: [],
        };
        const evidence = projectRelatedRecordProposalsToEvidence(bundle);
        expect(evidence.groups[0]?.instances).toHaveLength(2);
        expect(evidence.groups[0]?.instances[1]?.identity_label).toBe("Pat");
    });
});

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RelatedRecordInstanceProposal, RelatedRecordProposalBundle } from "@/lib/intake/proposals/types";
import { stableRelatedRecordProposalId } from "@/lib/intake/proposals/normalize";
import { projectRelatedRecordProposalsToEvidence } from "@/lib/pos/processingCase/collection/projectRelatedRecordProposalsToEvidence";

const FORBIDDEN_IMPORT_PATTERNS = ["@/lib/forms/", "react", "@/components/", "FormSchema", "validateSubmission"];

function listTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...listTsFiles(full));
        else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
    }
    return out;
}

describe("canonical proposal architecture", () => {
    it("canonical proposal modules do not import Forms, Documents, packets, or React", () => {
        const root = join(process.cwd(), "lib/intake/proposals");
        const files = listTsFiles(root);
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const content = readFileSync(file, "utf8");
            for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
                expect(content, `${file} must not reference ${pattern}`).not.toContain(pattern);
            }
        }
    });

    it("processing evidence projection accepts canonical proposals without Forms payload", () => {
        const bundle: RelatedRecordProposalBundle = {
            collections: [{
                collection_key: "import-children",
                collection_provider_ref: "children",
                status: "valid",
                diagnostics: [],
                instances: [{
                    proposal_id: stableRelatedRecordProposalId({
                        source_kind: "import",
                        source_record_id: "imp-1",
                        collection_provider_ref: "children",
                        instance_key: "row-1",
                    }),
                    collection_provider_ref: "children",
                    item_entity_type: "customer_member",
                    instance_key: "row-1",
                    origin: "proposed_new_record",
                    field_proposals: [{ provider_ref: "child.child_first_name", submitted_value: "Alex", label: "First Name" }],
                    source_lineage: { source_kind: "import", source_record_id: "imp-1", source_path: "rows[1]" },
                    diagnostics: [],
                    status: "valid",
                }],
            }],
            diagnostics: [],
        };
        const evidence = projectRelatedRecordProposalsToEvidence(bundle, { processingCaseId: "case-x" });
        expect(evidence.groups[0]?.collection_label).toBe("Children");
        expect(evidence.groups[0]?.instances[0]?.identity_label).toBe("Alex");
    });

    it("canonical proposal model can be consumed without Processing UI imports", () => {
        const inst: RelatedRecordInstanceProposal = {
            proposal_id: "rrp:test",
            collection_provider_ref: "children",
            item_entity_type: "customer_member",
            instance_key: "k1",
            origin: "existing_record",
            existing_record_id: "cm-1",
            field_proposals: [],
            source_lineage: { source_kind: "api", source_record_id: "api-1" },
            diagnostics: [],
            status: "valid",
        };
        expect(inst.origin).toBe("existing_record");
    });
});

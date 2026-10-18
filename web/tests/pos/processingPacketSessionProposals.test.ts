/**
 * WHAT THE OPERATOR SEES ON A PACKET CASE IS WHAT THEY CAN COMMIT.
 *
 * Deployed (a4e81b94): an Enrollment packet opened its Processing case from the PACKET SESSION. The case
 * view expanded that into the items' submissions and showed the family's proposed new child; commit read
 * form-submission sources only and answered "Proposal not found for case".
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadRelatedRecordProposalForCase } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";
import { adaptFormSubmissionToRelatedRecordProposals } from "@/lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals";
import { validateFormSchema } from "@/lib/forms/schema";

const RAW = JSON.parse(readFileSync(resolve(__dirname, "../forms/__fixtures_admissions_v12_published.json"), "utf8"));
const ORG = "org";
const payload = {
    values: { untitled_yes_no_13: true },
    groups: {
        emergency_contacts_2: [{
            instance_key: "row-dex",
            values: { emergency_contacts_2_full_name: "Dex Example", emergency_contacts_2_date_of_birth: "2021-05-01" },
            groups: {}, signatures: {},
            collection: { provider_ref: "children", origin: "respondent_added", iteration_entity_type: "customer_member" },
        }],
    },
};
const dexProposalId = (() => {
    const bundle = adaptFormSubmissionToRelatedRecordProposals(validateFormSchema(RAW), payload as never, { formSubmissionId: "sub-1", formDefinitionVersionId: "ver-1" });
    return bundle.collections.flatMap((c) => c.instances).find((i) => i.collection_provider_ref === "children")!.proposal_id;
})();

function db(tables: Record<string, Record<string, unknown>[]>) {
    return {
        from(table: string) {
            let rows = [...(tables[table] ?? [])];
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return api; },
                in: (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); return api; },
                maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
                then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
            };
            return api;
        },
    } as never;
}

const base = () => ({
    form_packet_session_items: [
        { org_id: ORG, packet_session_id: "session-1", form_submission_id: "sub-1" },
        { org_id: "other-org", packet_session_id: "session-1", form_submission_id: "sub-foreign" },
    ],
    form_submissions: [
        { id: "sub-1", org_id: ORG, payload, form_definition_version_id: "ver-1", customer_id: "house-1" },
        { id: "sub-foreign", org_id: "other-org", payload, form_definition_version_id: "ver-1", customer_id: "house-x" },
    ],
    form_definition_versions: [{ id: "ver-1", org_id: ORG, schema_json: RAW }],
});

describe("loading a proposal for commit", () => {
    it("a packet-session case resolves its submission's proposal, with the submission's household", async () => {
        const tables = { ...base(), processing_case_sources: [{ org_id: ORG, processing_case_id: "case-1", source_kind: "form_packet_session", source_id: "session-1" }] };
        const ctx = await loadRelatedRecordProposalForCase({ supabase: db(tables), orgId: ORG, caseId: "case-1", proposalId: dexProposalId });
        expect(ctx?.proposal.origin).toBe("proposed_new_record");
        expect(ctx?.proposal.collection_provider_ref).toBe("children");
        expect(ctx?.expectedCustomerId).toBe("house-1");
        expect(ctx?.source).toEqual({ source_kind: "form_submission", source_id: "sub-1" });
    });

    it("another organization's packet items are never read", async () => {
        const tables = {
            ...base(),
            form_packet_session_items: [{ org_id: "other-org", packet_session_id: "session-1", form_submission_id: "sub-1" }],
            processing_case_sources: [{ org_id: ORG, processing_case_id: "case-1", source_kind: "form_packet_session", source_id: "session-1" }],
        };
        expect(await loadRelatedRecordProposalForCase({ supabase: db(tables), orgId: ORG, caseId: "case-1", proposalId: dexProposalId })).toBeNull();
    });

    it("a form-submission case is unchanged", async () => {
        const tables = { ...base(), processing_case_sources: [{ org_id: ORG, processing_case_id: "case-2", source_kind: "form_submission", source_id: "sub-1" }] };
        const ctx = await loadRelatedRecordProposalForCase({ supabase: db(tables), orgId: ORG, caseId: "case-2", proposalId: dexProposalId });
        expect(ctx?.proposal.proposal_id).toBe(dexProposalId);
    });
});

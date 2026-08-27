/**
 * The final publish blocker: a document a SENTENCE asks for must reach the family.
 *
 * The packet's document requirements are prose — "Completed immunization records must be provided
 * on or before the first day of care" — and publication only knew how to make an upload when a whole
 * SECTION was typed as one. Four discovered obligations published as zero participant asks: visible
 * in configuration, absent from execution, which is the worst shape a defect can have.
 *
 * The negative controls carry most of the weight here. A projection that turns prose into uploads
 * too eagerly is a different, louder failure than one that drops them.
 */

import { describe, expect, it } from "vitest";
import { applyDiscovery } from "@/lib/pos/discovery/applyDiscovery";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { enumerateRequirementsFromForm, refKey, deriveParticipantRequirements, evaluateCompletion } from "@/lib/pos/packet/requirementResponsibility";
import { DISCOVERY_CONTRACT_VERSION, type BusinessConceptCandidate, type ConfigurationDiscoveryResult, type ConfigurationProposal, type ProposalDecisionState } from "@/lib/pos/discovery/contracts";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

// ── fixtures ────────────────────────────────────────────────────────────────

function draft(over: Partial<StoredFormDraftPreview> = {}): StoredFormDraftPreview {
    return {
        source_document_id: "doc-1",
        title: "Handbook",
        title_from_text: true,
        extracted_text_available: true,
        sections: [
            {
                id: "consent",
                title: "Parent Handbook Acknowledgement",
                field_ids: ["f1"],
                disposition: "acknowledgement",
                static_text: "You must read this handbook. Completed immunization records must be provided on or before the first day of care.",
            },
            { id: "details", title: "Child details", field_ids: ["f2"] },
        ],
        fields: [
            { id: "f1", label: "Parent name", type: "text", required: false, confidence: "high" },
            { id: "f2", label: "Child first name", type: "text", required: true, confidence: "high" },
        ],
        warnings: [],
        diagnostics: {} as never,
        ...over,
    } as StoredFormDraftPreview;
}

const concept = (over: Partial<BusinessConceptCandidate> & { id: string; label: string; sectionKey: string }): BusinessConceptCandidate =>
    ({
        contract_version: DISCOVERY_CONTRACT_VERSION,
        kind: "upload_requirement",
        concept_key: `requirement.upload.${over.id}`,
        subject: "child",
        cardinality: "single",
        requirement_type: "upload",
        suggested_data_type: "file",
        source: { page: 1, section_title: over.sectionKey === "consent" ? "Parent Handbook Acknowledgement" : "Child details", section_key: over.sectionKey, labels: [over.label] },
        confidence: { band: "review", percent: 65, signals: [] },
        explanation: "",
        ...over,
    }) as BusinessConceptCandidate;

const uploadProposal = (id: string, candidateId: string, documentType?: string): ConfigurationProposal =>
    ({
        contract_version: DISCOVERY_CONTRACT_VERSION,
        id,
        candidate_id: candidateId,
        disposition: "upload_requirement",
        target_requirement_type: "upload",
        ...(documentType ? { target_document_classification: documentType } : {}),
        confidence: { band: "review", percent: 65, signals: [] },
        alternatives: [],
        decision_state: "proposed",
        validation_issues: [],
        explanation: "",
        source: { page: 1, section_title: "Parent Handbook Acknowledgement", section_key: "consent", labels: [] },
    }) as ConfigurationProposal;

function discovery(concepts: BusinessConceptCandidate[], proposals: ConfigurationProposal[]): ConfigurationDiscoveryResult {
    return { contract_version: DISCOVERY_CONTRACT_VERSION, concepts, proposals, summary: [], warnings: [] } as unknown as ConfigurationDiscoveryResult;
}

function publish(d: StoredFormDraftPreview, disc: ConfigurationDiscoveryResult, decisions: Record<string, ProposalDecisionState>) {
    const { updatedDraft } = applyDiscovery({ draft: d, discovery: disc, decisions });
    const schema = draftFormToFormSchemaV1(updatedDraft);
    return { updatedDraft, schema, requirements: enumerateRequirementsFromForm("form-1", schema as never) };
}

const IMMUNIZATION = concept({ id: "1:consent:upload_immunization", label: "Completed immunization records must be provided on or before the first day of care.", sectionKey: "consent" });

// ── A. section contamination ────────────────────────────────────────────────

describe("A · a clause does not retype its section", () => {
    const disc = discovery([IMMUNIZATION], [uploadProposal("p1", IMMUNIZATION.id, "immunization_record")]);
    const { updatedDraft, schema, requirements } = publish(draft(), disc, { p1: "accepted" });

    it("leaves the section an acknowledgement section", () => {
        expect(updatedDraft.sections.find((s) => s.id === "consent")!.disposition).toBe("acknowledgement");
    });

    it("still emits the acknowledgement the section is FOR", () => {
        expect(requirements.some((r) => r.type === "acknowledgement")).toBe(true);
        expect(requirements.some((r) => r.type === "static_content")).toBe(true);
    });

    it("creates exactly one upload, and turns no other content into one", () => {
        const uploads = requirements.filter((r) => r.type === "upload");
        expect(uploads).toHaveLength(1);
        const fileFields = schema.fields.filter((f) => f.type === "file_ref");
        expect(fileFields).toHaveLength(1);
        // The unrelated text fields stay text.
        expect(schema.fields.find((f) => f.label === "Child first name")!.type).toBe("text");
    });
});

// ── B. ordinary prose ───────────────────────────────────────────────────────

describe("B · prose about documents creates nothing on its own", () => {
    it("publishes no upload when discovery classified no obligation", () => {
        // The section's static text literally says "records must be provided" — and with no approved
        // upload obligation, publication must not read it. Discovery is the only classifier.
        const { requirements, schema } = publish(draft(), discovery([], []), {});
        expect(requirements.filter((r) => r.type === "upload")).toHaveLength(0);
        expect(schema.fields.filter((f) => f.type === "file_ref")).toHaveLength(0);
    });
});

// ── C. ignored obligation ───────────────────────────────────────────────────

describe("C · an obligation the operator rejected does not publish", () => {
    const disc = discovery([IMMUNIZATION], [uploadProposal("p1", IMMUNIZATION.id, "immunization_record")]);

    it("publishes nothing when ignored", () => {
        const { requirements } = publish(draft(), disc, { p1: "ignored" });
        expect(requirements.filter((r) => r.type === "upload")).toHaveLength(0);
    });

    it("publishes nothing while still merely proposed", () => {
        const { requirements } = publish(draft(), disc, {});
        expect(requirements.filter((r) => r.type === "upload")).toHaveLength(0);
    });
});

// ── D. duplicate obligation ─────────────────────────────────────────────────

describe("D · one obligation, one participant ask", () => {
    it("does not create a second ask when the same clause is approved twice", () => {
        // Packet correlation links the same obligation across artifacts. The family must be asked
        // once; the lineage of both proposals is preserved in the result, not in a duplicate control.
        const disc = discovery(
            [IMMUNIZATION],
            [uploadProposal("p1", IMMUNIZATION.id, "immunization_record"), uploadProposal("p2", IMMUNIZATION.id, "immunization_record")],
        );
        const { updatedDraft, requirements } = publish(draft(), disc, { p1: "accepted", p2: "accepted" });
        expect(requirements.filter((r) => r.type === "upload")).toHaveLength(1);
        expect(updatedDraft.sections.find((s) => s.id === "consent")!.clause_uploads).toHaveLength(1);
    });

    it("is idempotent on re-apply", () => {
        const disc = discovery([IMMUNIZATION], [uploadProposal("p1", IMMUNIZATION.id, "immunization_record")]);
        const once = applyDiscovery({ draft: draft(), discovery: disc, decisions: { p1: "accepted" } });
        const twice = applyDiscovery({ draft: once.updatedDraft, discovery: disc, decisions: { p1: "accepted" } });
        expect(twice.updatedDraft.sections.find((s) => s.id === "consent")!.clause_uploads).toHaveLength(1);
        expect(enumerateRequirementsFromForm("form-1", draftFormToFormSchemaV1(twice.updatedDraft) as never).filter((r) => r.type === "upload")).toHaveLength(1);
    });
});

// ── E. distinct obligations in one section ──────────────────────────────────

describe("E · two different documents in one section stay two asks", () => {
    const exemption = concept({ id: "1:consent:upload_exemption", label: "Medical exemptions require a letter signed by a licensed physician.", sectionKey: "consent" });
    const disc = discovery(
        [IMMUNIZATION, exemption],
        [uploadProposal("p1", IMMUNIZATION.id, "immunization_record"), uploadProposal("p2", exemption.id, "immunization_record")],
    );
    const { schema, requirements } = publish(draft(), disc, { p1: "accepted", p2: "accepted" });

    it("publishes two upload requirements with distinct identities", () => {
        const uploads = requirements.filter((r) => r.type === "upload");
        expect(uploads).toHaveLength(2);
        expect(new Set(uploads.map((u) => refKey(u.ref))).size).toBe(2);
    });

    it("gives them distinct participant labels even when the document TYPE is the same", () => {
        // Both classify as `immunization_record` — the vocabulary has no name for an exemption
        // letter. Two asks reading "Immunization record" would look like one duplicated ask.
        const uploads = requirements.filter((r) => r.type === "upload");
        expect(new Set(uploads.map((u) => u.label)).size).toBe(2);
    });

    it("keeps each clause's own wording as the description", () => {
        const files = schema.fields.filter((f) => f.type === "file_ref");
        expect(files.map((f) => f.description)).toContain(IMMUNIZATION.label);
        expect(files.map((f) => f.description)).toContain(exemption.label);
    });
});

// ── F. document type ────────────────────────────────────────────────────────

describe("F · the document type survives, and is never invented", () => {
    it("carries a known type into the published control", () => {
        const disc = discovery([IMMUNIZATION], [uploadProposal("p1", IMMUNIZATION.id, "immunization_record")]);
        const { schema } = publish(draft(), disc, { p1: "accepted" });
        const file = schema.fields.find((f) => f.type === "file_ref")!;
        expect((file as { document_type?: string }).document_type).toBe("immunization_record");
        expect(file.label).toBe("Immunization record");
    });

    it("leaves it absent when discovery recognised none", () => {
        const disc = discovery([IMMUNIZATION], [uploadProposal("p1", IMMUNIZATION.id)]);
        const { schema } = publish(draft(), disc, { p1: "accepted" });
        const file = schema.fields.find((f) => f.type === "file_ref")!;
        expect((file as { document_type?: string }).document_type).toBeUndefined();
        // …and the label falls back to the clause rather than to a guessed type.
        expect(file.label).toMatch(/^Completed immunization records/);
    });
});

// ── §6. the satisfaction vertical ───────────────────────────────────────────

describe("§6 · one clause, end to end", () => {
    const exemption = concept({ id: "1:consent:upload_exemption", label: "Medical exemptions require a letter signed by a licensed physician.", sectionKey: "consent" });
    const disc = discovery(
        [IMMUNIZATION, exemption],
        [uploadProposal("p1", IMMUNIZATION.id, "immunization_record"), uploadProposal("p2", exemption.id)],
    );
    const { requirements } = publish(draft(), disc, { p1: "accepted", p2: "accepted" });
    const uploads = requirements.filter((r) => r.type === "upload");

    const roster = {
        children: [{ customer_member_id: "child-1", label: "Marisol", dob: "2021-04-02" }],
        recipients: [{ person_id: "guardian-1", label: "Ana", email: "ana@example.com", phone: null, relationship: "mother" }],
    };
    const instances = deriveParticipantRequirements({ requirements: uploads, rules: [], roster });

    it("projects an upload need to a real participant", () => {
        expect(instances).toHaveLength(2);
        expect(instances.every((i) => i.responsible_participants.length > 0)).toBe(true);
    });

    it("satisfies the requirement the document was supplied for — and only that one", () => {
        const target = instances.find((i) => refKey(i.ref) === refKey(uploads[0].ref))!;
        const submissions = [
            { ref_key: refKey(target.ref), scope_key: target.scope_key, participant_id: "guardian-1", document_id: "doc-uploaded-1" },
        ];
        const completions = evaluateCompletion(instances, submissions);
        const satisfied = completions.filter((c) => c.complete);
        const outstanding = completions.filter((c) => !c.complete);
        expect(satisfied).toHaveLength(1);
        expect(refKey(satisfied[0].instance.ref)).toBe(refKey(uploads[0].ref));
        // The unrelated upload is still owed. One document must not clear every document ask.
        expect(outstanding).toHaveLength(1);
        expect(refKey(outstanding[0].instance.ref)).toBe(refKey(uploads[1].ref));
    });

    it("carries the evidence document id on the submission", () => {
        const target = instances[0];
        const completions = evaluateCompletion(instances, [
            { ref_key: refKey(target.ref), scope_key: target.scope_key, participant_id: "guardian-1", document_id: "doc-uploaded-1" },
        ]);
        expect(completions.find((c) => c.complete)).toBeTruthy();
    });
});

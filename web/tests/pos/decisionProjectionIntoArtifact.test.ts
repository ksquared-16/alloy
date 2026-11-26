/**
 * An approved decision must reach the artifact's draft BEFORE it becomes a schema.
 *
 * The defect this locks: artifact realization built each Form straight from the projected structure
 * and never applied the case's approved decisions, so four approved clause-level upload obligations
 * produced zero `file_ref` controls — a packet that would never ask the family for the immunization
 * record. Everything else looked correct, which is exactly why it needed a control rather than a
 * reading.
 *
 * The second half was worse and only visible once the first was fixed: those uploads were neither
 * bulk-safe nor claimed by the review queue, so nobody could have approved them. An obligation that
 * becomes an executable requirement must be decidable by someone.
 */

import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { loadCertificationPacket } from "@/lib/pos/packetIntake/loadCertificationPacket";
import { structureForArtifact } from "@/lib/pos/processingCase/structure/structureForArtifact";
import { buildFormDraftFromStructure } from "@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { applyDiscovery } from "@/lib/pos/discovery/applyDiscovery";
import { isBulkAcceptSafe } from "@/lib/pos/discovery/bulkAcceptSafety";
import { needsOperatorReview } from "@/lib/pos/discovery/reviewPresentation";
import type { PacketIntakeInput } from "@/lib/pos/packetIntake/contracts";
import type { ProposalDecisionState } from "@/lib/pos/discovery/contracts";

let inputs: PacketIntakeInput[];
beforeAll(async () => {
    inputs = await loadCertificationPacket(path.join(process.cwd(), "tests/fixtures/processing"));
}, 300_000);

/** Realize one artifact the way the service must: project → apply approved decisions → schema. */
function realize(input: PacketIntakeInput, artifactId: string, decisions: Record<string, ProposalDecisionState>) {
    const artifact = (input.structure.logical_artifacts ?? []).find((a) => a.id === artifactId)!;
    const projected = structureForArtifact(input.structure, artifact);
    const draft0 = buildFormDraftFromStructure({
        structure: projected.structure, sourceDocumentId: input.artifact.document_id,
        extractedText: null, extractedTextAvailable: false, fileName: null, classificationKey: null,
    });
    const { updatedDraft } = applyDiscovery({ draft: draft0, discovery: input.discovery, decisions });
    return draftFormToFormSchemaV1(updatedDraft);
}

const uploadsOf = (i: PacketIntakeInput) => i.discovery.proposals.filter((p) => p.disposition === "upload_requirement");
const cisInput = () => inputs.find((i) => uploadsOf(i).length >= 2)!;

describe("REGRESSION — an approved clause upload must become a file_ref", () => {
    it("emits a file_ref for the artifact that owns the approved upload", () => {
        const input = cisInput();
        const uploads = uploadsOf(input);
        expect(uploads.length).toBeGreaterThan(0);
        const decisions: Record<string, ProposalDecisionState> = {};
        for (const u of uploads) decisions[u.id] = "accepted";

        const files = (input.structure.logical_artifacts ?? []).flatMap((a) =>
            realize(input, a.id, decisions).fields.filter((f) => f.type === "file_ref"),
        );
        // Before the fix the realization skipped applyDiscovery entirely and this was zero.
        expect(files.length, "approved clause uploads produced no upload control").toBe(uploads.length);
    });

    it("emits NO file_ref when the same upload is ignored", () => {
        const input = cisInput();
        const decisions: Record<string, ProposalDecisionState> = {};
        for (const u of uploadsOf(input)) decisions[u.id] = "ignored";
        const files = (input.structure.logical_artifacts ?? []).flatMap((a) =>
            realize(input, a.id, decisions).fields.filter((f) => f.type === "file_ref"),
        );
        expect(files).toHaveLength(0);
    });

    it("gives an artifact only the decisions whose lineage belongs to it", () => {
        // The CIS's two artifacts own different clauses. An upload approved on page 2 must not
        // appear on page 1's Form — a family would be asked for a document by the wrong agreement.
        const input = cisInput();
        const uploads = uploadsOf(input);
        const perArtifact = (input.structure.logical_artifacts ?? []).map((a) => ({
            id: a.id,
            files: realize(input, a.id, Object.fromEntries(uploads.map((u) => [u.id, "accepted" as const]))).fields.filter((f) => f.type === "file_ref").length,
        }));
        const total = perArtifact.reduce((n, p) => n + p.files, 0);
        expect(total).toBe(uploads.length);
        // and no single artifact absorbed them all
        expect(perArtifact.filter((p) => p.files > 0).length).toBeGreaterThan(1);
    });
});

describe("the other obligations survive the same path", () => {
    const accepted = (i: PacketIntakeInput) =>
        Object.fromEntries(i.discovery.proposals.map((p) => [p.id, "accepted" as ProposalDecisionState]));

    it("keeps acknowledgements as acknowledgements and signatures as signatures", () => {
        let acks = 0, sigs = 0;
        for (const i of inputs) {
            for (const a of i.structure.logical_artifacts ?? []) {
                const schema = realize(i, a.id, accepted(i));
                acks += schema.fields.filter((f) => f.type === "boolean").length;
                sigs += schema.fields.filter((f) => f.type === "signature").length;
            }
        }
        expect(sigs).toBe(6);
        expect(acks).toBeGreaterThan(0);
    });

    it("creates no canonical field for a held, process-scoped fact", () => {
        for (const i of inputs) {
            const held = i.discovery.proposals.filter((p) => p.disposition === "held_for_canonical_owner" || p.disposition === "held_unknown_owner");
            for (const p of held) expect(p.proposed_field, "a held concept must carry nothing creatable").toBeUndefined();
        }
    });
});

describe("no obligation may be invisible to both predicates", () => {
    it("puts every undecidable executable obligation in the operator's queue", () => {
        // The hole: an upload at `review` confidence was neither bulk-safe nor claimed by review, so
        // nobody could approve it and it silently never executed. Conclusions the operator only
        // inspects — held, derived, financial, reuse — are deliberately NOT swept in here.
        const OBLIGATIONS = new Set(["upload_requirement", "acknowledgement", "signature_requirement"]);
        const orphaned = inputs
            .flatMap((i) => i.discovery.proposals)
            .filter((p) => OBLIGATIONS.has(p.disposition) && !isBulkAcceptSafe(p) && !needsOperatorReview(p));
        expect(orphaned.map((p) => p.id), "obligations nobody can decide").toEqual([]);
    });
});

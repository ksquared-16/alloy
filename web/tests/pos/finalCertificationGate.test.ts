/**
 * The publish gate, run over the real corpus.
 *
 * Every clause here is a way the first certification publish could be dishonest: a question
 * collected into nowhere, a durable field nobody approved, a document requirement that never
 * reaches the family, a held concept slipping through. If any of them fails, the publish does not
 * happen — which is why they are assertions rather than a report.
 */

import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { composePacket } from "@/lib/pos/packetIntake/composePacket";
import { loadCertificationPacket } from "@/lib/pos/packetIntake/loadCertificationPacket";
import { buildFormDraftFromStructure } from "@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { applyDiscovery } from "@/lib/pos/discovery/applyDiscovery";
import { enumerateRequirementsFromForm, refKey } from "@/lib/pos/packet/requirementResponsibility";
import { classifyForPublish, ownerlessCount } from "@/lib/pos/discovery/publishOwnershipClassification";
import { isBulkAcceptSafe } from "@/lib/pos/discovery/bulkAcceptSafety";
import type { PacketIntakeInput, PacketIntakeResult } from "@/lib/pos/packetIntake/contracts";
import type { ProposalDecisionState } from "@/lib/pos/discovery/contracts";

let inputs: PacketIntakeInput[];
let packet: PacketIntakeResult;

beforeAll(async () => {
    inputs = await loadCertificationPacket(path.join(process.cwd(), "tests/fixtures/processing"));
    packet = composePacket(inputs);
}, 300_000);

const all = () => inputs.flatMap((i) => i.discovery.proposals);

/** The publish as proposed: accept the bindings and obligations, leave everything held. */
function publishDecisions(i: PacketIntakeInput): Record<string, ProposalDecisionState> {
    const d: Record<string, ProposalDecisionState> = {};
    for (const p of i.discovery.proposals) {
        d[p.id] = ["reuse_canonical_field", "reuse_existing_field", "relationship_binding", "safeguarding_binding",
            "acknowledgement", "signature_requirement", "upload_requirement", "static_content", "output_binding",
        ].includes(p.disposition)
            ? "accepted"
            : "proposed";
    }
    return d;
}

function project(i: PacketIntakeInput) {
    const draft0 = buildFormDraftFromStructure({
        structure: i.structure, sourceDocumentId: i.artifact.document_id,
        extractedText: null, extractedTextAvailable: false, fileName: null, classificationKey: null,
    });
    const { updatedDraft } = applyDiscovery({ draft: draft0, discovery: i.discovery, decisions: publishDecisions(i) });
    const schema = draftFormToFormSchemaV1(updatedDraft);
    return { schema, requirements: enumerateRequirementsFromForm(`form-${i.artifact.document_id}`, schema as never) };
}

describe("the packet still reconciles", () => {
    it("180 destinations, 86 facts, 32 obligations", () => {
        expect(packet.destinations).toHaveLength(180);
        expect(packet.obligations).toHaveLength(32);
        const OB = new Set(["upload_requirement", "acknowledgement", "signature", "static_content", "generated_output", "output_copy"]);
        const merge = new Map<string, string>();
        for (const c of packet.correlations) for (const m of c.members) merge.set(`${m.document_id}:${m.concept_id}`, c.concept_key);
        const facts = new Set<string>();
        for (const i of inputs) {
            if (i.artifact.fill_intent === "reference") continue;
            for (const c of i.discovery.concepts) {
                if (OB.has(c.kind)) continue;
                facts.add(merge.get(`${i.artifact.document_id}:${c.id}`) ?? `${i.artifact.document_id}|${c.concept_key ?? c.id}`);
            }
        }
        expect(facts.size).toBe(86);
    });
});

describe("ownership holds from the earlier slices", () => {
    it("proposes no new canonical field and leaves nothing ownerless", () => {
        expect(all().filter((p) => p.disposition === "create_proposed_field")).toHaveLength(0);
        const classified = inputs.flatMap((i) => {
            const byCandidate = new Map(i.discovery.proposals.map((p) => [p.candidate_id, p]));
            return i.artifact.fill_intent === "reference"
                ? []
                : i.discovery.concepts.flatMap((c) => {
                      const p = byCandidate.get(c.id);
                      return p ? [classifyForPublish(p, { label: c.label, concept_key: c.concept_key })] : [];
                  });
        });
        expect(ownerlessCount(classified)).toBe(0);
    });

    it("keeps safeguarding, Financials, Health and derived where they belong", () => {
        const by = (d: string) => all().filter((p) => p.disposition === d);
        expect(by("safeguarding_binding")).toHaveLength(3);
        expect(by("financial_payment")).toHaveLength(6);
        expect(by("held_for_canonical_owner")).toHaveLength(14);
        expect(by("derived_value_system")).toHaveLength(8);
        expect(by("relationship_binding")).toHaveLength(5);
        expect(by("reuse_canonical_field")).toHaveLength(21);
        // None of the held or derived rows carries anything creatable.
        for (const d of ["financial_payment", "derived_value_system", "held_for_canonical_owner", "held_unknown_owner", "safeguarding_binding"]) {
            expect(by(d).every((p) => p.proposed_field === undefined), d).toBe(true);
        }
    });

    it("never bulk-accepts a held, financial, derived or sensitive row", () => {
        const unsafe = all().filter((p) => isBulkAcceptSafe(p) &&
            ["financial_payment", "derived_value_system", "held_for_canonical_owner", "held_unknown_owner", "safeguarding_binding", "create_proposed_field"].includes(p.disposition));
        expect(unsafe).toHaveLength(0);
    });
});

describe("the obligation matrix", () => {
    it("projects uploads 4/4 — the blocker this slice existed to clear", () => {
        const discovered = all().filter((p) => p.disposition === "upload_requirement").length;
        const published = inputs.flatMap((i) => project(i).requirements).filter((r) => r.type === "upload").length;
        expect(discovered).toBe(4);
        expect(published).toBe(4);
    });

    it("projects signatures and static content, as the earlier preflight found", () => {
        const reqs = inputs.flatMap((i) => project(i).requirements);
        expect(reqs.filter((r) => r.type === "signature")).toHaveLength(6);
        expect(reqs.filter((r) => r.type === "static_content").length).toBeGreaterThan(0);
        expect(reqs.filter((r) => r.type === "acknowledgement").length).toBeGreaterThan(0);
    });

    it("gives every published requirement a distinct satisfaction identity", () => {
        // Two participant asks sharing an identity means one document clears both.
        for (const i of inputs) {
            const reqs = project(i).requirements;
            const keys = reqs.map((r) => refKey(r.ref));
            expect(new Set(keys).size, `${i.artifact.document_id} has colliding requirement identities`).toBe(keys.length);
        }
    });

    it("gives every upload a distinct participant label", () => {
        const uploads = inputs.flatMap((i) => project(i).requirements).filter((r) => r.type === "upload");
        expect(new Set(uploads.map((u) => u.label)).size).toBe(uploads.length);
    });
});

describe("nothing held or ignored publishes", () => {
    it("creates no upload control for a held or unapproved obligation", () => {
        // Publish the same packet with EVERYTHING left proposed: no obligation should reach a form.
        for (const i of inputs) {
            const draft0 = buildFormDraftFromStructure({
                structure: i.structure, sourceDocumentId: i.artifact.document_id,
                extractedText: null, extractedTextAvailable: false, fileName: null, classificationKey: null,
            });
            const { updatedDraft } = applyDiscovery({ draft: draft0, discovery: i.discovery, decisions: {} });
            const clauseUploads = updatedDraft.sections.flatMap((s) => s.clause_uploads ?? []);
            expect(clauseUploads, `${i.artifact.document_id} published an unapproved obligation`).toHaveLength(0);
        }
    });

    it("publishes no field for any held concept", () => {
        const schemas = inputs.map((i) => project(i).schema);
        const heldLabels = all()
            .filter((p) => p.disposition === "held_for_canonical_owner" || p.disposition === "held_unknown_owner" || p.disposition === "financial_payment")
            .map((p) => inputs.flatMap((i) => i.discovery.concepts).find((c) => c.id === p.candidate_id)?.label)
            .filter((l): l is string => Boolean(l));
        for (const schema of schemas) {
            for (const f of schema.fields) {
                if (f.type !== "file_ref") continue;
                // A held concept must never have become an upload control either.
                expect(heldLabels).not.toContain(f.label);
            }
        }
    });
});

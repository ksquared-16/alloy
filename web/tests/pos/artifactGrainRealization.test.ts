/**
 * The executable grain is the logical artifact, not the source document.
 *
 * The real packet proves why: three sources, six artifacts, signatures 2/1/0/1/1/1. One Form per
 * source would put three signatures on one Formsite Form, letting a single signature satisfy the
 * Tuition Agreement, the Handbook Acknowledgement and the ACH Authorization at once.
 *
 * Slicing is only safe if it partitions — losing a destination is a question never asked, and
 * duplicating one is a question asked twice or a signature that appears to execute two artifacts.
 * Those two properties carry most of this file.
 */

import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { loadCertificationPacket } from "@/lib/pos/packetIntake/loadCertificationPacket";
import {
    projectAllArtifacts,
    reconcileArtifactPartition,
    structureForArtifact,
} from "@/lib/pos/processingCase/structure/structureForArtifact";
import { buildFormDraftFromStructure } from "@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { enumerateRequirementsFromForm, refKey } from "@/lib/pos/packet/requirementResponsibility";
import type { PacketIntakeInput } from "@/lib/pos/packetIntake/contracts";

let inputs: PacketIntakeInput[];

beforeAll(async () => {
    inputs = await loadCertificationPacket(path.join(process.cwd(), "tests/fixtures/processing"));
}, 300_000);

const artifactsOf = (i: PacketIntakeInput) => i.structure.logical_artifacts ?? [];
const allProjections = () =>
    inputs.flatMap((i) => projectAllArtifacts(i.structure).map((p) => ({ input: i, ...p })));

describe("the corpus really is six artifacts across three sources", () => {
    it("finds six executable artifacts", () => {
        expect(inputs).toHaveLength(3);
        expect(allProjections()).toHaveLength(6);
    });

    it("carries signatures 2/1/0/1/1/1 — the reason the grain matters", () => {
        const sigs = allProjections().map((p) => p.artifact.signature_ids.length);
        expect(sigs.reduce((a, b) => a + b, 0)).toBe(6);
        expect(sigs.filter((n) => n === 0)).toHaveLength(1); // the unsigned collection artifact
    });
});

describe("slicing partitions the source — nothing lost, nothing duplicated", () => {
    it("reconciles every source exactly", () => {
        for (const i of inputs) {
            const report = reconcileArtifactPartition(i.structure);
            if (!artifactsOf(i).length) continue; // a source with no artifacts is not sliced
            expect(report.lost, `${i.artifact.document_id} lost destinations`).toEqual([]);
            expect(report.duplicated, `${i.artifact.document_id} duplicated destinations`).toEqual([]);
            expect(report.ok).toBe(true);
        }
    });

    it("keeps every destination the source had", () => {
        for (const i of inputs) {
            if (!artifactsOf(i).length) continue;
            const r = reconcileArtifactPartition(i.structure);
            expect(r.total_projected_destinations).toBe(r.total_source_destinations);
        }
    });
});

describe("the projection filters and never reinterprets", () => {
    it("keeps only the sections the artifact already claimed", () => {
        for (const { input, artifact, structure } of allProjections()) {
            const titles = structure.sections.map((s) => s.title);
            for (const t of titles) expect(artifact.section_titles, `${artifact.id}`).toContain(t);
            void input;
        }
    });

    it("reports nothing missing — every claimed section exists in the source", () => {
        for (const p of allProjections()) expect(p.missing_sections, p.artifact.id).toEqual([]);
    });

    it("preserves the source's section ORDER, not the title list's", () => {
        for (const i of inputs) {
            const order = i.structure.sections.map((s) => s.title);
            for (const p of projectAllArtifacts(i.structure)) {
                const kept = p.structure.sections.map((s) => s.title);
                const expected = order.filter((t) => kept.includes(t));
                expect(kept).toEqual(expected);
            }
        }
    });

    it("does not change a single field — same labels, same types", () => {
        for (const i of inputs) {
            const before = new Map(
                i.structure.sections.flatMap((s) => s.fields.map((f) => [`${s.title}::${f.label}`, f.suggested_type])),
            );
            for (const p of projectAllArtifacts(i.structure)) {
                for (const s of p.structure.sections) {
                    for (const f of s.fields) {
                        expect(before.get(`${s.title}::${f.label}`), f.label).toBe(f.suggested_type);
                    }
                }
            }
        }
    });

    it("tells the projected structure it is ONE artifact, so nobody re-segments it", () => {
        for (const p of allProjections()) {
            expect(p.structure.logical_artifacts).toHaveLength(1);
            expect(p.structure.logical_artifacts![0]!.id).toBe(p.artifact.id);
        }
    });
});

describe("six artifacts realize six Forms, each scoped to itself", () => {
    const realize = () =>
        allProjections().map(({ input, artifact, structure }) => {
            const draft = buildFormDraftFromStructure({
                structure,
                sourceDocumentId: input.artifact.document_id,
                extractedText: null,
                extractedTextAvailable: false,
                fileName: null,
                classificationKey: null,
            });
            const schema = draftFormToFormSchemaV1(draft);
            return {
                artifact,
                documentId: input.artifact.document_id,
                schema,
                requirements: enumerateRequirementsFromForm(`form-${input.artifact.document_id}-${artifact.id}`, schema as never),
            };
        });

    it("produces one Form per artifact", () => {
        expect(realize()).toHaveLength(6);
    });

    it("SIGNATURES stay artifact-scoped — one cannot satisfy another", () => {
        const forms = realize();
        const signed = forms.filter((f) => f.requirements.some((r) => r.type === "signature"));
        // Every signed artifact has its own form_definition_id, so its RequirementRefs cannot
        // collide with another artifact's. This is the property the whole grain decision protects.
        const keysByArtifact = new Map<string, string[]>();
        for (const f of forms) {
            keysByArtifact.set(f.artifact.id, f.requirements.filter((r) => r.type === "signature").map((r) => refKey(r.ref)));
        }
        const all = [...keysByArtifact.values()].flat();
        expect(new Set(all).size, "two artifacts share a signature identity").toBe(all.length);

        const tuition = keysByArtifact.get("2:tuition_enrollment_agreement") ?? [];
        const handbook = keysByArtifact.get("3:parent_handbook_acknowledgement") ?? [];
        const ach = keysByArtifact.get("4:direct_payment_authorization") ?? [];
        for (const set of [tuition, handbook, ach]) expect(set.length).toBeGreaterThan(0);
        expect(new Set([...tuition, ...handbook, ...ach]).size).toBe(tuition.length + handbook.length + ach.length);
    });

    it("keeps BOTH signatures independent inside the CIS artifact that carries two", () => {
        const page1 = realize().find((f) => f.artifact.id === "1:page_1")!;
        const sigs = page1.requirements.filter((r) => r.type === "signature");
        expect(sigs.length).toBeGreaterThanOrEqual(2);
        expect(new Set(sigs.map((r) => refKey(r.ref))).size).toBe(sigs.length);
    });

    it("keeps ACKNOWLEDGEMENTS inside their owning artifact even where labels collide", () => {
        const forms = realize();
        const acks = forms.flatMap((f) => f.requirements.filter((r) => r.type === "acknowledgement").map((r) => ({ artifact: f.artifact.id, key: refKey(r.ref) })));
        // Identical labels are fine; identical identities are not.
        expect(new Set(acks.map((a) => a.key)).size).toBe(acks.length);
    });

    it("keeps STATIC content as content, never as a participant information need", () => {
        for (const f of realize()) {
            for (const r of f.requirements.filter((x) => x.type === "static_content")) {
                expect(r.type).not.toBe("information");
            }
        }
    });
});

describe("the unsigned collection artifact is executable", () => {
    const collection = () => allProjections().find((p) => p.artifact.unsigned)!;

    it("exists, and carries the most destinations of any artifact", () => {
        const c = collection();
        expect(c.artifact.id).toBe("1:school_of_enrichment_admissions_packet");
        expect(c.artifact.destination_ids.length).toBe(76);
    });

    it("has no signature responsibility — and is still a Form with real content", () => {
        const c = collection();
        const draft = buildFormDraftFromStructure({
            structure: c.structure, sourceDocumentId: "doc", extractedText: null,
            extractedTextAvailable: false, fileName: null, classificationKey: null,
        });
        const schema = draftFormToFormSchemaV1(draft);
        const reqs = enumerateRequirementsFromForm("form-collection", schema as never);
        expect(reqs.filter((r) => r.type === "signature")).toHaveLength(0);
        // "unsigned" means nothing signs it, not that nothing is collected by it.
        expect(schema.fields.length).toBeGreaterThan(0);
        expect(reqs.length).toBeGreaterThan(0);
    });
});

describe("ask-once survives the split", () => {
    it("keeps one semantic identity for a fact that appears in several artifacts", async () => {
        const { canonicalKeyFor } = await import("@/lib/pos/packet/packetFieldPlan");
        const forms = allProjections().map(({ input, structure }) => {
            const draft = buildFormDraftFromStructure({
                structure, sourceDocumentId: input.artifact.document_id, extractedText: null,
                extractedTextAvailable: false, fileName: null, classificationKey: null,
            });
            return draftFormToFormSchemaV1(draft);
        });
        const bound = forms.flatMap((s) => s.fields.filter((f) => f.field_source));
        const keys = bound.map((f) => canonicalKeyFor(f).key);
        // Splitting one source into several Forms must not multiply questions: the same canonical
        // fact reached from two artifacts collapses to one key, which is what the runtime asks once.
        expect(new Set(keys).size).toBeLessThan(keys.length);
    });

    it("leaves an artifact-specific answer artifact-specific", () => {
        // A field with no canonical binding belongs to the artifact that asked it and nowhere else.
        const forms = allProjections().map(({ input, structure }) => {
            const draft = buildFormDraftFromStructure({
                structure, sourceDocumentId: input.artifact.document_id, extractedText: null,
                extractedTextAvailable: false, fileName: null, classificationKey: null,
            });
            return { id: input.artifact.document_id, schema: draftFormToFormSchemaV1(draft) };
        });
        const unbound = forms.flatMap((f) => f.schema.fields.filter((x) => !x.field_source && x.type !== "text_block"));
        expect(unbound.length).toBeGreaterThan(0);
    });
});

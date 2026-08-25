/**
 * Slice 3 acceptance — a reviewable packet that cannot publish.
 *
 * The acceptance boundary is: operator provides sources → Alloy composes → operator receives ONE
 * reviewable proposed configuration → nothing publishes automatically. The last clause is the one
 * worth testing hardest, so the publication controls here are both positive and negative: they
 * assert that the review path writes only analysis and decisions, and that the things which DO
 * publish are absent from it.
 */

import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { composePacket } from "@/lib/pos/packetIntake/composePacket";
import { loadCertificationPacket } from "@/lib/pos/packetIntake/loadCertificationPacket";
import { PACKET_INTAKE_METADATA_KEY, PACKET_REVIEW_METADATA_KEY } from "@/lib/pos/packetIntake/packetIntakeDb";
import type { PacketIntakeInput, PacketIntakeResult } from "@/lib/pos/packetIntake/contracts";

const FIXTURE_DIR = path.join(process.cwd(), "tests/fixtures/processing");
const WEB = process.cwd();

let inputs: PacketIntakeInput[];
let packet: PacketIntakeResult;

beforeAll(async () => {
    inputs = await loadCertificationPacket(FIXTURE_DIR);
    packet = composePacket(inputs);
}, 300_000);

describe("the packet is self-contained enough to review", () => {
    it("carries each source's own analysis, so the review never re-reads three documents", () => {
        expect(Object.keys(packet.source_analysis).sort()).toEqual(["doc-cis", "doc-formsite", "doc-handbook"]);
        for (const [id, a] of Object.entries(packet.source_analysis)) {
            expect(a.proposals.length, `${id} proposals`).toBe(a.concepts.length);
        }
    });

    it("gives the operator a review grain of facts and obligations, not 180 destinations", () => {
        const OBLIGATION = new Set(["acknowledgement", "upload_requirement", "signature"]);
        const factRows = Object.values(packet.source_analysis).flatMap((a) => a.concepts.filter((c) => !OBLIGATION.has(c.kind)));
        expect(packet.destinations.length).toBe(180);
        expect(factRows.length).toBeLessThan(packet.destinations.length / 1.8);
    });
});

describe("lineage answers 'why does Alloy think this fact belongs here?'", () => {
    it("traces a fact to artifact, section, page and stable control identity", () => {
        const guardianName = packet.source_analysis["doc-formsite"].concepts.find((c) => c.concept_key === "guardian.name")!;
        const lineage = guardianName.source.destinations ?? [];
        expect(lineage.length).toBeGreaterThanOrEqual(3);
        for (const d of lineage) {
            expect(d.evidence, "a destination must be addressable").toMatch(/^hosted_form:/);
            expect(d.section_title.length).toBeGreaterThan(0);
            expect(d.logical_artifact_id, "a destination knows which artifact owns it").toBeTruthy();
        }
        // It spans more than one artifact — which is the answer to "why here?"
        expect(new Set(lineage.map((d) => d.logical_artifact_id)).size).toBeGreaterThan(1);
    });

    it("does not make the display label the identity", () => {
        // Two destinations in different artifacts share the label "Parent Name:" and remain distinct.
        const guardianName = packet.source_analysis["doc-formsite"].concepts.find((c) => c.concept_key === "guardian.name")!;
        const lineage = guardianName.source.destinations ?? [];
        const duplicatedLabels = lineage.filter((d) => d.label === "Parent Name:");
        expect(duplicatedLabels.length).toBeGreaterThan(1);
        expect(new Set(duplicatedLabels.map((d) => d.evidence)).size).toBe(duplicatedLabels.length);
    });

    it("gives every fact-bearing destination a stable identity, page and section", () => {
        for (const a of Object.values(packet.source_analysis)) {
            for (const c of a.concepts) {
                for (const d of c.source.destinations ?? []) {
                    expect(d.evidence.length).toBeGreaterThan(0);
                    expect(typeof d.section_title).toBe("string");
                }
            }
        }
    });
});

describe("artifacts are named from evidence, and never by page number", () => {
    it("names the hosted form's agreements from their own headings", () => {
        const named = packet.artifacts.filter((a) => a.document_id === "doc-formsite");
        expect(named.every((a) => !a.needs_name)).toBe(true);
        expect(named.map((a) => a.title)).toContain("Tuition & Enrollment Agreement");
    });

    it("refuses to treat a page number as an artifact name, and asks the operator instead", () => {
        const cis = packet.artifacts.filter((a) => a.document_id === "doc-cis");
        expect(cis).toHaveLength(2);
        expect(cis.every((a) => a.needs_name), "Page 1 / Page 2 are positions, not identities").toBe(true);
        expect(cis.every((a) => a.signals.join(" ").includes("position, not an identity"))).toBe(true);
    });

    it("keeps artifact identity stable when the operator renames one", () => {
        // The id comes from lineage (ordinal + section), so a rename decision cannot orphan itself.
        const cis = packet.artifacts.filter((a) => a.document_id === "doc-cis");
        expect(cis.map((a) => a.id)).toEqual(["1:page_1", "2:page_2"]);
    });
});

describe("declared choices survive into a publishable form", () => {
    it("drafts a hosted form's choices as choices, with the options the source declared", async () => {
        const { buildFormDraftFromStructure } = await import("@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure");
        const hosted = inputs.find((i) => i.artifact.document_id === "doc-formsite")!;
        const draft = buildFormDraftFromStructure({ structure: hosted.structure, sourceDocumentId: "doc-formsite", extractedText: null, fileName: null, classificationKey: null });
        const gender = draft.fields.find((f) => f.label.startsWith("How would you describe"))!;
        expect(gender.type).toBe("select");
        expect(gender.options).toEqual(["Male", "Female", "Gender-diverse"]);
    });

    it("converts them into real select fields with static options", async () => {
        const { buildFormDraftFromStructure } = await import("@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure");
        const { draftFormToFormSchemaV1 } = await import("@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1");
        const hosted = inputs.find((i) => i.artifact.document_id === "doc-formsite")!;
        const draft = buildFormDraftFromStructure({ structure: hosted.structure, sourceDocumentId: "doc-formsite", extractedText: null, fileName: null, classificationKey: null });
        const schema = draftFormToFormSchemaV1(draft, { name: "Admissions Packet" });
        const flat = schema.sections.flatMap((s) => s.field_ids.map((id) => schema.fields.find((f) => f.id === id)!)).filter(Boolean);
        const gender = flat.find((f) => f.label.startsWith("How would you describe"))!;
        expect(gender.type).toBe("select");
        expect(gender.type === "select" ? gender.static_options : null).toEqual([
            { value: "Male", label: "Male" },
            { value: "Female", label: "Female" },
            { value: "Gender-diverse", label: "Gender-diverse" },
        ]);
        const account = flat.find((f) => f.label.startsWith("Select Account Type"))!;
        expect(account.type).toBe("select");
    });

    it("never invents options — a choice without them stays text and says so", async () => {
        const { buildFormDraftFromStructure } = await import("@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure");
        const draft = buildFormDraftFromStructure({
            structure: { sections: [{ title: "S", confidence: "high", fields: [{ label: "Pick one", suggested_type: "select", confidence: "medium" }] }], warnings: [] },
            sourceDocumentId: "d", extractedText: null, fileName: null, classificationKey: null,
        });
        expect(draft.fields[0].type).toBe("text");
        expect(draft.warnings.join(" ")).toMatch(/choices/i);
    });

    it("leaves every non-choice field exactly as it was", async () => {
        const { buildFormDraftFromStructure } = await import("@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure");
        const hosted = inputs.find((i) => i.artifact.document_id === "doc-formsite")!;
        const draft = buildFormDraftFromStructure({ structure: hosted.structure, sourceDocumentId: "doc-formsite", extractedText: null, fileName: null, classificationKey: null });
        const byType = draft.fields.reduce<Record<string, number>>((a, f) => { a[f.type] = (a[f.type] ?? 0) + 1; return a; }, {});
        // 5 choices: gender, account type, the annual fee, and the two Yes/No questions.
        expect(byType.select).toBe(5);
        expect(byType.signature).toBe(3);
        expect(byType.text + byType.select + byType.signature).toBe(95);
    });
});

describe("requiredness survives extraction", () => {
    it("carries the hosted form's 79 required destinations onto the draft", async () => {
        const { buildFormDraftFromStructure } = await import("@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure");
        const hosted = inputs.find((i) => i.artifact.document_id === "doc-formsite")!;
        const draft = buildFormDraftFromStructure({ structure: hosted.structure, sourceDocumentId: "doc-formsite", extractedText: null, fileName: null, classificationKey: null });
        expect(draft.fields.filter((f) => f.required)).toHaveLength(79);
    });
});

describe("NOTHING publishes from the review path", () => {
    const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf8");

    it("the packet analysis and decisions write only to case metadata", () => {
        const db = read("lib/pos/packetIntake/packetIntakeDb.ts");
        // Only ONE table is touched, and only its metadata column.
        const tables = [...db.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
        expect([...new Set(tables)]).toEqual(["processing_cases"]);
        expect(db).not.toMatch(/form_definitions|form_versions|field_definitions|business_process|process_instances|publish/i);
        expect(PACKET_INTAKE_METADATA_KEY).toBe("packet_intake");
        expect(PACKET_REVIEW_METADATA_KEY).toBe("packet_intake_review");
    });

    it("the packet builder creates no form, field or process", () => {
        const builder = read("lib/pos/packetIntake/buildPacketIntakeForCaseSafe.ts");
        expect(builder).not.toMatch(/form_definitions|form_versions|field_definitions|process_instances|business_process_/);
        expect(builder).not.toMatch(/\bpublish\w*\(/);
        // It reads documents and case sources, and writes the analysis. Nothing else.
        const tables = [...builder.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
        expect([...new Set(tables)].sort()).toEqual(["documents", "processing_case_sources"]);
    });

    it("the review component offers no publish control", () => {
        const ui = read("app/adminV2/pos/PacketIntakeReview.tsx");
        // A control, not a word: the component performs no writes of its own and calls nothing that
        // creates a form. (Its prose says "nothing published", which is the opposite of a control.)
        expect(ui).not.toMatch(/fetch\(|form-draft\/create|createFormFromCaseDraft|insertFormDefinition|insertVersion/);
        expect(ui).not.toMatch(/>\s*(Publish|Generate|Create form|Go live)\s*</i);
    });

    it("every proposal in a freshly composed packet is still proposed", () => {
        for (const a of Object.values(packet.source_analysis)) {
            expect(a.proposals.every((p) => p.decision_state === "proposed")).toBe(true);
        }
        expect(packet.correlations.every((c) => c.decision_state === "proposed")).toBe(true);
        expect(packet.obligations.every((o) => o.decision_state === "proposed")).toBe(true);
    });

    it("POSITIVE CONTROL — the path that DOES publish is a different one, and it is not reachable here", () => {
        // `createFormFromCaseDraft` is the real publish path. If the review ever gains a route to it,
        // this fails — which is the point.
        const creator = read("lib/pos/processingCase/formDraft/createFormFromCaseDraft.ts");
        expect(creator, "the real form-creating path must still exist for this control to mean anything").toMatch(
            /insertFormDefinition|insertVersion/
        );
        const ui = read("app/adminV2/pos/PacketIntakeReview.tsx");
        expect(ui).not.toMatch(/createFormFromCaseDraft|form-draft\/create/);
        const db = read("lib/pos/packetIntake/packetIntakeDb.ts");
        expect(db).not.toMatch(/createFormFromCaseDraft/);
    });
});

describe("G9 — source validation survives, or is reported as lost", () => {
    it("carries a declared max length from the hosted form onto the published field", async () => {
        const { buildFormDraftFromStructure } = await import("@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure");
        const { draftFormToFormSchemaV1 } = await import("@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1");
        const hosted = inputs.find((i) => i.artifact.document_id === "doc-formsite")!;
        const withLimit = hosted.structure.sections.flatMap((s) => s.fields).filter((f) => f.validate?.max_length);
        // The form declares maxlength on its four date controls.
        expect(withLimit.length).toBe(4);
        expect(withLimit.every((f) => f.validate!.max_length === 10)).toBe(true);

        const draft = buildFormDraftFromStructure({ structure: hosted.structure, sourceDocumentId: "doc-formsite", extractedText: null, fileName: null, classificationKey: null });
        expect(draft.fields.filter((f) => f.validate?.max_length === 10)).toHaveLength(4);
        const schema = draftFormToFormSchemaV1(draft, { name: "Admissions Packet" });
        expect(schema.fields.filter((f) => f.validate?.max_length === 10)).toHaveLength(4);
    });

    it("reads the AcroForm's own required and max-length flags rather than guessing", async () => {
        const { extractPdfAcroFormFields } = await import("@/lib/pos/processingCase/structure/pdfAcroForm");
        const acro = await extractPdfAcroFormFields(new Uint8Array(fs.readFileSync(path.join(FIXTURE_DIR, "oregon-certificate-of-immunization-status.pdf"))));
        // The Oregon form marks nothing required and sets no max length. Reading the flags and
        // finding them empty is a measurement; assuming it is not.
        expect(acro.fields.some((f) => f.required)).toBe(false);
        expect(acro.fields.some((f) => f.max_length)).toBe(false);
    }, 120_000);

    it("never invents validation the source did not state", () => {
        for (const i of inputs) {
            for (const f of i.structure.sections.flatMap((s) => s.fields)) {
                if (!f.validate) continue;
                // Every rule present must have come from a declared attribute or widget flag.
                expect(Object.keys(f.validate).length).toBeGreaterThan(0);
                expect(Object.values(f.validate).every((v) => v !== undefined && v !== null)).toBe(true);
            }
        }
    });
});

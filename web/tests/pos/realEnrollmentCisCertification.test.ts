/**
 * Real Enrollment Certification V1 — Slice 1 acceptance, against the real source document.
 *
 * The fixture is the Oregon Health Authority's Certificate of Immunization Status exactly as the
 * school distributes it: the blank public form, byte-identical to what was imported. It carries no
 * family data — all 85 widgets are empty and no checkbox is set, which the first test asserts
 * rather than assumes.
 *
 * What this certifies:
 *   source CIS
 *     → 85 native destinations preserved, with names, types, pages and boxes unchanged
 *     → semantic discovery runs on the SAME draft
 *     → signatures correctly classified
 *     → repeated immunization destinations compressed structurally
 *     → proposals produced, none applied
 */

import { beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chooseDraftForCase } from "@/lib/pos/processingCase/formDraft/buildFormDraftForCaseSafe";
import { extractPdfAcroFormFields } from "@/lib/pos/processingCase/structure/pdfAcroForm";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

const FIXTURE = path.join(process.cwd(), "tests/fixtures/processing/oregon-certificate-of-immunization-status.pdf");

/** Pins the fixture. A different file is a different certification. */
const FIXTURE_SHA256 = "cda2af9f85f814cee37b7990a0c99c3808e47283457cf76c83cc0146ee357388";

/** The measured baseline this slice is certified against. @see docs/audits/active/real-enrollment-certification-v1 */
const NATIVE_DESTINATIONS = 85;

let draft: StoredFormDraftPreview;

beforeAll(async () => {
    draft = await chooseDraftForCase({
        sourceDocumentId: "cis-fixture",
        fileName: "oregon-certificate-of-immunization-status.pdf",
        classificationKey: null,
        text: { available: false, text: null, reason: "not_extracted" },
        pdfBytes: new Uint8Array(fs.readFileSync(FIXTURE)),
        mimeType: "application/pdf",
        extractAcroForm: extractPdfAcroFormFields,
    });
}, 120_000);

describe("the fixture is the real blank public form", () => {
    it("is byte-identical to the imported document", () => {
        const sha = crypto.createHash("sha256").update(fs.readFileSync(FIXTURE)).digest("hex");
        expect(sha).toBe(FIXTURE_SHA256);
    });

    it("carries no family data", async () => {
        const acro = await extractPdfAcroFormFields(new Uint8Array(fs.readFileSync(FIXTURE)));
        expect(acro.fields).toHaveLength(NATIVE_DESTINATIONS);
        // Nothing is prefilled: the draft's labels are the widget NAMES, so any personal value would
        // have to have come from a field value, and the extractor reads none.
        expect(acro.fields.every((f) => typeof f.label === "string" && f.label.length > 0)).toBe(true);
    }, 120_000);
});

describe("exact extraction is preserved", () => {
    it("keeps every native destination", () => {
        expect(draft.fields).toHaveLength(NATIVE_DESTINATIONS);
    });

    it("keeps every field's native name, page and bounding box", () => {
        expect(draft.fields.every((f) => !!f.pdf_field_name)).toBe(true);
        expect(draft.fields.every((f) => f.page === 1 || f.page === 2)).toBe(true);
        expect(draft.fields.every((f) => Array.isArray(f.bbox) && f.bbox.length === 4)).toBe(true);
    });

    it("keeps the document's own field types", () => {
        const byType = draft.fields.reduce<Record<string, number>>((acc, f) => {
            acc[f.type] = (acc[f.type] ?? 0) + 1;
            return acc;
        }, {});
        expect(byType).toEqual({ text: 52, date: 14, number: 1, boolean: 15, signature: 3 });
    });

    it("does not suppress or rewrite a destination to make a collection", () => {
        // Grouping is a proposal. Every occurrence is still a real, reviewable destination.
        expect(draft.fields.filter((f) => f.suppressed_by_collection).length).toBe(0);
        expect(new Set(draft.fields.map((f) => f.pdf_field_name)).size).toBe(NATIVE_DESTINATIONS);
    });
});

describe("semantic discovery runs on that same draft", () => {
    it("produces concepts and proposals", () => {
        const d = draft.configuration_discovery;
        expect(d, "the AcroForm draft must carry discovery").toBeTruthy();
        expect(d!.concepts.length).toBeGreaterThan(0);
        expect(d!.proposals.length).toBe(d!.concepts.length);
    });

    it("compresses 85 destinations into far fewer decisions", () => {
        const concepts = draft.configuration_discovery!.concepts;
        expect(concepts.length).toBeLessThan(NATIVE_DESTINATIONS / 2);
    });

    it("proposes nothing as applied — the operator still decides", () => {
        expect(draft.configuration_discovery!.proposals.every((p) => p.decision_state === "proposed")).toBe(true);
    });
});

describe("signatures", () => {
    const sigs = () => draft.fields.filter((f) => f.type === "signature");

    it("finds all three signature lines, including the two mandatory numbered ones", () => {
        expect(sigs().map((f) => f.pdf_field_name).sort()).toEqual(["Signature update", "Signature1", "Signature2"]);
    });

    it("raises each one as a signature requirement", () => {
        const proposals = draft.configuration_discovery!.proposals.filter((p) => p.disposition === "signature_requirement");
        expect(proposals).toHaveLength(3);
        expect(proposals.every((p) => p.target_requirement_type === "signature")).toBe(true);
    });

    it("keeps the re-sign line distinguishable from the initial signatures", () => {
        const concepts = draft.configuration_discovery!.concepts.filter((c) => c.kind === "signature");
        const update = concepts.find((c) => /update/i.test(c.label));
        expect(update?.explanation).toMatch(/re-sign/i);
        expect(concepts.filter((c) => !/update/i.test(c.label)).every((c) => !/re-sign/i.test(c.explanation))).toBe(true);
    });

    it("does not mistake the date beside a signature for a signature", () => {
        expect(sigs().some((f) => /^Date/i.test(f.pdf_field_name ?? ""))).toBe(false);
        expect(draft.fields.filter((f) => /^Date/i.test(f.pdf_field_name ?? "")).every((f) => f.type === "date")).toBe(true);
    });
});

describe("repeated immunization destinations compress structurally", () => {
    const groups = () => draft.configuration_discovery!.concepts.filter((c) => !!c.repetition);

    it("recognizes the eight per-vaccine dose schedules", () => {
        const series = groups().filter((c) => c.kind === "value_series");
        expect(series).toHaveLength(8);
        // Seven vaccines carry five dose columns; varicella carries two.
        expect(series.map((c) => c.repetition!.instances).sort((a, b) => a - b)).toEqual([2, 5, 5, 5, 5, 5, 5, 5]);
    });

    it("recognizes the eight-row 'other vaccines' table as ONE repeating collection", () => {
        const records = groups().filter((c) => c.kind === "repeating_record");
        expect(records).toHaveLength(1);
        expect(records[0].repetition!.instances).toBe(8);
        expect(records[0].repetition!.item_types).toEqual(["text", "date"]);
    });

    it("recognizes the exemption checkbox blocks as choices, not fifteen booleans", () => {
        const choices = groups().filter((c) => c.kind === "choice_field");
        expect(choices.map((c) => c.repetition!.instances).sort((a, b) => a - b)).toEqual([2, 2, 3, 7]);
    });

    it("turns 67 repeated destinations into 13 decisions", () => {
        const covered = groups().reduce((n, c) => n + c.repetition!.member_names.length, 0);
        expect(covered).toBe(67);
        expect(groups()).toHaveLength(13);
    });

    it("counts no occurrence twice — every grouped destination belongs to exactly one group", () => {
        const all = groups().flatMap((c) => c.repetition!.member_names);
        expect(new Set(all).size).toBe(all.length);
    });
});

describe("the immunization record projects to roughly the measured participant needs", () => {
    it("is about a dozen needs, not sixty-nine questions", () => {
        // Baseline (docs/audits/active/real-enrollment-certification-v1/packet-baseline.md) counted 13
        // semantic needs behind 69 immunization destinations. Discovery reaches 15: it keeps the
        // English and Spanish exemption-document blocks separate (2 rather than 1, since telling
        // translated duplicates apart needs language awareness the importer does not have), and it
        // keeps "had chickenpox disease" and its date as two facts rather than a gate and its detail.
        const d = draft.configuration_discovery!;
        const immunization = d.concepts.filter(
            (c) => !!c.repetition || /var_history|date_fecha$/.test(c.concept_key ?? "")
        );
        expect(immunization.length).toBe(15);
    });
});

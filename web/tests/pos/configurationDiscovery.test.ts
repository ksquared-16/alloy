/**
 * POS-FP16 — Configuration Discovery acceptance certification (Layers 2→5).
 *
 * Proves the exact Enrollment Record fixture is discovered as a governed operating-model proposal —
 * concept-first, not 112 rows — with the required concept-level outcomes: existing-field matches,
 * relationships, upload/acknowledgement/signature requirements, static/output classification.
 *
 * Contract-level assertions (not one golden snapshot): each boundary is checked for the meaningful
 * property it must guarantee. Input is the captured fixture geometry run through the real detector +
 * discovery pipeline — deterministic, no PDF library, no LLM, no I/O.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { buildLayoutLines } from "@/lib/pos/processingCase/structure/pdfLayoutLines";
import { detectLayoutStructure } from "@/lib/pos/processingCase/structure/detectLayoutStructure";
import type { LayoutDocument, LayoutTextItem } from "@/lib/pos/processingCase/structure/pdfLayoutTypes";
import { buildSemanticModel } from "@/lib/pos/discovery/semanticModel";
import { discoverConcepts } from "@/lib/pos/discovery/conceptDiscovery";
import { discoverConfiguration } from "@/lib/pos/discovery/discoverConfiguration";

type GeomItem = { s: string; x: number; y: number; w: number; h: number; fh: number };
type Geom = { pageCount: number; pages: { page: number; width: number; height: number; items: GeomItem[] }[] };

function fixtureStructure() {
    const g = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/enrollment-record-8.25.geom.json"), "utf8")) as Geom;
    const doc: LayoutDocument = {
        pageCount: g.pageCount,
        ok: true,
        reason: null,
        pages: g.pages.map((p) => ({
            page: p.page,
            width: p.width,
            height: p.height,
            lines: buildLayoutLines(p.items.map((it): LayoutTextItem => ({ s: it.s, x: it.x, y: it.y, w: it.w, h: it.h, fh: it.fh })), p.page),
        })),
    };
    return detectLayoutStructure(doc);
}

const structure = fixtureStructure();
const result = discoverConfiguration({ structure });
const concepts = result.concepts;
const proposals = result.proposals;
const summaryCount = (label: RegExp) => result.summary.find((s) => label.test(s.label))?.count ?? 0;
const proposalFor = (labelRe: RegExp) => proposals.find((p) => labelRe.test(concepts.find((c) => c.id === p.candidate_id)?.label ?? ""));

describe("Configuration Discovery — Enrollment Record acceptance fixture", () => {
    it("reviews concepts, not 112 raw questions", () => {
        // 112 detected questions collapse to a reviewable concept set (relationships + dedup + output copy).
        expect(concepts.length).toBeLessThan(50);
        expect(concepts.length).toBeGreaterThan(25);
    });

    it("produces the operator-facing summary categories", () => {
        expect(summaryCount(/Existing fields matched/)).toBeGreaterThanOrEqual(6);
        expect(summaryCount(/Relationships found/)).toBe(3);
        expect(summaryCount(/Upload requirements found/)).toBe(2);
        expect(summaryCount(/Acknowledgements found/)).toBe(1);
        expect(summaryCount(/Signatures found/)).toBe(2);
        expect(summaryCount(/output copies found/)).toBe(1);
    });

    it("AUDIT: proposes only genuinely durable new fields — screening data is form-only, not new fields", () => {
        const newFields = proposals.filter((p) => p.disposition === "create_proposed_field");
        const formOnly = proposals.filter((p) => p.disposition === "form_only_response");
        // The 5 audited durable new fields — no more (25→5 correction). Optimize ownership, not count.
        const newLabels = newFields.map((p) => concepts.find((c) => c.id === p.candidate_id)!.label).sort();
        expect(newLabels).toEqual(["Date of Enrollment", "Dentist Name/Practice", "Nickname", "Preferred Hospital", "Primary Care Doctor Name/Practice"]);
        // The health-history screening grid is FORM-ONLY, never durable customer_member fields.
        for (const screening of ["Ear Infections", "Diabetes", "Asthma", "Nosebleeds", "Convulsions/Seizures", "Heart Disease/Defect"]) {
            expect(formOnly.some((p) => concepts.find((c) => c.id === p.candidate_id)!.label === screening)).toBe(true);
            expect(newLabels).not.toContain(screening);
        }
        // Y/N screening statuses + conditional explanations are form-only.
        expect(formOnly.some((p) => /health care plan/i.test(concepts.find((c) => c.id === p.candidate_id)!.label))).toBe(true);
        expect(formOnly.some((p) => /if yes, please explain/i.test(concepts.find((c) => c.id === p.candidate_id)!.label))).toBe(true);
        expect(formOnly.length).toBeGreaterThanOrEqual(18);
        // A durable medical-provider field carries health sensitivity.
        const doctor = newFields.find((p) => /Primary Care Doctor/.test(concepts.find((c) => c.id === p.candidate_id)!.label));
        expect(doctor?.proposed_field?.sensitivity).toBe("health");
    });

    it("matches high-confidence canonical fields to the existing model (no duplicates)", () => {
        const expectMatch = (labelRe: RegExp, entity: string, key: string) => {
            const p = proposalFor(labelRe);
            expect(p?.disposition, `${labelRe} should reuse a canonical field`).toBe("reuse_canonical_field");
            expect(p?.target_field_source).toEqual(expect.objectContaining({ entity_type: entity, field_key: key }));
        };
        expectMatch(/Child's Name/, "customer_member", "display_name");
        expectMatch(/Date of Birth/, "customer_member", "dob");
        expectMatch(/Allergies/, "customer_member", "allergies");
        expectMatch(/Best Email Address/, "person", "email");
        expectMatch(/Best Contact Number/, "person", "phone"); // richer than the label — via concept key
        expectMatch(/Home Address/, "customer", "address");
    });

    it("classifies guardians, emergency contacts, and pickups as child-scoped relationships", () => {
        const rel = proposals.filter((p) => p.disposition === "relationship_binding");
        const roles = rel.map((p) => p.target_relationship_role).sort();
        expect(roles).toEqual(["authorized_pickup", "emergency_contact", "guardian"]);
        // relationship concepts, not flat person fields
        expect(concepts.filter((c) => c.kind === "relationship_group").every((c) => c.cardinality === "multiple")).toBe(true);
        // no "Emergency Contact #1 Name" leaked as a scalar field concept
        expect(concepts.some((c) => c.kind === "scalar_field" && /Emergency Contact #/.test(c.label))).toBe(false);
    });

    it("recognizes both document-upload requirements (immunization + conditional health-care-plan)", () => {
        const uploads = proposals.filter((p) => p.disposition === "upload_requirement");
        expect(uploads.length).toBe(2);
        expect(uploads.every((p) => p.target_requirement_type === "upload")).toBe(true);
        const labels = uploads.map((p) => concepts.find((c) => c.id === p.candidate_id)?.label ?? "");
        expect(labels.some((l) => /immuniz/i.test(l))).toBe(true);
        expect(labels.some((l) => /health care plan/i.test(l))).toBe(true);
    });

    it("recognizes the emergency-authorization acknowledgement", () => {
        const ack = proposals.find((p) => p.disposition === "acknowledgement");
        expect(ack?.target_requirement_type).toBe("acknowledgement");
    });

    it("distinguishes participant signatures from an internal director signature", () => {
        const sigs = proposals.filter((p) => p.disposition === "signature_requirement");
        expect(sigs.length).toBe(2);
        const director = sigs.find((p) => /Director/i.test(concepts.find((c) => c.id === p.candidate_id)?.label ?? ""));
        const guardian = sigs.find((p) => /Parent\/Guardian/i.test(concepts.find((c) => c.id === p.candidate_id)?.label ?? ""));
        expect(concepts.find((c) => c.id === director?.candidate_id)?.subject).toBe("internal");
        expect(concepts.find((c) => c.id === guardian?.candidate_id)?.subject).toBe("person");
        expect(director?.explanation).toMatch(/internal/i);
    });

    it("recognizes the classroom copy as an output projection, not participant work", () => {
        const out = proposals.find((p) => p.disposition === "output_binding");
        expect(out).toBeTruthy();
        expect(concepts.find((c) => c.id === out?.candidate_id)?.kind).toBe("output_copy");
    });

    it("proposes a durable new field for a genuine unmatched attribute (choice with options)", () => {
        const hospital = proposalFor(/Preferred Hospital/);
        expect(hospital?.disposition).toBe("create_proposed_field");
        expect(hospital?.proposed_field?.data_type).toBe("select");
        expect((hospital?.proposed_field?.option_set ?? []).length).toBe(6);
        // new fields are proposals only — never auto-created
        expect(proposals.filter((p) => p.disposition === "create_proposed_field").every((p) => p.decision_state === "proposed")).toBe(true);
    });

    it("captures Y/N status questions and their conditional explanations as concepts", () => {
        expect(concepts.some((c) => c.kind === "boolean_status" && /health care plan/i.test(c.label))).toBe(true);
        expect(concepts.filter((c) => c.kind === "conditional_explanation").length).toBeGreaterThanOrEqual(3);
    });

    it("gives every concept and proposal a stable, lineage-derived id (rerun-safe)", () => {
        const rerun = discoverConfiguration({ structure });
        expect(rerun.concepts.map((c) => c.id)).toEqual(concepts.map((c) => c.id));
        expect(rerun.proposals.map((p) => p.id)).toEqual(proposals.map((p) => p.id));
        // ids derive from lineage (page:section:slug), never an array index
        expect(concepts.every((c) => /^\d+:[a-z0-9_]*:/.test(c.id))).toBe(true);
    });

    it("every proposal is explainable and confidence-banded", () => {
        expect(proposals.every((p) => p.explanation.length > 10)).toBe(true);
        expect(proposals.every((p) => ["high", "review", "attention", "unresolved"].includes(p.confidence.band))).toBe(true);
        expect(proposals.every((p) => p.confidence.signals.length > 0)).toBe(true);
    });
});

describe("Configuration Discovery — semantic model boundary", () => {
    it("does not treat a signature section as a repeated person group", () => {
        const sem = buildSemanticModel(structure);
        const sig = sem.sections.find((s) => /Parent\/Guardian Signatures/.test(s.title));
        expect(sig?.repeated_person).toBe(false);
        const guardians = sem.sections.find((s) => /^Parent or Guardian #1$/.test(s.title));
        expect(guardians?.repeated_person).toBe(true);
    });
    it("discovers concepts deterministically from the semantic model", () => {
        const a = discoverConcepts(buildSemanticModel(structure));
        const b = discoverConcepts(buildSemanticModel(structure));
        expect(a.map((c) => c.concept_key)).toEqual(b.map((c) => c.concept_key));
    });
});

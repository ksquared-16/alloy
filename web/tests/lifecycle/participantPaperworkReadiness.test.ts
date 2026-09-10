import { describe, expect, it } from "vitest";

import {
    participantPaperworkReadiness,
    participantPaperworkHeadline,
    type ReferencedFormFacts,
    type StageFormRequirementFacts,
} from "@/lib/lifecycle/participantPaperworkReadiness";

/**
 * THE CHECKS THAT WERE MISSING WHILE THE SURFACE SAID HEALTHY.
 *
 * Measured on the real Enrolling stage: four Forms required, and Configuration Health reported
 * HEALTHY on five checks that are all about operators — a workspace tile, queue views, a records
 * query, an actions matrix. Not one of them asked whether a family could complete any of it.
 *
 * Every row here is a way that same configuration can look finished and be unusable.
 */

const form = (over: Partial<ReferencedFormFacts> & { form_definition_id: string }): ReferencedFormFacts => ({
    exists: true,
    name: "A form",
    has_published_version: true,
    published_field_count: 10,
    uploads: [],
    signature_field_ids: [],
    signature_placement_field_ids: [],
    renders_source_document: false,
    ...over,
});

const req = (id: string, level: StageFormRequirementFacts["level"] = "required"): StageFormRequirementFacts => ({
    requirement_id: `r_${id}`,
    form_definition_id: id,
    level,
});

const idOf = (checks: ReturnType<typeof participantPaperworkReadiness>, id: string) => checks.find((c) => c.id === id)!;

describe("the real Enrolling stage, configured through the product", () => {
    const northwind = form({ form_definition_id: "nw", name: "Northwind Enrollment Application", renders_source_document: true, signature_field_ids: ["s1"], signature_placement_field_ids: ["s1"] });
    const health = form({ form_definition_id: "hm", name: "Health and Medical Authorization", renders_source_document: true, signature_field_ids: ["s1"], signature_placement_field_ids: ["s1"] });
    const immunization = form({
        form_definition_id: "im",
        name: "Immunization Record",
        renders_source_document: true,
        signature_field_ids: ["s1"],
        signature_placement_field_ids: ["s1"],
        uploads: [{ label: "Immunization or vaccination record", document_type: "immunization_record", required: true }],
    });

    it("reads READY TO USE for the configuration that actually works", () => {
        const checks = participantPaperworkReadiness({
            requirements: [req("nw"), req("hm"), req("im", "enforced")],
            forms: [northwind, health, immunization],
        });
        expect(checks.every((c) => c.pass)).toBe(true);
        expect(participantPaperworkHeadline(checks)).toBe("READY TO USE");
        expect(idOf(checks, "participant_work_exists").summary).toContain("3 forms");
    });

    it("catches a required form that was never published", () => {
        const checks = participantPaperworkReadiness({
            requirements: [req("nw"), req("hm")],
            forms: [northwind, form({ ...health, has_published_version: false })],
        });
        const row = idOf(checks, "required_forms_published");
        expect(row.pass).toBe(false);
        // Operator language: what a family would hit, and where to fix it.
        expect(row.summary).toContain("Health and Medical Authorization");
        expect(row.summary).toContain("still a draft");
        expect(row.summary).toContain("Publish it from Forms");
        expect(participantPaperworkHeadline(checks)).toBe("NEEDS SETUP — 1 ITEM");
    });

    it("catches a document request that never says which document", () => {
        const checks = participantPaperworkReadiness({
            requirements: [req("im", "enforced")],
            forms: [form({ ...immunization, uploads: [{ label: "Immunization or vaccination record", document_type: null, required: true }] })],
        });
        const row = idOf(checks, "upload_requests_classified");
        expect(row.pass).toBe(false);
        expect(row.summary).toContain("Immunization Record — Immunization or vaccination record");
        expect(row.summary).toContain("what they still owe");
    });

    it("catches a signature with nowhere to land on the document", () => {
        const checks = participantPaperworkReadiness({
            requirements: [req("nw")],
            forms: [form({ ...northwind, signature_placement_field_ids: [] })],
        });
        const row = idOf(checks, "signature_can_be_placed");
        expect(row.pass).toBe(false);
        expect(row.summary).toContain("nowhere to appear");
    });

    it("catches a requirement pointing at deleted paperwork", () => {
        const checks = participantPaperworkReadiness({
            requirements: [req("nw"), req("gone")],
            forms: [northwind, form({ form_definition_id: "gone", exists: false, name: null, has_published_version: false })],
        });
        expect(idOf(checks, "required_forms_resolve").pass).toBe(false);
        expect(idOf(checks, "required_forms_resolve").summary).toContain("deleted");
    });

    it("says so when a stage asks a family for nothing", () => {
        const checks = participantPaperworkReadiness({ requirements: [], forms: [] });
        const row = idOf(checks, "participant_work_exists");
        expect(row.pass).toBe(false);
        expect(row.summary).toContain("nothing to do");
    });

    it("judges obligations, not suggestions", () => {
        // A recommended form is not something a family must complete, so an unpublished one is not
        // a launch failure — it would be, the moment someone made it required.
        const recommended = participantPaperworkReadiness({
            requirements: [req("hm", "recommended")],
            forms: [form({ ...health, has_published_version: false })],
        });
        expect(idOf(recommended, "required_forms_published").pass).toBe(true);
        const required = participantPaperworkReadiness({
            requirements: [req("hm", "required")],
            forms: [form({ ...health, has_published_version: false })],
        });
        expect(idOf(required, "required_forms_published").pass).toBe(false);
    });

    it("counts every distinct problem once", () => {
        const checks = participantPaperworkReadiness({
            requirements: [req("hm"), req("im", "enforced")],
            forms: [
                form({ ...health, has_published_version: false }),
                form({ ...immunization, uploads: [{ label: "Record", document_type: "", required: true }] }),
            ],
        });
        expect(participantPaperworkHeadline(checks)).toBe("NEEDS SETUP — 2 ITEMS");
    });
});

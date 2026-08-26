/**
 * Gates for the pass that decides what a family is ASKED.
 *
 * These pin the properties the live run got wrong: a source destination is not automatically a
 * participant question; one concept's destinations are facets, not repeats; and the reader's
 * structural widget is a fact about the page that no concept key may overrule.
 */
import { describe, it, expect } from "vitest";
import { applySemanticRefinement, facetOf } from "@/lib/pos/processingCase/formDraft/applySemanticRefinement";
import { classifySelfContainedArtifact } from "@/lib/pos/packet/selfContainedArtifact";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

function field(id: string, label: string, type = "text", extra: Record<string, unknown> = {}) {
    return { id, label, type, required: false, ...extra } as StoredFormDraftPreview["fields"][number];
}

function draftOf(fields: StoredFormDraftPreview["fields"]): StoredFormDraftPreview {
    return {
        source_document_id: "doc",
        title: "t",
        sections: [{ id: "s1", title: "Page 1", field_ids: fields.map((f) => f.id) }],
        fields,
    } as unknown as StoredFormDraftPreview;
}

function discoveryOf(concepts: { key: string; kind: string; labels: string[]; disposition: string; target?: { entity_type: string; field_key: string; shared_value_key?: string } }[]) {
    return {
        contract_version: "fp16.0",
        summary: [],
        warnings: [],
        concepts: concepts.map((c, i) => ({
            id: `c${i}`,
            concept_key: c.key,
            label: c.labels[0],
            kind: c.kind,
            source: { labels: c.labels, section_title: "Page 1" },
        })),
        proposals: concepts.map((c, i) => ({
            candidate_id: `c${i}`,
            disposition: c.disposition,
            target_field_source: c.target ?? null,
        })),
    } as never;
}

const NAME_CONCEPT = {
    key: "child.name",
    kind: "scalar_field",
    labels: ["Childs Last Name Apellido Delde La Menor Row1", "First Name Primer Nombre Row1", "Middle Name Segundo Nombre Row1"],
    disposition: "reuse_canonical_field",
    target: { entity_type: "customer_member", field_key: "first_name", shared_value_key: "child_first_name" },
};

describe("facetOf", () => {
    it("keeps the English prompt of a bilingual label", () => {
        expect(facetOf("Childs Last Name Apellido Delde La Menor Row1")).toBe("Childs Last Name");
        expect(facetOf("Phone Number NúMero De TeléFono Row1")).toBe("Phone Number");
        expect(facetOf("Birth Date Fecha De Nacimiento Row1 2")).toBe("Birth Date");
    });

    it("keeps a Spanish-only label whole rather than emptying it", () => {
        expect(facetOf("Fecha De Nacimiento")).toBe("Fecha De Nacimiento");
    });

    it("distinguishes the doses of one vaccine series", () => {
        expect(facetOf("Dose 1 Dosis 1 Hib")).toBe("Dose 1");
        expect(facetOf("Dose 5 Dosis 5 Hib")).toBe("Dose 5");
    });

    it("leaves an already-English prompt alone", () => {
        expect(facetOf("Emergency Contact #1 Phone Number:")).toBe("Emergency Contact #1 Phone Number:");
    });
});

describe("applySemanticRefinement", () => {
    it("never adds or removes a destination", () => {
        const fields = NAME_CONCEPT.labels.map((l, i) => field(`f${i}`, l));
        const draft = draftOf(fields);
        const { draft: out } = applySemanticRefinement({ draft, discovery: discoveryOf([NAME_CONCEPT]) });
        expect(out.fields.map((f) => f.id)).toEqual(["f0", "f1", "f2"]);
    });

    it("gives each facet of one concept its own identity", () => {
        const fields = NAME_CONCEPT.labels.map((l, i) => field(`f${i}`, l));
        const { draft: out } = applySemanticRefinement({ draft: draftOf(fields), discovery: discoveryOf([NAME_CONCEPT]) });
        const keys = out.fields.map((f) => f.field_source?.shared_value_key);
        expect(new Set(keys).size).toBe(3);
        expect(out.fields.map((f) => f.label)).toEqual(["Childs Last Name", "First Name", "Middle Name"]);
    });

    it("binds each facet to its OWN canonical field, never the neighbour's", () => {
        const fields = NAME_CONCEPT.labels.map((l, i) => field(`f${i}`, l));
        const { draft: out } = applySemanticRefinement({ draft: draftOf(fields), discovery: discoveryOf([NAME_CONCEPT]) });
        const [last, first, middle] = out.fields;
        expect(first!.field_source?.field_key).toBe("first_name");
        expect(first!.field_source?.shared_value_key).toBe("child_first_name");
        // The concept bound to first name; the registry already holds the right field for last name.
        expect(last!.field_source?.field_key).toBe("child_last_name");
        expect(last!.field_source?.shared_value_key).toBe("child_last_name");
        // The defect this prevents: a last name written into `first_name` via a shared concept.
        expect(last!.field_source?.field_key).not.toBe("first_name");
    });

    it("leaves a facet with no registered field unbound rather than inventing one", () => {
        const fields = NAME_CONCEPT.labels.map((l, i) => field(`f${i}`, l));
        const { draft: out } = applySemanticRefinement({ draft: draftOf(fields), discovery: discoveryOf([NAME_CONCEPT]) });
        // No `child_middle_name` is registered, so the box is asked and stored nowhere durable —
        // a proposed field here would be an ownership claim nobody approved.
        expect(out.fields[2]!.label).toBe("Middle Name");
        expect(out.fields[2]!.field_source).toBeUndefined();
    });

    it("shares one identity when every destination prints the same prompt", () => {
        const c = { key: "child.routine", kind: "scalar_field", labels: ["Toileting Routine"], disposition: "reuse_canonical_field", target: { entity_type: "customer_member", field_key: "toileting_routine" } };
        const fields = [field("f0", "Toileting Routine"), field("f1", "Toileting Routine")];
        const { draft: out } = applySemanticRefinement({ draft: draftOf(fields), discovery: discoveryOf([c]) });
        expect(out.fields[0]!.field_source?.shared_value_key).toBe(out.fields[1]!.field_source?.shared_value_key);
    });

    it("types a phone as text with a shape, never as a number", () => {
        const c = { key: "person.phone", kind: "scalar_field", labels: ["Phone Number NúMero De TeléFono Row1"], disposition: "reuse_canonical_field", target: { entity_type: "person", field_key: "phone" } };
        const { draft: out } = applySemanticRefinement({ draft: draftOf([field("f0", c.labels[0]!, "number")]), discovery: discoveryOf([c]) });
        expect(out.fields[0]!.type).toBe("text");
        expect(out.fields[0]!.validate?.pattern).toBeTruthy();
        expect(new RegExp(out.fields[0]!.validate!.pattern!).test("(503) 555-0134")).toBe(true);
        expect(new RegExp(out.fields[0]!.validate!.pattern!).test("not a phone")).toBe(false);
    });

    it("takes phone semantics from the facet when the concept is too coarse", () => {
        const c = { key: "relationship.emergency_contact", kind: "scalar_field", labels: ["Emergency Contact #1 Phone Number:"], disposition: "create_proposed_field" };
        const { draft: out } = applySemanticRefinement({ draft: draftOf([field("f0", c.labels[0]!)]), discovery: discoveryOf([c]) });
        expect(out.fields[0]!.validate?.pattern).toBeTruthy();
    });

    it("never retypes a structural widget the reader detected", () => {
        const c = { key: "child.var_history", kind: "boolean_status", labels: ["Var History"], disposition: "create_proposed_field" };
        const { draft: out } = applySemanticRefinement({ draft: draftOf([field("f0", "Var History", "boolean")]), discovery: discoveryOf([c]) });
        expect(out.fields[0]!.type).toBe("boolean");
    });

    it("places a held concept without asking it, keeping its label", () => {
        const c = { key: "child.hib", kind: "value_series", labels: ["Dose 1 Dosis 1 Hib"], disposition: "needs_review" };
        const { draft: out } = applySemanticRefinement({ draft: draftOf([field("f0", "Dose 1 Dosis 1 Hib")]), discovery: discoveryOf([c]) });
        expect(out.fields[0]!.read_only).toBe(true);
        expect(out.fields[0]!.label).toBe("Dose 1 Dosis 1 Hib");
    });

    it("does not report a concept belonging to another artifact of the same source", () => {
        const mine = { key: "person.phone", kind: "scalar_field", labels: ["Phone Number NúMero De TeléFono Row1"], disposition: "reuse_canonical_field", target: { entity_type: "person", field_key: "phone" } };
        const elsewhere = { key: "child.religious", kind: "choice_field", labels: ["Religious"], disposition: "needs_review" };
        const { report } = applySemanticRefinement({ draft: draftOf([field("f0", mine.labels[0]!)]), discovery: discoveryOf([mine, elsewhere]) });
        expect(report.unresolved).toEqual([]);
        expect(report.unclaimedDestinations).toBe(0);
    });

    it("reports the ask-once population it actually created", () => {
        const fields = NAME_CONCEPT.labels.map((l, i) => field(`f${i}`, l));
        fields.push(field("f3", "First Name Primer Nombre Row1"));
        const { report } = applySemanticRefinement({ draft: draftOf(fields), discovery: discoveryOf([NAME_CONCEPT]) });
        expect(report.sharedIdentitiesMultiDestination).toBe(1);
        expect(report.destinationsUnderSharedIdentity).toBe(2);
        expect(report.noisyAskedLabels).toEqual([]);
    });
});

describe("classifySelfContainedArtifact", () => {
    const c = (kind: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${kind}${i}`, kind, label: kind }));

    it("selects a page whose choices pick among obligations it carries", () => {
        expect(classifySelfContainedArtifact([...c("choice_field", 4), ...c("upload_requirement", 2), ...c("acknowledgement", 3)]).isSelfContained).toBe(true);
    });

    it("rejects a page of questions with no obligations", () => {
        expect(classifySelfContainedArtifact(c("choice_field", 3)).isSelfContained).toBe(false);
    });

    it("rejects an agreement whose single choice does not select among its obligations", () => {
        expect(classifySelfContainedArtifact([...c("choice_field", 1), ...c("acknowledgement", 11)]).isSelfContained).toBe(false);
    });
});

describe("the source's own numbering", () => {
    const ordinals = {
        key: "guardian.phone",
        kind: "scalar_field",
        labels: ["Parent/Guardian #1 Phone Number:", "Parent/Guardian #2 Phone Number:"],
        disposition: "reuse_canonical_field",
        target: { entity_type: "guardian", field_key: "guardian_phone", shared_value_key: "guardian_phone" },
    };

    it("gives the first numbered box the canonical field and the second its own identity", () => {
        const fields = ordinals.labels.map((l, i) => field(`f${i}`, l));
        const { draft: out } = applySemanticRefinement({ draft: draftOf(fields), discovery: discoveryOf([ordinals]) });
        expect(out.fields[0]!.field_source?.field_key).toBe("guardian_phone");
        // Two guardians are two people. The second must never write over the first.
        expect(out.fields[1]!.field_source?.shared_value_key).not.toBe("guardian_phone");
        expect(out.fields[1]!.field_source?.field_key).not.toBe("guardian_phone");
    });

    it("treats two boxes printed with the same prompt as one fact", () => {
        const c = { key: "child.routine", kind: "scalar_field", labels: ["Nap Routine"], disposition: "reuse_canonical_field", target: { entity_type: "customer_member", field_key: "nap_routine" } };
        const fields = [field("f0", "Nap Routine"), field("f1", "Nap Routine")];
        const { draft: out } = applySemanticRefinement({ draft: draftOf(fields), discovery: discoveryOf([c]) });
        expect(out.fields[0]!.field_source?.shared_value_key).toBe(out.fields[1]!.field_source?.shared_value_key);
        expect(out.fields[0]!.field_source?.shared_value_key).toBeTruthy();
    });

    it("keeps every ordinal of a family asked, never collapsed", () => {
        const c = { key: "relationship.emergency_contact", kind: "scalar_field", labels: ["Emergency Contact #1 Phone Number:", "Emergency Contact #2 Phone Number:", "Emergency Contact #3 Phone Number:"], disposition: "create_proposed_field" };
        const fields = c.labels.map((l, i) => field(`f${i}`, l));
        const { draft: out } = applySemanticRefinement({ draft: draftOf(fields), discovery: discoveryOf([c]) });
        const keys = out.fields.map((f) => f.field_source?.shared_value_key ?? f.id);
        expect(new Set(keys).size).toBe(3);
        expect(out.fields.every((f) => f.validate?.pattern)).toBe(true);
    });
});

describe("placement-only fields on the participant's side", () => {
    it("hides a read-only destination with nothing to show, and keeps one that carries a fact", async () => {
        const { isPlacementOnlyForParticipant } = await import("@/lib/forms/placementOnlyFields");
        const f = (id: string, read_only?: boolean) => ({ id, type: "text", label: id, ...(read_only ? { read_only } : {}) }) as never;
        expect(isPlacementOnlyForParticipant(f("a", true), {})).toBe(true);
        expect(isPlacementOnlyForParticipant(f("a", true), { a: "" })).toBe(true);
        expect(isPlacementOnlyForParticipant(f("a", true), { a: "2019-04-02" })).toBe(false);
        // An ordinary question is never hidden by this rule, empty or not.
        expect(isPlacementOnlyForParticipant(f("a"), {})).toBe(false);
    });

    it("never marks a placement-only destination required", () => {
        const c = { key: "child.hib", kind: "value_series", labels: ["Dose 1 Dosis 1 Hib"], disposition: "needs_review" };
        const fields = [{ id: "f0", label: "Dose 1 Dosis 1 Hib", type: "text", required: false }] as never;
        const { draft: out } = applySemanticRefinement({ draft: draftOf(fields), discovery: discoveryOf([c]) });
        expect(out.fields[0]!.read_only).toBe(true);
        expect(out.fields[0]!.required).toBe(false);
    });
});

describe("a required box owned elsewhere", () => {
    it("stops being asked, stops being mandatory, and is recorded", () => {
        // A vaccine dose series: the record is Health's, and the school's form still marks it required.
        const c = { key: "child.hib", kind: "value_series", labels: ["Dose 1 Dosis 1 Hib"], disposition: "needs_review" };
        const fields = [{ id: "f0", label: "Dose 1 Dosis 1 Hib", type: "text", required: true }] as never;
        const { draft: out, report } = applySemanticRefinement({ draft: draftOf(fields), discovery: discoveryOf([c]) });
        expect(out.fields[0]!.read_only).toBe(true);
        expect(out.fields[0]!.required).toBe(false);
        expect(report.relinquishedRequirements).toHaveLength(1);
        expect(report.relinquishedRequirements[0]!.label).toBe("Dose 1 Dosis 1 Hib");
        expect(report.relinquishedRequirements[0]!.basis).toBeTruthy();
    });

    it("does not relinquish a requirement on a question that is still asked", () => {
        const c = { key: "person.phone", kind: "scalar_field", labels: ["Phone Number NúMero De TeléFono Row1"], disposition: "reuse_canonical_field", target: { entity_type: "person", field_key: "phone" } };
        const fields = [{ id: "f0", label: "Phone Number NúMero De TeléFono Row1", type: "number", required: true }] as never;
        const { draft: out, report } = applySemanticRefinement({ draft: draftOf(fields), discovery: discoveryOf([c]) });
        expect(out.fields[0]!.required).toBe(true);
        expect(report.relinquishedRequirements).toEqual([]);
    });
});

describe("what a packet asks of a family besides questions", () => {
    const act = (key: string, kind: string, label: string, disposition: string, type = "text") => ({
        c: { key, kind, labels: [label], disposition },
        f: [{ id: "f0", label, type, required: true }] as never,
    });

    it("never hides a signature — the packet would render with nowhere to sign", () => {
        const { c, f } = act("signature.participant", "signature", "Signature1", "signature_requirement", "signature");
        const { draft: out, report } = applySemanticRefinement({ draft: draftOf(f), discovery: discoveryOf([c]) });
        expect(out.fields[0]!.read_only).toBe(false);
        expect(out.fields[0]!.type).toBe("signature");
        expect(out.fields[0]!.required).toBe(true);
        expect(report.relinquishedRequirements).toEqual([]);
    });

    it("keeps an acknowledgement and an upload in front of the participant", () => {
        const ack = act("requirement.acknowledgement.x", "acknowledgement", "I have received information regarding the benefits and risk of immunizations.", "acknowledgement", "boolean");
        const up = act("requirement.upload.y", "upload_requirement", "Immunization record", "upload_requirement", "file_ref");
        const a = applySemanticRefinement({ draft: draftOf(ack.f), discovery: discoveryOf([ack.c]) });
        const u = applySemanticRefinement({ draft: draftOf(up.f), discovery: discoveryOf([up.c]) });
        expect(a.draft.fields[0]!.read_only).toBe(false);
        expect(u.draft.fields[0]!.read_only).toBe(false);
        expect(u.draft.fields[0]!.type).toBe("file_ref");
    });

    it("leaves an act's wording exactly as the source wrote it", () => {
        const { c, f } = act("requirement.acknowledgement.z", "acknowledgement", "I certify that the information on the form is an accurate record of this child's immunizations.", "acknowledgement", "boolean");
        const { draft: out } = applySemanticRefinement({ draft: draftOf(f), discovery: discoveryOf([c]) });
        expect(out.fields[0]!.label).toBe("I certify that the information on the form is an accurate record of this child's immunizations.");
    });
});

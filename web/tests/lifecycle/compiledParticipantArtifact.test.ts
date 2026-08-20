/**
 * The compiled artifact — "here is your completed paperwork", not "here is a form".
 *
 * ## The abstraction gap, stated
 *
 * `FormEngineRenderer` takes `mode: "edit" | "readonly"`, and that mode is per-FORM. Every control
 * is editable or none is. So the only thing the runtime could hand a parent after the conversation
 * was the whole form as inputs — including the facts they had just settled, rendered as boxes to
 * fill in again.
 *
 * What was missing was never a document model. It was a CLASSIFICATION: for each control, what does
 * the runtime already know? These controls pin that classification and the invariant it exists for.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { compileParticipantArtifact } from "@/lib/enrollment/participantRuntime/compileParticipantArtifact";

const read = (rel: string) => readFileSync(resolve(__dirname, "../../", rel), "utf8");
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** The shape of the live QA artifact, including its unbound field and its display blocks. */
const SCHEMA = {
    version: 1,
    fields: [
        { id: "field_1", type: "text", label: "Child Full Name" },
        {
            id: "field_2",
            type: "date",
            label: "Child Dob",
            field_source: { entity_type: "child", field_key: "child_date_of_birth", shared_value_key: "child_date_of_birth" },
        },
        {
            id: "field_3",
            type: "text",
            label: "Allergies",
            field_source: { entity_type: "customer_member", field_key: "allergies" },
        },
        { id: "disp_text_1", type: "text_block", label: "Page 2", content: "Handbook Intro" },
        { id: "disp_ack_3", type: "boolean", label: "I acknowledge the above", required: true },
        { id: "disp_sig_5", type: "signature", label: "Parent Signature", required: true },
    ],
} as never;

const RESOLVED = { field_2: "2022-08-18", field_3: "No known allergies" };

describe("classification", () => {
    it("a settled shared fact is a resolved value, not an input", () => {
        const artifact = compileParticipantArtifact(SCHEMA, RESOLVED);
        expect(artifact.resolved.map((c) => c.field_id)).toEqual(["field_2", "field_3"]);
        // THE INVARIANT: nothing the conversation resolved may come back as unresolved work.
        expect(artifact.outstanding.map((c) => c.field_id)).not.toContain("field_2");
        expect(artifact.outstanding.map((c) => c.field_id)).not.toContain("field_3");
    });

    it("an unbound field is the artifact's own to collect", () => {
        const artifact = compileParticipantArtifact(SCHEMA, RESOLVED);
        // `field_1` carries no `field_source`, so nothing shared can claim to be its value.
        expect(artifact.outstanding.map((c) => c.field_id)).toEqual(["field_1"]);
    });

    it("signature and acknowledgment are recognised structurally, never by label", () => {
        const artifact = compileParticipantArtifact(SCHEMA, RESOLVED);
        expect(artifact.signatures.map((c) => c.field_id)).toEqual(["disp_sig_5"]);
        expect(artifact.acknowledgments.map((c) => c.field_id)).toEqual(["disp_ack_3"]);

        // A tenant writing "I agree" instead must classify identically — the rule is "required
        // boolean with no canonical binding", not a phrase.
        const reworded = compileParticipantArtifact(
            { ...(SCHEMA as { fields: unknown[] }), fields: [{ id: "ack", type: "boolean", label: "I agree", required: true }] } as never,
            {},
        );
        expect(reworded.acknowledgments.map((c) => c.field_id)).toEqual(["ack"]);
    });

    it("document prose stays prose and is never work", () => {
        const artifact = compileParticipantArtifact(SCHEMA, RESOLVED);
        const display = artifact.sections[0].controls.filter((c) => c.kind === "display_content");
        expect(display.map((c) => c.content)).toEqual(["Handbook Intro"]);
        expect(artifact.outstanding.map((c) => c.field_id)).not.toContain("disp_text_1");
    });

    it("a bound field with no value is still the participant's to answer", () => {
        const artifact = compileParticipantArtifact(SCHEMA, { field_2: "2022-08-18" });
        expect(artifact.outstanding.map((c) => c.field_id)).toContain("field_3");
    });

    it("carries the authored type, so an edit uses the same control the Form would", () => {
        const artifact = compileParticipantArtifact(SCHEMA, RESOLVED);
        expect(artifact.resolved.find((c) => c.field_id === "field_2")?.input_type).toBe("date");
    });
});

describe("it is a projection, not a second Forms authority", () => {
    it("derives everything and owns nothing", () => {
        const src = code("lib/enrollment/participantRuntime/compileParticipantArtifact.ts");
        // Same binding vocabulary as an information need, same "does this collect anything" as the
        // packet plan — a second derivation here would eventually disagree with the one that decided
        // what to ask, and the failure would be silent.
        expect(src).toContain("canonicalKeyFor");
        expect(src).toContain("formFieldCollectsValue");
        // No validation, submission, signing or persistence.
        for (const forbidden of ["supabase", "validate", "submit", "fetch("]) {
            expect(src, `the projection must not ${forbidden}`).not.toContain(forbidden);
        }
    });

    it("the review renderer shows facts as facts and yields inputs to Forms", () => {
        const view = code("app/forms/embed/[token]/CompiledArtifactReview.tsx");
        expect(view).toContain("data-compiled-artifact");
        expect(view).toContain("data-artifact-edit");
        // Artifact-specific controls are handed back to the Forms renderer rather than reimplemented.
        expect(view).toContain("renderInput(control)");
        // Acknowledgment and signature are deferred, not rendered inline with the review content.
        expect(view).toContain('control.kind === "acknowledgment" || control.kind === "signature"');
    });
});

describe("binding identity travels with the control", () => {
    it("every control sharing a canonical key IS the same fact — an edit must reach all of them", () => {
        const twoOccurrences = {
            fields: [
                {
                    id: "dob_page_1",
                    type: "date",
                    label: "Child Dob",
                    field_source: { entity_type: "child", field_key: "child_date_of_birth", shared_value_key: "child_date_of_birth" },
                },
                {
                    id: "dob_page_3",
                    type: "date",
                    label: "Date of Birth (repeat)",
                    field_source: { entity_type: "child", field_key: "child_date_of_birth", shared_value_key: "child_date_of_birth" },
                },
            ],
        } as never;
        const artifact = compileParticipantArtifact(twoOccurrences, { dob_page_1: "2022-08-18", dob_page_3: "2022-08-18" });
        const keys = artifact.resolved.map((c) => c.shared_key);
        expect(keys).toEqual(["child_date_of_birth", "child_date_of_birth"]);
        // The host fans an edit out over controls with an EQUAL shared_key. Two occurrences with
        // the same key is the whole mechanism — if this ever splits, an edit updates one box and
        // the same fact reads as two values on one page.
        expect(new Set(keys).size).toBe(1);
    });

    it("an unbound control has no shared identity and cannot claim one", () => {
        const artifact = compileParticipantArtifact(SCHEMA, RESOLVED);
        const unbound = artifact.sections[0].controls.find((c) => c.field_id === "field_1");
        expect(unbound?.shared_key).toBeNull();
    });
});

describe("negative controls — the raw Form cannot silently become the review", () => {
    const host = code("app/forms/embed/[token]/FormEmbedClient.tsx");
    /** The enrollment-review branch of the host's render chain, and everything after it. */
    const reviewStart = host.indexOf("enrollmentReview && compiled ?");
    const reviewEnd = host.indexOf(": familyMode && famStep ?");
    const reviewBranch = host.slice(reviewStart, reviewEnd);

    it("the review branch exists and takes precedence over every Form-rendering branch", () => {
        // -1 on either index means the chain was reordered or the branch was removed — both are the
        // regression this test exists to catch: an enrollment journey falling through to a Form.
        expect(reviewStart).toBeGreaterThan(-1);
        expect(reviewEnd).toBeGreaterThan(reviewStart);
        expect(reviewBranch).toContain("<CompiledArtifactReview");
    });

    it("inside the review, Forms renders only carved sub-schemas — never the whole artifact as inputs", () => {
        // Every FormEngineRenderer in the review branch must take a reviewControlSubSchema carve.
        const usages = reviewBranch.split("<FormEngineRenderer").slice(1);
        expect(usages.length).toBeGreaterThan(0);
        for (const usage of usages) {
            expect(usage).toContain("schema={reviewControlSubSchema(schema,");
        }
        // The raw whole-schema pass is the fallback this guards against.
        expect(reviewBranch).not.toContain("schema={schema}");
        // POSITIVE CONTROL: the whole-schema pass still exists for ordinary links — if this ever
        // fails the assertion above is checking a vocabulary that no longer exists.
        expect(host.slice(reviewEnd)).toContain("schema={schema}");
    });

    it("acknowledgment precedes signature structurally, and signing is last", () => {
        const ack = reviewBranch.indexOf('data-artifact-final-phase="acknowledgment"');
        const sig = reviewBranch.indexOf('data-artifact-final-phase="signature"');
        expect(ack).toBeGreaterThan(-1);
        expect(sig).toBeGreaterThan(ack);
    });

    it("an edit at review records the D-99 confirmation with the value, in one write", () => {
        const edit = code("lib/enrollment/participantRuntime/applyParticipantValueEdit.ts");
        // Without this, fingerprint invalidation re-opens the need and the runtime asks the parent
        // to confirm the value they just typed. Observed live before the patch existed.
        expect(edit).toContain("buildEnrollmentNeedConfirmationPatch");
        expect(edit).toContain("shallowMergeSharedValues");
    });
});

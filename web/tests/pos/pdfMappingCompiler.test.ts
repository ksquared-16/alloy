/**
 * Where a realized value prints — and the ways that must fail.
 *
 * The compiler makes no semantic decision: Processing already decided what each destination means.
 * It only joins the schema field to the authored box, using the native identity the reader recorded
 * as `pdf_field:<name>`. So the controls here are about integrity of that join, not about meaning.
 */
import { describe, it, expect } from "vitest";
import {
    compilePdfMappingForRealizedArtifact,
    artifactIsPdfBacked,
} from "@/lib/pos/packet/compilePdfMappingForRealizedArtifact";
import { parseFidelityPdfMapping } from "@/lib/forms/pdf/fidelityMappingContract";

const SHA = "a".repeat(64);
const DOC = "11111111-2222-4333-8444-555555555555";
const f = (over: Record<string, unknown>) => ({ id: "x", label: "L", type: "text", required: false, ...over }) as never;
const draftOf = (fields: unknown[]) => ({ source_document_id: DOC, title: "t", sections: [], fields }) as never;

const compile = (fields: unknown[], sha = SHA) =>
    compilePdfMappingForRealizedArtifact({ draft: draftOf(fields), sourceDocumentId: DOC, sourceSha256: sha });

describe("compiling a source mapping from certified evidence", () => {
    it("maps each destination to the authored box the reader recorded", () => {
        const r = compile([
            f({ id: "field_1", evidence: "pdf_field:Childs last name Apellido delde la menorRow1" }),
            f({ id: "field_2", evidence: "pdf_field:First name Primer nombreRow1" }),
        ]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.mapped).toBe(2);
        expect(r.value.mapping.acro_fields["First name Primer nombreRow1"]).toEqual({ field_id: "field_2" });
        // The result must satisfy the contract Runtime already enforces.
        expect(parseFidelityPdfMapping(r.value.mapping)).not.toBeNull();
    });

    it("preserves an authored signature rectangle rather than treating it as a value box", () => {
        const r = compile([
            f({ id: "field_1", evidence: "pdf_field:Name" }),
            f({ id: "sig_1", type: "signature", evidence: "pdf_field:Signature1", page: 1, bbox: [142, 100, 370, 130] }),
        ]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.signatures).toBe(1);
        // The reader numbers pages from 1; `pages[ov.page]` indexes from 0. Page one is index zero.
        expect(r.value.mapping.signature_placements[0]).toEqual({ field_id: "sig_1", page: 0, x: 142, y: 100, width: 228, height: 30 });
        // A signature is a mark, not a typed value.
        expect(r.value.mapping.acro_fields["Signature1"]).toBeUndefined();
    });

    it("classifies a hosted-form artifact as generated rather than inventing placements", () => {
        const r = compile([f({ id: "field_1", evidence: "hosted_form:q1:RESULT_TextField-7" })]);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe("not_pdf_backed");
        expect(artifactIsPdfBacked([f({ id: "a", evidence: "hosted_form:q1" })])).toBe(false);
    });
});

describe("positive controls — the join must fail when it is wrong", () => {
    it("refuses to pin bytes it cannot identify", () => {
        // Without a sha, render could not refuse drifted bytes, and the D-94 pin would be a fiction.
        const r = compile([f({ id: "field_1", evidence: "pdf_field:Name" })], "not-a-sha");
        expect(r.ok).toBe(false);
    });

    it("never lets two schema fields claim one box", () => {
        // Otherwise the rendered document would depend on field order.
        const r = compile([
            f({ id: "field_1", evidence: "pdf_field:Name" }),
            f({ id: "field_2", evidence: "pdf_field:Name" }),
        ]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(Object.keys(r.value.acro_fields ?? r.value.mapping.acro_fields)).toHaveLength(1);
        expect(r.value.mapping.acro_fields["Name"]!.field_id).toBe("field_1");
        expect(r.value.unmapped, "the losing claim is reported, not silently dropped").toContain("field_2");
    });

    it("reports a destination with no native identity instead of guessing one", () => {
        const r = compile([
            f({ id: "field_1", evidence: "pdf_field:Name" }),
            f({ id: "field_2", evidence: undefined }),
        ]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.unmapped).toContain("field_2");
        expect(r.value.mapped).toBe(1);
    });

    it("reports a signature with no rectangle instead of placing it at the origin", () => {
        const r = compile([
            f({ id: "field_1", evidence: "pdf_field:Name" }),
            f({ id: "sig_1", type: "signature", evidence: "pdf_field:Signature1" }),
        ]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.signatures).toBe(0);
        expect(r.value.unmapped).toContain("sig_1");
    });

    it("produces a mapping the existing parser accepts, or none at all", () => {
        const r = compile([f({ id: "field_1", evidence: "pdf_field:Name" })]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const parsed = parseFidelityPdfMapping(r.value.mapping);
        expect(parsed?.engine).toBe("fidelity_v1");
        expect(parsed?.source_sha256).toBe(SHA);
        expect(parsed?.template_key, "an uploaded original, not a controlled template").toBeUndefined();
    });
});

describe("page numbering crosses a base boundary", () => {
    it("converts the reader's one-indexed page to the contract's zero-indexed one", () => {
        // Left unconverted, a mark authored on page one lands on page two — and on the last page it
        // lands nowhere, because `pages[ov.page]` is simply undefined.
        const r = compile([
            f({ id: "a", evidence: "pdf_field:Name" }),
            f({ id: "s1", type: "signature", evidence: "pdf_field:Sig1", page: 1, bbox: [10, 20, 110, 50] }),
            f({ id: "s2", type: "signature", evidence: "pdf_field:Sig2", page: 2, bbox: [10, 20, 110, 50] }),
        ]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.mapping.signature_placements.map((p) => p.page)).toEqual([0, 1]);
    });

    it("refuses a page number the reader could not have produced", () => {
        const r = compile([
            f({ id: "a", evidence: "pdf_field:Name" }),
            f({ id: "s", type: "signature", evidence: "pdf_field:Sig", page: 0, bbox: [10, 20, 110, 50] }),
        ]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.signatures, "page 0 is not a page the reader emits").toBe(0);
        expect(r.value.unmapped).toContain("s");
    });
});

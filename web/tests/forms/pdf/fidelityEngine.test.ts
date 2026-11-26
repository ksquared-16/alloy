import { promises as fs } from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
    buildSignedArtifact,
    fillPdfWithFidelity,
    hasNoFillableFields,
    readTextFieldValues,
} from "@/lib/forms/pdf/generation/fidelityEngine";
import {
    ENROLLMENT_FIELD_NAMES,
    ENROLLMENT_SIGNATURE_RECT,
    buildEnrollmentAcroFormFixture,
} from "@/lib/forms/pdf/generation/enrollmentFixture";
import type { SignedArtifactInput } from "@/lib/forms/pdf/generation/types";

// Minimal valid 1x1 PNG standing in for a signature-pad capture (real UI supplies the drawn PNG).
const DRAWN_PNG = Uint8Array.from(
    Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
    )
);

const NOW = "2026-07-24T12:00:00.000Z";
/**
 * Openable evidence artifacts are OPT-IN via FIDELITY_EVIDENCE_DIR. The suite's assertions are the
 * certification; the PDFs exist for a human eyeball. The previous hardcoded absolute path was a
 * session-local scratch directory that broke the moment this suite ran in CI.
 */
const EVIDENCE_DIR = process.env.FIDELITY_EVIDENCE_DIR?.trim() || null;

async function extractText(bytes: Uint8Array): Promise<string> {
    const moduleName = "unpdf";
    const mod = (await import(moduleName)) as {
        getDocumentProxy: (data: Uint8Array) => Promise<unknown>;
        extractText: (pdf: unknown, opts?: { mergePages?: boolean }) => Promise<{ text?: string | string[] }>;
    };
    const proxy = await mod.getDocumentProxy(bytes);
    const out = await mod.extractText(proxy, { mergePages: true });
    return Array.isArray(out.text) ? out.text.join("\n") : out.text ?? "";
}

function baseInput(source: Uint8Array): SignedArtifactInput {
    return {
        sourcePdf: source,
        documentId: "doc-fixture-enrollment",
        fieldValues: {
            [ENROLLMENT_FIELD_NAMES.childName]: "Sofia Ramirez",
            [ENROLLMENT_FIELD_NAMES.childDob]: "2024-03-04",
            [ENROLLMENT_FIELD_NAMES.guardianName]: "Maria Ramirez",
            [ENROLLMENT_FIELD_NAMES.allergies]: "Peanuts",
        },
        signatures: [
            {
                ...ENROLLMENT_SIGNATURE_RECT,
                kind: "typed",
                typedName: "Maria Ramirez",
                signerRole: "guardian_primary",
            },
        ],
        evidence: {
            signerName: "Maria Ramirez",
            signerId: "person-maria",
            intentAcknowledged: true,
            acknowledgedAt: NOW,
            signerIpHash: "sha256:deadbeef",
        },
        now: NOW,
    };
}

describe("Phase 7 Slice 0 — fidelity generation + native signing", () => {
    let source: Uint8Array;

    beforeAll(async () => {
        source = await buildEnrollmentAcroFormFixture();
    });

    it("fills the original AcroForm with fidelity — values appear in the document text", async () => {
        const populated = await fillPdfWithFidelity({
            sourcePdf: source,
            fieldValues: baseInput(source).fieldValues,
            documentId: "doc-fixture-enrollment",
            now: NOW,
        });
        // Original still has fillable fields (populated is the unsigned, editable version).
        expect(await hasNoFillableFields(populated.bytes)).toBe(false);
        // Fidelity: the original fields now carry the collected values (read via the form API — an
        // unflattened AcroForm keeps values in field objects, not the page content stream).
        const values = await readTextFieldValues(populated.bytes);
        expect(values[ENROLLMENT_FIELD_NAMES.childName]).toBe("Sofia Ramirez");
        expect(values[ENROLLMENT_FIELD_NAMES.guardianName]).toBe("Maria Ramirez");
        expect(values[ENROLLMENT_FIELD_NAMES.allergies]).toBe("Peanuts");
        // Original layout preserved: the source labels remain in the page content.
        const text = await extractText(populated.bytes);
        expect(text).toContain("Firefly Early Learning");
        expect(text).toContain("Enrollment Application");
    });

    it("produces an immutable, flattened signed artifact with hashed version lineage", async () => {
        const result = await buildSignedArtifact(baseInput(source));

        const roles = result.versions.map((v) => v.role);
        expect(roles).toEqual(["source", "populated", "signed"]);

        // Three distinct versions (real lineage, not the same bytes relabeled).
        const shas = result.versions.map((v) => v.sha256);
        expect(new Set(shas).size).toBe(3);
        expect(result.lineage.source_sha256).toBe(shas[0]);
        expect(result.lineage.populated_sha256).toBe(shas[1]);
        expect(result.lineage.signed_sha256).toBe(shas[2]);

        // Immutable = flattened: the signed version has NO fillable fields.
        expect(result.lineage.signed_is_flattened).toBe(true);
        const signed = result.versions.find((v) => v.role === "signed")!;
        expect(await hasNoFillableFields(signed.bytes)).toBe(true);

        // The signed document carries the filled values and the typed signature.
        const text = await extractText(signed.bytes);
        expect(text).toContain("Sofia Ramirez");
        expect(text).toContain("Maria Ramirez"); // typed signature mark + guardian field
    });

    it("captures typed, drawn, and initials marks with aligned audit evidence", async () => {
        const input = baseInput(source);
        input.signatures = [
            { ...ENROLLMENT_SIGNATURE_RECT, kind: "typed", typedName: "Maria Ramirez", signerRole: "guardian_primary" },
            { page: 0, x: 210, y: 110, width: 160, height: 26, kind: "drawn", drawnPng: DRAWN_PNG, signerRole: "guardian_secondary" },
            { page: 0, x: 470, y: 150, width: 40, height: 22, kind: "initials", typedName: "MR", signerRole: "guardian_primary" },
        ];
        const result = await buildSignedArtifact(input);

        expect(result.audit).toHaveLength(3);
        const typed = result.audit.find((a) => a.signature_kind === "typed")!;
        const drawn = result.audit.find((a) => a.signature_kind === "drawn")!;
        const initials = result.audit.find((a) => a.signature_kind === "initials")!;

        expect(typed.typed_full_name).toBe("Maria Ramirez");
        expect(typed.has_drawn_asset).toBe(false);
        expect(drawn.typed_full_name).toBeNull();
        expect(drawn.has_drawn_asset).toBe(true);
        expect(initials.typed_full_name).toBe("MR");

        // Every audit row preserves signer identity, intent timestamp, hashed IP, and provenance.
        for (const row of result.audit) {
            expect(row.signer_id).toBe("person-maria");
            expect(row.signer_acknowledged_at).toBe(NOW);
            expect(row.signer_ip_hash).toBe("sha256:deadbeef");
            expect(row.metadata.document_id).toBe("doc-fixture-enrollment");
            expect(row.metadata.placement.page).toBe(0);
        }
        expect(await hasNoFillableFields(result.versions.find((v) => v.role === "signed")!.bytes)).toBe(true);
    });

    it("refuses to sign without acknowledged intent (ESIGN gate)", async () => {
        const input = baseInput(source);
        input.evidence = { ...input.evidence, intentAcknowledged: false };
        await expect(buildSignedArtifact(input)).rejects.toThrow(/acknowledged intent/i);
    });

    it("reports applied vs missed fields honestly (no silent fidelity claims)", async () => {
        const populated = await fillPdfWithFidelity({
            sourcePdf: source,
            fieldValues: {
                [ENROLLMENT_FIELD_NAMES.childName]: "Sofia Ramirez",
                nonexistent_field: "should be reported missed",
            },
            documentId: "doc-fixture-enrollment",
            now: NOW,
        });
        expect(populated.applied).toContain(ENROLLMENT_FIELD_NAMES.childName);
        expect(populated.missed).toContain("nonexistent_field");
    });

    it("supports the coordinate-overlay (generated-placement) path for non-AcroForm content", async () => {
        const populated = await fillPdfWithFidelity({
            sourcePdf: source,
            overlays: [{ page: 0, x: 54, y: 300, size: 11, text: "Generated: enrolled in Toddler 2, start Sept 3" }],
            documentId: "doc-fixture-enrollment",
            now: NOW,
        });
        const text = await extractText(populated.bytes);
        expect(text).toContain("Generated: enrolled in Toddler 2");
    });

    // Write openable evidence artifacts for visual/manual verification (opt-in).
    afterAll(async () => {
        if (!EVIDENCE_DIR) return;
        const result = await buildSignedArtifact(baseInput(source));
        await fs.mkdir(EVIDENCE_DIR, { recursive: true });
        for (const v of result.versions) {
            await fs.writeFile(path.join(EVIDENCE_DIR, `enrollment.${v.role}.pdf`), Buffer.from(v.bytes));
        }
        await fs.writeFile(
            path.join(EVIDENCE_DIR, "lineage.json"),
            JSON.stringify({ lineage: result.lineage, audit: result.audit, fill_report: result.fill_report }, null, 2)
        );
    });
});

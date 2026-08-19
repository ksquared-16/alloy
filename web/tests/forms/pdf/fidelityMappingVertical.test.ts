/**
 * Vertical A — the original-document artifact pipeline, proven deterministically.
 *
 * The chain under test is the product promise itself:
 *
 *   one confirmed semantic fact
 *     → session shared value (one key)
 *     → every BOUND schema field                     (`sharedValuesToFieldIds` — the owner)
 *     → every mapped document location               (`fidelityFieldValues` + the fidelity engine)
 *     → the rendered document shows it everywhere
 *   and changing the fact ONCE moves every occurrence.
 *
 * PDF locations are outputs, never value identity: the test's schema binds three distinct fields to
 * ONE `shared_value_key`, and the mapping routes each to its own AcroForm field. No step below ever
 * addresses a value by PDF coordinates or field name.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    ENROLLMENT_FIELD_NAMES,
    ENROLLMENT_SIGNATURE_RECT,
    buildEnrollmentAcroFormFixture,
} from "@/lib/forms/pdf/generation/enrollmentFixture";
import {
    fillPdfWithFidelity,
    hasNoFillableFields,
    buildSignedArtifact,
    readTextFieldValues,
} from "@/lib/forms/pdf/generation/fidelityEngine";
import {
    fidelityFieldValues,
    fidelitySignaturePlacements,
    parseFidelityPdfMapping,
    resolveFidelitySourceBytes,
    sha256Hex,
} from "@/lib/forms/pdf/fidelityMappingContract";
import { parseFormPdfMappingJson } from "@/lib/forms/pdf/pdfMappingContract";
import { sharedValuesToFieldIds } from "@/lib/forms/packets/sharedValuesToFieldIds";

const read = (rel: string) => readFileSync(resolve(__dirname, "../../../", rel), "utf8");
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const NOW = "2026-08-19T12:00:00.000Z";

/**
 * The certification Form: DOB is ONE fact bound three times — the document asks for it in the
 * application, the medical release, and the pickup authorization.
 */
const SCHEMA = {
    fields: [
        {
            id: "f_name",
            type: "text",
            label: "Child Full Name",
            field_source: { entity_type: "child", field_key: "child_full_name", shared_value_key: "child_full_name" },
        },
        {
            id: "f_dob",
            type: "date",
            label: "Child Dob",
            field_source: { entity_type: "child", field_key: "child_date_of_birth", shared_value_key: "child_date_of_birth" },
        },
        {
            id: "f_dob_medical",
            type: "date",
            label: "Child Dob (medical release)",
            field_source: { entity_type: "child", field_key: "child_date_of_birth", shared_value_key: "child_date_of_birth" },
        },
        {
            id: "f_dob_pickup",
            type: "date",
            label: "Child Dob (pickup authorization)",
            field_source: { entity_type: "child", field_key: "child_date_of_birth", shared_value_key: "child_date_of_birth" },
        },
        {
            id: "f_allergies",
            type: "text",
            label: "Allergies",
            field_source: { entity_type: "customer_member", field_key: "allergies" },
        },
        { id: "f_sig", type: "signature", label: "Parent Signature", required: true },
    ],
} as never;

async function fixtureMapping() {
    const bytes = await buildEnrollmentAcroFormFixture();
    return {
        engine: "fidelity_v1",
        template_key: "firefly_enrollment_fixture_v1",
        source_sha256: sha256Hex(bytes),
        acro_fields: {
            [ENROLLMENT_FIELD_NAMES.childName]: { field_id: "f_name" },
            [ENROLLMENT_FIELD_NAMES.childDob]: { field_id: "f_dob" },
            [ENROLLMENT_FIELD_NAMES.childDobMedical]: { field_id: "f_dob_medical" },
            [ENROLLMENT_FIELD_NAMES.childDobPickup]: { field_id: "f_dob_pickup" },
            [ENROLLMENT_FIELD_NAMES.allergies]: { field_id: "f_allergies" },
        },
        signature_placements: [{ field_id: "f_sig", ...ENROLLMENT_SIGNATURE_RECT }],
    };
}

/** One shared DOB + the other resolved facts → the document's field values, via the real owners. */
function documentValues(sharedDob: string): Record<string, unknown> {
    const shared = {
        child_full_name: "Test Process",
        child_date_of_birth: sharedDob,
        "customer_member:allergies": "Peanut butter",
    };
    return sharedValuesToFieldIds(SCHEMA, shared);
}

describe("the template builder is deterministic — the sha pin depends on it", () => {
    it("two builds a second apart are byte-identical", async () => {
        const first = sha256Hex(await buildEnrollmentAcroFormFixture());
        await new Promise((r) => setTimeout(r, 1100));
        const second = sha256Hex(await buildEnrollmentAcroFormFixture());
        expect(second).toBe(first);
    });
});

describe("the fidelity mapping contract", () => {
    it("parses, and refuses a mapping that names no source or two sources", async () => {
        const mapping = await fixtureMapping();
        expect(parseFidelityPdfMapping(mapping)).not.toBeNull();
        expect(parseFidelityPdfMapping({ ...mapping, template_key: undefined })).toBeNull();
        expect(
            parseFidelityPdfMapping({ ...mapping, source_document_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
        ).toBeNull();
    });

    it("coexists with the stub contract — neither parser misreads the other's shape", async () => {
        const fidelity = await fixtureMapping();
        expect(parseFormPdfMappingJson(fidelity)).toBeNull();
        const stub = { engine: "stub_v1", template_key: "t", slots: { a: { path: "values.x" } } };
        expect(parseFidelityPdfMapping(stub)).toBeNull();
        expect(parseFormPdfMappingJson(stub)).not.toBeNull();
    });

    it("refuses drifted source bytes — the sha pin is the version's document identity", async () => {
        const mapping = await fixtureMapping();
        const drifted = { ...mapping, source_sha256: "0".repeat(64) };
        // The template path never touches the database, so no client is needed to prove the refusal.
        const result = await resolveFidelitySourceBytes(null as never, "org", parseFidelityPdfMapping(drifted)!);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe("sha_mismatch");
    });
});

describe("THE ASK-ONCE PROOF — one confirmed fact fills every document location", () => {
    it("one shared DOB lands in all three places the document asks for it", async () => {
        const mapping = parseFidelityPdfMapping(await fixtureMapping())!;
        const source = await resolveFidelitySourceBytes(null as never, "org", mapping);
        expect(source.ok).toBe(true);
        if (!source.ok) return;

        const filled = await fillPdfWithFidelity({
            sourcePdf: source.bytes,
            fieldValues: fidelityFieldValues(mapping, documentValues("2025-08-19")),
            documentId: "template:firefly_enrollment_fixture_v1",
            now: NOW,
        });
        expect(filled.missed).toEqual([]);

        const rendered = await readTextFieldValues(filled.bytes);
        expect(rendered[ENROLLMENT_FIELD_NAMES.childDob]).toBe("2025-08-19");
        expect(rendered[ENROLLMENT_FIELD_NAMES.childDobMedical]).toBe("2025-08-19");
        expect(rendered[ENROLLMENT_FIELD_NAMES.childDobPickup]).toBe("2025-08-19");
        expect(rendered[ENROLLMENT_FIELD_NAMES.childName]).toBe("Test Process");
        expect(rendered[ENROLLMENT_FIELD_NAMES.allergies]).toBe("Peanut butter");
    });

    it("changing the fact ONCE moves every occurrence — no document-local value copies", async () => {
        const mapping = parseFidelityPdfMapping(await fixtureMapping())!;
        const source = await resolveFidelitySourceBytes(null as never, "org", mapping);
        if (!source.ok) throw new Error("source unavailable");

        // The correction is ONE write to ONE shared key; everything downstream is derivation.
        const corrected = await fillPdfWithFidelity({
            sourcePdf: source.bytes,
            fieldValues: fidelityFieldValues(mapping, documentValues("2025-08-20")),
            documentId: "template:firefly_enrollment_fixture_v1",
            now: NOW,
        });
        const rendered = await readTextFieldValues(corrected.bytes);
        expect(rendered[ENROLLMENT_FIELD_NAMES.childDob]).toBe("2025-08-20");
        expect(rendered[ENROLLMENT_FIELD_NAMES.childDobMedical]).toBe("2025-08-20");
        expect(rendered[ENROLLMENT_FIELD_NAMES.childDobPickup]).toBe("2025-08-20");
    });
});

describe("the signed completed copy", () => {
    it("fills, places the captured signature at the authored rect, flattens, and keeps lineage", async () => {
        const mapping = parseFidelityPdfMapping(await fixtureMapping())!;
        const source = await resolveFidelitySourceBytes(null as never, "org", mapping);
        if (!source.ok) throw new Error("source unavailable");

        const marks = fidelitySignaturePlacements(mapping, { f_sig: { typed_full_name: "Kelly QA Parent" } });
        expect(marks).toHaveLength(1);
        expect(marks[0]).toMatchObject({ kind: "typed", typedName: "Kelly QA Parent", page: 0 });

        const artifact = await buildSignedArtifact({
            sourcePdf: source.bytes,
            documentId: "template:firefly_enrollment_fixture_v1",
            fieldValues: fidelityFieldValues(mapping, documentValues("2025-08-19")),
            signatures: marks,
            evidence: { signerName: "Kelly QA Parent", intentAcknowledged: true, acknowledgedAt: NOW },
            now: NOW,
        });

        const signed = artifact.versions.find((v) => v.role === "signed")!;
        expect(artifact.lineage.signed_is_flattened).toBe(true);
        expect(await hasNoFillableFields(signed.bytes)).toBe(true);
        // Three distinct hashes: source, populated, signed are different documents.
        expect(new Set(artifact.versions.map((v) => v.sha256)).size).toBe(3);
    });

    it("never invents a mark — an uncaptured signature placement is skipped", async () => {
        const mapping = parseFidelityPdfMapping(await fixtureMapping())!;
        expect(fidelitySignaturePlacements(mapping, {})).toEqual([]);
        expect(fidelitySignaturePlacements(mapping, { f_sig: { typed_full_name: null } })).toEqual([]);
    });
});

describe("negative controls — the document surface cannot bypass the owners", () => {
    it("the participant document route selects nothing from the caller", () => {
        const route = code("app/api/public/forms/[token]/enrollment-document/route.ts");
        expect(route).toContain("resolveParticipantEnrollmentFromToken");
        expect(route).toContain("renderParticipantEnrollmentDocument");
        // No caller-supplied selector may reach the render: the only inputs are the token's own
        // resolution and the clock.
        expect(route).not.toContain("searchParams");
        expect(route).not.toContain("request.json");
    });

    it("the render derives values through the same owners as every participant surface", () => {
        const render = code("lib/enrollment/participantRuntime/renderParticipantEnrollmentDocument.ts");
        expect(render).toContain("participantPrefillValues");
        expect(render).toContain("sharedValuesToFieldIds");
        expect(render).toContain("resolveFidelitySourceBytes");
    });

    it("the host shows the original document as the primary artifact, with the semantic review as the edit surface", () => {
        const host = code("app/forms/embed/[token]/FormEmbedClient.tsx");
        const reviewBranch = host.slice(
            host.indexOf("enrollmentReview && compiled ?"),
            host.indexOf(": familyMode && famStep ?"),
        );
        expect(reviewBranch).toContain("<ParticipantDocumentCanvas");
        // The semantic review stays — it is the edit mechanism and the fallback, never deleted.
        expect(reviewBranch).toContain("<CompiledArtifactReview");
        // An edit regenerates the document.
        expect(host).toContain("setDocumentRev((r) => r + 1)");
    });
});

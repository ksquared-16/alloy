/**
 * The `fidelity_v1` contract for `form_definition_versions.pdf_mapping_json` — the seam between a
 * pinned Form version and its ORIGINAL document.
 *
 * ## What this is, doctrinally
 *
 * The source document/layout is the artifact-PRESENTATION authority. Forms remain the semantic and
 * validation authority; Participant Runtime remains the information-collection authority. This
 * contract therefore carries only presentation wiring:
 *
 *   - which document (a pinned identity: template or uploaded original, plus its sha256);
 *   - which AcroForm field shows which schema field's value (locations are OUTPUTS — the canonical
 *     datum is the schema field and its `field_source`, never a PDF field name);
 *   - where each authored signature control's mark lands on the page.
 *
 * ## Why it lives on the VERSION (D-94)
 *
 * A running participant session is pinned to `resolved_form_definition_version_id`. Because this
 * mapping is a column of that same immutable row, the session is transitively pinned to the
 * document reference AND its bytes (`source_sha256` refuses drifted bytes at render time).
 * Republishing the Form or replacing its source upload creates a NEW version and cannot alter an
 * in-flight session. No new doctrine was needed to establish the invariant — which is exactly why
 * this is a mapping contract and not a migration.
 *
 * ## Coexistence with the stub contract
 *
 * The same column also carries the older `{engine?, template_key?, slots}` stub contract
 * (`pdfMappingContract.ts`). The two are discriminated by `engine: "fidelity_v1"`;
 * `parseFidelityPdfMapping` returns null for anything else, and the stub parser is strict enough
 * to return null for this shape. Neither parser ever misreads the other's mapping.
 *
 * Pure except `resolveFidelitySourceBytes` (storage/DB read).
 */

import { createHash } from "crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { FieldValue, SignaturePlacement } from "@/lib/forms/pdf/generation/types";
import { buildEnrollmentAcroFormFixture } from "@/lib/forms/pdf/generation/enrollmentFixture";
import { downloadDocumentBytesSafe } from "@/lib/pos/processingCase/structure/documentBytes";

const signaturePlacementSchema = z
    .object({
        /** The authored signature control this mark satisfies — Forms' identity, not the PDF's. */
        field_id: z.string().min(1),
        page: z.number().int().min(0),
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
    })
    .strict();

export const fidelityPdfMappingSchema = z
    .object({
        engine: z.literal("fidelity_v1"),
        /** A CONTROLLED in-repo template, resolved deterministically by the registry below. */
        template_key: z.string().min(1).optional(),
        /** An uploaded original — a `documents` row in this org. */
        source_document_id: z.string().uuid().optional(),
        /** The pinned identity of the source BYTES. Render refuses anything else. */
        source_sha256: z.string().regex(/^[0-9a-f]{64}$/),
        /**
         * PDF AcroForm field name → the schema field whose value it shows.
         *
         * Many PDF fields may name the same schema field (the same fact printed in several places),
         * and several schema fields may share a `shared_value_key` — both are how one confirmed
         * value reaches every occurrence. The map points location → semantics, never the reverse.
         */
        acro_fields: z.record(z.string().min(1), z.object({ field_id: z.string().min(1) }).strict()),
        signature_placements: z.array(signaturePlacementSchema).default([]),
    })
    .strict()
    .refine((m) => Boolean(m.template_key) !== Boolean(m.source_document_id), {
        message: "Exactly one of template_key or source_document_id identifies the source document.",
    });

export type FidelityPdfMapping = z.infer<typeof fidelityPdfMappingSchema>;

export function parseFidelityPdfMapping(raw: unknown): FidelityPdfMapping | null {
    const parsed = fidelityPdfMappingSchema.safeParse(raw);
    if (!parsed.success) return null;
    if (!Object.keys(parsed.data.acro_fields).length) return null;
    return parsed.data;
}

/**
 * Controlled document templates — deterministic builders, keyed for certification.
 *
 * A template is bytes produced by code in this repository, so the certification vertical needs no
 * uploaded file and no storage fixture; the sha pin still applies, because determinism is asserted,
 * never assumed.
 */
const FIDELITY_TEMPLATE_BUILDERS: Readonly<Record<string, () => Promise<Uint8Array>>> = {
    firefly_enrollment_fixture_v1: buildEnrollmentAcroFormFixture,
};

export function sha256Hex(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

export type FidelitySourceResult =
    | { readonly ok: true; readonly bytes: Uint8Array; readonly sourceRef: string }
    | { readonly ok: false; readonly code: "unknown_template" | "document_unavailable" | "sha_mismatch"; readonly detail: string };

/**
 * Resolve the mapping's source document to bytes, verifying the sha pin.
 *
 * A mismatch is a REFUSAL, not a fallback: rendering different bytes than the version pinned would
 * show a parent a document their session never agreed to.
 */
export async function resolveFidelitySourceBytes(
    supabase: SupabaseClient,
    orgId: string,
    mapping: FidelityPdfMapping,
): Promise<FidelitySourceResult> {
    let bytes: Uint8Array | null = null;
    let sourceRef = "";

    if (mapping.template_key) {
        const build = FIDELITY_TEMPLATE_BUILDERS[mapping.template_key];
        if (!build) {
            return { ok: false, code: "unknown_template", detail: `No registered template: ${mapping.template_key}` };
        }
        bytes = await build();
        sourceRef = `template:${mapping.template_key}`;
    } else if (mapping.source_document_id) {
        const downloaded = await downloadDocumentBytesSafe(supabase, {
            orgId,
            documentId: mapping.source_document_id,
        });
        if (!downloaded) {
            return { ok: false, code: "document_unavailable", detail: "Source document could not be read." };
        }
        bytes = downloaded.bytes;
        sourceRef = `document:${mapping.source_document_id}`;
    }

    if (!bytes) return { ok: false, code: "document_unavailable", detail: "Mapping names no source." };

    const actual = sha256Hex(bytes);
    if (actual !== mapping.source_sha256) {
        return {
            ok: false,
            code: "sha_mismatch",
            detail: `Source bytes ${actual.slice(0, 12)}… do not match the pinned ${mapping.source_sha256.slice(0, 12)}…`,
        };
    }
    return { ok: true, bytes, sourceRef };
}

function usableFieldValue(value: unknown): value is FieldValue {
    if (typeof value === "boolean" || typeof value === "number") return true;
    return typeof value === "string" && value.trim().length > 0;
}

/**
 * Project resolved payload values onto the document's AcroForm fields.
 *
 * `values` is keyed by schema field id — the same merged view the participant surface holds
 * (canonical record beneath session shared values beneath the draft's artifact-specific answers).
 * Empty values are omitted rather than written: an unanswered field stays a blank on the document,
 * exactly as it would on paper.
 */
export function fidelityFieldValues(
    mapping: FidelityPdfMapping,
    values: Readonly<Record<string, unknown>>,
): Record<string, FieldValue> {
    const out: Record<string, FieldValue> = {};
    for (const [pdfField, target] of Object.entries(mapping.acro_fields)) {
        const value = values[target.field_id];
        if (usableFieldValue(value)) out[pdfField] = value;
    }
    return out;
}

/**
 * Join the version's authored placements to the signatures actually captured, producing the
 * engine's marks. A placement with no captured signature is skipped — the engine must never invent
 * a mark the participant did not make.
 */
export function fidelitySignaturePlacements(
    mapping: FidelityPdfMapping,
    signaturesByFieldId: Readonly<Record<string, { typed_full_name: string | null }>>,
): SignaturePlacement[] {
    const marks: SignaturePlacement[] = [];
    for (const placement of mapping.signature_placements) {
        const captured = signaturesByFieldId[placement.field_id];
        if (!captured?.typed_full_name) continue;
        marks.push({
            page: placement.page,
            x: placement.x,
            y: placement.y,
            width: placement.width,
            height: placement.height,
            kind: "typed",
            typedName: captured.typed_full_name,
            signerRole: placement.field_id,
        });
    }
    return marks;
}

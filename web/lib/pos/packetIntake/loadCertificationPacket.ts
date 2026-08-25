/**
 * Build the Real Enrollment Certification V1 packet from the corpus fixtures.
 *
 * Shared by the certification test and the reporting scripts so both measure the same thing. Reads
 * files; performs no network access. The Formsite source is a stored CAPTURE, exactly as the
 * pipeline would read it from a document row.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractPdfAcroFormFields } from "@/lib/pos/processingCase/structure/pdfAcroForm";
import { buildStructureFromAcroForm } from "@/lib/pos/processingCase/structure/acroFormStructure";
import { extractPdfPositional } from "@/lib/pos/processingCase/structure/pdfPositionalExtract";
import { detectLayoutStructure } from "@/lib/pos/processingCase/structure/detectLayoutStructure";
import { detectHostedFormStructure } from "@/lib/pos/processingCase/structure/hostedFormStructure";
import { discoverConfiguration } from "@/lib/pos/discovery/discoverConfiguration";
import type { PacketIntakeInput } from "./contracts";

export const CERTIFICATION_FIXTURES = {
    handbook: "school-of-enrichment-family-handbook.pdf",
    cis: "oregon-certificate-of-immunization-status.pdf",
    hostedForm: "school-of-enrichment-admissions-packet.capture.html",
} as const;

/** The hosted form's own address. Provenance for the capture — never fetched. */
export const HOSTED_FORM_SOURCE_URI = "https://fs23.formsite.com/Okk63x/bztthqe6gx/index";

const sha256 = (bytes: Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");

export async function loadCertificationPacket(fixtureDir: string): Promise<PacketIntakeInput[]> {
    const read = (name: string) => fs.readFileSync(path.join(fixtureDir, name));

    // ── the handbook: something to read ──
    const handbookBytes = read(CERTIFICATION_FIXTURES.handbook);
    const layout = await extractPdfPositional(new Uint8Array(handbookBytes));
    const handbookStructure = detectLayoutStructure(layout);

    // ── the state certificate: a fillable PDF that declares its own destinations ──
    const cisBytes = read(CERTIFICATION_FIXTURES.cis);
    const acroform = await extractPdfAcroFormFields(new Uint8Array(cisBytes));
    const cisStructure = buildStructureFromAcroForm(acroform);

    // ── the hosted form: a capture, read as a form ──
    const captureBytes = read(CERTIFICATION_FIXTURES.hostedForm);
    const hostedStructure = detectHostedFormStructure({
        html: captureBytes.toString("utf8"),
        sourceUri: HOSTED_FORM_SOURCE_URI,
    });

    return [
        {
            artifact: {
                document_id: "doc-handbook",
                title: "Family Handbook 2026–2027",
                source_name: CERTIFICATION_FIXTURES.handbook,
                source_uri: null,
                mime_type: "application/pdf",
                checksum_sha256: sha256(handbookBytes),
                reader: "layout",
                page_count: layout.pageCount,
                fill_intent: handbookStructure.fill_intent?.intent ?? "unknown",
                raw_control_count: 0,
            },
            structure: handbookStructure,
            discovery: discoverConfiguration({ structure: handbookStructure, sourceDocumentId: "doc-handbook" }),
        },
        {
            artifact: {
                document_id: "doc-cis",
                title: "Oregon Certificate of Immunization Status",
                source_name: CERTIFICATION_FIXTURES.cis,
                source_uri: null,
                mime_type: "application/pdf",
                checksum_sha256: sha256(cisBytes),
                reader: "acroform",
                page_count: acroform.page_count,
                fill_intent: "fillable",
                raw_control_count: acroform.fields.length,
            },
            structure: cisStructure,
            discovery: discoverConfiguration({ structure: cisStructure, sourceDocumentId: "doc-cis" }),
        },
        {
            artifact: {
                document_id: "doc-formsite",
                title: "School of Enrichment Admissions Packet",
                source_name: CERTIFICATION_FIXTURES.hostedForm,
                source_uri: HOSTED_FORM_SOURCE_URI,
                mime_type: "text/html",
                checksum_sha256: sha256(captureBytes),
                reader: "hosted_form",
                page_count: 1,
                fill_intent: "fillable",
                raw_control_count: hostedStructure.hosted_form?.raw_control_count ?? null,
            },
            structure: hostedStructure,
            discovery: discoverConfiguration({ structure: hostedStructure, sourceDocumentId: "doc-formsite" }),
        },
    ];
}

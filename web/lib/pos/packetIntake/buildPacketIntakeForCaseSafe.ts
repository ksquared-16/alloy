/**
 * Compose a packet from EVERY source attached to one Processing case.
 *
 * The single-document path reads the case's `primary` source and stops. A packet is the same case
 * with several sources — the row shape has always allowed it (`processing_case_sources`, `role`
 * primary | related), and nothing composed across them.
 *
 * So this reuses the existing owners rather than adding beside them: documents own the bytes, hash
 * and provenance; the case owns the sources; the draft preview and discovery are produced by the
 * same readers a single document uses. What is new is only the composition, and its output is stored
 * on the case exactly like the other previews.
 *
 * Best-effort, like every other draft path: NEVER throws, and a source that cannot be read is
 * reported as a warning rather than silently dropped — a packet that quietly analyses two of three
 * documents is worse than one that says so.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractPdfAcroFormFields } from "@/lib/pos/processingCase/structure/pdfAcroForm";
import { buildStructureFromAcroForm } from "@/lib/pos/processingCase/structure/acroFormStructure";
import { extractPdfPositional } from "@/lib/pos/processingCase/structure/pdfPositionalExtract";
import { detectLayoutStructure } from "@/lib/pos/processingCase/structure/detectLayoutStructure";
import { detectHostedFormStructure } from "@/lib/pos/processingCase/structure/hostedFormStructure";
import { detectDocumentStructure } from "@/lib/pos/processingCase/structure/detectDocumentStructure";
import { extractDocumentTextSafe } from "@/lib/pos/processingCase/structure/extractDocumentTextSafe";
import {
    decodeCaptureText,
    downloadDocumentBytesSafe,
    looksLikeHtmlBytes,
    looksLikePdfBytes,
} from "@/lib/pos/processingCase/structure/documentBytes";
import { discoverConfiguration } from "@/lib/pos/discovery/discoverConfiguration";
import type { DocumentStructureCandidate } from "@/lib/pos/processingCase/structure/types";
import { composePacket } from "./composePacket";
import type { PacketIntakeInput, PacketIntakeResult, PacketSourceArtifact, SourceReader } from "./contracts";
import { dbStorePacketIntake } from "./packetIntakeDb";

interface DocumentRow {
    id: string;
    title?: string | null;
    original_filename?: string | null;
    mime_type?: string | null;
    public_url?: string | null;
    checksum_sha256?: string | null;
    extraction_provider?: string | null;
    created_at?: string | null;
}

/** Read ONE source document with the reader its format deserves. */
async function readSource(
    supabase: SupabaseClient,
    orgId: string,
    doc: DocumentRow
): Promise<{ artifact: PacketSourceArtifact; structure: DocumentStructureCandidate } | { error: string }> {
    const downloaded = await downloadDocumentBytesSafe(supabase, { orgId, documentId: doc.id });
    const bytes = downloaded?.bytes ?? null;
    const mime = downloaded?.mimeType ?? doc.mime_type ?? null;
    const title = doc.title?.trim() || doc.original_filename?.trim() || "Untitled source";

    const base = {
        document_id: doc.id,
        title,
        source_name: doc.original_filename ?? null,
        source_uri: doc.public_url ?? null,
        mime_type: mime,
        checksum_sha256: doc.checksum_sha256 ?? null,
        captured_at: doc.created_at ?? null,
    };

    if (!bytes) return { error: `${title}: the document has no readable bytes` };

    // Hosted-form capture — the richest structural evidence any source gives.
    if (looksLikeHtmlBytes(bytes, mime)) {
        const html = decodeCaptureText(bytes);
        if (!html) return { error: `${title}: the capture could not be decoded as text` };
        const structure = detectHostedFormStructure({ html, sourceUri: doc.public_url ?? null });
        const count = structure.sections.reduce((n, s) => n + s.fields.length, 0);
        if (count === 0) return { error: `${title}: no form controls found in the capture` };
        return {
            artifact: { ...base, reader: "hosted_form" as SourceReader, page_count: 1, fill_intent: "fillable", raw_control_count: structure.hosted_form?.raw_control_count ?? count },
            structure,
        };
    }

    if (looksLikePdfBytes(bytes, mime)) {
        // A fillable PDF declares its own destinations.
        const acro = await extractPdfAcroFormFields(bytes.slice());
        if (acro.has_acroform && acro.fields.length > 0) {
            return {
                artifact: { ...base, reader: "acroform", page_count: acro.page_count, fill_intent: "fillable", raw_control_count: acro.fields.length },
                structure: buildStructureFromAcroForm(acro),
            };
        }
        const layout = await extractPdfPositional(bytes.slice());
        if (layout.ok && layout.pages.length > 0) {
            const structure = detectLayoutStructure(layout);
            return {
                artifact: {
                    ...base,
                    reader: "layout",
                    page_count: layout.pageCount,
                    fill_intent: structure.fill_intent?.intent ?? "unknown",
                    raw_control_count: structure.sections.reduce((n, s) => n + s.fields.length, 0),
                },
                structure,
            };
        }
    }

    // Anything else: whatever text the document already carries.
    const text = await extractDocumentTextSafe(supabase, { orgId, documentId: doc.id });
    const structure = detectDocumentStructure(text.text);
    const count = structure.sections.reduce((n, s) => n + s.fields.length, 0);
    return {
        artifact: { ...base, reader: "flat_text", page_count: null, fill_intent: "unknown", raw_control_count: count },
        structure,
    };
}

export interface PacketIntakeBuildResult {
    packet: PacketIntakeResult;
    /** Sources the packet could not read, named rather than dropped. */
    unreadable: string[];
}

export async function buildPacketIntakeForCaseSafe(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string }
): Promise<PacketIntakeBuildResult | null> {
    try {
        if (!args.orgId || !args.caseId) return null;

        const { data: sourceRows } = await supabase
            .from("processing_case_sources")
            .select("source_kind, source_id, role, linked_at")
            .eq("org_id", args.orgId)
            .eq("processing_case_id", args.caseId)
            .order("linked_at", { ascending: true });

        const documentIds = (sourceRows ?? [])
            .filter((r) => (r as { source_kind?: string }).source_kind === "document")
            .map((r) => (r as { source_id?: string }).source_id)
            .filter((id): id is string => !!id);
        if (documentIds.length === 0) return null;

        const { data: docs } = await supabase
            .from("documents")
            .select("id, title, original_filename, mime_type, public_url, checksum_sha256, extraction_provider, created_at")
            .eq("org_id", args.orgId)
            .in("id", documentIds);

        // Keep the case's own source order — it is the order the operator attached them in.
        const byId = new Map((docs ?? []).map((d) => [(d as DocumentRow).id, d as DocumentRow]));
        const ordered = documentIds.map((id) => byId.get(id)).filter((d): d is DocumentRow => !!d);

        const inputs: PacketIntakeInput[] = [];
        const unreadable: string[] = [];
        for (const doc of ordered) {
            const read = await readSource(supabase, args.orgId, doc);
            if ("error" in read) {
                unreadable.push(read.error);
                continue;
            }
            inputs.push({
                artifact: read.artifact,
                structure: read.structure,
                discovery: discoverConfiguration({ structure: read.structure, sourceDocumentId: read.artifact.document_id }),
            });
        }
        if (inputs.length === 0) return null;

        const packet = composePacket(inputs);
        if (unreadable.length > 0) packet.warnings.push(...unreadable.map((u) => `Source not analysed — ${u}`));

        await dbStorePacketIntake(supabase, { orgId: args.orgId, caseId: args.caseId, packet });
        return { packet, unreadable };
    } catch (e) {
        console.warn("[buildPacketIntakeForCaseSafe]", e instanceof Error ? e.message : e);
        return null;
    }
}

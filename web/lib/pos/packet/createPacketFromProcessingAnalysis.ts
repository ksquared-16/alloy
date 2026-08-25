/**
 * Turn an approved Processing packet analysis into the durable executable configuration.
 *
 * The boundary this respects: Processing understands documents and proposes; the Packet owns what
 * actually executes. So this reads Processing evidence and writes only canonical Packet/Form rows —
 * `form_definitions`, `form_definition_versions`, `form_packet_definitions`, `form_packet_items`.
 * Participant Runtime continues to read those and never the Processing metadata.
 *
 * The grain is the LOGICAL ARTIFACT, not the source document. On the real packet that is six
 * artifacts from three documents carrying signatures 2/1/0/1/1/1 — one Form per source would let a
 * single signature satisfy the Tuition Agreement, the Handbook Acknowledgement and the ACH
 * Authorization at once.
 *
 * No second Form builder: after `structureForArtifact` the existing chain runs unchanged.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPacketIntakeForCaseSafe } from "@/lib/pos/packetIntake/buildPacketIntakeForCaseSafe";
import { dbLoadPacketReview } from "@/lib/pos/packetIntake/packetIntakeDb";
import { structureForArtifact } from "@/lib/pos/processingCase/structure/structureForArtifact";
import { buildFormDraftFromStructure } from "@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { safeParseFormSchema } from "@/lib/forms/schema";
import { allocateUniqueKey, slugKeyFromDisplayName } from "@/lib/forms/adminGeneratedKeys";

/**
 * The durable identity of one artifact's realization.
 *
 * The existing form link is stored ONE PER CASE, which cannot express six artifacts. This keys on
 * the three things that actually identify an artifact realization — the case it came from, the
 * document whose bytes it is, and the artifact inside that document — so a re-run finds its own
 * previous work instead of making a seventh Form.
 */
export function artifactRealizationKey(caseId: string, documentId: string, artifactId: string): string {
    return `${caseId}::${documentId}::${artifactId}`;
}

export const PACKET_REALIZATION_METADATA_KEY = "packet_realization";

export interface RealizedArtifact {
    artifact_id: string;
    document_id: string;
    document_checksum_sha256: string | null;
    name: string;
    form_definition_id: string;
    form_version_id: string;
    packet_item_id: string;
    sequence_index: number;
    already_existed: boolean;
}

export interface PacketRealization {
    packet_definition_id: string;
    packet_already_existed: boolean;
    artifacts: RealizedArtifact[];
    warnings: string[];
}

export type CreatePacketResult =
    | { ok: true; realization: PacketRealization }
    | { ok: false; code: "no_packet" | "no_artifacts" | "invalid_schema" | "failed"; message: string };

export interface CreatePacketDeps {
    listFormKeys(orgId: string): Promise<Set<string>>;
    listPacketKeys(orgId: string): Promise<Set<string>>;
    insertFormDefinition(a: { orgId: string; key: string; name: string; metadata: Record<string, unknown> }): Promise<{ id: string }>;
    insertVersion(a: { orgId: string; formDefinitionId: string; versionNumber: number; schemaJson: unknown; metadata: Record<string, unknown> }): Promise<{ id: string }>;
    publishVersion(a: { orgId: string; versionId: string; userId: string }): Promise<void>;
    insertPacketDefinition(a: { orgId: string; key: string; name: string; metadata: Record<string, unknown> }): Promise<{ id: string }>;
    insertPacketItem(a: { orgId: string; packetDefinitionId: string; formDefinitionId: string; pinnedVersionId: string | null; sequenceIndex: number; metadata: Record<string, unknown> }): Promise<{ id: string }>;
    loadRealization(a: { orgId: string; caseId: string }): Promise<PacketRealization | null>;
    saveRealization(a: { orgId: string; caseId: string; realization: PacketRealization }): Promise<void>;
}

export async function createPacketFromProcessingAnalysis(
    supabase: SupabaseClient,
    deps: CreatePacketDeps,
    args: { orgId: string; caseId: string; userId: string; packetName?: string },
): Promise<CreatePacketResult> {
    try {
        // Idempotent at the whole-realization grain: a re-run of an unchanged case returns what it
        // built before rather than a second packet.
        const prior = await deps.loadRealization(args);
        if (prior) return { ok: true, realization: { ...prior, warnings: [...prior.warnings, "Already realized — returned the existing packet."] } };

        const built = await buildPacketIntakeForCaseSafe(supabase, args);
        if (!built) return { ok: false, code: "no_packet", message: "No packet analysis for this case." };
        const { packet, inputs } = built;
        if (!packet.artifacts.length) return { ok: false, code: "no_artifacts", message: "The packet analysis found no executable artifacts." };

        // Operator-authored artifact names, from the review the operator actually recorded. A name
        // is configuration for THIS packet — never a rule the importer learns.
        const review = await dbLoadPacketReview(supabase, args);
        const named = new Map<string, string>();
        for (const d of review) if (d.decision === "renamed" && d.subject === "artifact" && d.name) named.set(d.subject_id, d.name);

        const inputByDoc = new Map(inputs.map((i) => [i.artifact.document_id, i]));
        const formKeys = await deps.listFormKeys(args.orgId);
        const warnings: string[] = [];
        const realized: RealizedArtifact[] = [];

        // Artifact order IS the certified order. The packet's items must read as the family reads.
        for (const [index, artifact] of packet.artifacts.entries()) {
            const input = inputByDoc.get(artifact.document_id);
            if (!input) {
                warnings.push(`Artifact ${artifact.id} has no readable source — skipped.`);
                continue;
            }
            const projected = structureForArtifact(input.structure, artifact);
            if (projected.missing_sections.length) {
                warnings.push(`Artifact ${artifact.id}: ${projected.missing_sections.length} claimed section(s) missing from the source.`);
            }

            const name = named.get(artifact.id) ?? artifact.title;
            const draft = buildFormDraftFromStructure({
                structure: projected.structure,
                sourceDocumentId: artifact.document_id,
                extractedText: null,
                extractedTextAvailable: false,
                fileName: null,
                classificationKey: null,
            });
            const parsed = safeParseFormSchema(draftFormToFormSchemaV1({ ...draft, title: name, generated_form_name: name }));
            if (!parsed.success) return { ok: false, code: "invalid_schema", message: `Artifact ${artifact.id} did not validate as a form schema.` };

            const key = allocateUniqueKey(slugKeyFromDisplayName(name), formKeys);
            formKeys.add(key);
            const source = packet.sources.find((s) => s.document_id === artifact.document_id);
            const def = await deps.insertFormDefinition({
                orgId: args.orgId,
                key,
                name,
                metadata: {
                    source: "processing_packet_artifact",
                    realization_key: artifactRealizationKey(args.caseId, artifact.document_id, artifact.id),
                    source_case_id: args.caseId,
                    source_document_id: artifact.document_id,
                    source_checksum_sha256: source?.checksum_sha256 ?? null,
                    logical_artifact_id: artifact.id,
                    logical_artifact_unsigned: artifact.unsigned,
                    logical_artifact_sections: artifact.section_titles,
                },
            });
            const ver = await deps.insertVersion({
                orgId: args.orgId,
                formDefinitionId: def.id,
                versionNumber: 1,
                schemaJson: parsed.data,
                metadata: { source: "processing_packet_artifact", source_case_id: args.caseId, logical_artifact_id: artifact.id },
            });
            // Pinned items must point at a PUBLISHED version — a draft is not executable.
            await deps.publishVersion({ orgId: args.orgId, versionId: ver.id, userId: args.userId });

            realized.push({
                artifact_id: artifact.id,
                document_id: artifact.document_id,
                document_checksum_sha256: source?.checksum_sha256 ?? null,
                name,
                form_definition_id: def.id,
                form_version_id: ver.id,
                packet_item_id: "",
                sequence_index: index,
                already_existed: false,
            });
        }

        const packetName = args.packetName?.trim() || "School of Enrichment — Enrollment Packet";
        const packetKeys = await deps.listPacketKeys(args.orgId);
        const pkt = await deps.insertPacketDefinition({
            orgId: args.orgId,
            key: allocateUniqueKey(slugKeyFromDisplayName(packetName), packetKeys),
            name: packetName,
            metadata: {
                created_via: "pos_packet_from_analysis",
                source_case_id: args.caseId,
                source_documents: packet.sources.map((s) => ({ document_id: s.document_id, checksum_sha256: s.checksum_sha256 ?? null, title: s.title })),
                logical_artifact_ids: packet.artifacts.map((a) => a.id),
                destinations: packet.destinations.length,
                obligations: packet.obligations.length,
            },
        });

        for (const r of realized) {
            const item = await deps.insertPacketItem({
                orgId: args.orgId,
                packetDefinitionId: pkt.id,
                formDefinitionId: r.form_definition_id,
                // Pin the exact version this realization published: a packet that follows "latest"
                // would silently change what a family signs.
                pinnedVersionId: r.form_version_id,
                sequenceIndex: r.sequence_index,
                metadata: { step_label: r.name, logical_artifact_id: r.artifact_id, source_document_id: r.document_id },
            });
            r.packet_item_id = item.id;
        }

        const realization: PacketRealization = { packet_definition_id: pkt.id, packet_already_existed: false, artifacts: realized, warnings };
        await deps.saveRealization({ orgId: args.orgId, caseId: args.caseId, realization });
        return { ok: true, realization };
    } catch (e) {
        return { ok: false, code: "failed", message: e instanceof Error ? e.message : "Packet realization failed" };
    }
}

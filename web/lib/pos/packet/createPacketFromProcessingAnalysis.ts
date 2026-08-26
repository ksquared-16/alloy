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
import { applyDiscovery } from "@/lib/pos/discovery/applyDiscovery";
import { fromDecisionRecords } from "@/lib/pos/discovery/discoveryDecisionBridge";
import type { DiscoveryDecisionRecord } from "@/lib/pos/discovery/reconciliation";
import type { ConfigurationDiscoveryResult, ConfigurationProposal, ProposalDecisionState } from "@/lib/pos/discovery/contracts";
import { structureForArtifact } from "@/lib/pos/processingCase/structure/structureForArtifact";
import { buildFormDraftFromStructure } from "@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure";
import { applySemanticRefinement } from "@/lib/pos/processingCase/formDraft/applySemanticRefinement";
import { classifySelfContainedArtifact } from "./selfContainedArtifact";
import type { ArtifactConcept } from "./paymentSetupArtifact";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { safeParseFormSchema } from "@/lib/forms/schema";
import { allocateUniqueKey, slugKeyFromDisplayName } from "@/lib/forms/adminGeneratedKeys";
import { reconcileDocumentObligations, describeObligationReconciliation, type ObligationConcept } from "./obligationReconciliation";
import type { DeferredCapability } from "@/lib/pos/discovery/contracts";
import { deferredCapabilityFor, PAYMENT_SETUP_REQUIRED, DEFERRED_OWNER_LABEL } from "@/lib/pos/discovery/deferredCapabilities";
import { classifyPaymentSetupArtifact } from "./paymentSetupArtifact";

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

/**
 * A deferred obligation with its full lineage, as the packet records it.
 *
 * Concept-grain lineage rides on the proposal; this adds what only the packet knows — which source
 * document said it, that document's bytes, and which executable artifact expresses the same
 * obligation on paper. The relationship matters: an operator looking at the Direct Payment
 * Authorization needs to see that the deferred capability is about the very thing that artifact is.
 */
export interface RealizedDeferredCapability extends DeferredCapability {
    source_document_id: string;
    source_document_title: string | null;
    source_checksum_sha256: string | null;
    /** Artifacts that express the same obligation as legacy paperwork. */
    related_artifact_ids: string[];
    /**
     * Artifacts NOT realized as executable Forms because they collect only payment setup.
     *
     * The school's Direct Payment Authorization is one. Its boxes are a routing number and an
     * account number, and a Form is built from a source's destinations rather than from its
     * proposals — so realizing it would have asked a parent for a bank credential inside Alloy even
     * though every proposal correctly refused to store one.
     */
    deferred_artifact_ids: string[];
    certification: "REAL_ENROLLMENT_CERTIFICATION_V1";
}

export interface PacketRealization {
    packet_definition_id: string;
    packet_already_existed: boolean;
    artifacts: RealizedArtifact[];
    /**
     * Obligations recorded and NOT built, with the owner that will build them.
     *
     * Empty means nothing was deferred. It never means "nothing was found" — that is the whole
     * reason this is a first-class field on the realization instead of a warning string.
     */
    deferred_capabilities: RealizedDeferredCapability[];
    /** discovered = executable + deferred + dropped. `dropped` must be 0. */
    obligation_reconciliation: { discovered: number; executable: number; deferred: number; dropped: number; summary: string };
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
    /** The case's persisted discovery decisions — the operator's approvals, never reconstructed. */
    loadDiscoveryDecisions(a: { orgId: string; caseId: string }): Promise<DiscoveryDecisionRecord[]>;
    loadRealization(a: { orgId: string; caseId: string }): Promise<PacketRealization | null>;
    saveRealization(a: { orgId: string; caseId: string; realization: PacketRealization }): Promise<void>;
}

/** The source's own discovery result, rebuilt from the stored packet analysis. */
function discoveryFor(packet: { source_analysis: Record<string, { concepts: unknown[]; proposals: unknown[] }> }, documentId: string): ConfigurationDiscoveryResult | null {
    const a = packet.source_analysis?.[documentId];
    if (!a) return null;
    return { contract_version: "fp16.0", concepts: a.concepts, proposals: a.proposals, summary: [], warnings: [] } as unknown as ConfigurationDiscoveryResult;
}


/**
 * One artifact, from source structure to a validated FormSchemaV1.
 *
 * Extracted so that first realization and later re-projection are the SAME chain. Two copies of this
 * would drift, and the drift would only be visible as a difference between what a family was shown
 * and what the packet says it was shown.
 */
function projectArtifactSchema(input: {
    artifact: Parameters<typeof structureForArtifact>[1] & { document_id: string };
    structure: Parameters<typeof structureForArtifact>[0];
    packet: { source_analysis: Record<string, { concepts: unknown[]; proposals: unknown[] }> };
    decisionRecords: DiscoveryDecisionRecord[];
    name: string;
}): { ok: true; schema: unknown; relinquished: number; missingSections: number } | { ok: false; message: string } {
    const projected = structureForArtifact(input.structure, input.artifact);
    const draft0 = buildFormDraftFromStructure({
        structure: projected.structure,
        sourceDocumentId: input.artifact.document_id,
        extractedText: null,
        extractedTextAvailable: false,
        fileName: null,
        classificationKey: null,
    });
    const discovery = discoveryFor(input.packet, input.artifact.document_id);
    const decisions: Record<string, ProposalDecisionState> = discovery ? fromDecisionRecords(discovery, input.decisionRecords) : {};
    const { updatedDraft } = discovery ? applyDiscovery({ draft: draft0, discovery, decisions }) : { updatedDraft: draft0 };
    const refined = discovery
        ? applySemanticRefinement({
              draft: updatedDraft,
              discovery,
              selfContained: classifySelfContainedArtifact(
                  (discovery.concepts as unknown as ArtifactConcept[]).filter((cc) =>
                      input.artifact.section_titles.includes(cc.source?.section_title ?? ""),
                  ),
              ).isSelfContained,
          })
        : { draft: updatedDraft, report: null };

    const parsed = safeParseFormSchema(draftFormToFormSchemaV1({ ...refined.draft, title: input.name, generated_form_name: input.name }));
    if (!parsed.success) return { ok: false, message: `Artifact ${input.artifact.id} did not validate as a form schema.` };
    return {
        ok: true,
        schema: parsed.data,
        relinquished: refined.report?.relinquishedRequirements.length ?? 0,
        missingSections: projected.missing_sections.length,
    };
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
        const decisionRecords = await deps.loadDiscoveryDecisions(args);
        const formKeys = await deps.listFormKeys(args.orgId);
        const warnings: string[] = [];
        const realized: RealizedArtifact[] = [];

        // ── artifacts that collect only payment setup ────────────────────────────────────────────
        //
        // Decided BEFORE the loop, because the answer changes what the packet is rather than what
        // one Form contains. See `paymentSetupArtifact` for why an artifact whose proposals all
        // refuse to store a bank credential can still ASK for one.
        const paymentSetupArtifactIds = new Set(
            packet.artifacts
                .filter((a) =>
                    classifyPaymentSetupArtifact(
                        a,
                        (packet.source_analysis?.[a.document_id]?.concepts ?? []) as { id: string; kind: string; label: string; source?: { section_title?: string } }[],
                        (packet.source_analysis?.[a.document_id]?.proposals ?? []) as ConfigurationProposal[],
                    ).isPaymentSetup,
                )
                .map((a) => a.id),
        );

        // Artifact order IS the certified order. The packet's items must read as the family reads.
        // `sequence` counts REALIZED items, so a deferred artifact leaves no gap in what the family
        // is walked through.
        let sequence = 0;
        for (const artifact of packet.artifacts) {
            if (paymentSetupArtifactIds.has(artifact.id)) {
                warnings.push(`Artifact "${artifact.title}" collects only payment setup — held for ${DEFERRED_OWNER_LABEL} and not realized as a Form.`);
                continue;
            }
            const index = sequence;
            const input = inputByDoc.get(artifact.document_id);
            if (!input) {
                warnings.push(`Artifact ${artifact.id} has no readable source — skipped.`);
                continue;
            }
            const name = named.get(artifact.id) ?? artifact.title;
            const projectedSchema = projectArtifactSchema({ artifact, structure: input.structure, packet, decisionRecords, name });
            if (!projectedSchema.ok) return { ok: false, code: "invalid_schema", message: projectedSchema.message };
            if (projectedSchema.missingSections) {
                warnings.push(`Artifact ${artifact.id}: ${projectedSchema.missingSections} claimed section(s) missing from the source.`);
            }
            if (projectedSchema.relinquished) {
                warnings.push(
                    `Artifact "${name}": ${projectedSchema.relinquished} required box(es) are owned elsewhere — placed on the document, not asked of the family, and no longer mandatory.`,
                );
            }
            const parsed = { success: true as const, data: projectedSchema.schema };

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

            sequence += 1;
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

        // ── obligations held for an owner Alloy has not built ────────────────────────────────────
        //
        // Scanned across EVERY source, not only the ones that produced artifacts. That is not a
        // detail: the clause that raised this obligation lives in the family handbook, which is a
        // reference document with no executable artifact at all. A loop over artifacts would have
        // walked straight past it — and the obligation would have vanished with no reader ever
        // being in a position to notice.
        const deferredCapabilities: RealizedDeferredCapability[] = [];
        const obligationProposals: ConfigurationProposal[] = [];
        const obligationConcepts: ObligationConcept[] = [];

        // Artifacts expressing the same obligation as paperwork. Answered structurally — an artifact
        // whose own concepts the same classifiers recognise — never by matching a title.
        const relatedArtifactIds = packet.artifacts
            .filter((artifact) => {
                if (paymentSetupArtifactIds.has(artifact.id)) return true;
                const own = (packet.source_analysis?.[artifact.document_id]?.concepts ?? []) as { id: string; label: string; concept_key?: string; source?: { section_title?: string } }[];
                return own.some(
                    (c) =>
                        c.source?.section_title &&
                        artifact.section_titles.includes(c.source.section_title) &&
                        deferredCapabilityFor({ label: c.label, ...(c.concept_key ? { concept_key: c.concept_key } : {}), concept_id: c.id }) !== null,
                );
            })
            .map((artifact) => artifact.id);

        for (const [documentId, analysis] of Object.entries(packet.source_analysis ?? {})) {
            const proposals = (analysis?.proposals ?? []) as ConfigurationProposal[];
            const concepts = (analysis?.concepts ?? []) as { id: string; kind: string; label: string; concept_key?: string; source?: { section_title?: string } }[];
            for (const c of concepts) obligationConcepts.push({ id: c.id, kind: c.kind, label: c.label });
            obligationProposals.push(...proposals);
            const src = packet.sources.find((x) => x.document_id === documentId);
            for (const proposal of proposals) {
                if (!proposal.deferred_capability) continue;
                deferredCapabilities.push({
                    ...proposal.deferred_capability,
                    source_document_id: documentId,
                    source_document_title: src?.title ?? null,
                    source_checksum_sha256: src?.checksum_sha256 ?? null,
                    related_artifact_ids: relatedArtifactIds,
                    deferred_artifact_ids: [...paymentSetupArtifactIds],
                    certification: "REAL_ENROLLMENT_CERTIFICATION_V1",
                });
            }
        }

        // A packet could hold the paper authorization and no clause about it. The obligation is just
        // as real, so it gets its own record rather than living only in a skipped-artifact warning.
        if (!deferredCapabilities.length && paymentSetupArtifactIds.size) {
            const first = packet.artifacts.find((a) => paymentSetupArtifactIds.has(a.id))!;
            const src = packet.sources.find((x) => x.document_id === first.document_id);
            deferredCapabilities.push({
                obligation: PAYMENT_SETUP_REQUIRED,
                hold_state: "HELD_PENDING_FINANCIALS",
                intended_owner: "FINANCIAL_PAYMENT",
                owner_label: DEFERRED_OWNER_LABEL,
                reason: `"${first.title}" collects only payment setup. The family authorizes a payment method with the payment provider and Alloy keeps the authorization that comes back, so the account details on this paper form never become Alloy fields — and are never asked for here. Financials/Payments owns that experience and does not define it yet.`,
                clause: first.title,
                concept_id: first.id,
                source_document_id: first.document_id,
                source_document_title: src?.title ?? null,
                source_checksum_sha256: src?.checksum_sha256 ?? null,
                related_artifact_ids: relatedArtifactIds,
                deferred_artifact_ids: [...paymentSetupArtifactIds],
                certification: "REAL_ENROLLMENT_CERTIFICATION_V1",
            });
        }

        const reconciliation = reconcileDocumentObligations(obligationProposals, obligationConcepts);
        // Loud, not fatal: a dropped obligation is a defect in the reader, and the packet that
        // exposes it is more useful than a failure that hides which one was lost.
        for (const lost of reconciliation.dropped) {
            warnings.push(`Obligation "${lost.clause}" is neither executable nor deferred — it would be lost.`);
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
                // Read by Studio. Stored on the packet rather than only on the case because the
                // packet is what an operator opens, and "what is knowingly not here" is part of
                // what a packet is.
                deferred_capabilities: deferredCapabilities,
                obligation_reconciliation: {
                    discovered: reconciliation.discovered,
                    executable: reconciliation.executable.length,
                    deferred: reconciliation.deferred.length,
                    dropped: reconciliation.dropped.length,
                    summary: describeObligationReconciliation(reconciliation),
                },
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

        const realization: PacketRealization = {
            packet_definition_id: pkt.id,
            packet_already_existed: false,
            artifacts: realized,
            deferred_capabilities: deferredCapabilities,
            obligation_reconciliation: {
                discovered: reconciliation.discovered,
                executable: reconciliation.executable.length,
                deferred: reconciliation.deferred.length,
                dropped: reconciliation.dropped.length,
                summary: describeObligationReconciliation(reconciliation),
            },
            warnings,
        };
        await deps.saveRealization({ orgId: args.orgId, caseId: args.caseId, realization });
        return { ok: true, realization };
    } catch (e) {
        return { ok: false, code: "failed", message: e instanceof Error ? e.message : "Packet realization failed" };
    }
}

/**
 * Supabase-backed deps. Every writer here already existed — this only wires them together at
 * artifact grain, and stores the realization link on the case so a re-run finds its own work.
 */
export function makeCreatePacketDepsFromSupabase(supabase: SupabaseClient): ReprojectDeps {
    const caseMeta = async (orgId: string, caseId: string): Promise<Record<string, unknown>> => {
        const { data } = await supabase.from("processing_cases").select("metadata").eq("org_id", orgId).eq("id", caseId).maybeSingle();
        const m = (data as { metadata?: unknown } | null)?.metadata;
        return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
    };
    return {
        async listFormKeys(orgId) {
            const { data } = await supabase.from("form_definitions").select("key").eq("org_id", orgId);
            return new Set(((data ?? []) as Array<{ key: string | null }>).map((r) => r.key ?? "").filter(Boolean));
        },
        async listPacketKeys(orgId) {
            const { data } = await supabase.from("form_packet_definitions").select("key").eq("org_id", orgId);
            return new Set(((data ?? []) as Array<{ key: string | null }>).map((r) => r.key ?? "").filter(Boolean));
        },
        async insertFormDefinition({ orgId, key, name, metadata }) {
            const { data, error } = await supabase.from("form_definitions")
                .insert({ org_id: orgId, key, name, description: null, kind: "center", is_active: true, metadata })
                .select("id").single();
            if (error) throw new Error(error.message);
            return { id: (data as { id: string }).id };
        },
        async insertVersion({ orgId, formDefinitionId, versionNumber, schemaJson, metadata }) {
            const { data, error } = await supabase.from("form_definition_versions")
                .insert({ org_id: orgId, form_definition_id: formDefinitionId, version_number: versionNumber, status: "draft", schema_json: schemaJson, metadata })
                .select("id").single();
            if (error) throw new Error(error.message);
            return { id: (data as { id: string }).id };
        },
        async loadVersion({ orgId, versionId }) {
            const { data } = await supabase.from("form_definition_versions")
                .select("id, version_number, schema_json, form_definition_id")
                .eq("org_id", orgId).eq("id", versionId).maybeSingle();
            return (data as { id: string; version_number: number; schema_json: unknown; form_definition_id: string } | null) ?? null;
        },
        async nextVersionNumber({ orgId, formDefinitionId }) {
            const { data } = await supabase.from("form_definition_versions")
                .select("version_number").eq("org_id", orgId).eq("form_definition_id", formDefinitionId)
                .order("version_number", { ascending: false }).limit(1);
            const top = ((data ?? []) as { version_number: number }[])[0]?.version_number ?? 0;
            return top + 1;
        },
        async repinPacketItem({ orgId, packetItemId, pinnedVersionId }) {
            const { error } = await supabase.from("form_packet_items")
                .update({ pinned_form_definition_version_id: pinnedVersionId })
                .eq("org_id", orgId).eq("id", packetItemId);
            if (error) throw new Error(error.message);
        },
        async publishVersion({ orgId, versionId, userId }) {
            const { error } = await supabase.from("form_definition_versions")
                .update({ status: "published", published_at: new Date().toISOString(), published_by_user_id: userId })
                .eq("org_id", orgId).eq("id", versionId).eq("status", "draft");
            if (error) throw new Error(error.message);
        },
        async insertPacketDefinition({ orgId, key, name, metadata }) {
            const { data, error } = await supabase.from("form_packet_definitions")
                .insert({ org_id: orgId, key, name, description: null, is_active: true, metadata })
                .select("id").single();
            if (error) throw new Error(error.message);
            return { id: (data as { id: string }).id };
        },
        async insertPacketItem({ orgId, packetDefinitionId, formDefinitionId, pinnedVersionId, sequenceIndex, metadata }) {
            const { data, error } = await supabase.from("form_packet_items")
                .insert({ org_id: orgId, packet_definition_id: packetDefinitionId, sequence_index: sequenceIndex, form_definition_id: formDefinitionId, pinned_form_definition_version_id: pinnedVersionId, metadata })
                .select("id").single();
            if (error) throw new Error(error.message);
            return { id: (data as { id: string }).id };
        },
        async loadDiscoveryDecisions({ orgId, caseId }) {
            const raw = (await caseMeta(orgId, caseId))["configuration_discovery_decisions"];
            const list = raw && typeof raw === "object" ? (raw as { decisions?: unknown }).decisions : null;
            return Array.isArray(list) ? (list as DiscoveryDecisionRecord[]) : [];
        },
        async loadRealization({ orgId, caseId }) {
            const raw = (await caseMeta(orgId, caseId))[PACKET_REALIZATION_METADATA_KEY];
            return raw && typeof raw === "object" ? (raw as PacketRealization) : null;
        },
        async saveRealization({ orgId, caseId, realization }) {
            const base = await caseMeta(orgId, caseId);
            const { error } = await supabase.from("processing_cases")
                .update({ metadata: { ...base, [PACKET_REALIZATION_METADATA_KEY]: realization } })
                .eq("org_id", orgId).eq("id", caseId);
            if (error) throw new Error(error.message);
        },
    };
}

/**
 * Publish CORRECTED versions of an already-realized packet.
 *
 * Realization is idempotent at the whole-packet grain, which is right: re-running it must not build
 * a second packet. But when the projection itself is corrected — as it was when a source destination
 * stopped being automatically a participant question — the five Forms already published are wrong
 * and cannot be edited. A published version is immutable, and the certification session that resolved
 * it must keep resolving exactly what the family was shown.
 *
 * So this adds a version rather than changing one: for each realized artifact it re-projects through
 * the SAME chain, and only where the schema actually differs does it write the next version number,
 * publish it, and re-pin the packet item. Where nothing changed, nothing is published — an empty
 * version is noise in a certification record.
 *
 * Everything else stays untouched: form definitions, keys, packet identity, sequence, and every
 * version that already exists.
 */
export interface ReprojectDeps extends CreatePacketDeps {
    loadVersion(a: { orgId: string; versionId: string }): Promise<{ id: string; version_number: number; schema_json: unknown; form_definition_id: string } | null>;
    nextVersionNumber(a: { orgId: string; formDefinitionId: string }): Promise<number>;
    repinPacketItem(a: { orgId: string; packetItemId: string; pinnedVersionId: string }): Promise<void>;
}

export interface ReprojectedArtifact {
    artifact_id: string;
    name: string;
    form_definition_id: string;
    previous_version_id: string;
    previous_version_number: number;
    new_version_id: string | null;
    new_version_number: number | null;
    packet_item_id: string;
    changed: boolean;
    /** What the correction did to this artifact, in counts the reader can check. */
    delta: { destinations_before: number; destinations_after: number; asked_before: number; asked_after: number; relinquished_requirements: number };
}

export type ReprojectResult =
    | { ok: true; artifacts: ReprojectedArtifact[]; warnings: string[] }
    | { ok: false; code: "no_realization" | "no_packet" | "invalid_schema" | "failed"; message: string };

export async function reprojectRealizedPacket(
    supabase: SupabaseClient,
    deps: ReprojectDeps,
    args: { orgId: string; caseId: string; userId: string; dryRun?: boolean },
): Promise<ReprojectResult> {
    try {
        const prior = await deps.loadRealization(args);
        if (!prior) return { ok: false, code: "no_realization", message: "This case has no realized packet to re-project." };

        const built = await buildPacketIntakeForCaseSafe(supabase, args);
        if (!built) return { ok: false, code: "no_packet", message: "No packet analysis for this case." };
        const { packet, inputs } = built;
        const inputByDoc = new Map(inputs.map((i) => [i.artifact.document_id, i]));
        const decisionRecords = await deps.loadDiscoveryDecisions(args);

        const out: ReprojectedArtifact[] = [];
        const warnings: string[] = [];

        for (const realized of prior.artifacts) {
            const artifact = packet.artifacts.find((a) => a.id === realized.artifact_id);
            const input = artifact ? inputByDoc.get(artifact.document_id) : undefined;
            if (!artifact || !input) {
                warnings.push(`Realized artifact ${realized.artifact_id} is no longer in the packet analysis — left exactly as published.`);
                continue;
            }
            const current = await deps.loadVersion({ orgId: args.orgId, versionId: realized.form_version_id });
            if (!current) {
                warnings.push(`Artifact "${realized.name}" points at a version that no longer exists — left alone.`);
                continue;
            }

            const projectedSchema = projectArtifactSchema({
                artifact,
                structure: input.structure,
                packet,
                decisionRecords,
                name: realized.name,
            });
            if (!projectedSchema.ok) return { ok: false, code: "invalid_schema", message: projectedSchema.message };

            const before = fieldCounts(current.schema_json);
            const after = fieldCounts(projectedSchema.schema);
            const changed = JSON.stringify(current.schema_json) !== JSON.stringify(projectedSchema.schema);

            const entry: ReprojectedArtifact = {
                artifact_id: realized.artifact_id,
                name: realized.name,
                form_definition_id: realized.form_definition_id,
                previous_version_id: current.id,
                previous_version_number: current.version_number,
                new_version_id: null,
                new_version_number: null,
                packet_item_id: realized.packet_item_id,
                changed,
                delta: {
                    destinations_before: before.total,
                    destinations_after: after.total,
                    asked_before: before.asked,
                    asked_after: after.asked,
                    relinquished_requirements: projectedSchema.relinquished,
                },
            };

            // Placement is the artifact's identity. A re-projection that changes how many boxes the
            // document has is not a correction, it is a different document — refuse it.
            if (before.total !== after.total) {
                return {
                    ok: false,
                    code: "invalid_schema",
                    message: `Artifact "${realized.name}" would change from ${before.total} to ${after.total} destinations. A correction may change what is ASKED, never what the document contains.`,
                };
            }

            if (changed && !args.dryRun) {
                const versionNumber = await deps.nextVersionNumber({ orgId: args.orgId, formDefinitionId: realized.form_definition_id });
                const ver = await deps.insertVersion({
                    orgId: args.orgId,
                    formDefinitionId: realized.form_definition_id,
                    versionNumber,
                    schemaJson: projectedSchema.schema,
                    metadata: {
                        source: "processing_packet_artifact",
                        source_case_id: args.caseId,
                        logical_artifact_id: artifact.id,
                        supersedes_version_id: current.id,
                        correction: "participant_question_eligibility",
                    },
                });
                await deps.publishVersion({ orgId: args.orgId, versionId: ver.id, userId: args.userId });
                await deps.repinPacketItem({ orgId: args.orgId, packetItemId: realized.packet_item_id, pinnedVersionId: ver.id });
                entry.new_version_id = ver.id;
                entry.new_version_number = versionNumber;
            }
            out.push(entry);
        }

        if (!args.dryRun) {
            const updated: PacketRealization = {
                ...prior,
                artifacts: prior.artifacts.map((a) => {
                    const r = out.find((x) => x.artifact_id === a.artifact_id);
                    return r?.new_version_id ? { ...a, form_version_id: r.new_version_id } : a;
                }),
                warnings: [
                    ...prior.warnings,
                    `Re-projected ${out.filter((a) => a.changed).length} of ${out.length} artifact(s) onto new published versions; superseded versions remain intact.`,
                ],
            };
            await deps.saveRealization({ orgId: args.orgId, caseId: args.caseId, realization: updated });
        }

        return { ok: true, artifacts: out, warnings };
    } catch (e) {
        return { ok: false, code: "failed", message: e instanceof Error ? e.message : "Re-projection failed." };
    }
}

function fieldCounts(schema: unknown): { total: number; asked: number } {
    const fields = ((schema as { fields?: { read_only?: boolean }[] })?.fields ?? []);
    return { total: fields.length, asked: fields.filter((f) => !f.read_only).length };
}

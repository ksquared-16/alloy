/**
 * Collect what Configuration Health needs to answer "can a family complete this?".
 *
 * Every value here is READ from the owner that already holds it — the requirement section for what
 * a stage obliges, Forms for publication and schema, the fidelity mapping for whether a signing
 * mark has somewhere to land. Nothing is recomputed and nothing is judged; the judging lives in
 * `participantPaperworkReadiness`, which stays pure so its failure modes can be proven without a
 * database.
 *
 * Scoped to the ACTIVE process, because that is the process the Health surface is describing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { activeLifecycleProcess, lifecycleBuilderFromDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { parseFidelityPdfMapping } from "@/lib/forms/pdf/fidelityMappingContract";
import type {
    ReferencedFormFacts,
    StageFormRequirementFacts,
} from "@/lib/lifecycle/participantPaperworkReadiness";

type Gathered = {
    readonly requirements: StageFormRequirementFacts[];
    readonly forms: ReferencedFormFacts[];
    /** True when the active process states no form obligations at all. */
    readonly noProcess: boolean;
};

export async function gatherParticipantPaperworkFacts(
    supabase: SupabaseClient,
    orgId: string,
    departmentMetadata: unknown,
): Promise<Gathered> {
    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    if (!process) return { requirements: [], forms: [], noProcess: true };

    // Form obligations across every stage of the active process: a family meets them all in turn,
    // and one unpublished form breaks the journey wherever it sits.
    const requirements: StageFormRequirementFacts[] = [];
    const packetRequirements: { requirement_id: string; packet_definition_id: string; level: StageFormRequirementFacts["level"] }[] = [];
    for (const stage of process.stages ?? []) {
        for (const requirement of stage.requirements_v1?.requirements ?? []) {
            if (requirement.ref.kind === "form") {
                requirements.push({
                    requirement_id: requirement.requirement_id,
                    form_definition_id: requirement.ref.form_definition_id,
                    level: requirement.level,
                });
                continue;
            }
            if (requirement.ref.kind === "packet") {
                packetRequirements.push({
                    requirement_id: requirement.requirement_id,
                    packet_definition_id: requirement.ref.packet_definition_id,
                    level: requirement.level,
                });
            }
        }
    }

    /*
     * A PACKET REQUIREMENT IS TRAVERSED, NOT TAKEN ON TRUST.
     *
     * "The packet exists" is not an answer to "can this family complete it?". Expanding the packet
     * into the Form steps it actually contains means every check below — the form resolves, it has a
     * published version, its uploads name the document they want, its signatures have somewhere to
     * land — runs over the packet's contents unchanged. No second validation engine, and a packet
     * whose third step lost its published version fails for the same reason a bare Form requirement
     * would.
     *
     * A packet with no steps yields nothing here, and `participantPaperworkReadiness` then reports
     * the stage as having no paperwork a family can complete — which is the truthful answer.
     */
    if (packetRequirements.length > 0) {
        const packetIds = [...new Set(packetRequirements.map((p) => p.packet_definition_id))];
        const { data: items } = await supabase
            .from("form_packet_items")
            .select("packet_definition_id, sequence_index, form_definition_id")
            .eq("org_id", orgId)
            .in("packet_definition_id", packetIds)
            .order("sequence_index", { ascending: true });
        const stepsByPacket = new Map<string, { sequence_index: number; form_definition_id: string }[]>();
        for (const row of (items ?? []) as { packet_definition_id: string; sequence_index: number; form_definition_id: string }[]) {
            const list = stepsByPacket.get(row.packet_definition_id) ?? [];
            list.push({ sequence_index: row.sequence_index, form_definition_id: row.form_definition_id });
            stepsByPacket.set(row.packet_definition_id, list);
        }
        for (const packet of packetRequirements) {
            for (const step of stepsByPacket.get(packet.packet_definition_id) ?? []) {
                requirements.push({
                    // Keyed by packet requirement AND step, so two packets requiring the same Form
                    // stay distinguishable in the readiness report.
                    requirement_id: `${packet.requirement_id}:${step.sequence_index}`,
                    form_definition_id: step.form_definition_id,
                    level: packet.level,
                });
            }
        }
    }
    if (requirements.length === 0) return { requirements, forms: [], noProcess: false };

    const ids = [...new Set(requirements.map((r) => r.form_definition_id))];
    const { data: defs } = await supabase
        .from("form_definitions")
        .select("id, name")
        .eq("org_id", orgId)
        .in("id", ids);
    const nameById = new Map((defs ?? []).map((d) => [d.id as string, (d.name as string) ?? null]));

    // The PUBLISHED version is the only one a family can be handed, so it is the only one read.
    const { data: versions } = await supabase
        .from("form_definition_versions")
        .select("form_definition_id, schema_json, pdf_mapping_json, status")
        .eq("org_id", orgId)
        .eq("status", "published")
        .in("form_definition_id", ids);

    const publishedByForm = new Map<string, { schema_json: unknown; pdf_mapping_json: unknown }>();
    for (const v of versions ?? []) {
        publishedByForm.set(v.form_definition_id as string, {
            schema_json: v.schema_json,
            pdf_mapping_json: v.pdf_mapping_json,
        });
    }

    const forms: ReferencedFormFacts[] = ids.map((id) => {
        const exists = nameById.has(id);
        const published = publishedByForm.get(id);
        if (!exists || !published) {
            return {
                form_definition_id: id,
                exists,
                name: nameById.get(id) ?? null,
                has_published_version: false,
                published_field_count: 0,
                uploads: [],
                signature_field_ids: [],
                signature_placement_field_ids: [],
                renders_source_document: false,
            };
        }
        const fields = (published.schema_json as { fields?: ReadonlyArray<Record<string, unknown>> })?.fields ?? [];
        const mapping = parseFidelityPdfMapping(published.pdf_mapping_json);
        return {
            form_definition_id: id,
            exists: true,
            name: nameById.get(id) ?? null,
            has_published_version: true,
            published_field_count: fields.length,
            uploads: fields
                .filter((f) => f.type === "file_ref")
                .map((f) => ({
                    label: String(f.label ?? "Document"),
                    document_type: typeof f.document_type === "string" ? f.document_type : null,
                    required: f.required === true,
                })),
            signature_field_ids: fields.filter((f) => f.type === "signature").map((f) => String(f.id)),
            signature_placement_field_ids: (mapping?.signature_placements ?? []).map((p) => p.field_id),
            renders_source_document: Boolean(mapping),
        };
    });

    return { requirements, forms, noProcess: false };
}

import "server-only";

/**
 * A packet requirement, as the forms it actually contains.
 *
 * A stage may require a PACKET rather than list its forms — Enrollment's Enrolling stage does
 * exactly that, with one `{kind: "packet"}` requirement. The needs projection can only ask questions
 * about FORMS, so a packet requirement has to be read as the forms inside it or the participant is
 * asked nothing at all.
 *
 * ── THE TRANSLATION IS NOT NEW, AND MUST NOT BE ──
 *
 * `compilePacketToStageRequirements` already turns packet steps into form requirements, and it is
 * what both the Studio compiler and the hand-launched packet path use. Reusing it is what makes a
 * packet chosen for a stage and the same packet launched by hand describe the SAME obligation with
 * the SAME requirement ids, rather than two obligations that merely look alike. A second translation
 * here would be a second answer to "which requirement is this form", and the two would drift.
 *
 * ── STATUS IS INHERITED, DELIBERATELY ──
 *
 * The expanded forms carry the packet requirement's own status. A packet the governing revision still
 * wants is a packet whose forms are still worth asking about; whether any individual form has been
 * satisfied is decided downstream from what the session actually realized, which is where that
 * verdict has always lived. Inventing a per-form status here would be this module forming a second
 * opinion about completion.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    compilePacketToStageRequirements,
    type PacketItemForCompile,
} from "@/lib/lifecycle/compilePacketToStageRequirements";
import type { EnrollmentParticipantProgress } from "@/lib/enrollment/participantProgress/enrollmentParticipantProgressTypes";

type RequirementProgress = EnrollmentParticipantProgress["requirements"][number];

/**
 * Read each packet's ordered steps and return one form-kind requirement per distinct form.
 *
 * A packet that cannot be read yields nothing rather than failing the objective — the same leniency
 * the schema parse below it already applies. A participant shown a short list is recoverable; a
 * participant shown an error because one packet row was unreadable is not.
 */
export async function expandPacketRequirementsToForms(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        requirements: readonly RequirementProgress[];
    },
): Promise<RequirementProgress[]> {
    const packetIds = [...new Set(input.requirements.map((r) => r.artifact.id).filter(Boolean))];
    if (!packetIds.length) return [];

    const { data, error } = await supabase
        .from("form_packet_items")
        .select("packet_definition_id, sequence_index, form_definition_id")
        .eq("org_id", input.orgId)
        .in("packet_definition_id", packetIds);
    if (error) return [];

    const itemsByPacket = new Map<string, PacketItemForCompile[]>();
    for (const row of (data ?? []) as {
        packet_definition_id: string;
        sequence_index: number;
        form_definition_id: string | null;
    }[]) {
        const formDefinitionId = String(row.form_definition_id ?? "").trim();
        // A packet step that is not a form — a document to read, a document to send in — has no
        // schema and therefore no field to ask about. It is still a real obligation; it is simply
        // not one this projection can turn into a question.
        if (!formDefinitionId) continue;
        const list = itemsByPacket.get(String(row.packet_definition_id)) ?? [];
        list.push({ sequence_index: Number(row.sequence_index ?? 0), form_definition_id: formDefinitionId });
        itemsByPacket.set(String(row.packet_definition_id), list);
    }

    const out: RequirementProgress[] = [];
    const seenForms = new Set<string>();
    for (const requirement of input.requirements) {
        const items = itemsByPacket.get(requirement.artifact.id) ?? [];
        if (!items.length) continue;
        for (const compiled of compilePacketToStageRequirements(items, { level: requirement.level })) {
            // One form is one requirement even when two packets both contain it: a duplicate would
            // give the same ask two colliding identities.
            if (seenForms.has(compiled.form_definition_id)) continue;
            seenForms.add(compiled.form_definition_id);
            out.push({
                requirement_id: compiled.requirement_id,
                kind: "form",
                artifact: { kind: "form", id: compiled.form_definition_id },
                level: compiled.level,
                status: requirement.status,
            });
        }
    }
    return out;
}

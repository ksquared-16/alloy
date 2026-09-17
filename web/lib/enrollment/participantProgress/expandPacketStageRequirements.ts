import "server-only";

/**
 * A packet requirement, read as the forms it contains.
 *
 * `projectRequirementProgress` reports any non-form requirement as `unsupported` — "No canonical
 * evidence owner". That is true of a rule and of work, and FALSE of a packet: a packet's evidence
 * owners are the forms inside it. A stage that requires a packet therefore projected one unevaluable
 * requirement, enumerated no forms, and told a participant with 65 required answers outstanding that
 * everything was complete.
 *
 * ── THE TRANSLATION IS NOT NEW, AND MUST NOT BE ──
 *
 * `compilePacketToStageRequirements` already turns packet steps into form requirements, and both the
 * Studio compiler and the hand-launched packet path use it. Reusing it is what makes a packet chosen
 * for a stage and the same packet launched by hand describe the SAME obligation with the SAME
 * requirement ids, rather than two obligations that merely look alike. A second translation here
 * would be a second answer to "which requirement is this form", and the two would drift.
 *
 * ── WHAT IT DOES NOT DO ──
 *
 * It decides nothing about satisfaction. Expansion produces requirements; whether each is
 * outstanding, satisfied or unrealized is still decided by the projection from what the session
 * actually realized. A packet whose rows cannot be read expands to nothing and keeps its original
 * requirement, so an unreadable packet stays visible as unsupported rather than vanishing from the
 * denominator — silence is the one failure a denominator must never have.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    compilePacketToStageRequirements,
    type PacketItemForCompile,
} from "@/lib/lifecycle/compilePacketToStageRequirements";
import type { StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";

export async function expandPacketStageRequirements(
    supabase: SupabaseClient,
    input: { orgId: string; requirements: readonly StageRequirementV1[] },
): Promise<readonly StageRequirementV1[]> {
    const packetIds = [
        ...new Set(
            input.requirements
                .filter((r) => r.ref.kind === "packet")
                .map((r) => String((r.ref as { packet_definition_id?: string }).packet_definition_id ?? "").trim())
                .filter(Boolean),
        ),
    ];
    if (!packetIds.length) return input.requirements;

    const { data, error } = await supabase
        .from("form_packet_items")
        .select("packet_definition_id, sequence_index, form_definition_id")
        .eq("org_id", input.orgId)
        .in("packet_definition_id", packetIds);
    if (error) return input.requirements;

    const itemsByPacket = new Map<string, PacketItemForCompile[]>();
    for (const row of (data ?? []) as {
        packet_definition_id: string;
        sequence_index: number;
        form_definition_id: string | null;
    }[]) {
        const formDefinitionId = String(row.form_definition_id ?? "").trim();
        // A step that is not a form — a document to read, a document to send in — has no schema and
        // so no field need. It remains a real obligation; it is simply not one this expansion can
        // turn into a form requirement.
        if (!formDefinitionId) continue;
        const list = itemsByPacket.get(String(row.packet_definition_id)) ?? [];
        list.push({ sequence_index: Number(row.sequence_index ?? 0), form_definition_id: formDefinitionId });
        itemsByPacket.set(String(row.packet_definition_id), list);
    }

    const out: StageRequirementV1[] = [];
    const seenForms = new Set<string>();
    // A form the stage declared DIRECTLY keeps its own requirement id; the packet expansion never
    // displaces it.
    for (const requirement of input.requirements) {
        if (requirement.ref.kind === "form") seenForms.add(requirement.ref.form_definition_id);
    }

    for (const requirement of input.requirements) {
        if (requirement.ref.kind !== "packet") {
            out.push(requirement);
            continue;
        }
        const packetId = String((requirement.ref as { packet_definition_id?: string }).packet_definition_id ?? "").trim();
        const items = itemsByPacket.get(packetId) ?? [];
        if (!items.length) {
            // Nothing readable inside it. Keep the packet requirement so it stays in the denominator.
            out.push(requirement);
            continue;
        }
        for (const compiled of compilePacketToStageRequirements(items, {
            level: requirement.level,
            enforcement: requirement.enforcement,
        })) {
            // One form is one requirement even when two packets both contain it: a duplicate would
            // give the same ask two colliding identities.
            if (seenForms.has(compiled.form_definition_id)) continue;
            seenForms.add(compiled.form_definition_id);
            out.push({
                requirement_id: compiled.requirement_id,
                ref: { kind: "form", form_definition_id: compiled.form_definition_id },
                level: compiled.level,
                scope: requirement.scope,
                timing: requirement.timing,
                enforcement: compiled.enforcement,
            } satisfies StageRequirementV1);
        }
    }
    return out;
}

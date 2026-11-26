/**
 * Compile a Studio Packet's ordered Forms into canonical stage requirements.
 *
 * This is the bridge that was missing, and its whole design is about what it is NOT:
 *
 *   • It runs ONCE, when a director chooses a packet. Nothing re-reads the packet afterwards.
 *   • The result is ordinary `kind: "form"` requirements. BP stores Forms, never a packet id, so
 *     there is nothing for a later packet edit to reach through — a published revision cannot move
 *     because someone reordered a packet in Studio.
 *   • Runtime is unaffected: `requirementDerivedPacket` still derives execution from BP.
 *
 * The packet is how a director SAYS what they want. The requirements are what Alloy then owns.
 *
 * Pure. No I/O — the caller supplies the packet's items already ordered.
 */

import type { PersistedRequirementLevel } from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import type { RequirementEnforcement } from "@/lib/lifecycle/requirementTimingTypes";

export type PacketItemForCompile = {
    sequence_index: number;
    form_definition_id: string;
};

export type CompiledFormRequirement = {
    requirement_id: string;
    kind: "form";
    form_definition_id: string;
    level: PersistedRequirementLevel;
    scope: "record";
    timing: "stage_exit";
    enforcement: RequirementEnforcement;
};

/**
 * Identity derived from the form, so recompiling the same selection is the same requirement rather
 * than a new one. The section is replaced wholesale on save; a positional or random id would make an
 * unchanged requirement look different every time it was written.
 */
export function requirementIdForForm(formDefinitionId: string): string {
    return `form_${formDefinitionId.replace(/-/g, "")}`;
}

export function compilePacketToStageRequirements(
    items: readonly PacketItemForCompile[],
    defaults?: { level?: PersistedRequirementLevel; enforcement?: RequirementEnforcement },
): CompiledFormRequirement[] {
    const level = defaults?.level ?? "required";
    const enforcement = defaults?.enforcement ?? "blocking";
    const seen = new Set<string>();
    // Packet order IS requirement order — the family meets the artifacts as the packet reads.
    return [...items]
        .sort((a, b) => a.sequence_index - b.sequence_index)
        .flatMap((item) => {
            const id = item.form_definition_id?.trim();
            // One form twice in a packet is one requirement: a duplicate would ask the same family
            // for the same form twice and give the two asks colliding identities.
            if (!id || seen.has(id)) return [];
            seen.add(id);
            return [{
                requirement_id: requirementIdForForm(id),
                kind: "form" as const,
                form_definition_id: id,
                level,
                scope: "record" as const,
                timing: "stage_exit" as const,
                enforcement,
            }];
        });
}

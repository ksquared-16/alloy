import type { AutoPopulateInstruction } from "@/lib/completion/effectiveRequirementsTypes";

export function applyMetadataAutoPopulate(
    existingMetadata: Record<string, unknown> | null | undefined,
    instructions: AutoPopulateInstruction[]
): Record<string, unknown> {
    const meta = {
        ...(existingMetadata && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
            ? existingMetadata
            : {}),
    };
    for (const ins of instructions) {
        if (ins.entity_type !== "opportunity" || !ins.metadata_key) continue;
        const key = ins.metadata_key.trim();
        const val = ins.value?.trim();
        if (!key || !val) continue;
        const current = meta[key];
        if (current == null || String(current).trim() === "") {
            meta[key] = val;
        }
    }
    return meta;
}

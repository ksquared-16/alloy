/**
 * Bounded Command variants from action_definitions.metadata (D1 / P8).
 * Variants are config overlays — never a different executor.
 */

export type CommandConfigVariant = {
    variantKey: string;
    label: string;
    description?: string;
};

/**
 * Read `metadata.command_config.variants[]` when present.
 * Accepts snake_case or camelCase keys.
 */
export function parseCommandConfigVariants(metadata: unknown): CommandConfigVariant[] {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
    const root = metadata as Record<string, unknown>;
    const commandConfig = root.command_config ?? root.commandConfig;
    if (!commandConfig || typeof commandConfig !== "object" || Array.isArray(commandConfig)) {
        return [];
    }
    const variants = (commandConfig as Record<string, unknown>).variants;
    if (!Array.isArray(variants)) return [];

    const out: CommandConfigVariant[] = [];
    const seen = new Set<string>();
    for (const raw of variants) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        const row = raw as Record<string, unknown>;
        const variantKey = String(row.variant_key ?? row.variantKey ?? "").trim();
        if (!variantKey || seen.has(variantKey)) continue;
        seen.add(variantKey);
        const label = String(row.label ?? variantKey).trim() || variantKey;
        const description = String(row.description ?? "").trim();
        out.push({
            variantKey,
            label,
            ...(description ? { description } : {}),
        });
    }
    return out;
}

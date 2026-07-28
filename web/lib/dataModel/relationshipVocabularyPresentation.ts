/**
 * Operator-facing relationship vocabulary presentation — label-only.
 * Stable key / cardinality / storage identity are never mutated here.
 * Plural label + default snapshot live in existing `metadata` jsonb (no migration).
 */

export type RelationshipVocabularyPresentationMeta = {
    plural_label?: string;
    platform_default_label?: string;
    platform_default_plural_label?: string;
    platform_default_description?: string | null;
};

export function readRelationshipPresentationMeta(
    metadata: unknown
): RelationshipVocabularyPresentationMeta {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
    const m = metadata as Record<string, unknown>;
    return {
        plural_label: typeof m.plural_label === "string" ? m.plural_label : undefined,
        platform_default_label:
            typeof m.platform_default_label === "string" ? m.platform_default_label : undefined,
        platform_default_plural_label:
            typeof m.platform_default_plural_label === "string"
                ? m.platform_default_plural_label
                : undefined,
        platform_default_description:
            m.platform_default_description === null
                ? null
                : typeof m.platform_default_description === "string"
                  ? m.platform_default_description
                  : undefined,
    };
}

export function mergeRelationshipPresentationMetadata(input: {
    existingMetadata: unknown;
    existingLabel: string;
    existingDescription: string | null;
    nextLabel?: string;
    nextPluralLabel?: string | null;
    nextDescription?: string | null;
    resetToDefault?: boolean;
}): {
    metadata: Record<string, unknown>;
    label: string;
    description: string | null;
    error?: string;
} {
    const existing =
        input.existingMetadata &&
        typeof input.existingMetadata === "object" &&
        !Array.isArray(input.existingMetadata)
            ? { ...(input.existingMetadata as Record<string, unknown>) }
            : {};
    const presentation = readRelationshipPresentationMeta(existing);

    if (!presentation.platform_default_label) {
        existing.platform_default_label = input.existingLabel;
        existing.platform_default_plural_label =
            presentation.plural_label ?? `${input.existingLabel}s`;
        existing.platform_default_description = input.existingDescription;
    }

    if (input.resetToDefault) {
        const label = String(existing.platform_default_label ?? input.existingLabel);
        const plural = String(existing.platform_default_plural_label ?? `${label}s`);
        const description =
            existing.platform_default_description === undefined
                ? input.existingDescription
                : (existing.platform_default_description as string | null);
        existing.plural_label = plural;
        return { metadata: existing, label, description };
    }

    const label = (input.nextLabel ?? input.existingLabel).trim();
    if (!label) {
        return {
            metadata: existing,
            label: input.existingLabel,
            description: input.existingDescription,
            error: "Singular label is required.",
        };
    }

    if (input.nextPluralLabel !== undefined) {
        const plural = (input.nextPluralLabel ?? "").trim();
        if (plural) existing.plural_label = plural;
        else delete existing.plural_label;
    }

    const description =
        input.nextDescription === undefined
            ? input.existingDescription
            : input.nextDescription === null || !String(input.nextDescription).trim()
              ? null
              : String(input.nextDescription).trim();

    return { metadata: existing, label, description };
}

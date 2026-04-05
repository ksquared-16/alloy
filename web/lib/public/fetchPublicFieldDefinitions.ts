import type { PublicFieldDef, PublicSectionDef } from "@/components/public/ConfigurableFieldSections";

export type PublicFieldDefinitionsResponse = {
    ok?: boolean;
    error?: string;
    entity_type?: string;
    fields?: PublicFieldDef[];
    sections?: PublicSectionDef[];
};

/**
 * GET /api/public/field-definitions — org + vertical resolved server-side (ALLOY_PUBLIC_ORG_ID).
 */
export async function fetchPublicFieldDefinitions(params: {
    entityType: string;
    verticalSlug?: string | null;
    sectionKeys?: string[] | null;
}): Promise<PublicFieldDefinitionsResponse> {
    const q = new URLSearchParams({ entity_type: params.entityType });
    if (params.verticalSlug?.trim()) q.set("vertical_slug", params.verticalSlug.trim());
    if (params.sectionKeys?.length) q.set("section_keys", params.sectionKeys.join(","));
    const res = await fetch(`/api/public/field-definitions?${q.toString()}`);
    return (await res.json()) as PublicFieldDefinitionsResponse;
}

export function fieldOptionsByKey(
    fields: PublicFieldDef[] | null | undefined,
    fieldKey: string
): { value: string; label: string }[] | null {
    const f = fields?.find((x) => x.field_key === fieldKey);
    if (!f?.options?.length) return null;
    return f.options;
}

/** Prefer `square_footage_tier` (option set); else legacy `square_footage` catalog field. */
export function squareFootageSelectOptionsFromLocationFields(
    fields: PublicFieldDef[] | null | undefined
): { value: string; label: string }[] | null {
    return (
        fieldOptionsByKey(fields, "square_footage_tier") ?? fieldOptionsByKey(fields, "square_footage")
    );
}

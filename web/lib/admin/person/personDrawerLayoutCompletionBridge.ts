import {
    PERSON_LAYOUT_VARIANT_CHILD,
    PERSON_LAYOUT_VARIANT_GENERIC,
    PERSON_LAYOUT_VARIANT_PARENT,
    type ResolvedPersonDrawerLayoutVariant,
} from "@/lib/admin/person/personDrawerLayoutRuntime";
import { evaluateCompletionRequirementsFromRecord } from "@/lib/completion/evaluateCompletionRequirements";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";

/** Completion preview surface keyed by Sprint A layout variant. */
export const PERSON_COMPLETION_SURFACE_BY_LAYOUT_VARIANT: Record<string, string> = {
    [PERSON_LAYOUT_VARIANT_CHILD]: "person_drawer_child",
    [PERSON_LAYOUT_VARIANT_PARENT]: "person_drawer_parent",
    [PERSON_LAYOUT_VARIANT_GENERIC]: "person_drawer_generic",
};

const DEFAULT_PERSON_COMPLETION_SURFACE = "person_drawer";

/**
 * Maps layout runtime variant → completion evaluation surface.
 * Rules remain code-based (Sprint B); variant key is metadata for future field_placements_v1 wiring.
 */
export function resolveCompletionSurfaceForLayoutVariant(
    layoutVariantKey: string | null | undefined
): string {
    const key = String(layoutVariantKey ?? "").trim();
    return PERSON_COMPLETION_SURFACE_BY_LAYOUT_VARIANT[key] ?? DEFAULT_PERSON_COMPLETION_SURFACE;
}

export function layoutVariantKeyFromResolved(
    variant: ResolvedPersonDrawerLayoutVariant | null | undefined
): string | null {
    return variant?.variant_key?.trim() || null;
}

/** Person drawer completion preview — layout-variant-aware, non-blocking. */
export function evaluatePersonDrawerCompletionPreview(input: {
    personId: string;
    record: Record<string, unknown>;
    layoutVariant?: ResolvedPersonDrawerLayoutVariant | null;
    layoutVariantKey?: string | null;
}): RequirementValidationResult {
    const layoutVariantKey =
        input.layoutVariantKey ?? layoutVariantKeyFromResolved(input.layoutVariant);
    return evaluateCompletionRequirementsFromRecord({
        entity_type: "person",
        entity_id: input.personId,
        phase: "preview",
        record: input.record,
        surface: resolveCompletionSurfaceForLayoutVariant(layoutVariantKey),
        layout_variant_key: layoutVariantKey,
    });
}

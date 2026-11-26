/**
 * Category-F department metadata writers may change sibling keys
 * (`lifecycle_actions_matrix_order_v1`, `lifecycle_activation_v1`, …) but must never rewrite
 * publication-owned `lifecycle_builder_v1`. The DB guard enforces that; this helper keeps the
 * application path from producing a forbidden patch in the first place.
 */

import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";

export function mergeCategoryFDepartmentMetadata(
    existing: Record<string, unknown>,
    patch: Record<string, unknown>,
): Record<string, unknown> {
    const { [LIFECYCLE_BUILDER_METADATA_KEY]: _ignored, ...safePatch } = patch;
    return {
        ...existing,
        ...safePatch,
        // Always re-pin the published projection value — even if the patch omitted the key,
        // a shallow merge of a full-metadata snapshot must not drift the builder bytes.
        ...(Object.prototype.hasOwnProperty.call(existing, LIFECYCLE_BUILDER_METADATA_KEY)
            ? { [LIFECYCLE_BUILDER_METADATA_KEY]: existing[LIFECYCLE_BUILDER_METADATA_KEY] }
            : {}),
    };
}

/** True when a patch would change publication-owned configuration if applied naively. */
export function metadataPatchTouchesLifecycleBuilder(patch: Record<string, unknown> | null | undefined): boolean {
    return Boolean(patch && Object.prototype.hasOwnProperty.call(patch, LIFECYCLE_BUILDER_METADATA_KEY));
}

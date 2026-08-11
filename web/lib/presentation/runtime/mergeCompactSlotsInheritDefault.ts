/**
 * Merge variant compact slots with Default: any slot the variant did not configure
 * (hidden / no fieldKeys) inherits the Default slot.
 *
 * Why: stage/grain variants often specialize status/work only. Replacing the entire
 * column set wiped Default children.names/count (and contact/work) on live rows once
 * variant matching started working. Inheritance preserves Default content unless the
 * variant explicitly assigns fields to that slot.
 *
 * Exception: child / candidate grain rows must NOT inherit family `children.*` into
 * groupCount OR work — that produces duplicate subject name + "1 child" on Waitlist
 * child-grain rows even when the published Waitlist variant matched.
 */

import type { CompactRowSlotConfig, CompactRowSlots } from "@/lib/presentation/runtime/queueRowSurfaceConfig";

const COMPACT_SLOT_KEYS = [
    "subject",
    "status",
    "contact",
    "attention",
    "work",
    "groupCount",
] as const satisfies readonly (keyof CompactRowSlots)[];

function slotHasConfiguredFields(slot: CompactRowSlotConfig | undefined): boolean {
    if (!slot?.visible) return false;
    return Boolean(slot.fieldKeys && slot.fieldKeys.length > 0);
}

function isChildOrCandidateGrain(grain: string | null | undefined): boolean {
    const g = (grain ?? "").trim().toLowerCase();
    return g === "child" || g === "candidate";
}

function isFamilyChildrenCollectionSlot(slot: CompactRowSlotConfig | undefined): boolean {
    const keys = slot?.fieldKeys ?? [];
    return keys.some(
        (k) =>
            k === "children.names" ||
            k === "children.count" ||
            k === "children" ||
            k.startsWith("children."),
    );
}

export type MergeCompactSlotsOptions = {
    /** Row subject grain from QueueRowContext — when child/candidate, skip Default children inherit. */
    rowGrain?: string | null;
};

/**
 * Prefer variant slot when it configures fieldKeys; otherwise inherit Default.
 * Subject stays variant-preferred when configured; otherwise Default.
 */
export function mergeCompactSlotsInheritDefault(
    variantSlots: CompactRowSlots,
    defaultSlots: CompactRowSlots,
    options?: MergeCompactSlotsOptions,
): CompactRowSlots {
    const out = { ...variantSlots };
    const skipFamilyChildrenInherit = isChildOrCandidateGrain(options?.rowGrain);
    for (const key of COMPACT_SLOT_KEYS) {
        if (!slotHasConfiguredFields(variantSlots[key]) && slotHasConfiguredFields(defaultSlots[key])) {
            if (
                skipFamilyChildrenInherit &&
                (key === "groupCount" || key === "work") &&
                isFamilyChildrenCollectionSlot(defaultSlots[key])
            ) {
                out[key] = variantSlots[key];
                continue;
            }
            out[key] = defaultSlots[key];
        } else if (!slotHasConfiguredFields(variantSlots[key]) && !slotHasConfiguredFields(defaultSlots[key])) {
            // Both empty — keep variant visibility (typically hidden under published authority).
            out[key] = variantSlots[key];
        }
    }
    return out;
}

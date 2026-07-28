/**
 * Merge variant compact slots with Default: any slot the variant did not configure
 * (hidden / no fieldKeys) inherits the Default slot.
 *
 * Why: stage/grain variants often specialize status/work only. Replacing the entire
 * column set wiped Default children.names/count (and contact/work) on live rows once
 * variant matching started working. Inheritance preserves Default content unless the
 * variant explicitly assigns fields to that slot.
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

/**
 * Prefer variant slot when it configures fieldKeys; otherwise inherit Default.
 * Subject stays variant-preferred when configured; otherwise Default.
 */
export function mergeCompactSlotsInheritDefault(
    variantSlots: CompactRowSlots,
    defaultSlots: CompactRowSlots,
): CompactRowSlots {
    const out = { ...variantSlots };
    for (const key of COMPACT_SLOT_KEYS) {
        if (!slotHasConfiguredFields(variantSlots[key]) && slotHasConfiguredFields(defaultSlots[key])) {
            out[key] = defaultSlots[key];
        } else if (!slotHasConfiguredFields(variantSlots[key]) && !slotHasConfiguredFields(defaultSlots[key])) {
            // Both empty — keep variant visibility (typically hidden under published authority).
            out[key] = variantSlots[key];
        }
    }
    return out;
}

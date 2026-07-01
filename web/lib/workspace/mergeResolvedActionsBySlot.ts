import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";

const SLOT_ORDER: (keyof ResolvedActionsBySlot)[] = [
    "right_rail",
    "primary",
    "secondary",
    "overflow",
    "row_inline",
    "header",
];

/**
 * Merge multiple `GET /api/admin/actions` payloads (same org) into one bucket map.
 * De-duplicates by `slot::key` so overlapping surfaces (e.g. `right_rail` + `work_unit`) keep a stable order.
 */
export function mergeResolvedActionsBySlot(...inputs: (ResolvedActionsBySlot | undefined | null)[]): ResolvedActionsBySlot {
    const out = emptyResolvedActionsBySlot();
    const seen = new Set<string>();
    for (const input of inputs) {
        if (!input) continue;
        for (const slot of SLOT_ORDER) {
            const list = input[slot] ?? [];
            for (const a of list) {
                const k = `${String(slot)}::${a.key}`;
                if (seen.has(k)) continue;
                seen.add(k);
                out[slot].push(a);
            }
        }
    }
    return out;
}

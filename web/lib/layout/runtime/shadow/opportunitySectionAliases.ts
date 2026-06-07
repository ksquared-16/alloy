/**
 * VM ↔ layout runtime section key aliases (Phase 3 shadow parity).
 */

/** VM / shell section key → layout section keys (canonical lead default). */
export const OPPORTUNITY_VM_TO_LAYOUT_SECTION_ALIASES: Readonly<Record<string, readonly string[]>> = {
    inquiry_summary: ["lead_summary"],
    inq_identity: ["lead_summary"],
    inquiry_children: ["children_inquiry", "enrollment_children"],
    inquiry_tuition: ["lead_source"],
    inquiry_source: ["lead_source"],
    details: ["lead_source", "notes_communication"],
    notes: ["notes_communication"],
    tour_scheduling: ["lead_summary"],
};

export function layoutSectionKeysForVmSection(vmSectionKey: string): readonly string[] {
    return OPPORTUNITY_VM_TO_LAYOUT_SECTION_ALIASES[vmSectionKey] ?? [vmSectionKey];
}

export function vmSectionKeysForLayoutSection(layoutSectionKey: string): string[] {
    const out: string[] = [layoutSectionKey];
    for (const [vmKey, layoutKeys] of Object.entries(OPPORTUNITY_VM_TO_LAYOUT_SECTION_ALIASES)) {
        if (layoutKeys.includes(layoutSectionKey)) out.push(vmKey);
    }
    return [...new Set(out)];
}

/** Normalize field refKey for loose parity (strip redundant opportunity prefix). */
export function normalizeFieldRefKeyForParity(refKey: string): string {
    if (refKey.startsWith("opportunity.")) return refKey.slice("opportunity.".length);
    return refKey;
}

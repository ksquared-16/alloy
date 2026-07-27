import type { BosCommandDraft, BosCommandInputValue } from "@/lib/bos/commandSession/types";

/**
 * Stable fingerprint of draft contents for stale-preview / latest-input guards.
 * Intentionally excludes evidence timestamps so pure re-renders don't invalidate.
 */
export function fingerprintBosCommandDraft(draft: BosCommandDraft): string {
    const values = [...draft.values]
        .map((v) => serializeValue(v))
        .sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
    const payload = {
        schemaVersion: draft.schemaVersion,
        values,
        household: draft.household,
        unmappedText: draft.unmappedText,
        sourceTextIds: draft.sourceTexts.map((s) => s.id),
    };
    return stableHash(JSON.stringify(payload));
}

function serializeValue(v: BosCommandInputValue): {
    fieldKey: string;
    value: unknown;
    state: string;
    optionResolved: boolean;
} {
    return {
        fieldKey: v.fieldKey,
        value: v.value,
        state: v.state,
        optionResolved: v.optionResolved,
    };
}

/** FNV-1a 32-bit — deterministic, no crypto dependency for client fingerprints. */
function stableHash(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return `fp_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

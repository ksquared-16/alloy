/**
 * Layout refKey namespace convergence (FC-1).
 *
 * Canonical namespaces: child.*, inquiry_child.*, person.*, opportunity.*
 * Deprecated namespace: child_inquiry.* (alias-on-read only; reject on write).
 *
 * Durable child truth is customer_member (+ optional person). The child.* picker
 * group may temporarily bridge person registry rows — that is NOT person == child.
 */

/** Canonical layout refKey entity prefixes (frozen FC-1). */
export const CANONICAL_LAYOUT_REFKEY_NAMESPACES = ["child", "inquiry_child", "person", "opportunity"] as const;

export type CanonicalLayoutRefKeyNamespace = (typeof CANONICAL_LAYOUT_REFKEY_NAMESPACES)[number];

/** Legacy namespace — do not emit on write. */
export const DEPRECATED_LAYOUT_REFKEY_NAMESPACES = ["child_inquiry"] as const;

/**
 * Full refKey aliases: legacy stored key → canonical key.
 * Alias-on-read only; stored layout JSON is not rewritten in FC-1.
 */
export const LAYOUT_REFKEY_ALIASES: Readonly<Record<string, string>> = {
    // Deprecated child_inquiry.* → inquiry_child.*
    "child_inquiry.desired_start_date": "inquiry_child.desired_start_date",
    "child_inquiry.program": "inquiry_child.desired_program_type",
    "child_inquiry.status": "inquiry_child.outcome_status_key",
    "child_inquiry.child_name": "child.name", // repeater summary — interim until FC-3 binding

    // Participation fields incorrectly namespaced as child.* → inquiry_child.*
    "child.program": "inquiry_child.desired_program_type",
    "child.desired_start_date": "inquiry_child.desired_start_date",
    "child.status": "inquiry_child.outcome_status_key",
    "child.location": "inquiry_child.location_id",
    "child.room": "inquiry_child.program_room_cohort_key",
    "child.schedule": "inquiry_child.desired_schedule_type",

    // Person curated keys → registry-aligned keys
    "person.primary_phone": "person.phone",
    "person.primary_email": "person.email",
};

/** Normalize legacy entity prefix (child_inquiry → inquiry_child). */
export function normalizeRefKeyEntityOnRead(entityKey: string): string {
    if (entityKey === "child_inquiry") return "inquiry_child";
    return entityKey;
}

/** Apply full refKey alias map (alias-on-read). */
export function normalizeRefKeyOnRead(refKey: string): string {
    const trimmed = refKey.trim();
    if (!trimmed) return trimmed;
    const mapped = LAYOUT_REFKEY_ALIASES[trimmed];
    if (mapped) return mapped;
    const dot = trimmed.indexOf(".");
    if (dot === -1) return trimmed;
    const entity = normalizeRefKeyEntityOnRead(trimmed.slice(0, dot));
    const fieldKey = trimmed.slice(dot + 1);
    if (entity !== trimmed.slice(0, dot)) return `${entity}.${fieldKey}`;
    return trimmed;
}

export type ParsedLayoutRefKey = {
    entityKey: string;
    fieldKey: string;
    /** Set when alias-on-read changed the incoming refKey. */
    legacyRefKey?: string;
};

/** Parse a refKey after alias-on-read normalization. Bare keys → opportunity. */
export function parseLayoutRefKey(refKey: string): ParsedLayoutRefKey {
    const legacyRefKey = refKey !== normalizeRefKeyOnRead(refKey) ? refKey : undefined;
    const normalized = normalizeRefKeyOnRead(refKey);
    const dot = normalized.indexOf(".");
    if (dot === -1) {
        return { entityKey: "opportunity", fieldKey: normalized, legacyRefKey };
    }
    return {
        entityKey: normalizeRefKeyEntityOnRead(normalized.slice(0, dot)),
        fieldKey: normalized.slice(dot + 1),
        legacyRefKey,
    };
}

export function isDeprecatedRefKeyNamespace(refKey: string): boolean {
    const trimmed = refKey.trim();
    const dot = trimmed.indexOf(".");
    const entity = dot === -1 ? trimmed : trimmed.slice(0, dot);
    return entity === "child_inquiry";
}

/** Deprecate-on-write: reject new child_inquiry.* refKeys. */
export function validateRefKeyForWrite(refKey: string): { ok: true } | { ok: false; reason: string } {
    if (isDeprecatedRefKeyNamespace(refKey)) {
        return {
            ok: false,
            reason: `Deprecated refKey namespace "child_inquiry.*". Use inquiry_child.* (OCM participation) or child.* (durable child) instead.`,
        };
    }
    return { ok: true };
}

/** Collect all refKeys from a layout doc shape (items + related_list columns + conditions paths). */
export function collectRefKeysFromLayoutDoc(doc: {
    sections: Array<{
        visibleWhen?: { path?: string };
        rows: Array<{
            visibleWhen?: { path?: string };
            columns: Array<{
                items: Array<{
                    refKey?: string;
                    visibleWhen?: { path?: string };
                    columns?: Array<{ refKey?: string }>;
                    items?: Array<{ refKey?: string }>;
                    rows?: Array<{ columns: Array<{ items: Array<{ refKey?: string }> }> }>;
                }>;
            }>;
        }>;
    }>;
}): string[] {
    const keys = new Set<string>();

    const addPath = (path?: string) => {
        if (!path?.trim()) return;
        keys.add(path.trim());
    };

    const walkItem = (item: {
        refKey?: string;
        visibleWhen?: { path?: string };
        columns?: Array<{ refKey?: string }>;
        items?: Array<{ refKey?: string }>;
        rows?: Array<{ columns: Array<{ items: Array<{ refKey?: string }> }> }>;
    }) => {
        if (item.refKey) keys.add(item.refKey);
        addPath(item.visibleWhen?.path);
        item.columns?.forEach((c) => {
            if (c.refKey) keys.add(c.refKey);
        });
        item.items?.forEach(walkItem);
        item.rows?.forEach((row) => row.columns.forEach((col) => col.items.forEach(walkItem)));
    };

    for (const section of doc.sections) {
        addPath(section.visibleWhen?.path);
        for (const row of section.rows) {
            addPath(row.visibleWhen?.path);
            for (const col of row.columns) {
                for (const item of col.items) walkItem(item);
            }
        }
    }
    return [...keys];
}

/** Non-fatal deprecation warnings for layout docs that still contain legacy refKeys. */
export function collectDeprecatedRefKeyWarnings(refKeys: string[]): string[] {
    const warnings: string[] = [];
    for (const key of refKeys) {
        if (isDeprecatedRefKeyNamespace(key)) {
            const canonical = normalizeRefKeyOnRead(key);
            warnings.push(`Deprecated refKey "${key}" — use "${canonical}" for new layout docs.`);
        }
    }
    return warnings;
}

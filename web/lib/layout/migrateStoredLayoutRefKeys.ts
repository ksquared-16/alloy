/**
 * Migrate stored layout JSON refKeys to canonical aliases (Phase 6).
 *
 * Rewrites deprecated child_inquiry.* and mis-grain child.* enrollment aliases
 * using LAYOUT_REFKEY_ALIASES. Safe for published layouts — preserves structure.
 */

import { LAYOUT_REFKEY_ALIASES, normalizeRefKeyOnRead } from "@/lib/layout/layoutRefKeyAliases";

export type LayoutRefKeyMigrationResult = {
    changed: boolean;
    refKeysRewritten: string[];
};

function isObject(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function migrateRefKeyValue(refKey: string): { next: string; changed: boolean } {
    const trimmed = refKey.trim();
    if (!trimmed) return { next: trimmed, changed: false };
    const normalized = normalizeRefKeyOnRead(trimmed);
    return { next: normalized, changed: normalized !== trimmed };
}

/** Walk layout config JSON and rewrite field refKeys in place. */
export function migrateLayoutConfigRefKeys(config: unknown): LayoutRefKeyMigrationResult {
    const refKeysRewritten: string[] = [];

    function walk(node: unknown): void {
        if (Array.isArray(node)) {
            for (const item of node) walk(item);
            return;
        }
        if (!isObject(node)) return;

        if (typeof node.refKey === "string") {
            const { next, changed } = migrateRefKeyValue(node.refKey);
            if (changed) {
                refKeysRewritten.push(`${node.refKey} → ${next}`);
                node.refKey = next;
            }
        }

        for (const value of Object.values(node)) {
            walk(value);
        }
    }

    walk(config);
    return { changed: refKeysRewritten.length > 0, refKeysRewritten };
}

/** Known alias keys for audit reporting. */
export const CANONICAL_LAYOUT_ALIAS_COUNT = Object.keys(LAYOUT_REFKEY_ALIASES).length;

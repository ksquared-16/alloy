/**
 * Layout V2 proof — value resolution for a config-driven item.
 *
 * Pure helper used by the PROOF renderers only (not production). Given a record
 * and a Layout V2 item, it returns a display value formatted per the item's
 * render hint, or a placeholder marker when the configured field is not present
 * on the sample record. This is what lets the proof show "actual values where
 * available, placeholder otherwise" (per the sprint spec).
 *
 * It reuses the existing admin formatters so values look like the product, but
 * it does NOT import or affect any production renderer.
 */

import {
    formatDate,
    formatDateTime,
    formatMoneyFromCents,
    formatMoneyFromDollars,
    formatPhoneUS,
} from "@/lib/adminFormatters";
import type { LayoutItem } from "./layoutV2";
import { parseRefKey } from "./fieldCatalog";
import { normalizeRefKeyOnRead } from "./layoutRefKeyAliases";

export interface ResolvedValue {
    /** Rendered display string (or null when placeholder). */
    display: string | null;
    /** True when the configured field had no value on the record. */
    isPlaceholder: boolean;
    /** The render hint that drove formatting (for the renderer to style). */
    renderHint: string;
    /** Raw underlying value (pre-format), for link/status handling. */
    raw: unknown;
}

const PLACEHOLDER = "—";

function hasValue(v: unknown): boolean {
    return v !== undefined && v !== null && v !== "";
}

/**
 * Money fields: keys ending in `_cents` are integer cents; everything else is
 * treated as a dollar amount (opportunities store quote_* as numeric dollars).
 */
function formatMoney(refKey: string, value: unknown): string {
    const n = typeof value === "string" ? Number(value) : (value as number);
    if (typeof n !== "number" || Number.isNaN(n)) return String(value);
    return refKey.endsWith("_cents") ? formatMoneyFromCents(n) : formatMoneyFromDollars(n);
}

/**
 * Resolve the raw value behind a (possibly namespaced) refKey.
 *  - "opportunity.X" or bare "X" → record[X] (or record[refKey] as a fallback).
 *  - "person.X" / "child.X" / … → record[refKey] then record[X]; usually absent
 *    on the opportunity record today, so the renderer shows a placeholder while
 *    the layout still preserves the intended source.
 */
function resolveRaw(record: Record<string, unknown>, refKey: string): unknown {
    if (record[refKey] !== undefined) return record[refKey];
    const normalized = normalizeRefKeyOnRead(refKey);
    if (normalized !== refKey && record[normalized] !== undefined) return record[normalized];
    const { entityKey, fieldKey } = parseRefKey(refKey);
    if (entityKey === "opportunity") return record[fieldKey];
    return record[fieldKey]; // related-entity field not hydrated on this record → undefined
}

/**
 * Resolve a display-text template: static text with `{token}` slots. Each token
 * is a bare field key or a namespaced ref (e.g. "{last_name} Household",
 * "{person.primary_contact_name}"). Tokens that resolve to empty are replaced
 * with an empty string; surrounding whitespace is collapsed so a missing token
 * does not leave a double space.
 */
export function resolveTemplate(record: Record<string, unknown>, template: string): string {
    const out = template.replace(/\{([^}]+)\}/g, (_m, token: string) => {
        const v = resolveRaw(record, token.trim());
        return hasValue(v) ? String(v) : "";
    });
    return out.replace(/\s{2,}/g, " ").trim();
}

/**
 * Resolve a single item's value from a record.
 *
 * Status items prefer a hydrated `_status_display` label when present (the
 * record's raw status_key is the fallback). Link items show the resolved name
 * field value (display only — the proof does not navigate).
 */
export function resolveItemValue(record: Record<string, unknown>, item: LayoutItem): ResolvedValue {
    const hint = item.renderHint ?? "text";

    // Display-text template (computed item): static text + {token} replacement.
    if (typeof item.template === "string" && item.template.length > 0) {
        const text = resolveTemplate(record, item.template);
        return {
            display: text.length ? text : null,
            isPlaceholder: text.length === 0,
            renderHint: hint,
            raw: text,
        };
    }

    // Status: prefer the hydrated display label, else the raw key value.
    if (hint === "status") {
        const display = record["_status_display"] ?? resolveRaw(record, item.refKey);
        return {
            display: hasValue(display) ? String(display) : null,
            isPlaceholder: !hasValue(display),
            renderHint: hint,
            raw: display ?? null,
        };
    }

    const raw = resolveRaw(record, item.refKey);
    if (!hasValue(raw)) {
        return { display: null, isPlaceholder: true, renderHint: hint, raw: null };
    }

    let display: string;
    switch (hint) {
        case "money":
            display = formatMoney(item.refKey, raw);
            break;
        case "date":
            display = formatDate(raw as string) || PLACEHOLDER;
            break;
        case "datetime":
            display = formatDateTime(raw as string) || PLACEHOLDER;
            break;
        case "phone":
            display = formatPhoneUS(String(raw));
            break;
        case "primary_yes_no":
            display = raw === true || raw === "true" ? "Yes" : "No";
            break;
        case "link":
        case "text":
        case "badge":
        case "custom":
        default:
            display = String(raw);
            break;
    }

    return { display, isPlaceholder: false, renderHint: hint, raw };
}

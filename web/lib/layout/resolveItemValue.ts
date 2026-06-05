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
    const { entityKey, fieldKey } = parseRefKey(refKey);
    if (entityKey === "opportunity") return record[fieldKey];
    return record[fieldKey]; // related-entity field not hydrated on this record → undefined
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

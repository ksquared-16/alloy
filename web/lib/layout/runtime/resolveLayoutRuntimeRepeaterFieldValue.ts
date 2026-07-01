/**
 * Resolve one repeater-row field value (child.* / inquiry_child.* on collection rows).
 *
 * Queue + drawer related_list columns bind namespaced refKeys on row objects that
 * may be flat (`row["child.first_name"]`), nested (`row.child.first_name`), or
 * name-only (`row["child.name"]`). This helper unifies lookup before formatting.
 */

import { parseRefKey } from "../fieldCatalog";
import { normalizeRefKeyOnRead } from "../layoutRefKeyAliases";
import { LAYOUT_RUNTIME_DISPLAY_PREFERRED_REF_KEYS } from "@/lib/layout/runtime/resolveLayoutRuntimeFieldDisplayLabel";
import type { LayoutItem } from "../layoutV2";
import { resolveItemValue, type ResolvedValue } from "../resolveItemValue";

function hasValue(v: unknown): v is string | number | boolean {
    return v !== undefined && v !== null && v !== "";
}

function nestedChildObject(row: Record<string, unknown>): Record<string, unknown> | null {
    const nested = row.child;
    return nested && typeof nested === "object" ? (nested as Record<string, unknown>) : null;
}

function splitDisplayName(name: string): { first: string; last: string } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: "", last: "" };
    if (parts.length === 1) return { first: parts[0]!, last: "" };
    return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

function readChildNameFallback(row: Record<string, unknown>, fieldKey: string): unknown {
    const nested = nestedChildObject(row);
    const display = [
        row["child.name"],
        row["child.display_name"],
        nested?.display_name,
        nested?.name,
        row.display_name,
        row.name,
        row.primary,
        row.line,
    ].find((v) => typeof v === "string" && v.trim());
    if (typeof display !== "string" || !display.trim()) return undefined;
    const { first, last } = splitDisplayName(display);
    if (fieldKey === "first_name") return first || undefined;
    if (fieldKey === "last_name") return last || undefined;
    if (fieldKey === "full_name") {
        const composed = [first, last].filter(Boolean).join(" ").trim();
        return composed || display.trim();
    }
    if (fieldKey === "name" || fieldKey === "display_name") return display.trim();
    return undefined;
}

/** Read raw value for one collection column refKey from a repeater row. */
export function readLayoutRuntimeRepeaterFieldRaw(
    row: Record<string, unknown>,
    refKey: string,
): unknown {
    const trimmedRef = refKey.trim();
    if (LAYOUT_RUNTIME_DISPLAY_PREFERRED_REF_KEYS.has(trimmedRef) && hasValue(row[trimmedRef])) {
        return row[trimmedRef];
    }

    if (hasValue(row[refKey])) return row[refKey];

    const aliased = normalizeRefKeyOnRead(refKey);
    if (aliased !== refKey && hasValue(row[aliased])) return row[aliased];

    const { entityKey, fieldKey } = parseRefKey(refKey);
    if (entityKey === "child") {
        const nested = nestedChildObject(row);
        if (nested && hasValue(nested[fieldKey])) return nested[fieldKey];
        if (fieldKey === "full_name") {
            const first = readLayoutRuntimeRepeaterFieldRaw(row, "child.first_name");
            const last = readLayoutRuntimeRepeaterFieldRaw(row, "child.last_name");
            if (hasValue(first) || hasValue(last)) {
                return [first, last].filter((v) => hasValue(v)).map(String).join(" ").trim();
            }
        }
        const fromName = readChildNameFallback(row, fieldKey);
        if (fromName !== undefined) return fromName;
        if (hasValue(row[fieldKey])) return row[fieldKey];
        return undefined;
    }

    if (entityKey === "inquiry_child") {
        const inquiryKey = `inquiry_child.${fieldKey}`;
        // Prefer raw OCM column values for editable placement selects (ids / keys).
        if (hasValue(row[fieldKey])) return row[fieldKey];
        if (hasValue(row[inquiryKey])) return row[inquiryKey];
        return undefined;
    }

    if (entityKey === "person") {
        const namespaced = `person.${fieldKey}`;
        if (hasValue(row[namespaced])) return row[namespaced];
        const roleScoped =
            fieldKey.startsWith("secondary_")
            || fieldKey.startsWith("emergency_")
            || fieldKey.startsWith("billing_");
        if (roleScoped) {
            if (hasValue(row[fieldKey])) return row[fieldKey];
            return undefined;
        }
        if (fieldKey === "name" || fieldKey === "display_name" || fieldKey === "primary_contact_name") {
            return row["person.primary_contact_name"] ?? row["person.display_name"] ?? row["person.name"];
        }
        if (fieldKey === "email" || fieldKey === "primary_email") {
            return row["person.primary_email"] ?? row["person.email"];
        }
        if (fieldKey === "phone" || fieldKey === "primary_phone") {
            return row["person.primary_phone"] ?? row["person.phone"];
        }
        if (fieldKey === "role" || fieldKey === "contact_role" || fieldKey === "relationship") {
            return row["person.role"] ?? row["person.contact_role"] ?? row["person.relationship"];
        }
        if (fieldKey === "is_primary" || fieldKey === "is_primary_contact") {
            return row["person.is_primary"] ?? row["person.is_primary_contact"];
        }
        if (fieldKey === "is_payer") return row["person.is_payer"];
        if (hasValue(row[`person.${fieldKey}`])) return row[`person.${fieldKey}`];
        return undefined;
    }

    if (hasValue(row[fieldKey])) return row[fieldKey];
    return undefined;
}

/** Resolve + format one repeater column for queue cards and drawer related_list cells. */
export function resolveLayoutRuntimeRepeaterFieldValue(
    row: Record<string, unknown>,
    refKey: string,
    opts?: { renderHint?: LayoutItem["renderHint"]; template?: string },
): ResolvedValue {
    const synthetic: LayoutItem = {
        id: refKey,
        kind: "field",
        refKey,
        renderHint: opts?.renderHint,
        template: opts?.template,
    };
    const raw = readLayoutRuntimeRepeaterFieldRaw(row, refKey);
    if (!hasValue(raw)) {
        return resolveItemValue(row, synthetic);
    }
    const hydrated = {
        ...row,
        [refKey]: raw,
        [normalizeRefKeyOnRead(refKey)]: raw,
    };
    return resolveItemValue(hydrated, synthetic);
}

export function layoutRuntimeRepeaterFieldDisplay(
    row: Record<string, unknown>,
    refKey: string,
    opts?: { renderHint?: LayoutItem["renderHint"]; template?: string },
): { text: string; placeholder: boolean } {
    const resolved = resolveLayoutRuntimeRepeaterFieldValue(row, refKey, opts);
    return {
        text: resolved.isPlaceholder ? "" : (resolved.display ?? ""),
        placeholder: resolved.isPlaceholder,
    };
}

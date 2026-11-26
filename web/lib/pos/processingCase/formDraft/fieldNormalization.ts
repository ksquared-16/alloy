/**
 * Typed normalization contract for Processing review-question value transformation.
 * Reuses intake date parsing; does not silently coerce invalid data.
 */

import { parseFlexibleDate } from "@/lib/intake/normalize/date";
import type { SystemFieldValueKind } from "@/lib/forms/systemFieldRegistry";

export type FieldNormalizationResult =
    | {
          status: "valid";
          canonicalValue: unknown;
          sourceValue: unknown;
          transformer: string;
      }
    | {
          status: "ambiguous";
          sourceValue: unknown;
          reason: string;
          candidates?: unknown[];
      }
    | {
          status: "invalid";
          sourceValue: unknown;
          reason: string;
      };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^[+0-9()\-.\s]{7,}$/;

function normalizeText(raw: unknown): FieldNormalizationResult {
    const source = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
    if (!source) return { status: "invalid", sourceValue: raw, reason: "Value is empty." };
    return { status: "valid", canonicalValue: source, sourceValue: raw, transformer: "trim_text" };
}

function normalizeDate(raw: unknown): FieldNormalizationResult {
    const source = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
    if (!source) return { status: "invalid", sourceValue: raw, reason: "Date value is empty." };
    const parsed = parseFlexibleDate(source);
    if (parsed) return { status: "valid", canonicalValue: parsed, sourceValue: raw, transformer: "parse_flexible_date" };
    if (/\d/.test(source) && /[A-Za-z]{4,}/.test(source)) {
        return { status: "ambiguous", sourceValue: raw, reason: "Date text is partially readable but not unambiguous." };
    }
    return { status: "invalid", sourceValue: raw, reason: "Could not parse as a date." };
}

function normalizeEmail(raw: unknown): FieldNormalizationResult {
    const source = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
    if (!source) return { status: "invalid", sourceValue: raw, reason: "Email is empty." };
    if (EMAIL_RE.test(source)) return { status: "valid", canonicalValue: source.toLowerCase(), sourceValue: raw, transformer: "normalize_email" };
    return { status: "invalid", sourceValue: raw, reason: "Not a valid email address." };
}

function normalizePhone(raw: unknown): FieldNormalizationResult {
    const source = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
    if (!source) return { status: "invalid", sourceValue: raw, reason: "Phone is empty." };
    if (!PHONE_RE.test(source)) return { status: "invalid", sourceValue: raw, reason: "Not a recognizable phone number." };
    const digits = source.replace(/\D/g, "");
    if (digits.length < 7) return { status: "invalid", sourceValue: raw, reason: "Phone number is too short." };
    return { status: "valid", canonicalValue: source, sourceValue: raw, transformer: "normalize_phone" };
}

function normalizeNumber(raw: unknown): FieldNormalizationResult {
    const source = typeof raw === "string" ? raw.trim() : raw;
    if (source === "" || source == null) return { status: "invalid", sourceValue: raw, reason: "Number is empty." };
    const n = typeof source === "number" ? source : Number(String(source).replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(n)) return { status: "invalid", sourceValue: raw, reason: "Not a valid number." };
    return { status: "valid", canonicalValue: n, sourceValue: raw, transformer: "parse_number" };
}

function normalizeBoolean(raw: unknown): FieldNormalizationResult {
    if (typeof raw === "boolean") return { status: "valid", canonicalValue: raw, sourceValue: raw, transformer: "boolean_literal" };
    const source = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (["yes", "true", "1", "y", "checked"].includes(source)) {
        return { status: "valid", canonicalValue: true, sourceValue: raw, transformer: "parse_boolean" };
    }
    if (["no", "false", "0", "n", "unchecked"].includes(source)) {
        return { status: "valid", canonicalValue: false, sourceValue: raw, transformer: "parse_boolean" };
    }
    return { status: "ambiguous", sourceValue: raw, reason: "Checkbox value is unclear." };
}

/** Normalize an extracted value toward a canonical destination field kind. */
export function normalizeFieldValue(
    raw: unknown,
    destinationKind: SystemFieldValueKind | string
): FieldNormalizationResult {
    switch (destinationKind) {
        case "date":
            return normalizeDate(raw);
        case "email":
            return normalizeEmail(raw);
        case "phone":
            return normalizePhone(raw);
        case "number":
            return normalizeNumber(raw);
        case "checkbox":
            return normalizeBoolean(raw);
        case "textarea":
        case "text":
        case "select":
        case "signature":
        default:
            return normalizeText(raw);
    }
}

/** Human label for detected input format (review inspector). */
export function detectedInputFormatLabel(sourceValue: unknown, destinationKind: SystemFieldValueKind | string): string {
    if (destinationKind !== "date") return "Freeform text";
    const raw = typeof sourceValue === "string" ? sourceValue.trim() : "";
    if (!raw) return "No sample value";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "YYYY-MM-DD";
    if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(raw)) return "MM/DD/YYYY";
    if (/[A-Za-z]{3,}/.test(raw)) return "Named month date";
    return "Unrecognized date format";
}

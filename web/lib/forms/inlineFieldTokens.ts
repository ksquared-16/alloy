/**
 * Inline field token utilities (Forms MVP FD-15).
 * Flat canonical field references only — `{{field_key}}` syntax.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";

/** Matches `{{field_key}}` — flat snake_case keys only (no nested paths). */
export const INLINE_FIELD_TOKEN_PATTERN = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g;

export type InlineTokenEligibleField = {
    id: string;
    label: string;
    required: boolean;
};

export type InlineFieldTokenSegment =
    | { kind: "text"; text: string }
    | {
          kind: "token";
          fieldKey: string;
          displayValue: string | null;
          status: "resolved" | "missing" | "unknown";
          fieldLabel: string | null;
          required: boolean;
      };

export type InlineFieldTokenResolution = {
    segments: InlineFieldTokenSegment[];
    /** Keys referenced in text that are not defined on the form. */
    unknownKeys: string[];
    /** Known keys with no display value yet. */
    missingKeys: string[];
    /** Known required fields still missing at resolution time. */
    missingRequiredKeys: string[];
    plainText: string;
};

function isInlineTokenEligibleField(field: FormField): boolean {
    return field.type !== "group";
}

/** Top-level canonical fields eligible for inline tokens (repeaters excluded). */
export function listInlineTokenEligibleFields(schema: FormSchemaV1): InlineTokenEligibleField[] {
    return schema.fields.filter(isInlineTokenEligibleField).map((f) => ({
        id: f.id,
        label: f.label,
        required: f.required,
    }));
}

export function parseInlineFieldTokenKeys(text: string): string[] {
    const keys: string[] = [];
    const seen = new Set<string>();
    if (!text) return keys;
    for (const match of text.matchAll(INLINE_FIELD_TOKEN_PATTERN)) {
        const key = match[1];
        if (!key || seen.has(key)) continue;
        seen.add(key);
        keys.push(key);
    }
    return keys;
}

export function validateInlineFieldTokenKeys(
    text: string,
    knownFieldIds: readonly string[]
): { unknownKeys: string[]; validKeys: string[] } {
    const known = new Set(knownFieldIds);
    const unknownKeys: string[] = [];
    const validKeys: string[] = [];
    for (const key of parseInlineFieldTokenKeys(text)) {
        if (known.has(key)) validKeys.push(key);
        else unknownKeys.push(key);
    }
    return { unknownKeys, validKeys };
}

export function insertInlineFieldToken(
    content: string,
    fieldKey: string,
    selectionStart = content.length,
    selectionEnd = selectionStart
): { nextContent: string; nextCursor: number } {
    const token = `{{${fieldKey}}}`;
    const nextContent = content.slice(0, selectionStart) + token + content.slice(selectionEnd);
    return { nextContent, nextCursor: selectionStart + token.length };
}

function fieldMetaById(schema: FormSchemaV1): Map<string, FormField> {
    return new Map(schema.fields.map((f) => [f.id, f]));
}

function formatScalarDisplayValue(
    field: FormField,
    raw: unknown,
    optionChoices?: readonly { value: string; label: string }[]
): string | null {
    if (raw === undefined || raw === null || raw === "") return null;

    if (field.type === "boolean") {
        return raw === true || raw === "true" ? "Yes" : raw === false || raw === "false" ? "No" : null;
    }

    if (field.type === "multiselect" && Array.isArray(raw)) {
        if (raw.length === 0) return null;
        const labels = raw.map((v) => {
            const choice = optionChoices?.find((c) => c.value === String(v));
            return choice?.label ?? String(v);
        });
        return labels.join(", ");
    }

    if (field.type === "select") {
        const choice = optionChoices?.find((c) => c.value === String(raw));
        return choice?.label ?? String(raw);
    }

    if (field.type === "signature" && raw && typeof raw === "object") {
        const typed = (raw as { typed_full_name?: unknown }).typed_full_name;
        return typeof typed === "string" && typed.trim() ? typed.trim() : null;
    }

    return String(raw);
}

/** Build flat value map from payload for top-level fields only. */
export function buildInlineFieldValueMap(params: {
    schema: FormSchemaV1;
    payload: FormPayload;
    optionChoicesByFieldId?: Record<string, readonly { value: string; label: string }[]>;
}): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const field of params.schema.fields) {
        if (!isInlineTokenEligibleField(field)) continue;
        const raw =
            field.type === "signature" ?
                params.payload.signatures?.[field.id]
            :   params.payload.values[field.id];
        const choices = params.optionChoicesByFieldId?.[field.id];
        out[field.id] = formatScalarDisplayValue(field, raw, choices);
    }
    return out;
}

export function resolveInlineFieldTokens(
    text: string,
    params: {
        schema: FormSchemaV1;
        payload?: FormPayload;
        valueMap?: Record<string, string | null>;
        optionChoicesByFieldId?: Record<string, readonly { value: string; label: string }[]>;
    }
): InlineFieldTokenResolution {
    const fields = fieldMetaById(params.schema);
    const knownIds = [...fields.keys()];
    const valueMap =
        params.valueMap ??
        (params.payload ?
            buildInlineFieldValueMap({
                schema: params.schema,
                payload: params.payload,
                optionChoicesByFieldId: params.optionChoicesByFieldId,
            })
        :   {});

    const { unknownKeys } = validateInlineFieldTokenKeys(text, knownIds);
    const unknownSet = new Set(unknownKeys);
    const missingKeys: string[] = [];
    const missingRequiredKeys: string[] = [];
    const segments: InlineFieldTokenSegment[] = [];

    let lastIndex = 0;
    const re = new RegExp(INLINE_FIELD_TOKEN_PATTERN.source, "g");
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
        const before = text.slice(lastIndex, match.index);
        if (before) segments.push({ kind: "text", text: before });

        const fieldKey = match[1]!;
        const field = fields.get(fieldKey);
        if (!field || unknownSet.has(fieldKey)) {
            segments.push({
                kind: "token",
                fieldKey,
                displayValue: null,
                status: "unknown",
                fieldLabel: field?.label ?? null,
                required: field?.required ?? false,
            });
        } else {
            const displayValue = valueMap[fieldKey] ?? null;
            const status = displayValue ? "resolved" : "missing";
            if (!displayValue) {
                missingKeys.push(fieldKey);
                if (field.required) missingRequiredKeys.push(fieldKey);
            }
            segments.push({
                kind: "token",
                fieldKey,
                displayValue,
                status,
                fieldLabel: field.label,
                required: field.required,
            });
        }

        lastIndex = match.index + match[0].length;
    }

    const tail = text.slice(lastIndex);
    if (tail) segments.push({ kind: "text", text: tail });

    const plainParts = segments.map((seg) => {
        if (seg.kind === "text") return seg.text;
        if (seg.status === "resolved" && seg.displayValue) return seg.displayValue;
        return `[${seg.fieldLabel ?? seg.fieldKey}]`;
    });

    return {
        segments,
        unknownKeys,
        missingKeys: [...new Set(missingKeys)],
        missingRequiredKeys: [...new Set(missingRequiredKeys)],
        plainText: plainParts.join(""),
    };
}

export function collectInlineFieldTokenWarnings(
    schema: FormSchemaV1,
    payload: FormPayload,
    optionChoicesByFieldId?: Record<string, readonly { value: string; label: string }[]>
): { blockId: string; warnings: string[] }[] {
    const composition = schema.document_composition;
    if (!composition?.blocks?.length) return [];

    const warnings: { blockId: string; warnings: string[] }[] = [];
    for (const block of composition.blocks) {
        if (block.type !== "text" && block.type !== "heading") continue;
        const resolution = resolveInlineFieldTokens(block.content, {
            schema,
            payload,
            optionChoicesByFieldId,
        });
        const lines: string[] = [];
        for (const key of resolution.unknownKeys) {
            lines.push(`Unknown field token {{${key}}}`);
        }
        for (const key of resolution.missingRequiredKeys) {
            const field = schema.fields.find((f) => f.id === key);
            lines.push(`Required field missing: ${field?.label ?? key}`);
        }
        if (lines.length > 0) warnings.push({ blockId: block.id, warnings: lines });
    }
    return warnings;
}

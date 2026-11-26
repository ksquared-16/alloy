/**
 * Inline option management for select / multiselect business fields.
 * Canonical source: field_definitions.config.options (+ default_option_value).
 */

import { slugifyConfigurationKey } from "@/lib/adminV2/configuration/configurationWorkspaceOperatorUi";
import { isSelectLikeFieldType } from "@/lib/admin/fieldDefinitionOptionSetConfig";
import type { FieldOption } from "@/lib/fields/fieldDefinitionConfig";
import { normalizeOptionsFromConfig } from "@/lib/fields/fieldDefinitionConfig";

export function getDefaultOptionValueFromConfig(config: unknown | null | undefined): string {
    if (!config || typeof config !== "object" || Array.isArray(config)) return "";
    const v = (config as Record<string, unknown>).default_option_value;
    return typeof v === "string" ? v.trim() : "";
}

export function readInlineOptionsFromFieldConfig(config: unknown | null | undefined): FieldOption[] {
    return normalizeOptionsFromConfig(config);
}

export function buildConfigWithInlineOptions(
    existing: unknown | null | undefined,
    options: readonly FieldOption[],
    defaultOptionValue: string,
): Record<string, unknown> {
    const base =
        existing != null && typeof existing === "object" && !Array.isArray(existing)
            ? { ...(existing as Record<string, unknown>) }
            : {};
    delete base.option_set_key;
    const cleaned = options
        .map((o) => ({
            value: o.value.trim(),
            label: o.label.trim() || o.value.trim(),
        }))
        .filter((o) => o.value.length > 0);
    base.options = cleaned;
    const def = defaultOptionValue.trim();
    if (def && cleaned.some((o) => o.value === def)) {
        base.default_option_value = def;
    } else {
        delete base.default_option_value;
    }
    return base;
}

export function newInlineOptionFromLabel(label: string, existingValues: ReadonlySet<string>): FieldOption {
    const base = slugifyConfigurationKey(label) || `option_${existingValues.size + 1}`;
    let value = base;
    let n = 2;
    while (existingValues.has(value)) {
        value = `${base}_${n}`;
        n += 1;
    }
    return { value, label: label.trim() || value };
}

export function fieldSupportsInlineOptions(fieldType: string): boolean {
    return isSelectLikeFieldType(fieldType);
}

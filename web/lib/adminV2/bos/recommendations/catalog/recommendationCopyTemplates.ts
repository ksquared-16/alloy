/**
 * Deterministic catalog template interpolation (Phase 1 / Card 1.2).
 */

import {
    CATALOG_TEMPLATE_PLACEHOLDERS,
    type CatalogInterpolationValues,
    type CatalogTemplatePlaceholder,
} from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogTypes";
import { RecommendationCatalogValidationError } from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogValidation";

const PLACEHOLDER_RE = /\{\{([a-z_]+)\}\}/g;

export function listTemplatePlaceholders(template: string): string[] {
    const found = new Set<string>();
    for (const m of template.matchAll(PLACEHOLDER_RE)) {
        const key = m[1];
        if (key) found.add(key);
    }
    return [...found];
}

function formatPlaceholderValue(raw: string | number | null | undefined): string {
    if (raw == null) return "";
    if (typeof raw === "number" && Number.isFinite(raw)) return String(Math.round(raw));
    return String(raw).trim();
}

/**
 * Replace `{{placeholder}}` tokens from allowlisted keys only.
 * Unknown placeholders are left unchanged (visible in tests).
 */
export function renderCatalogTemplate(
    template: string,
    values: CatalogInterpolationValues,
    options?: {
        required?: CatalogTemplatePlaceholder[];
        field?: string;
    }
): string {
    const field = options?.field ?? "template";
    const required = options?.required ?? [];

    for (const key of required) {
        const v = values[key];
        if (v == null || (typeof v === "string" && !v.trim())) {
            throw new RecommendationCatalogValidationError(
                field,
                `missing required interpolation value: ${key}`
            );
        }
    }

    let out = template;
    for (const m of template.matchAll(PLACEHOLDER_RE)) {
        const key = m[1] as CatalogTemplatePlaceholder;
        if (!(CATALOG_TEMPLATE_PLACEHOLDERS as readonly string[]).includes(key)) {
            continue;
        }
        const replacement = formatPlaceholderValue(values[key]);
        out = out.split(`{{${key}}}`).join(replacement);
    }

    return out.replace(/\s{2,}/g, " ").trim();
}

/** Collapse optional clause markers `[[ ... ]]` when inner placeholders empty. */
export function renderCatalogTemplateWithOptionalClauses(
    template: string,
    values: CatalogInterpolationValues,
    options?: {
        required?: CatalogTemplatePlaceholder[];
        field?: string;
    }
): string {
    const withOptional = template.replace(/\[\[([^\]]+)\]\]/g, (_match, clause: string) => {
        const inner = clause.replace(PLACEHOLDER_RE, (_m, key: string) => {
            const v = values[key as CatalogTemplatePlaceholder];
            return formatPlaceholderValue(v);
        });
        return inner.trim() ? inner.trim() : "";
    });
    return renderCatalogTemplate(withOptional, values, options);
}

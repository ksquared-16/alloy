/**
 * Catalog copy quality validation (Phase 1 / Card 1.2).
 */

import {
    CONFIDENCE_LEVELS_V1,
    RECOMMENDATION_TYPES_V1,
    TRUST_BOUNDARIES_V1,
    URGENCY_BANDS_V1,
} from "@/lib/adminV2/bos/recommendations/types";
import type { OperationalRecommendationCatalogEntryV1 } from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogTypes";
import { listTemplatePlaceholders } from "@/lib/adminV2/bos/recommendations/catalog/recommendationCopyTemplates";

export class RecommendationCatalogValidationError extends Error {
    readonly field: string;

    constructor(field: string, message: string) {
        super(`recommendation_catalog:${field}: ${message}`);
        this.name = "RecommendationCatalogValidationError";
        this.field = field;
    }
}

/** Legacy mechanical labels the catalog must beat (execution pack §7.6). */
export const BANNED_GENERIC_ACTION_LABELS = [
    "Respond to new request",
    "Follow up",
    "Re-engage priority record",
    "Review operational state",
] as const;

const BANNED_GENERIC_PHRASES = [
    /^operational attention:/i,
    /^respond$/i,
    /^follow up$/i,
    /^take action$/i,
    /^review item$/i,
    /^review$/i,
] as const;

const BANNED_GENERIC_SUBSTRINGS = ["operational attention:", "take action", "review item"] as const;

export type GenericCopyIssue = {
    field: string;
    message: string;
};

export function findGenericCopyIssues(text: string, field: string): GenericCopyIssue[] {
    const t = text.trim();
    const issues: GenericCopyIssue[] = [];
    if (!t) {
        issues.push({ field, message: "empty copy" });
        return issues;
    }
    for (const re of BANNED_GENERIC_PHRASES) {
        if (re.test(t)) issues.push({ field, message: `matches banned pattern: ${re}` });
    }
    const lower = t.toLowerCase();
    for (const sub of BANNED_GENERIC_SUBSTRINGS) {
        if (lower.includes(sub)) issues.push({ field, message: `contains banned phrase: ${sub}` });
    }
    return issues;
}

export function assertNotGenericCopy(text: string, field: string): void {
    const issues = findGenericCopyIssues(text, field);
    if (issues.length) {
        throw new RecommendationCatalogValidationError(field, issues[0]!.message);
    }
}

export function validateCatalogEntryEnums(entry: OperationalRecommendationCatalogEntryV1): void {
    if (!(RECOMMENDATION_TYPES_V1 as readonly string[]).includes(entry.recommendation_type)) {
        throw new RecommendationCatalogValidationError("recommendation_type", "invalid enum");
    }
    if (!(URGENCY_BANDS_V1 as readonly string[]).includes(entry.default_urgency_band)) {
        throw new RecommendationCatalogValidationError("default_urgency_band", "invalid enum");
    }
    if (!(CONFIDENCE_LEVELS_V1 as readonly string[]).includes(entry.default_confidence_level)) {
        throw new RecommendationCatalogValidationError("default_confidence_level", "invalid enum");
    }
    if (!(TRUST_BOUNDARIES_V1 as readonly string[]).includes(entry.trust_boundary)) {
        throw new RecommendationCatalogValidationError("trust_boundary", "invalid enum");
    }
}

export function validateCatalogEntryTemplates(entry: OperationalRecommendationCatalogEntryV1): void {
    validateCatalogEntryEnums(entry);

    const fields: { name: string; value: string }[] = [
        { name: "title_template", value: entry.title_template },
        { name: "current_state_summary_template", value: entry.current_state_summary_template },
        { name: "why_it_matters_template", value: entry.why_it_matters_template },
        { name: "urgency_reason_template", value: entry.urgency_reason_template },
        { name: "action_rationale_template", value: entry.action_rationale_template },
        { name: "recommended_action.labelTemplate", value: entry.recommended_action.labelTemplate },
    ];
    if (entry.likely_outcome_template) fields.push({ name: "likely_outcome_template", value: entry.likely_outcome_template });
    if (entry.likely_risk_template) fields.push({ name: "likely_risk_template", value: entry.likely_risk_template });

    for (const { name, value } of fields) {
        assertNotGenericCopy(value, `${entry.catalog_key}.${name}`);
        if (!value.trim()) {
            throw new RecommendationCatalogValidationError(name, "template must be non-empty");
        }
    }

    if (entry.tier === "full" && entry.why_it_matters_template.includes("{{primary_label}}")) {
        if (!entry.required_interpolation.includes("primary_label")) {
            throw new RecommendationCatalogValidationError(
                "required_interpolation",
                "why template uses primary_label but it is not required"
            );
        }
    }

    for (const req of entry.required_interpolation) {
        const used = fields.some((f) => listTemplatePlaceholders(f.value).includes(req));
        if (!used && !entry.urgency_reason_template.includes(`{{${req}}}`)) {
            throw new RecommendationCatalogValidationError(
                "required_interpolation",
                `required placeholder ${req} not used in any template`
            );
        }
    }
}

export function validateOperationalRecommendationCatalog(
    entries: Readonly<Record<string, OperationalRecommendationCatalogEntryV1>>
): void {
    for (const entry of Object.values(entries)) {
        validateCatalogEntryTemplates(entry);
    }
}

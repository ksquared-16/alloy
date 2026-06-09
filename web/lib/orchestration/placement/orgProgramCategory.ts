/**
 * Org-level program/category keys — fallback classification and analytics only.
 *
 * Waitlist grouping labels and sort order prefer `location_program_categories` when site context exists.
 * This module classifies cohort slugs/labels into stable keys when location config is unavailable.
 *
 * Does not implement rates, classroom assignment, or site-scoped program catalogs.
 */

import { slugifyProgramRoomCohortKey } from "@/lib/orchestration/placement/resolveProgramRoomCohort";

export const ORG_PROGRAM_CATEGORY_KEYS = {
    infant: "infant",
    toddler: "toddler",
    preschool: "preschool",
    pre_k: "pre_k",
    school_age: "school_age",
    unspecified: "unspecified",
} as const;

export type OrgProgramCategoryKey = (typeof ORG_PROGRAM_CATEGORY_KEYS)[keyof typeof ORG_PROGRAM_CATEGORY_KEYS];

export const ORG_PROGRAM_CATEGORY_LABELS: Record<OrgProgramCategoryKey, string> = {
    infant: "Infant",
    toddler: "Toddler",
    preschool: "Preschool",
    pre_k: "Pre-K",
    school_age: "School Age",
    unspecified: "Unspecified category",
};

/** Display order for waitlist section headers when sorting categories. */
export const ORG_PROGRAM_CATEGORY_SORT_ORDER: OrgProgramCategoryKey[] = [
    "infant",
    "toddler",
    "preschool",
    "pre_k",
    "school_age",
    "unspecified",
];

function classifySlug(slug: string): OrgProgramCategoryKey | null {
    const s = slug.trim().toLowerCase();
    if (!s) return null;
    if (s === "infant" || s.startsWith("infant_")) return "infant";
    if (s === "young_toddler" || s.startsWith("young_toddler") || s === "toddler" || s.startsWith("toddler_")) {
        return "toddler";
    }
    if (s === "pre_k" || s.startsWith("pre_k") || s === "prek" || s.startsWith("prek")) return "pre_k";
    if (s === "preschool" || s.startsWith("preschool_")) return "preschool";
    if (s === "school_age" || s.startsWith("school_age") || s === "schoolage") return "school_age";
    return null;
}

/** Match operator-facing labels and location-level room names to org category. */
function classifyLabel(label: string): OrgProgramCategoryKey | null {
    const t = label.trim();
    if (!t) return null;
    const lower = t.toLowerCase();

    if (/^infant\b/i.test(t) || /\binfant\s+[a-z0-9]+\b/i.test(t)) return "infant";
    if (/^young toddler\b/i.test(t) || /^toddler\b/i.test(t) || /\btoddler\s+(room|[a-z0-9]+)\b/i.test(t)) {
        return "toddler";
    }
    if (/^pre-?k\b/i.test(t)) return "pre_k";
    if (/^preschool\b/i.test(t) || /\bpreschool\s+[0-9]+\b/i.test(t)) return "preschool";
    if (/^school age\b/i.test(t)) return "school_age";

    if (lower.includes("infant")) return "infant";
    if (lower.includes("young toddler") || (lower.includes("toddler") && !lower.includes("preschool"))) return "toddler";
    if (lower.includes("pre-k") || lower.includes("pre k") || lower.includes("prek")) return "pre_k";
    if (lower.includes("preschool")) return "preschool";
    if (lower.includes("school age")) return "school_age";

    return null;
}

export function resolveOrgProgramCategoryForWaitlist(params: {
    cohortKey?: string | null;
    cohortLabel?: string | null;
}): { categoryKey: OrgProgramCategoryKey; categoryLabel: string } {
    const rawKey = (params.cohortKey ?? "").trim();
    const rawLabel = (params.cohortLabel ?? "").trim();
    const slug = rawKey ? slugifyProgramRoomCohortKey(rawKey) : rawLabel ? slugifyProgramRoomCohortKey(rawLabel) : "";

    const fromSlug = classifySlug(slug);
    if (fromSlug) {
        return { categoryKey: fromSlug, categoryLabel: ORG_PROGRAM_CATEGORY_LABELS[fromSlug] };
    }

    const fromLabel = classifyLabel(rawLabel);
    if (fromLabel) {
        return { categoryKey: fromLabel, categoryLabel: ORG_PROGRAM_CATEGORY_LABELS[fromLabel] };
    }

    return {
        categoryKey: ORG_PROGRAM_CATEGORY_KEYS.unspecified,
        categoryLabel: ORG_PROGRAM_CATEGORY_LABELS.unspecified,
    };
}

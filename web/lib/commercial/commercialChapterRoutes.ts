/**
 * Financials workspace sections — former Commercial tools.
 *
 * Canonical owner: `/organization/financials?chapter=…`
 * Programs stays Programs-only (`/organization/programs`).
 * `/settings/commercial` remains compatibility only (redirects here).
 */

import {
    CANONICAL_ORGANIZATION_FINANCIALS_HREF,
    CANONICAL_ORGANIZATION_PROGRAMS_HREF,
} from "@/lib/admin/canonicalAdminRoutes";

export const FINANCIALS_WORKSPACE_CHAPTERS = [
    "tuition",
    "catalog",
    "policies",
    "accounting",
    "simulator",
    "funding",
] as const;

/** @deprecated Prefer FINANCIALS_WORKSPACE_CHAPTERS — same section keys. */
export const PROGRAMS_WORKSPACE_CHAPTERS = FINANCIALS_WORKSPACE_CHAPTERS;

export type FinancialsWorkspaceChapter = (typeof FINANCIALS_WORKSPACE_CHAPTERS)[number];

/** @deprecated Prefer FinancialsWorkspaceChapter */
export type ProgramsWorkspaceChapter = FinancialsWorkspaceChapter;

/** Legacy Commercial query aliases that resolve to a Financials chapter. */
const LEGACY_CHAPTER_ALIASES: Record<string, FinancialsWorkspaceChapter | "programs"> = {
    tuition: "tuition",
    fees: "catalog",
    catalog: "catalog",
    policies: "policies",
    accounting: "accounting",
    simulator: "simulator",
    funding: "funding",
    programs: "programs",
    programs_tuition: "programs",
    "programs-tuition": "programs",
};

export const FINANCIALS_WORKSPACE_CHAPTER_META: Record<
    FinancialsWorkspaceChapter,
    { label: string; description: string }
> = {
    tuition: {
        label: "Tuition",
        description: "Tuition Plans, enrollment commitments, organization pricing, and location overrides.",
    },
    accounting: {
        label: "Accounting",
        description: "GL Codes, revenue mappings, and where tuition and fees post.",
    },
    catalog: {
        label: "Catalog",
        description: "Fees, optional services, and other chargeable offerings outside recurring tuition.",
    },
    policies: {
        label: "Policies",
        description: "How operational events affect financial execution.",
    },
    simulator: {
        label: "Simulator",
        description: "Preview how commercial execution resolves for a Program and schedule.",
    },
    funding: {
        label: "Funding",
        description: "Who pays remains owned by Processing — this chapter documents the boundary.",
    },
};

/** @deprecated Prefer FINANCIALS_WORKSPACE_CHAPTER_META */
export const PROGRAMS_WORKSPACE_CHAPTER_META = FINANCIALS_WORKSPACE_CHAPTER_META;

export function normalizeFinancialsWorkspaceChapter(
    value: string | null | undefined,
): FinancialsWorkspaceChapter | "programs" | null {
    const raw = value?.trim().toLowerCase() ?? "";
    if (!raw) return null;
    return LEGACY_CHAPTER_ALIASES[raw] ?? null;
}

/** @deprecated Prefer normalizeFinancialsWorkspaceChapter */
export function normalizeProgramsWorkspaceChapter(
    value: string | null | undefined,
): FinancialsWorkspaceChapter | "programs" | null {
    return normalizeFinancialsWorkspaceChapter(value);
}

export function organizationFinancialsChapterHref(
    chapter: FinancialsWorkspaceChapter | null | undefined,
    options?: {
        planId?: string | null;
        tab?: string | null;
        setup?: string | null;
        accountId?: string | null;
        itemId?: string | null;
        policyId?: string | null;
    },
): string {
    if (!chapter) return CANONICAL_ORGANIZATION_FINANCIALS_HREF;
    const params = new URLSearchParams();
    params.set("chapter", chapter);
    if (options?.planId?.trim()) params.set("planId", options.planId.trim());
    if (options?.tab?.trim()) params.set("tab", options.tab.trim());
    if (options?.setup?.trim()) params.set("setup", options.setup.trim());
    if (options?.accountId?.trim()) params.set("accountId", options.accountId.trim());
    if (options?.itemId?.trim()) params.set("itemId", options.itemId.trim());
    if (options?.policyId?.trim()) params.set("policyId", options.policyId.trim());
    return `${CANONICAL_ORGANIZATION_FINANCIALS_HREF}?${params.toString()}`;
}

/** Tuition Plans collection / selected plan under Financials. */
export function organizationTuitionPlansHref(options?: {
    planId?: string | null;
    tab?: string | null;
    setup?: string | null;
}): string {
    return organizationFinancialsChapterHref("tuition", options);
}

/**
 * @deprecated Chapters no longer live under Programs — returns Financials href for tool chapters.
 * Bare Programs collection still uses CANONICAL_ORGANIZATION_PROGRAMS_HREF via commercialEntryToProgramsHref.
 */
export function organizationProgramsChapterHref(
    chapter: FinancialsWorkspaceChapter | null | undefined,
): string {
    return organizationFinancialsChapterHref(chapter);
}

/** @deprecated Use organizationFinancialsChapterHref — Commercial is no longer product IA. */
export function commercialSettingsHref(
    chapter?: FinancialsWorkspaceChapter | "fees" | "catalog" | null,
): string {
    const normalized =
        chapter === "fees" || chapter === "catalog" ? "catalog"
        : chapter && (FINANCIALS_WORKSPACE_CHAPTERS as readonly string[]).includes(chapter)
          ? (chapter as FinancialsWorkspaceChapter)
          : null;
    return organizationFinancialsChapterHref(normalized);
}

export const COMMERCIAL_SETTINGS_PATH = "/settings/commercial" as const;

export const COMMERCIAL_COMPAT_CHAPTERS = FINANCIALS_WORKSPACE_CHAPTERS;

export type CommercialCompatChapter = FinancialsWorkspaceChapter;

export type CommercialWorkspaceSection = FinancialsWorkspaceChapter;

export function normalizeCommercialCompatChapter(
    value: string | null | undefined,
): FinancialsWorkspaceChapter | "programs" | null {
    return normalizeFinancialsWorkspaceChapter(value);
}

export function commercialCompatChapterToSection(
    chapter: FinancialsWorkspaceChapter | "programs" | null,
): FinancialsWorkspaceChapter {
    if (!chapter || chapter === "programs") return "catalog";
    return chapter;
}

export const COMMERCIAL_DEFAULT_SECTION: FinancialsWorkspaceChapter = "catalog";

/** @deprecated Landing has no default chapter — bare `/organization/financials` is the product entry. */
export const FINANCIALS_DEFAULT_CHAPTER: FinancialsWorkspaceChapter = "tuition";


export function isProgramsOwnedCommercialChapter(
    chapter: string | null | undefined,
): boolean {
    return normalizeFinancialsWorkspaceChapter(chapter) === "programs";
}

/**
 * Every Commercial entry maps to Financials (tool chapters) or Programs (catalog identity).
 */
export function commercialEntryToProgramsHref(
    chapter: string | null | undefined,
): string {
    const normalized = normalizeFinancialsWorkspaceChapter(chapter);
    if (!normalized || normalized === "programs") {
        return CANONICAL_ORGANIZATION_PROGRAMS_HREF;
    }
    return organizationFinancialsChapterHref(normalized);
}

/** Compatibility alias — same destinations as commercialEntryToProgramsHref for tool chapters. */
export function commercialEntryToFinancialsHref(
    chapter: string | null | undefined,
): string {
    return commercialEntryToProgramsHref(chapter);
}

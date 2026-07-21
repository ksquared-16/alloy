/**
 * Programs workspace chapters — former Commercial tools, now owned by
 * `/organization/programs?chapter=…`.
 *
 * `/settings/commercial` remains compatibility only (redirects here).
 */

import { CANONICAL_ORGANIZATION_PROGRAMS_HREF } from "@/lib/admin/canonicalAdminRoutes";

export const PROGRAMS_WORKSPACE_CHAPTERS = [
    "tuition",
    "catalog",
    "policies",
    "accounting",
    "simulator",
    "funding",
] as const;

export type ProgramsWorkspaceChapter = (typeof PROGRAMS_WORKSPACE_CHAPTERS)[number];

/** Legacy Commercial query aliases that resolve to a Programs chapter. */
const LEGACY_CHAPTER_ALIASES: Record<string, ProgramsWorkspaceChapter | "programs"> = {
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

export const PROGRAMS_WORKSPACE_CHAPTER_META: Record<
    ProgramsWorkspaceChapter,
    { label: string; description: string }
> = {
    tuition: {
        label: "Tuition",
        description: "Organization tuition rates, inheritance, and Location overrides.",
    },
    catalog: {
        label: "Catalog",
        description: "Fees, add-ons, deposits, and commercial products published for Programs.",
    },
    policies: {
        label: "Policies",
        description: "Discount, deposit, and commercial policy rules scoped across the organization.",
    },
    accounting: {
        label: "Accounting",
        description: "Revenue categories and GL mapping for commercial charges.",
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

export function normalizeProgramsWorkspaceChapter(
    value: string | null | undefined,
): ProgramsWorkspaceChapter | "programs" | null {
    const raw = value?.trim().toLowerCase() ?? "";
    if (!raw) return null;
    return LEGACY_CHAPTER_ALIASES[raw] ?? null;
}

export function organizationProgramsChapterHref(
    chapter: ProgramsWorkspaceChapter | null | undefined,
): string {
    if (!chapter) return CANONICAL_ORGANIZATION_PROGRAMS_HREF;
    return `${CANONICAL_ORGANIZATION_PROGRAMS_HREF}?chapter=${encodeURIComponent(chapter)}`;
}

/** @deprecated Use organizationProgramsChapterHref — Commercial is no longer product IA. */
export function commercialSettingsHref(
    chapter?: ProgramsWorkspaceChapter | "fees" | "catalog" | null,
): string {
    const normalized =
        chapter === "fees" || chapter === "catalog" ? "catalog"
        : chapter && (PROGRAMS_WORKSPACE_CHAPTERS as readonly string[]).includes(chapter)
          ? (chapter as ProgramsWorkspaceChapter)
          : null;
    return organizationProgramsChapterHref(normalized);
}

export const COMMERCIAL_SETTINGS_PATH = "/settings/commercial" as const;

export const COMMERCIAL_COMPAT_CHAPTERS = PROGRAMS_WORKSPACE_CHAPTERS;

export type CommercialCompatChapter = ProgramsWorkspaceChapter;

export type CommercialWorkspaceSection = ProgramsWorkspaceChapter;

export function normalizeCommercialCompatChapter(
    value: string | null | undefined,
): ProgramsWorkspaceChapter | "programs" | null {
    return normalizeProgramsWorkspaceChapter(value);
}

export function commercialCompatChapterToSection(
    chapter: ProgramsWorkspaceChapter | "programs" | null,
): ProgramsWorkspaceChapter {
    if (!chapter || chapter === "programs") return "catalog";
    return chapter;
}

export const COMMERCIAL_DEFAULT_SECTION: ProgramsWorkspaceChapter = "catalog";

export function isProgramsOwnedCommercialChapter(
    chapter: string | null | undefined,
): boolean {
    return normalizeProgramsWorkspaceChapter(chapter) === "programs";
}

/** Every Commercial entry maps to a Programs chapter (or Programs collection). */
export function commercialEntryToProgramsHref(
    chapter: string | null | undefined,
): string {
    const normalized = normalizeProgramsWorkspaceChapter(chapter);
    if (!normalized || normalized === "programs") {
        return CANONICAL_ORGANIZATION_PROGRAMS_HREF;
    }
    return organizationProgramsChapterHref(normalized);
}

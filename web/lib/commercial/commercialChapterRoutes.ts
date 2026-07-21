/**
 * Compatibility routes for Commercial sibling chapters under `/settings/commercial`.
 * Programs product ownership is `/organization/programs` — never treat Commercial as Programs IA.
 */

export const COMMERCIAL_SETTINGS_PATH = "/settings/commercial" as const;

export const COMMERCIAL_COMPAT_CHAPTERS = [
    "tuition",
    "fees",
    "catalog",
    "policies",
    "accounting",
    "simulator",
    "funding",
] as const;

export type CommercialCompatChapter = (typeof COMMERCIAL_COMPAT_CHAPTERS)[number];

/** Internal section keys used by CommercialConfigWorkspace. */
export type CommercialWorkspaceSection =
    | "tuition"
    | "fees"
    | "policies"
    | "accounting"
    | "simulator"
    | "funding";

const CHAPTER_TO_SECTION: Record<CommercialCompatChapter, CommercialWorkspaceSection | "programs"> = {
    tuition: "tuition",
    fees: "fees",
    catalog: "fees",
    policies: "policies",
    accounting: "accounting",
    simulator: "simulator",
    funding: "funding",
};

export function normalizeCommercialCompatChapter(
    value: string | null | undefined,
): CommercialCompatChapter | "programs" | null {
    const raw = value?.trim().toLowerCase() ?? "";
    if (!raw) return null;
    if (raw === "programs" || raw === "programs_tuition" || raw === "programs-tuition") {
        return "programs";
    }
    if ((COMMERCIAL_COMPAT_CHAPTERS as readonly string[]).includes(raw)) {
        return raw as CommercialCompatChapter;
    }
    return null;
}

export function commercialCompatChapterToSection(
    chapter: CommercialCompatChapter | "programs" | null,
): CommercialWorkspaceSection {
    if (!chapter || chapter === "programs") return "fees";
    return CHAPTER_TO_SECTION[chapter] === "programs" ? "fees" : CHAPTER_TO_SECTION[chapter];
}

/** Default Commercial landing — Catalog, not Programs. */
export const COMMERCIAL_DEFAULT_SECTION: CommercialWorkspaceSection = "fees";

export function commercialSettingsHref(chapter?: CommercialCompatChapter | null): string {
    if (!chapter) return COMMERCIAL_SETTINGS_PATH;
    const normalized = chapter === "catalog" ? "fees" : chapter;
    return `${COMMERCIAL_SETTINGS_PATH}?chapter=${encodeURIComponent(normalized)}`;
}

export function isProgramsOwnedCommercialChapter(
    chapter: string | null | undefined,
): boolean {
    return normalizeCommercialCompatChapter(chapter) === "programs";
}

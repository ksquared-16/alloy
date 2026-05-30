import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";
import {
    filterPersonDrawerChildOverviewSections,
    PERSON_DRAWER_CHILD_SUPPRESSED_SECTION_KEYS,
} from "@/lib/admin/person/personDrawerChildOperatingSections";
import {
    filterPersonDrawerParentOverviewSections,
    PERSON_DRAWER_PARENT_SUPPRESSED_SECTION_KEYS,
} from "@/lib/admin/person/personDrawerParentOperatingSections";

/** Titles for canonical presentation sections that must not appear under operating chrome. */
const SUPPRESSED_OVERVIEW_TITLES = new Set([
    "profile",
    "contact",
    "record info",
    "basic",
    "child profile",
    "preferred name",
]);

export function personDrawerSuppressedOverviewTitle(title: string | undefined): boolean {
    const normalized = (title ?? "").trim().toLowerCase();
    return SUPPRESSED_OVERVIEW_TITLES.has(normalized);
}

export function isPersonDrawerParentSuppressedOverviewSection(section: {
    key: string;
    title?: string;
}): boolean {
    return (
        PERSON_DRAWER_PARENT_SUPPRESSED_SECTION_KEYS.has(section.key) ||
        personDrawerSuppressedOverviewTitle(section.title)
    );
}

export function isPersonDrawerChildSuppressedOverviewSection(section: {
    key: string;
    title?: string;
}): boolean {
    return (
        PERSON_DRAWER_CHILD_SUPPRESSED_SECTION_KEYS.has(section.key) ||
        personDrawerSuppressedOverviewTitle(section.title)
    );
}

/** Final overview section list for parent operating chrome. */
export function personDrawerParentOperatingOverviewSections(
    sections: EntityDrawerSectionConfig[]
): EntityDrawerSectionConfig[] {
    return filterPersonDrawerParentOverviewSections(
        sections.filter((section) => !isPersonDrawerParentSuppressedOverviewSection(section))
    );
}

/** Final overview section list for child lifecycle operating chrome (keeps medical when configured). */
export function personDrawerChildOperatingOverviewSections(
    sections: EntityDrawerSectionConfig[]
): EntityDrawerSectionConfig[] {
    return filterPersonDrawerChildOverviewSections(
        sections.filter((section) => !isPersonDrawerChildSuppressedOverviewSection(section))
    );
}

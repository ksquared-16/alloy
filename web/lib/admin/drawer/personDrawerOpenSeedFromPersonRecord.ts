import {
    personDrawerOpenSeedFromContactValues,
    type PersonDrawerOpenSeed,
} from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

function splitDisplayName(name: string | null): { first?: string; last?: string; display?: string } {
    if (!name) return {};
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { display: name };
    return {
        first: parts[0],
        last: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
        display: name,
    };
}

/** First-paint seed when navigating parent ↔ child from a hydrated person drawer. */
export function personDrawerOpenSeedFromPersonRecord(
    record: Record<string, unknown>,
    personId: string
): PersonDrawerOpenSeed | null {
    const pid = personId.trim();
    if (!pid) return null;

    const childLinks = record._household_child_links;
    if (Array.isArray(childLinks)) {
        for (const row of childLinks) {
            if (!row || typeof row !== "object") continue;
            const link = row as Record<string, unknown>;
            if (trimOrNull(link.person_id) !== pid) continue;
            const names = splitDisplayName(trimOrNull(link.display_name));
            return {
                personId: pid,
                first_name: names.first,
                last_name: names.last,
                display_name: names.display,
                date_of_birth: trimOrNull(link.date_of_birth) ?? undefined,
                presentation_emphasis: PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS,
            };
        }
    }

    const siblingLinks = record._sibling_links;
    if (Array.isArray(siblingLinks)) {
        for (const row of siblingLinks) {
            if (!row || typeof row !== "object") continue;
            const link = row as Record<string, unknown>;
            if (trimOrNull(link.person_id) !== pid) continue;
            const names = splitDisplayName(trimOrNull(link.display_name));
            return {
                personId: pid,
                first_name: names.first,
                last_name: names.last,
                display_name: names.display,
                presentation_emphasis: PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS,
            };
        }
    }

    const adultLinks = record._household_adult_links;
    if (Array.isArray(adultLinks)) {
        for (const row of adultLinks) {
            if (!row || typeof row !== "object") continue;
            const link = row as Record<string, unknown>;
            if (trimOrNull(link.person_id) !== pid) continue;
            const names = splitDisplayName(trimOrNull(link.display_name));
            return personDrawerOpenSeedFromContactValues(
                pid,
                {
                    first_name: names.first ?? "",
                    last_name: names.last ?? "",
                    display_name: names.display ?? "",
                    email: trimOrNull(link.email) ?? "",
                    phone: trimOrNull(link.phone) ?? "",
                },
                { presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS }
            );
        }
    }

    return null;
}

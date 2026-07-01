import {
    buildPersonDrawerSeedRecord,
    personDrawerOpenSeedFromContactValues,
    type PersonDrawerOpenSeed,
} from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import type { GlobalRecordSearchHit } from "@/lib/admin/globalSearch/globalRecordSearchTypes";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

function splitName(name: string): { first?: string; last?: string; display: string } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { display: name };
    return {
        first: parts[0],
        last: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
        display: name.trim(),
    };
}

/** First-paint person drawer seed from a global search hit (profile before GET). */
export function personDrawerOpenSeedFromGlobalSearchHit(
    hit: GlobalRecordSearchHit
): PersonDrawerOpenSeed | null {
    const personId = trimOrNull(hit.person_id) ?? (hit.open_entity_type === "persons" ? trimOrNull(hit.open_entity_id) : null);
    if (!personId) return null;

    const names = splitName(hit.name);

    if (hit.group === "children") {
        return {
            personId,
            first_name: names.first,
            last_name: names.last,
            display_name: names.display,
            presentation_emphasis: PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS,
        };
    }

    if (hit.group === "parents") {
        return personDrawerOpenSeedFromContactValues(
            personId,
            {
                first_name: names.first ?? "",
                last_name: names.last ?? "",
                display_name: names.display,
                email: "",
                phone: "",
            },
            { presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS }
        );
    }

    return {
        personId,
        first_name: names.first,
        last_name: names.last,
        display_name: names.display,
    };
}

/** Cache-first seed record for global search person open. */
export function buildGlobalSearchPersonSeedRecord(hit: GlobalRecordSearchHit): Record<string, unknown> | null {
    const seed = personDrawerOpenSeedFromGlobalSearchHit(hit);
    if (!seed) return null;
    return buildPersonDrawerSeedRecord(seed);
}

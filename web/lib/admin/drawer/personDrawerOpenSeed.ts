import { primaryPersonIdFromOpportunityRecord } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { primaryPersonCardValuesFromRecord } from "@/lib/admin/drawer/primaryPersonCardEdit";
import type { PersonContactCardValues } from "@/lib/admin/drawer/primaryPersonCardEdit";

export const PERSON_DRAWER_SEED_SURFACE = "drawer_seed";

export type PersonDrawerOpenSeed = {
    personId: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    display_name?: string;
};

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s.length > 0 ? s : null;
}

export function personDrawerOpenSeedFromContactValues(
    personId: string,
    values: PersonContactCardValues
): PersonDrawerOpenSeed {
    return {
        personId: personId.trim(),
        first_name: values.first_name || undefined,
        last_name: values.last_name || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
        display_name: values.display_name || undefined,
    };
}

export function personDrawerDisplayNameFromSeed(seed: PersonDrawerOpenSeed): string {
    const explicit = trimOrNull(seed.display_name);
    if (explicit) return explicit;
    const joined = [seed.first_name, seed.last_name].map((p) => trimOrNull(p)).filter(Boolean).join(" ");
    return joined || "Person";
}

/** Minimal person row for first paint — authoritative hydrate replaces via GET. */
export function buildPersonDrawerSeedRecord(seed: PersonDrawerOpenSeed): Record<string, unknown> {
    const id = seed.personId.trim();
    const first_name = trimOrNull(seed.first_name) ?? "";
    const last_name = trimOrNull(seed.last_name) ?? "";
    const display = personDrawerDisplayNameFromSeed(seed);
    return {
        id,
        first_name,
        last_name,
        email: trimOrNull(seed.email) ?? "",
        phone: trimOrNull(seed.phone) ?? "",
        _person_name: display,
        _record_surface: PERSON_DRAWER_SEED_SURFACE,
    };
}

export function isPersonDrawerSeedRecord(record: Record<string, unknown> | null | undefined): boolean {
    return String(record?._record_surface ?? "").trim() === PERSON_DRAWER_SEED_SURFACE;
}

/** Build seed from opportunity mirror fields or `_opportunity_persons` row when id matches. */
export function personDrawerSeedFromOpportunityRecord(
    opportunityRecord: Record<string, unknown>,
    personId: string
): PersonDrawerOpenSeed | null {
    const pid = personId.trim();
    if (!pid) return null;

    const primaryId = primaryPersonIdFromOpportunityRecord(opportunityRecord);
    if (primaryId === pid) {
        const values = primaryPersonCardValuesFromRecord(opportunityRecord);
        return personDrawerOpenSeedFromContactValues(pid, values);
    }

    const rows = opportunityRecord._opportunity_persons;
    if (Array.isArray(rows)) {
        for (const row of rows) {
            if (!row || typeof row !== "object") continue;
            if (trimOrNull((row as { person_id?: unknown }).person_id) !== pid) continue;
            const name = trimOrNull((row as { name?: unknown }).name);
            const parts = name ? name.split(/\s+/).filter(Boolean) : [];
            return {
                personId: pid,
                first_name: parts[0] ?? "",
                last_name: parts.length > 1 ? parts.slice(1).join(" ") : "",
                email: trimOrNull((row as { email?: unknown }).email) ?? undefined,
                phone: trimOrNull((row as { phone?: unknown }).phone) ?? undefined,
                display_name: name ?? undefined,
            };
        }
    }

    return null;
}

export function applyPersonDrawerOpenSeed(
    personId: string,
    seed: PersonDrawerOpenSeed | null | undefined
): Record<string, unknown> | null {
    if (!seed || seed.personId.trim() !== personId.trim()) return null;
    return buildPersonDrawerSeedRecord(seed);
}

/**
 * P5A — collection-specific display metadata (read-only, no commit).
 */

import type { ProcessingCollectionInstanceProposal } from "./types";

export type CollectionInstanceDisplayKind = "children" | "parents_guardians" | "generic";

export function collectionDisplayKind(providerRef: string): CollectionInstanceDisplayKind {
    const ref = providerRef.trim();
    if (ref === "children") return "children";
    if (ref === "person.contact_role.parents") return "parents_guardians";
    return "generic";
}

export function collectionGroupTitle(providerRef: string, fallbackLabel: string): string {
    const kind = collectionDisplayKind(providerRef);
    if (kind === "children") return "Children";
    if (kind === "parents_guardians") return "Parents / Guardians";
    return fallbackLabel;
}

export function instanceOriginLabel(
    providerRef: string,
    origin: ProcessingCollectionInstanceProposal["origin"],
): string {
    const kind = collectionDisplayKind(providerRef);
    if (origin === "existing") {
        if (kind === "children") return "Existing child";
        if (kind === "parents_guardians") return "Existing person";
        return "Existing record";
    }
    if (kind === "children") return "New child proposed";
    if (kind === "parents_guardians") return "New person proposed";
    return "New record proposed";
}

export function identityLabelFromValues(providerRef: string, values: Record<string, unknown>): string | null {
    const pick = (...keys: string[]) => {
        for (const k of keys) {
            const v = values[k];
            if (typeof v === "string" && v.trim()) return v.trim();
        }
        return null;
    };
    const kind = collectionDisplayKind(providerRef);
    if (kind === "children") {
        const first = pick("child_first_name", "first_name");
        const last = pick("child_last_name", "last_name");
        if (first && last) return `${first} ${last}`;
        return first ?? last;
    }
    if (kind === "parents_guardians") {
        const name = pick("name", "person_name", "full_name");
        if (name) return name;
        const first = pick("first_name", "person_first_name");
        const last = pick("last_name", "person_last_name");
        if (first && last) return `${first} ${last}`;
        return first ?? last ?? pick("email", "person_email");
    }
    return pick("name", "first_name", "label", "email");
}

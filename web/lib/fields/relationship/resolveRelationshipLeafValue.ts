/**
 * Leaf value resolution from a target person record using manifest leaf identity.
 */

import { manifestRefKeyForRelationshipRoleLeaf } from "@/lib/fields/formsRelationshipTransport";
import type { FormsRelationshipRoleKey } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";

const LEAF_MANIFEST_FALLBACK_COLUMN: Record<string, string> = {
    email: "email",
    phone: "phone",
    name: "full_name",
    first_name: "first_name",
    last_name: "last_name",
    display_name: "full_name",
};

function trim(v: unknown): string | null {
    if (v == null) return null;
    const s = typeof v === "string" ? v.trim() : String(v).trim();
    return s || null;
}

function columnFromManifestRef(manifestRefKey: string): string | null {
    const dot = manifestRefKey.indexOf(".");
    if (dot < 0) return null;
    return manifestRefKey.slice(dot + 1) || null;
}

export function resolveRelationshipLeafFromPersonRow(
    personRow: Record<string, unknown> | null | undefined,
    args: {
        /**
         * Legacy Forms role axis, used only to pick a role-specific manifest column. OMIT for
         * collection items whose role has no legacy manifest — passing an unrelated role (the old
         * hardcoded `"parents"`) would read a guardian-flavoured column for emergency contacts and
         * authorized pickups. Absent role → generic fallback column, which is correct for person rows.
         */
        role?: FormsRelationshipRoleKey;
        leafKey: string;
        leafProviderRefKey?: string | null;
    },
): string | null {
    if (!personRow) return null;
    const leaf = args.leafKey.trim().toLowerCase();
    const manifestRef =
        args.leafProviderRefKey?.trim()
        ?? (args.role ? manifestRefKeyForRelationshipRoleLeaf(args.role, leaf) : null);
    const manifestColumn = manifestRef ? columnFromManifestRef(manifestRef) : null;
    const fallbackColumn = LEAF_MANIFEST_FALLBACK_COLUMN[leaf];
    if (!fallbackColumn) return null;

    if (leaf === "name") {
        const composed = [trim(personRow.first_name), trim(personRow.last_name)].filter(Boolean).join(" ");
        return trim(personRow.full_name)
            ?? trim(personRow.display_name)
            ?? (composed || null);
    }

    const manifestValue = manifestColumn ? trim(personRow[manifestColumn]) : null;
    if (manifestValue) return manifestValue;
    return trim(personRow[fallbackColumn]);
}

export function resolveRelationshipLeafFromContactRow(
    contactRow: Record<string, unknown> | null | undefined,
    leafKey: string,
): string | null {
    if (!contactRow) return null;
    const leaf = leafKey.trim().toLowerCase();
    if (leaf === "name") {
        const composed = [trim(contactRow.first_name), trim(contactRow.last_name)].filter(Boolean).join(" ");
        return trim(contactRow.full_name) ?? (composed || null);
    }
    const column = LEAF_MANIFEST_FALLBACK_COLUMN[leaf];
    return column ? trim(contactRow[column]) : null;
}

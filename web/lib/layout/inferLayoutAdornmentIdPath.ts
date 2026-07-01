/**
 * Default idPath for layout adornment open_drawer actions when the editor
 * or published doc omits an explicit path.
 */

import type { LayoutAdornmentActionEntity } from "./layoutV2";

/** Infer record path for one adornment action entity (+ optional column refKey). */
export function inferLayoutAdornmentIdPath(
    entity: LayoutAdornmentActionEntity,
    refKey?: string,
): string {
    if (entity === "child") return "child.id";
    if (entity === "opportunity") return "id";
    if (entity === "person") {
        if (refKey === "person.primary_contact_name" || refKey === "person.primary_phone" || refKey === "person.primary_email") {
            return "opportunity.primary_person_id";
        }
        if (refKey?.startsWith("person.")) {
            const suffix = refKey.slice("person.".length);
            if (suffix.endsWith("_id") || suffix === "id") return refKey;
            return `person.${suffix.replace(/_(name|display_name|phone|email)$/, "_id").replace(/\.(name|display_name)$/, ".id")}`;
        }
        return "person.id";
    }
    return "id";
}

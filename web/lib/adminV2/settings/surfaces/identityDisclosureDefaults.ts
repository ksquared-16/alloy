/**
 * Default identity field layer classification when seeding nested surface groups.
 *
 * Builder/runtime share this mapping so new surfaces start with progressive disclosure.
 * Published operator configs are never rewritten — only default seeds use this table.
 */

import type { IdentityLayerFieldKeys } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";

const DETAILS_FIELD_SUFFIXES = [
    "address_line",
    "address",
    "date_of_birth",
    "employer",
    "preferred_language",
    "secondary_phone",
    "notes",
    "notes_summary",
    "pickup_summary",
    "medical_summary",
    "documents_summary",
    "communications_summary",
] as const;

const CONTEXT_FIELD_SUFFIXES = [
    "program",
    "room",
    "teacher",
    "rate",
    "schedule_type",
    "desired_schedule_type",
    "start_date",
    "desired_start_date",
    "status",
    "readiness_summary",
    "role_label",
] as const;

const SUMMARY_FIELD_SUFFIXES = [
    "phone",
    "email",
    "name",
    "display_name",
    "first_name",
    "last_name",
    "dob_age",
    "age",
    "nickname",
    "preferred_name",
] as const;

function fieldSuffix(fieldRef: string): string {
    const parts = fieldRef.split(".");
    return parts[parts.length - 1] ?? fieldRef;
}

function matchesSuffix(fieldRef: string, suffixes: readonly string[]): boolean {
    const suffix = fieldSuffix(fieldRef);
    return suffixes.some((candidate) => candidate === suffix || fieldRef.endsWith(`.${candidate}`));
}

/** Classify one field ref into summary, context facts, or details for default seeding. */
export function defaultDisclosureLayerForField(
    surfaceId: string,
    groupKey: string,
    fieldRef: string,
): keyof IdentityLayerFieldKeys {
    if (matchesSuffix(fieldRef, DETAILS_FIELD_SUFFIXES)) return "details";
    if (surfaceId === "children_surface" || surfaceId === "child_surface") {
        if (groupKey === "roster" && matchesSuffix(fieldRef, CONTEXT_FIELD_SUFFIXES)) {
            return "contextFacts";
        }
        if (groupKey !== "roster" && groupKey !== "identity") {
            return "details";
        }
    }
    if (surfaceId === "household_surface") {
        if (groupKey === "children" && matchesSuffix(fieldRef, CONTEXT_FIELD_SUFFIXES)) {
            return "contextFacts";
        }
        if (groupKey === "address") return "details";
    }
    if (matchesSuffix(fieldRef, CONTEXT_FIELD_SUFFIXES)) return "contextFacts";
    if (matchesSuffix(fieldRef, SUMMARY_FIELD_SUFFIXES)) return "summary";
    return "summary";
}

/** Split registry default field keys into configuration buckets for a new group seed. */
export function splitDefaultFieldsForIdentityGroup(
    surfaceId: string,
    groupKey: string,
    defaultFieldKeys: readonly string[],
): IdentityLayerFieldKeys {
    const keys: IdentityLayerFieldKeys = { summary: [], contextFacts: [], details: [] };
    for (const fieldRef of defaultFieldKeys) {
        const layer = defaultDisclosureLayerForField(surfaceId, groupKey, fieldRef);
        keys[layer].push(fieldRef);
    }
    return keys;
}

/**
 * Form section projection for Create Lead progressive Form.
 * Ensures Placement (incl. Location) is never swallowed by Family/Children repeaters.
 */

import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import { CREATE_LEAD_GATHER_FIELDS } from "@/lib/admin/actions/createLeadPlatformGather";
import { isCreateLeadLocationRequired } from "@/lib/admin/actions/createLead/resolveCreateLeadLocationPolicy";

/** Payload keys that belong on Placement & preferences (scalar Form controls). */
export const CREATE_LEAD_PLACEMENT_PAYLOAD_KEYS = new Set([
    "location_id",
    "child_location_id",
    "child_program",
    "child_program_room_cohort_key",
    "child_schedule_type",
    "child_start_date",
]);

const ADDITIONAL_PAYLOAD_KEYS = new Set(["source", "intake_notes"]);

const PERSON_IDENTITY_KEYS = new Set(["first_name", "last_name", "email", "phone"]);

const CHILD_IDENTITY_KEYS = new Set([
    "child_first_name",
    "child_last_name",
    "child_date_of_birth",
    "child_dob",
    "child_age",
]);

function isPlacementField(field: ActionWorkspaceGatherField): boolean {
    if (CREATE_LEAD_PLACEMENT_PAYLOAD_KEYS.has(field.payload_key)) return true;
    return Boolean(field.placement_select);
}

function platformLocationField(): ActionWorkspaceGatherField {
    const fromCatalog = CREATE_LEAD_GATHER_FIELDS.find((f) => f.payload_key === "location_id");
    return (
        fromCatalog ?? {
            payload_key: "location_id",
            field_label: "Location",
            section: "context",
            section_label: "Placement & preferences",
            tier: "required",
            value_kind: "select",
            placement_select: "site",
        }
    );
}

function catalogFields(keys: readonly string[]): ActionWorkspaceGatherField[] {
    const out: ActionWorkspaceGatherField[] = [];
    for (const key of keys) {
        const catalog = CREATE_LEAD_GATHER_FIELDS.find((f) => f.payload_key === key);
        if (catalog) out.push(catalog);
    }
    return out;
}

/**
 * Project effective gather fields into progressive Form sections.
 * Family/Children hold identity (+ repeater-owned fields); Placement always
 * materializes when location/placement fields exist or Location is platform-required.
 */
export function projectCreateLeadFormSections(
    gatherFields: readonly ActionWorkspaceGatherField[],
    options?: { requiredPayloadKeys?: readonly string[]; intakeSpecRequiredKeys?: readonly string[] }
): Array<{ key: string; label: string; fields: ActionWorkspaceGatherField[] }> {
    const byKey = new Map<string, ActionWorkspaceGatherField>();
    for (const field of gatherFields) {
        byKey.set(field.payload_key, field);
    }

    const locationRequired = isCreateLeadLocationRequired({
        requiredPayloadKeys: options?.requiredPayloadKeys ?? options?.intakeSpecRequiredKeys,
    });
    if (locationRequired && !byKey.has("location_id")) {
        byKey.set("location_id", platformLocationField());
    }

    // Prefer canonical location_id; map child_location_id → location_id for Form control.
    if (byKey.has("location_id") && byKey.has("child_location_id")) {
        byKey.delete("child_location_id");
    } else if (byKey.has("child_location_id") && !byKey.has("location_id")) {
        const childLoc = byKey.get("child_location_id")!;
        byKey.set("location_id", {
            ...childLoc,
            payload_key: "location_id",
            field_label: childLoc.field_label || "Location",
            section: "context",
            section_label: "Placement & preferences",
            placement_select: childLoc.placement_select ?? "site",
            value_kind: "select",
            tier: locationRequired ? "required" : childLoc.tier,
        });
        byKey.delete("child_location_id");
    }

    const person: ActionWorkspaceGatherField[] = [];
    const child: ActionWorkspaceGatherField[] = [];
    const placement: ActionWorkspaceGatherField[] = [];
    const additional: ActionWorkspaceGatherField[] = [];

    for (const field of byKey.values()) {
        if (isPlacementField(field)) {
            placement.push({
                ...field,
                section: "context",
                section_label: "Placement & preferences",
                tier:
                    field.payload_key === "location_id" && locationRequired
                        ? "required"
                        : field.tier,
            });
            continue;
        }
        if (ADDITIONAL_PAYLOAD_KEYS.has(field.payload_key)) {
            additional.push(field);
            continue;
        }
        if (PERSON_IDENTITY_KEYS.has(field.payload_key) || field.section === "person") {
            person.push(field);
            continue;
        }
        if (CHILD_IDENTITY_KEYS.has(field.payload_key) || field.section === "child") {
            child.push(field);
            continue;
        }
        // Unknown context → Placement so blocking fields never vanish.
        placement.push({
            ...field,
            section: "context",
            section_label: "Placement & preferences",
        });
    }

    if (person.length === 0) {
        person.push(...catalogFields(["first_name", "last_name", "email", "phone"]));
    }
    if (child.length === 0) {
        child.push(...catalogFields(["child_first_name", "child_last_name"]));
    }

    const sections: Array<{ key: string; label: string; fields: ActionWorkspaceGatherField[] }> = [];
    if (person.length) {
        sections.push({ key: "person", label: "Family", fields: person });
    }
    if (child.length) {
        sections.push({ key: "child", label: "Children", fields: child });
    }
    if (placement.length > 0 || locationRequired) {
        sections.push({
            key: "context",
            label: "Placement & preferences",
            fields:
                placement.length > 0
                    ? placement
                    : [{ ...platformLocationField(), tier: "required" }],
        });
    }
    if (additional.length) {
        sections.push({ key: "additional", label: "Additional information", fields: additional });
    }

    return sections;
}

/** True when every hard-required key has a Form-visible field in projected sections. */
export function everyRequiredKeyHasFormControl(input: {
    requiredPayloadKeys: readonly string[];
    sections: Array<{ fields: readonly ActionWorkspaceGatherField[] }>;
}): { ok: true } | { ok: false; missingControls: string[] } {
    const visible = new Set(
        input.sections.flatMap((s) => s.fields.map((f) => f.payload_key))
    );
    const repeaterCovered = new Set([...PERSON_IDENTITY_KEYS, ...CHILD_IDENTITY_KEYS]);
    const missing = input.requiredPayloadKeys.filter(
        (key) => !visible.has(key) && !repeaterCovered.has(key)
    );
    if (input.requiredPayloadKeys.includes("location_id") && !visible.has("location_id")) {
        if (!missing.includes("location_id")) missing.push("location_id");
    }
    return missing.length ? { ok: false, missingControls: missing } : { ok: true };
}

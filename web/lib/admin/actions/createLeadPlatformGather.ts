import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import type { ActionIntakePasteExtractionResult } from "@/lib/lifecycle/actionIntakePasteParserTypes";
import { CREATE_LEAD_PAYLOAD_KEY_BY_RULE } from "@/lib/lifecycle/createLeadIntakeFieldMap";
import {
    isValidCreateLeadEmail,
    isValidCreateLeadPhone,
} from "@/lib/admin/actions/createLeadIntakeValidation";

/** Platform minimum to create a lead — not lifecycle Required Information. */
export const CREATE_LEAD_PLATFORM_REQUIRED_KEYS = ["first_name", "last_name", "location_id"] as const;
export const CREATE_LEAD_PLATFORM_CONTACT_KEYS = ["email", "phone"] as const;

/** Unified draft layout — required block (action-oriented, not entity tabs). */
export const CREATE_LEAD_UNIFIED_REQUIRED_KEYS = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "location_id",
] as const;

export const CREATE_LEAD_UNIFIED_OPTIONAL_KEYS = [
    "child_first_name",
    "child_last_name",
    "child_date_of_birth",
    "child_age",
    "child_start_date",
    "child_program",
    "child_program_room_cohort_key",
    "source",
    "intake_notes",
] as const;

/**
 * Field labels omit role prefixes — section context (Family / Children) already
 * establishes parent vs child. Do not reintroduce "Parent/Guardian …" here.
 */
export const CREATE_LEAD_GATHER_FIELDS: readonly ActionWorkspaceGatherField[] = [
    { payload_key: "first_name", field_label: "First Name", section: "person", section_label: "Parent / guardian", tier: "required", value_kind: "text" },
    { payload_key: "last_name", field_label: "Last Name", section: "person", section_label: "Parent / guardian", tier: "required", value_kind: "text" },
    { payload_key: "email", field_label: "Email", section: "person", section_label: "Parent / guardian", tier: "optional", value_kind: "email" },
    { payload_key: "phone", field_label: "Phone", section: "person", section_label: "Parent / guardian", tier: "optional", value_kind: "phone" },
    { payload_key: "child_first_name", field_label: "First Name", section: "child", section_label: "Child", tier: "optional", value_kind: "text" },
    { payload_key: "child_last_name", field_label: "Last Name", section: "child", section_label: "Child", tier: "optional", value_kind: "text" },
    { payload_key: "child_date_of_birth", field_label: "Date of birth", section: "child", section_label: "Child", tier: "optional", value_kind: "date" },
    { payload_key: "child_age", field_label: "Age", section: "child", section_label: "Child", tier: "optional", value_kind: "text" },
    {
        payload_key: "child_program",
        field_label: "Program interest",
        section: "child",
        section_label: "Child",
        tier: "optional",
        value_kind: "select",
        placement_select: "site_program",
    },
    {
        payload_key: "child_program_room_cohort_key",
        field_label: "Classroom",
        section: "child",
        section_label: "Child",
        tier: "optional",
        value_kind: "select",
        placement_select: "site_room",
    },
    {
        payload_key: "child_schedule_type",
        field_label: "Schedule interest",
        section: "child",
        section_label: "Child",
        tier: "optional",
        value_kind: "select",
        option_set_key: "childcare_schedule_type",
    },
    { payload_key: "child_start_date", field_label: "Desired start date", section: "child", section_label: "Child", tier: "optional", value_kind: "date" },
    {
        payload_key: "location_id",
        field_label: "Location",
        section: "context",
        section_label: "Placement & preferences",
        tier: "required",
        value_kind: "select",
        placement_select: "site",
    },
    { payload_key: "source", field_label: "Source", section: "context", section_label: "Placement & preferences", tier: "optional", value_kind: "text" },
    { payload_key: "intake_notes", field_label: "Intake notes", section: "context", section_label: "Placement & preferences", tier: "optional", value_kind: "text", multiline: true },
] as const;

const GATHER_LABEL_BY_KEY = Object.fromEntries(
    CREATE_LEAD_GATHER_FIELDS.map((f) => [f.payload_key, f.field_label])
) as Record<string, string>;

export function emptyCreateLeadGatherValues(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const field of CREATE_LEAD_GATHER_FIELDS) out[field.payload_key] = "";
    return out;
}

function gatherEntityForSection(
    section: ActionWorkspaceGatherField["section"]
): "person" | "child" | "opportunity" {
    if (section === "child") return "child";
    if (section === "context") return "opportunity";
    return "person";
}

/** Minimal parser spec — field mapping only; not lifecycle Required Information. */
export function createLeadParserSpec(departmentId: string): ActionIntakeSpec {
    const fields = CREATE_LEAD_GATHER_FIELDS.map((f) => {
        const ruleId =
            Object.entries(CREATE_LEAD_PAYLOAD_KEY_BY_RULE).find(([, key]) => key === f.payload_key)?.[0] ??
            `gather:${f.payload_key}`;
        const entity = gatherEntityForSection(f.section);
        return {
            rule_id: ruleId,
            entity,
            entity_label: f.section_label,
            field_label: f.field_label,
            tier: f.tier,
            field_key: f.payload_key,
            value_kind: f.value_kind,
            option_set_key: f.option_set_key ?? null,
            placement_select: f.placement_select ?? null,
            payload_key: f.payload_key,
            form_capture_keys: [] as readonly string[],
            validation: [],
            runtime_enforced: false,
        };
    });

    const personFields = fields.filter((f) => f.entity === "person");
    const childFields = fields.filter((f) => f.entity === "child");
    const contextFields = fields.filter((f) => f.entity === "opportunity");

    return {
        action_key: "create_lead",
        department_id: departmentId,
        process_id: null,
        operator_stage: "lead",
        mode: "hybrid",
        requirements_source: "platform",
        groups: [
            { entity: "person", entity_label: "Parent / guardian", fields: personFields },
            ...(childFields.length ? [{ entity: "child" as const, entity_label: "Child", fields: childFields }] : []),
            ...(contextFields.length
                ? [{ entity: "opportunity" as const, entity_label: "Placement & preferences", fields: contextFields }]
                : []),
        ],
        required: [
            ...personFields.filter((f) => f.tier === "required"),
            ...contextFields.filter((f) => f.tier === "required"),
        ],
        recommended: [],
        optional: [
            ...personFields.filter((f) => f.tier === "optional"),
            ...childFields,
            ...contextFields.filter((f) => f.tier === "optional"),
        ],
        constraints: [],
        copy: {
            title: "Create Lead",
            help: "Gather lead details with BOS assist. Name, contact, and location are required to create.",
        },
    };
}

export function bosSuggestionsFromExtraction(
    extraction: ActionIntakePasteExtractionResult
): Array<{
    payload_key: string;
    field_label: string;
    suggested_value: string;
    confidence: "high" | "medium" | "low";
}> {
    return extraction.fields
        .filter((f) => f.confidence === "medium" || f.confidence === "low")
        .map((f) => ({
            payload_key: f.payload_key,
            field_label: GATHER_LABEL_BY_KEY[f.payload_key] ?? f.payload_key,
            suggested_value: f.value,
            confidence: f.confidence as "medium" | "low",
        }));
}

export function validateCreateLeadPlatformMinimum(
    values: Record<string, string>
): { ok: true } | { ok: false; issues: string[] } {
    const issues: string[] = [];
    const first = (values.first_name ?? "").trim();
    const last = (values.last_name ?? "").trim();
    const email = (values.email ?? "").trim();
    const phone = (values.phone ?? "").trim();
    const location = (values.location_id ?? "").trim();

    if (!first) issues.push("First name is required.");
    if (!last) issues.push("Last name is required.");
    if (!location) issues.push("Location is required.");

    const hasEmail = email.length > 0;
    const hasPhone = phone.length > 0;
    const emailValid = hasEmail && isValidCreateLeadEmail(email);
    if (!hasEmail && !hasPhone) {
        issues.push("Email or phone is required.");
    }

    if (hasEmail && !isValidCreateLeadEmail(email)) {
        issues.push("Enter a valid email address.");
    }
    if (hasPhone && !isValidCreateLeadPhone(phone) && !emailValid) {
        issues.push("Enter a valid 10-digit phone number.");
    }

    if (issues.length) return { ok: false, issues };
    return { ok: true };
}

export function mapCreateLeadGatherToExecutePayload(values: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const field of CREATE_LEAD_GATHER_FIELDS) {
        const v = (values[field.payload_key] ?? "").trim();
        if (v) out[field.payload_key] = v;
    }
    return out;
}

export function gatherSections(): Array<{ key: string; label: string; fields: ActionWorkspaceGatherField[] }> {
    const order = ["person", "child", "context"] as const;
    return order
        .map((key) => {
            const fields = CREATE_LEAD_GATHER_FIELDS.filter((f) => f.section === key);
            if (!fields.length) return null;
            return { key, label: fields[0]!.section_label, fields: [...fields] };
        })
        .filter((s) => s != null);
}

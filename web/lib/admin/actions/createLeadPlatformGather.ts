import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import type { ActionIntakePasteExtractionResult } from "@/lib/lifecycle/actionIntakePasteParserTypes";
import { CREATE_LEAD_PAYLOAD_KEY_BY_RULE } from "@/lib/lifecycle/createLeadIntakeFieldMap";
import {
    isValidCreateLeadEmail,
    isValidCreateLeadPhone,
} from "@/lib/admin/actions/createLeadIntakeValidation";

/** Platform minimum to create a lead — not lifecycle Required Information. */
export const CREATE_LEAD_PLATFORM_REQUIRED_KEYS = ["first_name", "last_name"] as const;
export const CREATE_LEAD_PLATFORM_CONTACT_KEYS = ["email", "phone"] as const;

/** Unified draft layout — code-owned floor only. */
export const CREATE_LEAD_UNIFIED_REQUIRED_KEYS = [
    "first_name",
    "last_name",
    "email",
    "phone",
] as const;

/** @deprecated No curated optional catalog — effective intake owns optional fields. */
export const CREATE_LEAD_UNIFIED_OPTIONAL_KEYS = [] as const;

/**
 * Code-owned Create Lead floor only.
 * Failed effective-spec fetch must not masquerade as tenant configuration
 * (no Child / Location / enrollment catalog).
 */
export const CREATE_LEAD_GATHER_FIELDS: readonly ActionWorkspaceGatherField[] = [
    {
        payload_key: "first_name",
        field_label: "First Name",
        section: "person",
        section_label: "Person",
        tier: "required",
        value_kind: "text",
    },
    {
        payload_key: "last_name",
        field_label: "Last Name",
        section: "person",
        section_label: "Person",
        tier: "required",
        value_kind: "text",
    },
    {
        payload_key: "email",
        field_label: "Email",
        section: "person",
        section_label: "Person",
        tier: "optional",
        value_kind: "email",
    },
    {
        payload_key: "phone",
        field_label: "Phone",
        section: "person",
        section_label: "Person",
        tier: "optional",
        value_kind: "phone",
    },
] as const;

/** Display labels for known payload keys (mapping aid — not an intake catalog). */
export const CREATE_LEAD_KNOWN_FIELD_LABELS: Readonly<Record<string, string>> = {
    first_name: "First Name",
    last_name: "Last Name",
    email: "Email",
    phone: "Phone",
    child_first_name: "First Name",
    child_last_name: "Last Name",
    child_date_of_birth: "Date of birth",
    child_age: "Age",
    child_program: "Program interest",
    child_program_room_cohort_key: "Classroom",
    child_schedule_type: "Schedule interest",
    child_start_date: "Desired start date",
    location_id: "Location",
    source: "Source",
    intake_notes: "Intake notes",
};

const GATHER_LABEL_BY_KEY = {
    ...CREATE_LEAD_KNOWN_FIELD_LABELS,
    ...Object.fromEntries(CREATE_LEAD_GATHER_FIELDS.map((f) => [f.payload_key, f.field_label])),
} as Record<string, string>;

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

/**
 * Failed fetch / missing department fallback — code-owned floor only.
 * Never restores Child or enrollment fields as if they were tenant config.
 */
export function createLeadParserSpec(departmentId: string): ActionIntakeSpec {
    const fields = CREATE_LEAD_GATHER_FIELDS.map((f) => {
        const ruleId =
            Object.entries(CREATE_LEAD_PAYLOAD_KEY_BY_RULE).find(([, key]) => key === f.payload_key)?.[0] ??
            `gather:${f.payload_key}`;
        const entity = gatherEntityForSection(f.section);
        return {
            rule_id: ruleId,
            entity,
            entity_label: "Person",
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

    return {
        action_key: "create_lead",
        department_id: departmentId,
        process_id: null,
        operator_stage: "lead",
        mode: "hybrid",
        requirements_source: "platform",
        groups: [{ entity: "person", entity_label: "Person", fields: personFields }],
        required: personFields.filter((f) => f.tier === "required"),
        recommended: [],
        optional: personFields.filter((f) => f.tier === "optional"),
        constraints: [
            {
                kind: "at_least_one",
                rule_ids: ["person:email", "person:phone"],
                message: "Phone or email is required.",
            },
        ],
        copy: {
            title: "Create Lead",
            help: "Platform minimum only — name and email or phone. Stage configuration could not be loaded.",
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

    if (!first) issues.push("First name is required.");
    if (!last) issues.push("Last name is required.");

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
    for (const [key, raw] of Object.entries(values)) {
        const v = String(raw ?? "").trim();
        if (v) out[key] = v;
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

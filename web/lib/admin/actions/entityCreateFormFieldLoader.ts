import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import { resolveSelectFieldBinding } from "@/lib/fields/resolveSelectFieldBinding";
import {
    fallbackOptionSetKeyForInquiryChildField,
    INQUIRY_CHILD_NATIVE_FIELD_MANIFEST,
} from "@/lib/fields/inquiryChildFieldRegistry";

export type EntityCreateFormField = {
    field_key: string;
    label: string;
    field_type: string;
    is_required: boolean;
    placeholder: string | null;
    help_text: string | null;
    section_key: string | null;
    sort_order: number;
    option_set_key: string | null;
};

function normalizeRow(row: FieldDef): EntityCreateFormField {
    const fallback =
        row.entity_type === "inquiry_child" ? fallbackOptionSetKeyForInquiryChildField(row.field_key) : null;
    const selectBinding = resolveSelectFieldBinding({
        field_type: row.field_type,
        config: row.config,
        fallbackOptionSetKey: fallback,
    });
    return {
        field_key: row.field_key,
        label: (row.label ?? row.field_key).trim(),
        field_type: row.field_type,
        is_required: row.is_required === true,
        placeholder: row.placeholder,
        help_text: row.help_text,
        section_key: row.section_key,
        sort_order: row.sort_order ?? 0,
        option_set_key: selectBinding.option_set_key,
    };
}

function isFormVisible(row: FieldDef): boolean {
    return row.is_active !== false && row.is_visible_in_form !== false;
}

/** Load operator-configured create-form fields for an entity type. */
export async function fetchEntityCreateFormFields(
    entityType: string,
    fetchFn: typeof fetch = fetch,
): Promise<EntityCreateFormField[]> {
    const res = await fetchFn(
        `/api/admin/field-definitions?entity_type=${encodeURIComponent(entityType.trim())}`,
        { credentials: "include" },
    );
    const json = (await res.json().catch(() => ({}))) as {
        field_definitions?: FieldDef[];
        error?: string;
    };
    if (!res.ok) {
        throw new Error(json.error ?? `Could not load ${entityType} form fields.`);
    }
    return sortCreateFormFields((json.field_definitions ?? []).filter(isFormVisible).map(normalizeRow));
}

/*
 * CREATE-FORM ORDER FOLLOWS MEANING, NOT THE ALPHABET.
 *
 * Fields used to be ordered by `section_key` alphabetically, so "contact" and "consent" landed above
 * "identity" and an operator adding a person met Mobile, Communication preference and Notes before
 * First and Last Name. Sections are free-form per org (one org files Employer and Notes under
 * "identity", another under "contact_profile"), so the section alone cannot place a field either.
 *
 * Order: a canonical GROUP (identity → contact → address → relationship/operational → other
 * canonical sections → custom), taken from the field key when it is a known canonical field and from
 * the section otherwise; then the canonical key order inside the group; then the configured
 * `sort_order` (what an admin edits); then the label. Custom fields keep their configured order, after
 * the canonical ones. Nothing here is tenant-specific.
 */
const GROUP_IDENTITY = 0;
const GROUP_CONTACT = 1;
const GROUP_ADDRESS = 2;
const GROUP_RELATIONSHIP = 3;
const GROUP_OTHER_CANONICAL = 4;
const GROUP_CUSTOM = 5;

/** Canonical fields in their intended order; the index is the order within the group. */
const CANONICAL_KEY_GROUPS: ReadonlyArray<readonly [number, readonly string[]]> = [
    [GROUP_IDENTITY, ["first_name", "last_name", "preferred_name", "full_name", "date_of_birth", "dob", "gender"]],
    [GROUP_CONTACT, ["phone", "mobile", "mobile_phone", "email", "communication_preference", "preferred_contact_method"]],
    [GROUP_ADDRESS, ["address_line1", "address_line2", "city", "state", "postal_code", "country"]],
    [
        GROUP_RELATIONSHIP,
        ["relationship", "employer", "contact_notes", "notes", "authorized_pickup_notes", "emergency_contact_notes"],
    ],
];
const CANONICAL_KEY_RANK = new Map<string, { group: number; index: number }>();
for (const [group, keys] of CANONICAL_KEY_GROUPS) keys.forEach((key, index) => CANONICAL_KEY_RANK.set(key, { group, index }));

const SECTION_GROUP: Record<string, number> = {
    identity: GROUP_IDENTITY,
    basic: GROUP_IDENTITY,
    profile: GROUP_IDENTITY,
    contact: GROUP_CONTACT,
    contact_profile: GROUP_CONTACT,
    address: GROUP_ADDRESS,
    relationship: GROUP_RELATIONSHIP,
    emergency: GROUP_RELATIONSHIP,
    operational: GROUP_RELATIONSHIP,
    child_profile: GROUP_OTHER_CANONICAL,
    medical: GROUP_OTHER_CANONICAL,
    consent: GROUP_OTHER_CANONICAL,
};

function createFormRank(field: EntityCreateFormField): { group: number; index: number } {
    const canonical = CANONICAL_KEY_RANK.get(field.field_key);
    if (canonical) return canonical;
    const section = (field.section_key ?? "").trim().toLowerCase();
    return { group: SECTION_GROUP[section] ?? GROUP_CUSTOM, index: Number.MAX_SAFE_INTEGER };
}

export function sortCreateFormFields(fields: EntityCreateFormField[]): EntityCreateFormField[] {
    return [...fields].sort((a, b) => {
        const ra = createFormRank(a);
        const rb = createFormRank(b);
        if (ra.group !== rb.group) return ra.group - rb.group;
        if (ra.index !== rb.index) return ra.index - rb.index;
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.label.localeCompare(b.label);
    });
}

/** Merge API form fields with native inquiry_child manifest when API is sparse. */
export function mergeInquiryChildCreateFormFields(apiFields: EntityCreateFormField[]): EntityCreateFormField[] {
    if (apiFields.length > 0) return apiFields;
    return INQUIRY_CHILD_NATIVE_FIELD_MANIFEST.filter((row) => row.is_visible_in_form).map((row) => {
        const selectBinding = resolveSelectFieldBinding({
            field_type: row.field_type,
            config: null,
            fallbackOptionSetKey: fallbackOptionSetKeyForInquiryChildField(row.field_key),
        });
        return {
            field_key: row.field_key,
            label: row.label,
            field_type: row.field_type,
            is_required: false,
            placeholder: null,
            help_text: null,
            section_key: row.section_key,
            sort_order: row.sort_order,
            option_set_key: selectBinding.option_set_key,
        };
    });
}

/** Default person create fields when org has no configured form surface. */
export const PERSON_CREATE_FORM_FALLBACK: EntityCreateFormField[] = [
    {
        field_key: "first_name",
        label: "First name",
        field_type: "text",
        is_required: true,
        placeholder: null,
        help_text: null,
        section_key: "identity",
        sort_order: 10,
        option_set_key: null,
    },
    {
        field_key: "last_name",
        label: "Last name",
        field_type: "text",
        is_required: true,
        placeholder: null,
        help_text: null,
        section_key: "identity",
        sort_order: 20,
        option_set_key: null,
    },
    {
        field_key: "email",
        label: "Email",
        field_type: "text",
        is_required: false,
        placeholder: null,
        help_text: null,
        section_key: "contact",
        sort_order: 30,
        option_set_key: null,
    },
    {
        field_key: "phone",
        label: "Phone",
        field_type: "phone",
        is_required: false,
        placeholder: null,
        help_text: null,
        section_key: "contact",
        sort_order: 40,
        option_set_key: null,
    },
];

/** Default durable child identity fields for add-child create flow. */
export const CHILD_IDENTITY_CREATE_FORM_FALLBACK: EntityCreateFormField[] = [
    {
        field_key: "first_name",
        label: "First name",
        field_type: "text",
        is_required: true,
        placeholder: null,
        help_text: null,
        section_key: "identity",
        sort_order: 10,
        option_set_key: null,
    },
    {
        field_key: "last_name",
        label: "Last name",
        field_type: "text",
        is_required: true,
        placeholder: null,
        help_text: null,
        section_key: "identity",
        sort_order: 20,
        option_set_key: null,
    },
    {
        field_key: "date_of_birth",
        label: "Date of birth",
        field_type: "date",
        is_required: false,
        placeholder: null,
        help_text: "Required when age group is not provided.",
        section_key: "identity",
        sort_order: 30,
        option_set_key: null,
    },
];

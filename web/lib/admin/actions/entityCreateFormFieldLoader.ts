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
    return (json.field_definitions ?? [])
        .filter(isFormVisible)
        .map(normalizeRow)
        .sort((a, b) => {
            const sk = (a.section_key ?? "").localeCompare(b.section_key ?? "");
            if (sk !== 0) return sk;
            return a.sort_order - b.sort_order;
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

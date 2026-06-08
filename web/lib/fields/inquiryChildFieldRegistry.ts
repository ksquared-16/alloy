/**
 * Inquiry Child — configurable field surface backed by `opportunity_customer_members`.
 * Operator-facing entity_type: `inquiry_child` (never expose raw table names in UX).
 */

import { CUSTOMER_MEMBER_ENTITY_TYPE } from "./customerMemberFieldRegistry";

export const INQUIRY_CHILD_ENTITY_TYPE = "inquiry_child" as const;

export type InquiryChildEntityType = typeof INQUIRY_CHILD_ENTITY_TYPE;

/** Settings → Fields / field-definitions API allowlist. */
export const FIELD_DEFINITION_ENTITY_TYPES = [
    "person",
    "customer",
    "job",
    "opportunity",
    "vendor",
    "schedule",
    "location",
    CUSTOMER_MEMBER_ENTITY_TYPE,
    INQUIRY_CHILD_ENTITY_TYPE,
] as const;

export type FieldDefinitionEntityType = (typeof FIELD_DEFINITION_ENTITY_TYPES)[number];

export function isFieldDefinitionEntityType(value: string): value is FieldDefinitionEntityType {
    return (FIELD_DEFINITION_ENTITY_TYPES as readonly string[]).includes(value.trim().toLowerCase());
}

/** Native columns on opportunity_customer_members exposed for configuration. */
export const INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS = [
    "desired_start_date",
    "location_id",
    "program_room_cohort_key",
    "desired_program_type",
    "desired_schedule_type",
    "outcome_status_key",
    "notes",
] as const;

export type InquiryChildNativeOcmFieldKey = (typeof INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS)[number];

/** Default option_set_key for native inquiry_child select fields (fallback when field_definitions.config absent). */
export const INQUIRY_CHILD_NATIVE_OPTION_SET_KEYS: Partial<
    Record<InquiryChildNativeOcmFieldKey, string>
> = {
    desired_program_type: "childcare_program_type",
    desired_schedule_type: "childcare_schedule_type",
};

export function fallbackOptionSetKeyForInquiryChildField(fieldKey: string): string | null {
    const k = fieldKey.trim() as InquiryChildNativeOcmFieldKey;
    return INQUIRY_CHILD_NATIVE_OPTION_SET_KEYS[k] ?? null;
}

export type InquiryChildNativeFieldManifestRow = {
    field_key: InquiryChildNativeOcmFieldKey;
    field_type: "date" | "text" | "select";
    label: string;
    section_key: string;
    sort_order: number;
    is_visible_in_drawer: boolean;
    is_visible_in_form: boolean;
    is_visible_in_table: boolean;
};

export const INQUIRY_CHILD_NATIVE_FIELD_MANIFEST: InquiryChildNativeFieldManifestRow[] = [
    {
        field_key: "desired_start_date",
        field_type: "date",
        label: "Desired start",
        section_key: "inquiry_participation",
        sort_order: 10,
        is_visible_in_drawer: true,
        is_visible_in_form: true,
        is_visible_in_table: false,
    },
    {
        field_key: "location_id",
        field_type: "select",
        label: "Location",
        section_key: "inquiry_participation",
        sort_order: 15,
        is_visible_in_drawer: true,
        is_visible_in_form: true,
        is_visible_in_table: false,
    },
    {
        field_key: "desired_program_type",
        field_type: "select",
        label: "Program",
        section_key: "inquiry_participation",
        sort_order: 18,
        is_visible_in_drawer: true,
        is_visible_in_form: true,
        is_visible_in_table: false,
    },
    {
        field_key: "program_room_cohort_key",
        field_type: "select",
        label: "Room",
        section_key: "inquiry_participation",
        sort_order: 22,
        is_visible_in_drawer: true,
        is_visible_in_form: true,
        is_visible_in_table: false,
    },
    {
        field_key: "desired_schedule_type",
        field_type: "select",
        label: "Schedule",
        section_key: "inquiry_participation",
        sort_order: 28,
        is_visible_in_drawer: true,
        is_visible_in_form: true,
        is_visible_in_table: false,
    },
    {
        field_key: "outcome_status_key",
        field_type: "select",
        label: "Status",
        section_key: "inquiry_participation",
        sort_order: 40,
        is_visible_in_drawer: true,
        is_visible_in_form: true,
        is_visible_in_table: false,
    },
    {
        field_key: "notes",
        field_type: "text",
        label: "Notes",
        section_key: "inquiry_participation",
        sort_order: 50,
        is_visible_in_drawer: true,
        is_visible_in_form: true,
        is_visible_in_table: false,
    },
];

const NATIVE_KEY_SET = new Set<string>(INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS);

export function isInquiryChildNativeFieldKey(fieldKey: string): fieldKey is InquiryChildNativeOcmFieldKey {
    return NATIVE_KEY_SET.has(fieldKey.trim());
}

export function isReservedInquiryChildFieldKey(fieldKey: string): boolean {
    return isInquiryChildNativeFieldKey(fieldKey);
}

/** Keys writable via PATCH /api/admin/opportunity-customer-members/:id (native OCM columns). */
export const INQUIRY_CHILD_NATIVE_OCM_PATCH_KEYS = [...INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS] as const;

export type InquiryChildFieldDefLike = {
    field_key: string;
    field_type: string;
    label: string | null;
    is_active?: boolean;
    is_visible_in_drawer?: boolean;
    is_system?: boolean;
    sort_order?: number;
};

/** Drawer column for desired_start_date when configured visible. */
export function inquiryChildDrawerShowsDesiredStart(defs: InquiryChildFieldDefLike[]): boolean {
    const row = defs.find((d) => d.field_key === "desired_start_date" && d.is_active !== false);
    if (!row) return true;
    return row.is_visible_in_drawer !== false;
}

export function labelForInquiryChildFieldKey(defs: InquiryChildFieldDefLike[], fieldKey: string, fallback: string): string {
    const row = defs.find((d) => d.field_key === fieldKey);
    const label = row?.label?.trim();
    return label || fallback;
}

export type InquiryChildDesiredStartDisplay = {
    /** Value shown in the date input (YYYY-MM-DD). */
    inputValue: string;
    /** True when OCM has no value and opportunity-level date is shown. */
    inherited: boolean;
    /** Stored on OCM (null when inheriting). */
    storedValue: string | null;
};

export function resolveInquiryChildDesiredStartDisplay(
    storedDesiredStart: string | null | undefined,
    opportunityDesiredStart: string | null | undefined
): InquiryChildDesiredStartDisplay {
    const stored = normalizeIsoDateOnly(storedDesiredStart);
    if (stored) {
        return { inputValue: stored, inherited: false, storedValue: stored };
    }
    const inherited = normalizeIsoDateOnly(opportunityDesiredStart);
    return {
        inputValue: inherited ?? "",
        inherited: !!inherited,
        storedValue: null,
    };
}

export function normalizeIsoDateOnly(value: string | null | undefined): string | null {
    if (value == null) return null;
    const s = String(value).trim();
    if (!s) return null;
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
    return m ? m[1]! : null;
}

/** Split PATCH body into native OCM columns vs custom field_values keys. */
export function partitionInquiryChildPatchBody(body: Record<string, unknown>): {
    native: Record<string, unknown>;
    custom: Record<string, unknown>;
} {
    const native: Record<string, unknown> = {};
    const custom: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
        if (k.startsWith("_")) continue;
        if (isInquiryChildNativeFieldKey(k)) native[k] = v;
        else custom[k] = v;
    }
    return { native, custom };
}

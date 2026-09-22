/**
 * The child's own profile fields, projected for Forms.
 *
 * ## Why this is not `+ "customer_member"` in the lifecycle loader
 *
 * `loadOrgFieldDefinitionsForLifecycle` reads four entity types and is consumed by the Business
 * Process requirement authoring routes, `persistLifecycleStageFieldRules`, Create Lead eligibility,
 * the action intake spec, AND `validatePublicSubmissionLifecycleRequirements` — which decides
 * whether a family's submission is accepted at runtime. Its entity vocabulary is
 * `LifecycleRequirementEntityKey = person | child | opportunity | customer`, and
 * `lifecycleEntityFromFieldDefinitionEntityType` returns null for anything else, so widening the
 * table read alone would change nothing there while widening the requirement contract would change
 * what every one of those surfaces requires.
 *
 * That constant owns the BUSINESS PROCESS REQUIREMENT CONTRACT. Forms needs something different and
 * larger: everything a form may legitimately capture. So Forms projects the child profile itself,
 * from the same canonical authority, and leaves the lifecycle contract alone.
 *
 * ## Where the truth comes from
 *
 * `CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST` is the platform's own declaration of the durable child
 * profile — key, type, label, section, sensitivity, and the vocabulary a choice field is backed by.
 * Nothing here restates it, and nothing here names a field. An entry is offered only when the org's
 * `field_definitions` actually carries it, so a tenant that has not seeded a field is not offered it.
 *
 * `person` holds guardians; `customer_member` holds the child. They are distinct canonical owners
 * and this never aliases one to the other.
 */

import {
    CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST,
    CUSTOMER_MEMBER_ENTITY_TYPE,
} from "@/lib/fields/customerMemberFieldRegistry";

export type ChildProfileFieldProjection = {
    /** Canonical field key on `customer_member`. */
    field_key: string;
    label: string;
    /** The Data Model's declared type, as `field_definitions` records it. */
    field_type: string;
    /** The organization vocabulary this field is declared over, when it has one. */
    option_set_key: string | null;
    /** True when the field carries its own inline list rather than a shared vocabulary. */
    has_inline_options: boolean;
    /** Health-classified facts carry different access and retention expectations. */
    sensitivity: "standard" | "health";
};

/** One org `field_definitions` row, as the Forms reader needs it. */
export type ChildProfileFieldDefinitionRow = {
    field_key: string;
    label?: string | null;
    field_type?: string | null;
    config?: Record<string, unknown> | null;
    is_active?: boolean;
};

function optionSetKeyOf(config: Record<string, unknown> | null | undefined): string | null {
    const key = (config as { option_set_key?: unknown } | null | undefined)?.option_set_key;
    return typeof key === "string" && key.trim() ? key.trim() : null;
}

function hasInlineOptionsIn(config: Record<string, unknown> | null | undefined): boolean {
    const options = (config as { options?: unknown } | null | undefined)?.options;
    return Array.isArray(options) && options.length > 0;
}

export const CHILD_PROFILE_ENTITY_TYPE = CUSTOMER_MEMBER_ENTITY_TYPE;

/**
 * The child-profile fields this organization actually has, in manifest order.
 *
 * The manifest decides WHICH fields belong to the child profile; the org's own rows decide what
 * each one currently IS. Where a row omits a type or a vocabulary, the manifest's declaration
 * stands in — a tenant that has not customised a seeded field still gets the platform's answer
 * rather than a guess made from the field key's spelling.
 */
export function projectChildProfileFields(
    rows: readonly ChildProfileFieldDefinitionRow[] | null | undefined,
): ChildProfileFieldProjection[] {
    const byKey = new Map<string, ChildProfileFieldDefinitionRow>();
    for (const row of rows ?? []) {
        const key = String(row.field_key ?? "").trim();
        if (!key || row.is_active === false) continue;
        if (!byKey.has(key)) byKey.set(key, row);
    }

    const out: ChildProfileFieldProjection[] = [];
    for (const entry of CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST) {
        const row = byKey.get(entry.field_key);
        if (!row) continue;
        const manifestOptionSet = optionSetKeyOf(entry.config);
        out.push({
            field_key: entry.field_key,
            label: String(row.label ?? "").trim() || entry.label,
            field_type: String(row.field_type ?? "").trim() || entry.field_type,
            option_set_key: optionSetKeyOf(row.config) ?? manifestOptionSet,
            has_inline_options: hasInlineOptionsIn(row.config),
            sensitivity: entry.sensitivity ?? "standard",
        });
    }
    return out;
}

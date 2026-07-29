/**
 * Resolve the runtime edit control for Focus Panel identity fields from the
 * canonical field type (platform manifest / tenant field_definitions / layout control).
 * Custom select fields (e.g. child.gender → person_gender) must not degrade to textboxes.
 */

import { getOptionSetKeyFromConfig, isSelectLikeFieldType } from "@/lib/admin/fieldDefinitionOptionSetConfig";
import {
    CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST,
    isCustomerMemberConfigFieldKey,
} from "@/lib/fields/customerMemberFieldRegistry";
import { resolveSelectFieldBinding } from "@/lib/fields/resolveSelectFieldBinding";
import { resolveLayoutRuntimeFieldControl } from "@/lib/layout/runtime/resolveLayoutRuntimeFieldControl";
import { resolveIdentityFieldRuntimeBinding } from "@/lib/adminV2/runtime/focusPanel/identity/identityCanonicalFieldMetadata";
import { inputTypeForIdentityFieldRef } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldMutationBinding";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export type IdentityFieldEditControl =
    | { kind: "text"; inputType: "text" | "email" | "tel" }
    | { kind: "date" }
    | { kind: "select"; optionSetKey: string }
    /** Site-scoped program categories (`location_program_categories.id`). */
    | {
          kind: "placement_select";
          placement: "program" | "site";
          siteLocationId?: string | null;
          programCategoryId?: string | null;
      };

const PROGRAM_PLACEMENT_SELECT_REFS = new Set([
    "inquiry_child.program",
    "inquiry_child.program_category_id",
    "child.program",
]);

const SITE_PLACEMENT_SELECT_REFS = new Set([
    "inquiry_child.location_id",
    "child.location",
]);

function childConfigKeyFromRef(fieldRef: string): string | null {
    const trimmed = fieldRef.trim();
    if (!trimmed.startsWith("child.")) return null;
    return trimmed.slice("child.".length) || null;
}

function tenantDefForRef(
    fieldRef: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): TenantFieldDefinitionRow | undefined {
    if (!tenantFieldDefinitions?.length) return undefined;
    const trimmed = fieldRef.trim();
    const suffix = trimmed.includes(".") ? trimmed.slice(trimmed.indexOf(".") + 1) : trimmed;
    return tenantFieldDefinitions.find((row) => {
        const key = String(row.field_key ?? "").trim();
        const ref = String((row as { refKey?: string }).refKey ?? "").trim();
        return key === suffix || key === trimmed || ref === trimmed;
    });
}

/** Resolve identity inline-edit control from published field type + option set. */
export function resolveIdentityFieldEditControl(
    fieldRef: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): IdentityFieldEditControl {
    const trimmed = fieldRef.trim();
    if (!trimmed) return { kind: "text", inputType: "text" };

    if (SITE_PLACEMENT_SELECT_REFS.has(trimmed)) {
        return { kind: "placement_select", placement: "site" };
    }

    if (PROGRAM_PLACEMENT_SELECT_REFS.has(trimmed)) {
        return { kind: "placement_select", placement: "program" };
    }

    // Platform child-profile config (FC-CM-1) — gender is select / person_gender.
    const childKey = childConfigKeyFromRef(trimmed);
    if (childKey && isCustomerMemberConfigFieldKey(childKey)) {
        const manifest = CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.find((row) => row.field_key === childKey);
        if (manifest && isSelectLikeFieldType(manifest.field_type)) {
            const optionSetKey = getOptionSetKeyFromConfig(manifest.config ?? null);
            if (optionSetKey) return { kind: "select", optionSetKey };
        }
    }

    const tenant = tenantDefForRef(trimmed, tenantFieldDefinitions);
    const layoutControl = resolveLayoutRuntimeFieldControl(trimmed, tenant ?? null);
    if (layoutControl.controlType === "date") return { kind: "date" };
    if (layoutControl.controlType === "select" && layoutControl.option_set_key) {
        return { kind: "select", optionSetKey: layoutControl.option_set_key };
    }

    if (tenant && isSelectLikeFieldType(tenant.field_type)) {
        const binding = resolveSelectFieldBinding({
            field_type: tenant.field_type,
            config: tenant.config ?? null,
        });
        if (binding.isSelect && binding.option_set_key) {
            return { kind: "select", optionSetKey: binding.option_set_key };
        }
    }

    const runtime = resolveIdentityFieldRuntimeBinding(trimmed, { tenantFieldDefinitions });
    if (
        (runtime.valueKind === "select" || runtime.valueKind === "multiselect" || runtime.valueKind === "choice")
        && runtime.optionSetRef
    ) {
        // Prefer tenant/manifest option set; optionSetRef on provider is often the field ref itself.
        const fromTenant = getOptionSetKeyFromConfig(tenant?.config ?? null);
        if (fromTenant) return { kind: "select", optionSetKey: fromTenant };
    }

    const inputType = inputTypeForIdentityFieldRef(trimmed);
    if (inputType === "date") return { kind: "date" };
    if (inputType === "email" || inputType === "tel") {
        return { kind: "text", inputType };
    }
    return { kind: "text", inputType: "text" };
}

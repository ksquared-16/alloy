/**
 * Opportunity drawer visual editor — operator-facing field labels and entity-first picker groups.
 * Settings-only; does not change runtime resolution.
 */

import {
    applyChildcareCatalogLabel,
    isChildcareCatalogRefKey,
    organizeChildcarePickerGroups,
} from "@/lib/layout/childcareLayoutFieldCatalog";
import {
    finalizeCatalogGroupsForPicker,
    GLOBAL_WIDGET_CATALOG,
    inquiryChildPickerFieldLabel,
    parseRefKey,
    type LayoutCatalogField,
    type LayoutCatalogGroup,
} from "@/lib/layout/fieldCatalog";
import type { LayoutItem } from "@/lib/layout/layoutV2";
import type { LayoutEditorRelatedListEntityType } from "@/lib/layout/layoutEditorRelatedListConfig";
import {
    isRefKeyPickerEligible,
    manifestEntryForRefKey,
} from "@/lib/layout/platformFieldResolutionManifest";
import { OPPORTUNITY_DRAWER_SURFACE } from "@/lib/layout/surfaceLayoutRegistry";

const RELATED_LIST_LABELS: Record<string, string> = {
    children: "Children list",
    contact_block: "Contact block",
};

const FIELD_GROUP_LABELS: Record<string, string> = {
    contact_block: "Primary contact",
};

function humanizeToken(token: string): string {
    return token
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

/** Operator-facing label for a layout field refKey — never returns raw dotted keys when manifest exists. */
export function resolveLayoutEditorFieldRefLabel(refKey: string): string {
    const trimmed = refKey.trim();
    if (!trimmed) return "Field";

    const catalog = applyChildcareCatalogLabel({ refKey: trimmed, fieldLabel: trimmed });
    if (catalog.fieldLabel && catalog.fieldLabel !== trimmed) return catalog.fieldLabel;

    const manifest = manifestEntryForRefKey(trimmed);
    if (manifest?.label) {
        const parsed = parseRefKey(trimmed);
        if (parsed.entityKey === "inquiry_child") {
            return inquiryChildPickerFieldLabel(parsed.fieldKey, manifest.label);
        }
        return manifest.label;
    }

    const parsed = parseRefKey(trimmed);
    if (parsed.entityKey === "inquiry_child") {
        return inquiryChildPickerFieldLabel(parsed.fieldKey, humanizeToken(parsed.fieldKey));
    }

    const dot = trimmed.lastIndexOf(".");
    if (dot > 0) return humanizeToken(trimmed.slice(dot + 1));
    return humanizeToken(trimmed);
}

/** Operator-facing label for any top-level layout item in the visual editor field list. */
export function resolveLayoutEditorItemDisplayLabel(item: LayoutItem): string {
    if (item.label?.trim()) return item.label.trim();

    if (item.kind === "field") {
        return resolveLayoutEditorFieldRefLabel(item.refKey);
    }

    if (item.kind === "widget_placeholder") {
        const widget = GLOBAL_WIDGET_CATALOG.find((w) => w.widgetKey === item.refKey);
        return widget?.label ?? humanizeToken(item.refKey);
    }

    if (item.kind === "related_list") {
        return RELATED_LIST_LABELS[item.refKey] ?? humanizeToken(item.refKey);
    }

    if (item.kind === "field_group") {
        return FIELD_GROUP_LABELS[item.refKey] ?? item.label?.trim() ?? "Field group";
    }

    return humanizeToken(item.refKey);
}

function refKeyToCatalogField(refKey: string): LayoutCatalogField | null {
    if (!isRefKeyPickerEligible(refKey, "opportunities")) return null;
    const dot = refKey.indexOf(".");
    const entityKey = dot === -1 ? "opportunity" : refKey.slice(0, dot);
    const fieldKey = dot === -1 ? refKey : refKey.slice(dot + 1);
    const manifest = manifestEntryForRefKey(refKey);
    const label = manifest?.label ?? resolveLayoutEditorFieldRefLabel(refKey);
    return {
        entityKey,
        entityLabel: "",
        fieldKey,
        fieldLabel: label,
        fieldType: manifest?.fieldType ?? "text",
        refKey,
    };
}

import { applyDrawerContextPickerLabels } from "@/lib/layout/drawerContextPickerGroups";
import { contactRolePickerRefKeys, type LayoutEditorContactRole } from "@/lib/layout/layoutEditorContactRoles";

function contactRolePickerRefKeysForOpportunity(role: LayoutEditorContactRole): string[] {
    return [
        ...contactRolePickerRefKeys(role),
        ...(role === "primary" ? (["person.is_primary_contact"] as const) : []),
    ];
}

/** Entity-first field picker groups constrained to opportunity drawer allowed refKeys. */
const CONTACT_ROLE_PICKER_GROUP_DEFS = [
    {
        entityKey: "contact_primary",
        entityLabel: "Primary Contact",
        groupDescription: "Uses the linked primary contact on this lead",
        refKeys: contactRolePickerRefKeysForOpportunity("primary"),
    },
    {
        entityKey: "contact_parents",
        entityLabel: "Additional Parents",
        groupDescription: "Parent/guardian relationships excluding the primary contact",
        refKeys: contactRolePickerRefKeys("parents"),
    },
    {
        entityKey: "contact_billing",
        entityLabel: "Billing/Payer Contact",
        groupDescription: "Uses the linked billing / payer contact on this lead",
        refKeys: contactRolePickerRefKeys("billing"),
    },
    {
        entityKey: "contact_emergency",
        entityLabel: "Emergency Contact",
        groupDescription: "Uses the linked emergency contact on this lead",
        refKeys: contactRolePickerRefKeys("emergency"),
    },
] as const;

function splitPersonContactRolePickerGroups(groups: LayoutCatalogGroup[]): LayoutCatalogGroup[] {
    const output: LayoutCatalogGroup[] = [];
    for (const group of groups) {
        if (group.entityKey !== "person") {
            output.push(group);
            continue;
        }
        const byRef = new Map(group.fields.map((field) => [field.refKey, field]));
        const consumed = new Set<string>();
        for (const roleGroup of CONTACT_ROLE_PICKER_GROUP_DEFS) {
            const fields = roleGroup.refKeys
                .map((refKey) => byRef.get(refKey))
                .filter((field): field is NonNullable<typeof field> => Boolean(field));
            if (fields.length === 0) continue;
            for (const field of fields) consumed.add(field.refKey);
            output.push({
                entityKey: roleGroup.entityKey,
                entityLabel: roleGroup.entityLabel,
                groupDescription: roleGroup.groupDescription,
                fields,
            });
        }
        const remaining = group.fields.filter((field) => !consumed.has(field.refKey));
        if (remaining.length > 0) {
            output.push({
                ...group,
                entityLabel: "Contact (other fields)",
                groupDescription: undefined,
                fields: remaining,
            });
        }
    }
    return output;
}

export function buildOpportunityDrawerEditorFieldPickerGroups(): LayoutCatalogGroup[] {
    const fields: LayoutCatalogField[] = [];
    for (const refKey of OPPORTUNITY_DRAWER_SURFACE.allowedFieldRefKeys) {
        if (refKey === "_template" || refKey.startsWith("_")) continue;
        if (!isChildcareCatalogRefKey(refKey, "opportunities") && !manifestEntryForRefKey(refKey)) continue;
        const field = refKeyToCatalogField(refKey);
        if (field) fields.push(field);
    }

    const groups = organizeChildcarePickerGroups(fields, "opportunities", {
        supplementFromStarterCatalog: false,
    }) as LayoutCatalogGroup[];
    return finalizeCatalogGroupsForPicker(
        applyDrawerContextPickerLabels(splitPersonContactRolePickerGroups(groups), "opportunity_drawer"),
    );
}

/** Entity namespace keys shown in related-list field pickers per list entity type. */
export const RELATED_LIST_FIELD_GROUP_ENTITY_KEYS: Record<
    LayoutEditorRelatedListEntityType,
    readonly string[]
> = {
    children: ["child", "inquiry_child"],
    contacts: ["person"],
    household_members: ["customer", "person", "location"],
    opportunities: ["opportunity"],
};

/** Field picker groups for related-list row config — defaults to the selected list entity. */
export function buildRelatedListFieldPickerGroups(
    entityType: LayoutEditorRelatedListEntityType,
    options?: { includeAllEntities?: boolean },
): LayoutCatalogGroup[] {
    const all = buildOpportunityDrawerEditorFieldPickerGroups();
    if (options?.includeAllEntities) return all;
    const allowed = new Set(RELATED_LIST_FIELD_GROUP_ENTITY_KEYS[entityType]);
    return all.filter((group) => allowed.has(group.entityKey));
}

/** Resolve entity label + field label for right-panel metadata display. */
export function resolveLayoutEditorFieldHierarchy(refKey: string): { entityLabel: string; fieldLabel: string } {
    const dot = refKey.indexOf(".");
    const entityKey = dot === -1 ? "opportunity" : refKey.slice(0, dot);
    const groups = buildOpportunityDrawerEditorFieldPickerGroups();
    const group = groups.find((g) => g.entityKey === entityKey);
    const fieldLabel = resolveLayoutEditorFieldRefLabel(refKey);
    return {
        entityLabel: group?.entityLabel ?? humanizeToken(entityKey),
        fieldLabel,
    };
}

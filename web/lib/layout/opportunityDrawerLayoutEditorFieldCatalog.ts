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

/** Entity-first field picker groups constrained to opportunity drawer allowed refKeys. */
export function buildOpportunityDrawerEditorFieldPickerGroups(): LayoutCatalogGroup[] {
    const fields: LayoutCatalogField[] = [];
    for (const refKey of OPPORTUNITY_DRAWER_SURFACE.allowedFieldRefKeys) {
        if (refKey === "_template" || refKey.startsWith("_")) continue;
        if (!isChildcareCatalogRefKey(refKey, "opportunities") && !manifestEntryForRefKey(refKey)) continue;
        const field = refKeyToCatalogField(refKey);
        if (field) fields.push(field);
    }

    const groups = organizeChildcarePickerGroups(fields, "opportunities") as LayoutCatalogGroup[];
    return finalizeCatalogGroupsForPicker(groups);
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

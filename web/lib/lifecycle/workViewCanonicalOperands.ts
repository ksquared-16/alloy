/**
 * Work View condition operands — operational predicates + canonical provider operands.
 */

import { resolveCanonicalConditionOperands, type CanonicalConditionOperand } from "@/lib/fields/canonicalConditionOperands";
import { workViewOperatorsForProvider } from "@/lib/fields/canonicalComparisonCapabilities";
import { resolveCanonicalProviderForConsumer } from "@/lib/fields/consumerCanonicalProviderAssembly";
import { readInlineOptionsFromFieldConfig } from "@/lib/fields/fieldDefinitionInlineOptions";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import {
    canonicalWorkViewConditionFieldKey,
    DEFAULT_WORK_VIEW_CONDITION_FIELD_KEY,
    getWorkViewConditionField,
    LEGACY_FIELD_KEY_ALIASES,
    type WorkViewConditionFieldDef,
    type WorkViewConditionFieldGroup,
    type WorkViewConditionFieldGroupSpec,
    type WorkViewConditionOptionSource,
    type WorkViewConditionValueKind,
    WORK_VIEW_CONDITION_FIELD_DEFS,
} from "@/lib/lifecycle/workViewConditionFieldRegistry";
import type { WorkViewFilterOperatorV1 } from "@/lib/lifecycle/workViewsConfigV1";

const GROUP_ORDER: readonly WorkViewConditionFieldGroup[] = ["lead", "child", "household", "operational", "custom"];

const GROUP_LABELS: Record<WorkViewConditionFieldGroup, string> = {
    lead: "Lead",
    child: "Child",
    household: "Household",
    operational: "Operational",
    custom: "Custom fields",
};

const OPERATIONAL_KEYS = new Set(WORK_VIEW_CONDITION_FIELD_DEFS.map((def) => def.key));

function workViewGroupForOperand(operand: CanonicalConditionOperand): WorkViewConditionFieldGroup {
    const namespace = operand.ownerEntity?.trim().toLowerCase() ?? "";
    if (namespace === "opportunity") return "lead";
    if (namespace === "child" || namespace === "inquiry_child" || namespace === "candidate") return "child";
    if (namespace === "customer" || namespace === "person" || namespace === "household") return "household";
    if (/queue_row|work|attention|activity/.test(namespace)) return "operational";
    return "custom";
}

function canonicalOperandToWorkViewDef(
    operand: CanonicalConditionOperand,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): WorkViewConditionFieldDef {
    const provider = resolveCanonicalProviderForConsumer(operand.refKey, "business_process", {
        tenantFieldDefinitions,
    });
    const valueKind = operand.valueKind as WorkViewConditionValueKind;
    const optionSource: WorkViewConditionOptionSource =
        valueKind === "choice_select"
            ? operand.optionSetRef
                ? { kind: "canonical_choice", optionSetRef: operand.optionSetRef }
                : { kind: "inline_choice", refKey: operand.refKey }
            : valueKind === "date_preset"
                ? { kind: "date" }
                : valueKind === "boolean"
                    ? { kind: "boolean" }
                    : { kind: "none" };

    return {
        key: operand.refKey,
        label: operand.label,
        group: workViewGroupForOperand(operand),
        subject: operand.ownerEntity === "child" ? "child" : operand.ownerEntity === "opportunity" ? "opportunity" : "record",
        valueKind,
        optionSource,
        operators: provider ? workViewOperatorsForProvider(provider) : (["equals", "not_equals", "is_any_of", "is_empty", "is_not_empty"] as const),
        runtimeField: operand.refKey,
        runtimeSupported: operand.runtimeSupported,
        source: "canonical",
    };
}

export function resolveWorkViewCanonicalOperands(
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): CanonicalConditionOperand[] {
    return resolveCanonicalConditionOperands({
        consumer: "work_view",
        filter: { tenantFieldDefinitions },
    }).filter((operand) => !OPERATIONAL_KEYS.has(operand.refKey));
}

export function resolveWorkViewConditionFieldDefs(
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): WorkViewConditionFieldDef[] {
    const operational = WORK_VIEW_CONDITION_FIELD_DEFS.filter((def) => def.runtimeSupported);
    const canonical = resolveWorkViewCanonicalOperands(tenantFieldDefinitions).map((operand) =>
        canonicalOperandToWorkViewDef(operand, tenantFieldDefinitions),
    );
    const seen = new Set<string>();
    const merged: WorkViewConditionFieldDef[] = [];
    for (const def of [...operational, ...canonical]) {
        if (seen.has(def.key)) continue;
        seen.add(def.key);
        merged.push(def);
    }
    return merged;
}

export function workViewConditionFieldGroups(
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): WorkViewConditionFieldGroupSpec[] {
    const defs = resolveWorkViewConditionFieldDefs(tenantFieldDefinitions);
    return GROUP_ORDER.map((groupKey) => ({
        key: groupKey,
        label: GROUP_LABELS[groupKey],
        fields: defs.filter((def) => def.group === groupKey),
    })).filter((group) => group.fields.length > 0);
}

export function workViewFilterFieldOptions(
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): ReadonlyArray<{ key: string; label: string }> {
    return resolveWorkViewConditionFieldDefs(tenantFieldDefinitions).map((def) => ({
        key: def.key,
        label: def.label,
    }));
}

export function getWorkViewConditionFieldDef(
    fieldKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): WorkViewConditionFieldDef | null {
    const canonicalKey = canonicalWorkViewConditionFieldKey(fieldKey);
    const operational = getWorkViewConditionField(canonicalKey);
    if (operational) return operational;
    const trimmed = String(fieldKey ?? "").trim();
    if (!trimmed) return null;
    const provider = resolveCanonicalProviderForConsumer(trimmed, "business_process", {
        tenantFieldDefinitions,
    });
    if (!provider) return null;
    const operand = resolveWorkViewCanonicalOperands(tenantFieldDefinitions).find((row) => row.refKey === trimmed);
    if (!operand) return null;
    return canonicalOperandToWorkViewDef(operand, tenantFieldDefinitions);
}

export function choiceOptionsForWorkViewField(
    fieldKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): ReadonlyArray<{ value: string; label: string }> {
    const def = getWorkViewConditionFieldDef(fieldKey, tenantFieldDefinitions);
    if (!def?.optionSource) return [];
    if (def.optionSource.kind === "inline_choice") {
        const fieldKeyPart = def.key.includes(".") ? def.key.slice(def.key.indexOf(".") + 1) : def.key;
        const tenantRow = tenantFieldDefinitions?.find((row) => {
            const key = row.field_key.trim().toLowerCase();
            return key === fieldKeyPart.trim().toLowerCase();
        });
        return readInlineOptionsFromFieldConfig(tenantRow?.config ?? null);
    }
    return [];
}

export function isCanonicalWorkViewConditionFieldKey(
    fieldKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): boolean {
    const key = String(fieldKey ?? "").trim();
    if (!key || OPERATIONAL_KEYS.has(key) || Object.prototype.hasOwnProperty.call(LEGACY_FIELD_KEY_ALIASES, key)) {
        return false;
    }
    if (!key.includes(".")) return false;
    return Boolean(resolveCanonicalProviderForConsumer(key, "business_process", { tenantFieldDefinitions }));
}

export { DEFAULT_WORK_VIEW_CONDITION_FIELD_KEY, canonicalWorkViewConditionFieldKey };

export type WorkViewConditionFieldDefWithSource = WorkViewConditionFieldDef & {
    source?: "operational" | "canonical";
};

export function operatorsForWorkViewField(
    fieldKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): WorkViewFilterOperatorV1[] {
    const def = getWorkViewConditionFieldDef(fieldKey, tenantFieldDefinitions);
    if (def) return [...def.operators];
    return ["equals", "not_equals", "is_any_of", "is_empty", "is_not_empty"];
}

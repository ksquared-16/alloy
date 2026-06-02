/**
 * Card 2 — Compare form schema capture index to lifecycle requirement contract.
 */

import {
    FORMS_LIFECYCLE_ENTITY_GROUP_LABELS,
    type FormsLifecycleCoverageEntityGroup,
    type FormsLifecycleCoverageItem,
    type FormsLifecycleCoverageItemStatus,
    type FormsLifecycleCoverageMatchKind,
    type FormsLifecycleCoverageResult,
    type FormsLifecycleEntityType,
    type FormsLifecycleFieldRequirement,
    type FormsLifecycleRequirementContract,
} from "@/lib/forms/lifecycle/formsLifecycleCoverageTypes";
import {
    buildFormFieldCaptureIndex,
    buildFormFieldCaptureIndexFromFields,
    type FormFieldCaptureEntry,
    type FormFieldCaptureIndex,
} from "@/lib/forms/lifecycle/formFieldCaptureIndex";
import type { FormField } from "@/lib/forms/schema";
import { SYSTEM_FIELD_BY_ID } from "@/lib/forms/systemFieldRegistry";
import {
    lifecycleFieldRequirementById,
    type LifecycleRequirementEntityKey,
} from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    lifecycleEntityFromFieldDefinitionEntityType,
    lifecycleFieldRuleBinding,
    parseCustomFieldRuleId,
} from "@/lib/lifecycle/lifecycleFieldRuleBindings";

/** Fields that must not satisfy split person name rules. */
const FULL_NAME_FIELD_IDS = new Set(["guardian_full_name"]);

/** Extra capture mappings not yet in lifecycle bindings (forms coverage only). */
const FORMS_COVERAGE_EXTRA_CAPTURE: Readonly<
    Record<string, { crmMappingKeys: readonly string[]; captureKeys: readonly string[] }>
> = {
    "opportunity:interest_notes": {
        crmMappingKeys: ["opportunity.interest_notes"],
        captureKeys: ["opportunity_interest_notes"],
    },
};

const MATCH_KIND_RANK: Record<FormsLifecycleCoverageMatchKind, number> = {
    crm_mapping_key: 5,
    entity_field_key: 4,
    registry: 3,
    alias: 2,
    label_weak: 1,
};

type RuleMatchResult = {
    status: FormsLifecycleCoverageItemStatus;
    field?: FormFieldCaptureEntry;
    matchKind?: FormsLifecycleCoverageMatchKind;
};

function normalizeCompare(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function lifecycleEntityFromFormFieldSource(entityType: string): LifecycleRequirementEntityKey | null {
    const t = entityType.trim().toLowerCase();
    if (t === "guardian") return "person";
    if (t === "enrollment") return "child";
    return lifecycleEntityFromFieldDefinitionEntityType(entityType);
}

function ruleEntity(ruleId: string): LifecycleRequirementEntityKey | null {
    const custom = parseCustomFieldRuleId(ruleId);
    if (custom) return custom.entity;
    const catalog = lifecycleFieldRequirementById(ruleId);
    if (catalog) return catalog.entity;
    const binding = lifecycleFieldRuleBinding(ruleId);
    return binding?.entity ?? null;
}

function ruleFieldKey(ruleId: string): string | null {
    const custom = parseCustomFieldRuleId(ruleId);
    if (custom) return custom.field_key;
    const binding = lifecycleFieldRuleBinding(ruleId);
    if (binding?.field_key) return binding.field_key;
    const colon = ruleId.indexOf(":");
    return colon >= 0 ? ruleId.slice(colon + 1) : null;
}

function crmMappingKeysForRule(ruleId: string): string[] {
    const keys: string[] = [];
    const extra = FORMS_COVERAGE_EXTRA_CAPTURE[ruleId];
    if (extra) keys.push(...extra.crmMappingKeys);

    const binding = lifecycleFieldRuleBinding(ruleId);
    const entity = ruleEntity(ruleId);
    const fieldKey = ruleFieldKey(ruleId);

    if (entity && fieldKey) {
        if (entity === "person") {
            keys.push(`guardian.${fieldKey}`, `person.${fieldKey}`);
        } else if (entity === "child") {
            keys.push(`child.${fieldKey}`, `enrollment.${fieldKey}`);
        } else if (entity === "opportunity") {
            keys.push(`opportunity.${fieldKey}`);
        } else if (entity === "customer") {
            keys.push(`customer.${fieldKey}`);
        }
    }

    for (const capKey of binding?.form_capture_keys ?? []) {
        const reg = capKey.includes(" ") ? null : SYSTEM_FIELD_BY_ID.get(capKey);
        if (reg?.crm_mapping_key) keys.push(reg.crm_mapping_key);
    }

    for (const capKey of extra?.captureKeys ?? []) {
        const reg = SYSTEM_FIELD_BY_ID.get(capKey);
        if (reg?.crm_mapping_key) keys.push(reg.crm_mapping_key);
    }

    return [...new Set(keys)];
}

function captureKeysForRule(ruleId: string): string[] {
    const binding = lifecycleFieldRuleBinding(ruleId);
    const extra = FORMS_COVERAGE_EXTRA_CAPTURE[ruleId];
    const custom = parseCustomFieldRuleId(ruleId);
    const keys: string[] = [];

    if (custom) keys.push(custom.field_key);
    if (binding) keys.push(...binding.form_capture_keys.filter((k) => !k.includes(" ")));
    if (extra) keys.push(...extra.captureKeys);

    return [...new Set(keys)];
}

function formFieldLifecycleEntity(field: FormFieldCaptureEntry): LifecycleRequirementEntityKey | null {
    if (field.fieldSource && field.fieldSource.entity_type !== "custom") {
        return lifecycleEntityFromFormFieldSource(field.fieldSource.entity_type);
    }
    if (field.registryEntry) {
        return lifecycleEntityFromFormFieldSource(field.registryEntry.entity_type);
    }
    return null;
}

function entitiesCompatibleForLabelMatch(
    ruleId: string,
    field: FormFieldCaptureEntry
): boolean {
    const expected = ruleEntity(ruleId);
    const actual = formFieldLifecycleEntity(field);
    if (!expected || !actual) return true;
    return expected === actual;
}

function isFullNameField(field: FormFieldCaptureEntry): boolean {
    return FULL_NAME_FIELD_IDS.has(field.id);
}

function blocksPersonNameRule(ruleId: string, field: FormFieldCaptureEntry): boolean {
    if (ruleId !== "person:first_name" && ruleId !== "person:last_name") return false;
    return isFullNameField(field);
}

function blocksCrossEntityLabelMatch(ruleId: string, field: FormFieldCaptureEntry): boolean {
    return !entitiesCompatibleForLabelMatch(ruleId, field);
}

function submittedFieldHasValue(
    submittedValues: Record<string, unknown> | undefined,
    fieldId: string | undefined
): boolean {
    if (!submittedValues || !fieldId) return true;
    const v = submittedValues[fieldId];
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.some((item) => typeof item === "string" && item.trim().length > 0);
    if (typeof v === "number") return !Number.isNaN(v);
    if (typeof v === "boolean") return true;
    return false;
}

function satisfiedMatch(
    field: FormFieldCaptureEntry,
    matchKind: FormsLifecycleCoverageMatchKind,
    submittedValues?: Record<string, unknown>
): RuleMatchResult {
    if (!submittedFieldHasValue(submittedValues, field.id)) {
        return { status: "missing" };
    }
    return { status: "satisfied", field, matchKind };
}

function matchFieldToRule(
    ruleId: string,
    field: FormFieldCaptureEntry,
    submittedValues?: Record<string, unknown>
): RuleMatchResult | null {
    if (field.isUnmappedCustom) return null;
    if (blocksPersonNameRule(ruleId, field)) return null;

    const binding = lifecycleFieldRuleBinding(ruleId);
    const catalog = lifecycleFieldRequirementById(ruleId);
    const custom = parseCustomFieldRuleId(ruleId);
    const extra = FORMS_COVERAGE_EXTRA_CAPTURE[ruleId];

    if (!custom && !catalog && !binding && !extra) {
        return null;
    }
    if (binding && !binding.form_coverage_supported && !custom && !extra) {
        return { status: "unknown" };
    }

    const crmKeys = crmMappingKeysForRule(ruleId);
    const src = field.fieldSource;

    if (src?.crm_mapping_key && crmKeys.includes(src.crm_mapping_key)) {
        return satisfiedMatch(field, "crm_mapping_key", submittedValues);
    }

    if (src && src.entity_type !== "custom") {
        const formEntity = lifecycleEntityFromFormFieldSource(src.entity_type);
        const expectedEntity = ruleEntity(ruleId);
        const expectedKey = ruleFieldKey(ruleId);
        if (
            formEntity &&
            expectedEntity &&
            formEntity === expectedEntity &&
            expectedKey &&
            (src.field_key === expectedKey || src.shared_value_key === expectedKey)
        ) {
            return satisfiedMatch(field, "entity_field_key", submittedValues);
        }
    }

    const captureKeys = captureKeysForRule(ruleId);
    if (captureKeys.includes(field.id)) {
        return satisfiedMatch(field, "registry", submittedValues);
    }
    if (field.registryEntry && captureKeys.includes(field.registryEntry.field_key)) {
        return satisfiedMatch(field, "registry", submittedValues);
    }
    if (
        field.registryEntry?.shared_value_key &&
        captureKeys.includes(field.registryEntry.shared_value_key)
    ) {
        return satisfiedMatch(field, "registry", submittedValues);
    }

    if (custom && field.fieldSource?.field_key === custom.field_key) {
        const formEntity = field.fieldSource ?
            lifecycleEntityFromFormFieldSource(field.fieldSource.entity_type)
        :   null;
        if (formEntity === custom.entity) {
            return satisfiedMatch(field, "alias", submittedValues);
        }
    }

    if (blocksCrossEntityLabelMatch(ruleId, field)) {
        return { status: "missing" };
    }

    const labelTokens = [
        ...(binding?.form_capture_keys ?? []),
        ...(extra?.captureKeys ?? []),
        catalog?.field_label ?? "",
    ].filter((t) => t.includes(" ") || t.includes("-"));

    const fieldNorm = normalizeCompare(field.label);
    for (const token of labelTokens) {
        const tokenNorm = normalizeCompare(token);
        if (!tokenNorm || !fieldNorm) continue;
        if (fieldNorm === tokenNorm || fieldNorm.includes(tokenNorm) || tokenNorm.includes(fieldNorm)) {
            return satisfiedMatch(field, "label_weak", submittedValues);
        }
    }

    return { status: "missing" };
}

function bestMatchForRule(
    ruleId: string,
    index: FormFieldCaptureIndex,
    submittedValues?: Record<string, unknown>
): RuleMatchResult {
    let best: RuleMatchResult = { status: "missing" };

    for (const field of index.fields) {
        const attempt = matchFieldToRule(ruleId, field, submittedValues);
        if (!attempt) continue;
        if (attempt.status === "unknown") return attempt;
        if (attempt.status !== "satisfied") continue;

        const rank = attempt.matchKind ? MATCH_KIND_RANK[attempt.matchKind] : 0;
        const bestRank = best.matchKind ? MATCH_KIND_RANK[best.matchKind] : 0;
        if (best.status !== "satisfied" || rank > bestRank) {
            best = attempt;
        }
    }

    if (parseCustomFieldRuleId(ruleId) && best.status === "missing") {
        return { status: "unknown" };
    }

    return best;
}

function requirementToCoverageItem(
    req: FormsLifecycleFieldRequirement,
    match: RuleMatchResult
): FormsLifecycleCoverageItem {
    return {
        requirementId: req.id,
        requirementLabel: req.label,
        requirementEntityType: req.entityType,
        requirementFieldKey: req.fieldKey,
        requiredness: req.requiredness,
        status: match.status,
        matchedFormFieldId: match.field?.id,
        matchedFormFieldLabel: match.field?.label,
        matchKind: match.matchKind,
    };
}

function entityGroupKey(entityType: FormsLifecycleEntityType): string {
    return FORMS_LIFECYCLE_ENTITY_GROUP_LABELS[entityType] ?? FORMS_LIFECYCLE_ENTITY_GROUP_LABELS.unknown;
}

function buildByEntity(items: FormsLifecycleCoverageItem[]): Record<string, FormsLifecycleCoverageEntityGroup> {
    const map: Record<string, FormsLifecycleCoverageEntityGroup> = {};

    for (const item of items) {
        const key = entityGroupKey(item.requirementEntityType);
        if (!map[key]) {
            map[key] = { entityLabel: key, required: [], recommended: [] };
        }
        if (item.requiredness === "required") map[key]!.required.push(item);
        else map[key]!.recommended.push(item);
    }

    return map;
}

function constraintFailureItem(
    constraint: FormsLifecycleRequirementContract["constraints"][number]
): FormsLifecycleCoverageItem {
    return {
        requirementId: `constraint:${constraint.ruleIds.join("|")}`,
        requirementLabel: constraint.message.replace(/\.$/, ""),
        requirementEntityType: "person",
        requirementFieldKey: "contact",
        requiredness: "required",
        status: "missing",
    };
}

function evaluateCoverageWithIndex(
    index: FormFieldCaptureIndex,
    contract: FormsLifecycleRequirementContract,
    submittedValues?: Record<string, unknown>
): FormsLifecycleCoverageResult {
    const matchByRuleId = new Map<string, RuleMatchResult>();

    const allRuleIds = new Set<string>([
        ...contract.required.map((r) => r.id),
        ...contract.recommended.map((r) => r.id),
        ...contract.constraints.flatMap((c) => c.ruleIds),
    ]);

    for (const ruleId of allRuleIds) {
        matchByRuleId.set(ruleId, bestMatchForRule(ruleId, index, submittedValues));
    }

    const satisfiedRequired: FormsLifecycleCoverageItem[] = [];
    const missingRequired: FormsLifecycleCoverageItem[] = [];
    const satisfiedRecommended: FormsLifecycleCoverageItem[] = [];
    const missingRecommended: FormsLifecycleCoverageItem[] = [];
    const constraintFailures: FormsLifecycleCoverageItem[] = [];

    for (const req of contract.required) {
        const match = matchByRuleId.get(req.id) ?? { status: "missing" as const };
        const item = requirementToCoverageItem(req, match);
        if (item.status === "satisfied") {
            satisfiedRequired.push(item);
        } else {
            missingRequired.push(item);
        }
    }

    for (const req of contract.recommended) {
        const match = matchByRuleId.get(req.id) ?? { status: "missing" as const };
        const item = requirementToCoverageItem(req, match);
        if (item.status === "satisfied") satisfiedRecommended.push(item);
        else if (item.status === "missing") missingRecommended.push(item);
        else missingRecommended.push({ ...item, status: "missing" });
    }

    for (const constraint of contract.constraints) {
        if (constraint.kind !== "at_least_one") continue;
        const anySatisfied = constraint.ruleIds.some((ruleId) => {
            const m = matchByRuleId.get(ruleId);
            return m?.status === "satisfied";
        });
        if (!anySatisfied) {
            constraintFailures.push(constraintFailureItem(constraint));
        }
    }

    const blockingMissingRequired = missingRequired.filter((i) => i.status === "missing");
    const ready = blockingMissingRequired.length === 0 && constraintFailures.length === 0;

    const allItems = [
        ...satisfiedRequired,
        ...missingRequired,
        ...satisfiedRecommended,
        ...missingRecommended,
        ...constraintFailures,
    ];

    return {
        ready,
        missingRequired: [...missingRequired, ...constraintFailures],
        missingRecommended,
        satisfiedRequired,
        satisfiedRecommended,
        byEntity: buildByEntity(allItems.filter((i) => !i.requirementId.startsWith("constraint:"))),
        constraintFailures,
    };
}

/** Evaluate lifecycle field coverage for a published/draft schema JSON. */
export function evaluateFormsLifecycleFieldCoverage(
    schemaJson: unknown,
    contract: FormsLifecycleRequirementContract
): FormsLifecycleCoverageResult {
    return evaluateCoverageWithIndex(buildFormFieldCaptureIndex(schemaJson), contract);
}

/** Card 5 — evaluate whether submitted values satisfy lifecycle requirements (not just schema capture). */
export function evaluateSubmittedFormsLifecycleFieldCoverage(
    schemaJson: unknown,
    contract: FormsLifecycleRequirementContract,
    submittedValues: Record<string, unknown>
): FormsLifecycleCoverageResult {
    return evaluateCoverageWithIndex(buildFormFieldCaptureIndex(schemaJson), contract, submittedValues);
}

/** Evaluate coverage from parsed form fields (tests + authoring previews). */
export function evaluateFormsLifecycleFieldCoverageFromFields(
    fields: FormField[],
    contract: FormsLifecycleRequirementContract,
    submittedValues?: Record<string, unknown>
): FormsLifecycleCoverageResult {
    return evaluateCoverageWithIndex(buildFormFieldCaptureIndexFromFields(fields), contract, submittedValues);
}

/** Representative Website Inquiry schema for docs/tests. */
export function websiteInquiryFormSchemaForCoverageExample(): FormField[] {
    return [
        {
            id: "guardian_first_name",
            type: "text",
            label: "Guardian first name",
            required: true,
            field_source: {
                entity_type: "guardian",
                field_key: "guardian_first_name",
                shared_value_key: "guardian_first_name",
                crm_mapping_key: "guardian.first_name",
            },
        },
        {
            id: "guardian_last_name",
            type: "text",
            label: "Guardian last name",
            required: true,
            field_source: {
                entity_type: "guardian",
                field_key: "guardian_last_name",
                shared_value_key: "guardian_last_name",
                crm_mapping_key: "guardian.last_name",
            },
        },
        {
            id: "guardian_email",
            type: "text",
            label: "Guardian email",
            required: false,
            field_source: {
                entity_type: "guardian",
                field_key: "guardian_email",
                shared_value_key: "guardian_email",
                crm_mapping_key: "guardian.email",
            },
        },
        {
            id: "guardian_phone",
            type: "text",
            label: "Guardian phone",
            required: false,
            field_source: {
                entity_type: "guardian",
                field_key: "guardian_phone",
                shared_value_key: "guardian_phone",
                crm_mapping_key: "guardian.phone",
            },
        },
        {
            id: "opportunity_interest_notes",
            type: "text",
            label: "Inquiry message",
            required: false,
            multiline: true,
            field_source: {
                entity_type: "opportunity",
                field_key: "opportunity_interest_notes",
                crm_mapping_key: "opportunity.interest_notes",
            },
        },
    ] as FormField[];
}

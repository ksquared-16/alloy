import {
    autoVariantLabel,
    type ProgramOfferingVariant,
    type QuantityType,
} from "@/lib/programs/programOfferingVariants";

export const TUITION_ENROLLMENT_COMMITMENTS_SET_KEY = "tuition_enrollment_commitments";

export type EnrollmentCommitmentTemplateItem = {
    id: string;
    itemKey: string;
    label: string;
    quantityType: QuantityType;
    quantityValue: number;
    metadata: Record<string, unknown>;
};

export type EnrollmentCommitmentPattern = {
    key: string;
    quantityType: QuantityType;
    quantityValue: number;
    label: string;
    usageCount: number;
    source: "derived" | "template";
    isActive: boolean;
    templateItemId: string | null;
};

export function commitmentPatternKey(quantityType: QuantityType, quantityValue: number): string {
    return `${quantityType}:${quantityValue}`;
}

function readTemplatePattern(item: EnrollmentCommitmentTemplateItem): EnrollmentCommitmentPattern | null {
    const quantityType = item.quantityType;
    const quantityValue = item.quantityValue;
    if (quantityValue == null || quantityValue < 1) return null;
    return {
        key: commitmentPatternKey(quantityType, quantityValue),
        quantityType,
        quantityValue,
        label: item.label,
        usageCount: 0,
        source: "template",
        isActive: item.metadata.active !== false && item.metadata.is_active !== false,
        templateItemId: item.id,
    };
}

function majorityLabel(
    variants: ProgramOfferingVariant[],
    quantityType: QuantityType,
    quantityValue: number,
): string {
    const labels = variants
        .filter(
            (v) =>
                v.is_active &&
                v.quantity_type === quantityType &&
                v.quantity_value === quantityValue,
        )
        .map((v) => v.label?.trim())
        .filter((label): label is string => Boolean(label));
    if (labels.length === 0) return autoVariantLabel(quantityValue, quantityType);
    const counts = new Map<string, number>();
    for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
    let best = labels[0]!;
    let bestCount = 0;
    for (const [label, count] of counts) {
        if (count > bestCount) {
            best = label;
            bestCount = count;
        }
    }
    return best;
}

export function deriveEnrollmentCommitments(input: {
    variants: ProgramOfferingVariant[];
    templateItems?: EnrollmentCommitmentTemplateItem[];
}): EnrollmentCommitmentPattern[] {
    const patterns = new Map<string, EnrollmentCommitmentPattern>();

    for (const variant of input.variants) {
        if (!variant.is_active) continue;
        if (variant.quantity_type == null || variant.quantity_value == null) continue;
        const key = commitmentPatternKey(variant.quantity_type, variant.quantity_value);
        const existing = patterns.get(key);
        if (existing) {
            existing.usageCount += 1;
        } else {
            patterns.set(key, {
                key,
                quantityType: variant.quantity_type,
                quantityValue: variant.quantity_value,
                label: majorityLabel(input.variants, variant.quantity_type, variant.quantity_value),
                usageCount: 1,
                source: "derived",
                isActive: true,
                templateItemId: null,
            });
        }
    }

    for (const item of input.templateItems ?? []) {
        const template = readTemplatePattern(item);
        if (!template) continue;
        const existing = patterns.get(template.key);
        if (existing) {
            if (!existing.label || existing.source === "derived") {
                existing.label = template.label;
            }
            if (existing.templateItemId == null) existing.templateItemId = template.templateItemId;
        } else {
            patterns.set(template.key, template);
        }
    }

    return [...patterns.values()].sort((a, b) => {
        if (a.quantityType !== b.quantityType) return a.quantityType.localeCompare(b.quantityType);
        return a.quantityValue - b.quantityValue;
    });
}

/** Active day-per-week commitments for plan create / add dialogs. */
export function buildActiveDayCommitmentValues(patterns: EnrollmentCommitmentPattern[]): number[] {
    const values = patterns
        .filter((p) => p.isActive && p.quantityType === "days")
        .map((p) => p.quantityValue);
    if (values.length > 0) return [...new Set(values)].sort((a, b) => a - b);
    return [1, 2, 3, 4, 5];
}

export function parseEnrollmentCommitmentTemplateItem(row: {
    id: string;
    item_key: string;
    label: string;
    metadata?: Record<string, unknown>;
}): EnrollmentCommitmentTemplateItem | null {
    const metadata = row.metadata ?? {};
    const quantityType =
        typeof metadata.quantity_type === "string" ? (metadata.quantity_type as QuantityType) : "days";
    const quantityValue = Number(metadata.quantity_value);
    if (!Number.isFinite(quantityValue) || quantityValue < 1) return null;
    return {
        id: row.id,
        itemKey: row.item_key,
        label: row.label,
        quantityType,
        quantityValue,
        metadata,
    };
}

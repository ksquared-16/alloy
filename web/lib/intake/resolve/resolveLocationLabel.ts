import type { IntakeSelectOption } from "@/lib/intake/types";

export type LocationLabelResolution = {
    label: string;
    resolved_value: string | null;
    resolved_label: string | null;
    confidence: "high" | "medium" | "low";
    validation_state: "valid" | "ambiguous" | "unknown";
    matching_option_values: string[];
};

function normalizeLocationAlias(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function optionMatchesLabel(option: IntakeSelectOption, label: string): boolean {
    const normLabel = normalizeLocationAlias(label);
    const normOptionLabel = normalizeLocationAlias(option.label);
    if (!normLabel || !normOptionLabel) return false;
    if (normOptionLabel === normLabel) return true;
    if (normOptionLabel.includes(normLabel) || normLabel.includes(normOptionLabel)) return true;
    return false;
}

/** Map a location label to available select options (exact, case-insensitive, alias-normalized). */
export function resolveLocationLabelToOption(
    label: string,
    options: readonly IntakeSelectOption[],
): LocationLabelResolution {
    const trimmed = label.trim();
    if (!trimmed || options.length === 0) {
        return {
            label: trimmed,
            resolved_value: null,
            resolved_label: null,
            confidence: "low",
            validation_state: "unknown",
            matching_option_values: [],
        };
    }

    const matches = options.filter((o) => optionMatchesLabel(o, trimmed));

    if (matches.length === 1) {
        const hit = matches[0]!;
        return {
            label: trimmed,
            resolved_value: hit.value,
            resolved_label: hit.label,
            confidence: "high",
            validation_state: "valid",
            matching_option_values: [hit.value],
        };
    }

    if (matches.length > 1) {
        return {
            label: trimmed,
            resolved_value: null,
            resolved_label: null,
            confidence: "medium",
            validation_state: "ambiguous",
            matching_option_values: matches.map((m) => m.value),
        };
    }

    return {
        label: trimmed,
        resolved_value: null,
        resolved_label: null,
        confidence: "medium",
        validation_state: "unknown",
        matching_option_values: [],
    };
}

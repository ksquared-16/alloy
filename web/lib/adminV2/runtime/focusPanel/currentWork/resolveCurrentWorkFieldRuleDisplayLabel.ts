import { lifecycleFieldRequirementById } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { parseCustomFieldRuleId } from "@/lib/lifecycle/lifecycleFieldRuleBindings";

function friendlyLabelFromToken(token: string): string {
    const cleaned = token.trim().replace(/_/g, " ");
    if (!cleaned) return "Field";
    return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Operator-facing checklist label for a lifecycle field rule id.
 * Never exposes canonical keys like `custom:opportunity:schools`.
 */
export function resolveCurrentWorkFieldRuleDisplayLabel(ruleId: string): string {
    const trimmed = ruleId.trim();
    if (!trimmed) return "Field";

    const catalogLabel = lifecycleFieldRequirementById(trimmed)?.field_label?.trim();
    if (catalogLabel) return catalogLabel;

    const custom = parseCustomFieldRuleId(trimmed);
    if (custom?.field_key) {
        return friendlyLabelFromToken(custom.field_key);
    }

    const colonParts = trimmed.split(":");
    if (colonParts.length >= 2) {
        return friendlyLabelFromToken(colonParts[colonParts.length - 1] ?? trimmed);
    }

    return friendlyLabelFromToken(trimmed);
}

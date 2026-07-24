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

/**
 * System/internal identifier field keys (foreign keys like `location_id`, bare `id`) are
 * never operator requirements — they leak from the derivation layer, not the config plane.
 * This is a FIELD-KEY convention applied uniformly to every process, not a business branch
 * and not a check against the human-readable label text.
 */
function isInternalIdentifierFieldKey(fieldKey: string): boolean {
    const key = fieldKey.trim().toLowerCase();
    if (!key) return true;
    return key === "id" || /(^|_)id$/.test(key) || /_ids$/.test(key);
}

/**
 * Operator-facing requirement label, or `null` when the rule id resolves to an internal
 * identifier that must never surface as an operator requirement (e.g. `location_id`).
 *
 * A catalog-backed field always resolves (catalog labels are curated for operators); only
 * un-catalogued identifier fields are suppressed. Callers drop `null`-labeled rows from the
 * "Still needed" summary and from the requirement counts.
 */
export function resolveCurrentWorkRequirementOperatorLabel(ruleId: string): string | null {
    const trimmed = ruleId.trim();
    if (!trimmed) return null;

    const catalogLabel = lifecycleFieldRequirementById(trimmed)?.field_label?.trim();
    if (catalogLabel) return catalogLabel;

    const custom = parseCustomFieldRuleId(trimmed);
    if (custom?.field_key) {
        return isInternalIdentifierFieldKey(custom.field_key)
            ? null
            : friendlyLabelFromToken(custom.field_key);
    }

    const colonParts = trimmed.split(":");
    const tail = colonParts[colonParts.length - 1] ?? trimmed;
    return isInternalIdentifierFieldKey(tail) ? null : friendlyLabelFromToken(tail);
}

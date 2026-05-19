/**
 * Opportunity drawer save helpers — custom field_values vs native column keys.
 */

export const OPPORTUNITY_PATCH_NATIVE_KEYS = new Set([
    "name",
    "job_date",
    "job_time_window",
    "status",
    "vertical_id",
    "quote_total",
    "price_breakdown",
    "notes",
    "status_key",
    "source",
    "assigned_to",
    "lost_reason",
    "appointment_id",
    "quote_subtotal",
    "discount_amount",
    "discount_code",
    "external_source",
    "external_id",
    "quote_is_overridden",
    "quote_override_total",
    "quote_override_reason",
    "enrollment_operational",
]);

const PIPELINE_ONLY_KEYS = new Set([
    "quote_inputs",
    "apply_quote_discount",
    "clear_quote_discount",
    "clear_quote_override",
    "quote_discount_selection",
]);

/** True when body may include custom field_values keys (not only native opportunity columns). */
export function opportunityBodyHasCustomFieldUpdates(
    body: Record<string, unknown>,
    extraSystemKeys: Iterable<string> = []
): boolean {
    const systemSet = new Set([...OPPORTUNITY_PATCH_NATIVE_KEYS, ...PIPELINE_ONLY_KEYS, ...extraSystemKeys]);
    return Object.keys(body).some(
        (k) => !systemSet.has(k) && !k.startsWith("_") && body[k] !== undefined
    );
}

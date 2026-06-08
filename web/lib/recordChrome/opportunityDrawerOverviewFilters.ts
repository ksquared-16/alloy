import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";

/** Launch: keep quote_total / discount fields visible; hide extra cents/subtotal noise (defs still exist in admin). */
export const OPPORTUNITY_DRAWER_HIDE_PRICING_FIELD_KEYS = new Set([
    "recurring_price_cents",
    "estimated_price_cents",
    "monetary_value_cents",
    "quote_subtotal",
    "discount_validated_at",
]);

/** Childcare inquiry workflow v1: fields promoted to the drawer header snapshot — omit from body grids. */
export const OPPORTUNITY_INQUIRY_HEADER_BODY_FIELD_KEYS = new Set([
    "status_key",
    "_status_display",
    "desired_start_date",
    "tour_date",
    "program_type",
    "schedule_type",
    "primary_contact_id",
    "primary_person_id",
    "customer_id",
    "next_follow_up_at",
    "follow_up_notes",
    "tour_notes",
]);

export function isOpportunityTourFollowUpSection(s: EntityDrawerSectionConfig): boolean {
    const k = (s.key ?? "").toLowerCase().replace(/-/g, "_");
    const t = (s.title ?? "").toLowerCase();
    if (k.includes("tour") && k.includes("follow")) return true;
    if (t.includes("tour") && (t.includes("follow") || t.includes("follow-up"))) return true;
    if (["follow_up", "followup", "tour_follow_up", "tour_and_follow_up"].includes(k)) return true;
    return false;
}

/** When workflow "Source & external" exists, drop generic `external` body section to avoid duplicate chrome. */
export function isOpportunityWorkflowStandaloneExternalDuplicate(
    sections: EntityDrawerSectionConfig[],
    s: EntityDrawerSectionConfig
): boolean {
    if (!sections.some((x) => x.key === "inquiry_source_external")) return false;
    const k = (s.key ?? "").toLowerCase().replace(/-/g, "_");
    return k === "external" || k === "opportunity_external" || k === "ext";
}

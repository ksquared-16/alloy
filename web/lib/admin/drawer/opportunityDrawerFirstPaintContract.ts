import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";

export type OpportunityDrawerPaintRecord = Record<string, unknown>;

/** Record row matches drawer and has at least `drawer_primary` merged. */
export function opportunityDrawerPrimaryContractReady(
    record: OpportunityDrawerPaintRecord | null | undefined,
    drawerId: string | null | undefined
): boolean {
    if (!drawerId || drawerId === "new") return false;
    if (!record || typeof record !== "object") return false;
    if (String(record.id ?? "").trim() !== String(drawerId).trim()) return false;
    const surface = String(record._record_surface ?? "").trim();
    return surface === "drawer_primary" || surface === "drawer_initial" || surface === "full";
}

/** AdminV2 bootstrap path: primary is painted but background `full` has not merged yet. */
export function opportunityDrawerFirstPaintActive(
    record: OpportunityDrawerPaintRecord | null | undefined,
    drawerId: string | null | undefined,
    bootstrapEnrichmentPath: boolean
): boolean {
    if (!bootstrapEnrichmentPath) return false;
    if (!opportunityDrawerPrimaryContractReady(record, drawerId)) return false;
    return String(record?._record_surface ?? "").trim() !== "full";
}

/** After this, below-the-fold sections and enrichment panels may mount. */
export function opportunityDrawerEnrichmentLayoutReady(
    bootstrapEnrichmentPath: boolean,
    fullRecordHydrateApplied: boolean
): boolean {
    return !bootstrapEnrichmentPath || fullRecordHydrateApplied;
}

/** Identity block guaranteed on bootstrap + `drawer_primary`. */
export function opportunityInquiryFamilyBlockReadyOnPrimary(
    record: OpportunityDrawerPaintRecord
): boolean {
    const ident = (record._identity as Record<string, unknown> | null) ?? null;
    if (ident && typeof ident === "object") {
        const household = ident.household as { label?: unknown } | null;
        const pp = ident.primary_person as { label?: unknown } | null;
        const pc = ident.primary_contact as { label?: unknown } | null;
        if (String(household?.label ?? "").trim()) return true;
        if (String(pp?.label ?? "").trim()) return true;
        if (String(pc?.label ?? "").trim()) return true;
    }
    if (String(record._customer_name ?? "").trim()) return true;
    if (String(record._primary_person_name ?? "").trim()) return true;
    if (String(record._primary_contact_name ?? "").trim()) return true;
    return false;
}

/** Tour readout from opportunity metadata only (no `tour_bookings` GET). */
export function opportunityInquiryTourDisplayFromPrimaryMetadata(
    record: OpportunityDrawerPaintRecord
): boolean {
    const md = (record.metadata as Record<string, unknown> | null) ?? null;
    if (!md) return false;
    const date = md.tour_date;
    const time = md.tour_time;
    return !!(date != null && String(date).trim()) || !!(time != null && String(time).trim());
}

/** Right summary column content that does not require secondary fetches. */
export function opportunityInquirySummaryRightPanelFromPrimaryOnly(
    record: OpportunityDrawerPaintRecord
): boolean {
    const follow = record.next_follow_up_at;
    if (follow != null && String(follow).trim()) return true;
    const next = record._lifecycle_next_step as { lines?: unknown } | undefined;
    const lines = next?.lines;
    if (Array.isArray(lines) && lines.some((l) => String(l ?? "").trim())) return true;
    return false;
}

/** Overview sections that must not mount on first paint (they fetch or pop layout). */
export const OPPORTUNITY_ENRICHMENT_DEFERRED_OVERVIEW_SECTION_KEYS = new Set<string>([
    "inquiry_children",
    "inquiry_tuition",
    "tuition",
    "tuition_pricing",
    "pricing",
    "fee_schedule",
    "source",
    "external_source",
    "external",
    "operational_attention",
    "operational_tasks_followups",
    "tour_scheduling",
    "customer_booking",
    "family_contacts",
]);

/** Collapse enrichment sections without removing shell structure (geometry contract). */
function collapseDeferredOverviewSections(sections: EntityDrawerSectionConfig[]): EntityDrawerSectionConfig[] {
    return sections.map((s) =>
        OPPORTUNITY_ENRICHMENT_DEFERRED_OVERVIEW_SECTION_KEYS.has(s.key) ?
            { ...s, defaultExpanded: false, collapsible: true }
        :   s
    );
}

/**
 * Inquiry workflow drawer may reveal only when shell contract + identity frame are structurally stable.
 */
export function opportunityInquiryDrawerShellStructurallyReady(params: {
    shellContractPresent: boolean;
    primaryContractSatisfied: boolean;
    record: OpportunityDrawerPaintRecord | null | undefined;
    familyContactsInSummary: boolean;
}): boolean {
    if (!params.shellContractPresent || !params.primaryContractSatisfied) return false;
    if (!params.record || typeof params.record !== "object") return false;
    if (params.familyContactsInSummary) {
        return opportunityInquiryFamilyBlockReadyOnPrimary(params.record);
    }
    return true;
}

export function filterOpportunityOverviewSectionsForFirstPaint(
    sections: EntityDrawerSectionConfig[],
    firstPaintActive: boolean,
    enrichmentLayoutReady: boolean,
    enrichmentHeldUntilInteraction?: boolean
): EntityDrawerSectionConfig[] {
    if (enrichmentHeldUntilInteraction) {
        return sections.map((s) =>
            s.key === "inquiry_children"
                ? { ...s, defaultExpanded: true, collapsible: true }
                : { ...s, defaultExpanded: false, collapsible: true }
        );
    }
    if (!firstPaintActive) return sections;
    if (!enrichmentLayoutReady) {
        return collapseDeferredOverviewSections(sections);
    }
    return collapseDeferredOverviewSections(sections);
}


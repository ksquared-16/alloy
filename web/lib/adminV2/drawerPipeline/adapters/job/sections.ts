import {
    getEntityPresentation,
    type EntityDrawerFieldConfig,
    type EntityDrawerSectionConfig,
} from "@/lib/entityPresentation";
import {
    getJobOverviewBillingSummarySection,
    getJobPricingBreakdownSection,
} from "@/lib/entityPresentation";

/** Curated collapsible sections for Admin V2 job record drawer (structure owned by shell). */
export function buildJobDrawerV2OverviewSections(): EntityDrawerSectionConfig[] {
    const pres = getEntityPresentation("jobs").drawer?.overviewSections ?? [];
    const ps = pres.find((s) => s.key === "property_service");
    const sched = pres.find((s) => s.key === "scheduling");
    const notes = pres.find((s) => s.key === "notes");
    const rec = pres.find((s) => s.key === "record_info");
    const propertyFields: EntityDrawerFieldConfig[] = [
        { key: "title", label: "Title", span: 1, renderHint: "text", editable: true },
        { key: "service_key", label: "Service", span: 1, renderHint: "text", editable: true },
        { key: "job_type", label: "Job type", span: 1, renderHint: "text", editable: true },
        ...(ps?.fields ?? []),
    ];
    const schedFields = (sched?.fields ?? []).filter((f) => f.key !== "_next_schedule");
    const pb = getJobPricingBreakdownSection();
    const bill = getJobOverviewBillingSummarySection();
    const peoplePlacesFields: EntityDrawerFieldConfig[] = [
        {
            key: "opportunity_id",
            label: "Opportunity",
            span: 1,
            renderHint: "link",
            editable: true,
            linkTarget: { idField: "opportunity_id", entityType: "opportunities" },
        },
        { key: "work_unit_id", label: "Work unit", span: 1, renderHint: "text", editable: true },
    ];
    return [
        {
            key: "property_service_v2",
            title: "Property & service details",
            defaultExpanded: true,
            collapsible: true,
            gridCols: 2,
            fields: propertyFields,
            locked: true,
        },
        {
            key: "scheduling_v2",
            title: "Scheduling",
            defaultExpanded: false,
            collapsible: true,
            gridCols: 2,
            fields: schedFields,
            locked: true,
        },
        { ...pb, key: "job_pricing_breakdown", title: "Pricing", defaultExpanded: false },
        { ...bill, defaultExpanded: false },
        {
            key: "people_places_v2",
            title: "People & places",
            defaultExpanded: false,
            collapsible: true,
            gridCols: 2,
            fields: peoplePlacesFields,
            locked: true,
        },
        {
            key: "communications_canonical_embed",
            title: "Communication",
            defaultExpanded: false,
            collapsible: true,
            gridCols: 1,
            fields: [],
            locked: true,
        },
        {
            key: "internal_notes_record_v2",
            title: "Internal notes & record details",
            defaultExpanded: false,
            collapsible: true,
            gridCols: 2,
            fields: [...(notes?.fields ?? []), ...(rec?.fields ?? [])],
            locked: true,
        },
    ];
}

export const JOB_DRAWER_V2_OVERVIEW_SECTIONS = buildJobDrawerV2OverviewSections();

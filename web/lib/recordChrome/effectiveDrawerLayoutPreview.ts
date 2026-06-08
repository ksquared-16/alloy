/**
 * Read-only effective drawer overview sections preview (Card 8).
 * Opportunity path mirrors `AdminEntityDrawer` config-driven overview assembly.
 * Job / schedule paths use presentation templates + `overview_section_order` / layout_blocks (skeleton).
 */

import type { EntityDrawerFieldConfig, EntityDrawerSectionConfig, EntityPresentationType } from "@/lib/entityPresentation";
import { getEntityPresentation } from "@/lib/entityPresentation";
import { mergeUnifiedStatusIntoConfigOverview } from "@/lib/admin/unifiedDrawerStatus";
import { OPPORTUNITY_WORKFLOW_V1_LEGACY_OVERVIEW_SECTION_KEYS } from "@/lib/admin/opportunityDrawerLayoutPolicy";
import {
    OPPORTUNITY_DRAWER_HIDE_PRICING_FIELD_KEYS,
    OPPORTUNITY_INQUIRY_HEADER_BODY_FIELD_KEYS,
    isOpportunityTourFollowUpSection,
    isOpportunityWorkflowStandaloneExternalDuplicate,
} from "@/lib/recordChrome/opportunityDrawerOverviewFilters";
import {
    applyOverviewSectionOrder,
    recordOpportunityDrawerLayoutIncludesSection,
    type RecordLayoutConfigJson,
} from "@/lib/recordChrome/types";
import { getSectionOrderFromScheduleLayoutBlocks, isScheduleLayoutV2 } from "@/lib/recordChrome/scheduleLayoutConfig";
import {
    buildPersonRuntimeLayoutSettingsPreview,
    type PersonRuntimeLayoutSettingsPreview,
} from "@/lib/recordChrome/personDrawerLayoutSettingsPreview";

export type { PersonRuntimeLayoutSettingsPreview } from "@/lib/recordChrome/personDrawerLayoutSettingsPreview";

export type PreviewFieldDef = {
    field_key: string;
    field_type: string;
    label: string | null;
    section_key: string | null;
    sort_order: number;
    is_visible_in_drawer?: boolean;
};

export type DrawerLayoutPreviewSectionKind =
    | "workflow_virtual"
    | "field_section_ref"
    | "layout_static"
    | "injected_system";

/** Structural provenance for each row (orthogonal to org vs global layout row). */
export type DrawerLayoutPreviewStructuralProvenance =
    | "workflow_generated"
    | "field_catalog"
    | "presentation_template"
    | "injected_system";

export type DrawerLayoutPreviewSection = {
    position: number;
    section_key: string;
    title: string;
    kind: DrawerLayoutPreviewSectionKind;
    structural_provenance: DrawerLayoutPreviewStructuralProvenance;
    /** Operator-facing detail */
    detail?: string;
    field_keys?: string[];
};

export type DrawerLayoutPreviewFidelity =
    | "opportunity_runtime_mirror"
    | "person_runtime_mirror"
    | "presentation_ordered_skeleton";

export type EffectiveDrawerLayoutPreviewBundle = {
    fidelity: DrawerLayoutPreviewFidelity;
    sections: DrawerLayoutPreviewSection[];
    person_runtime?: PersonRuntimeLayoutSettingsPreview;
};

function defaultSectionTitle(sectionKey: string): string {
    return sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1).replace(/_/g, " ");
}

const DRAWER_INJECTED_SECTION_KEYS = new Set(["inquiry_children", "inquiry_tuition", "__unified_status"]);

/**
 * Catalog sections explicitly placed on this drawer layout (overview order or hidden list),
 * not every field_section_definitions row org-wide.
 */
export function mergeExplicitCatalogSectionsInDrawerLayout(
    sections: EntityDrawerSectionConfig[],
    cfg: RecordLayoutConfigJson | null | undefined,
    fieldSectionLabels: Record<string, string>
): EntityDrawerSectionConfig[] {
    if (!cfg) return sections;
    const byKey = new Set(sections.map((s) => s.key));
    const wfKeys = new Set((cfg.inquiry_workflow_sections ?? []).map((w) => w.key));
    const layoutKeys = new Set<string>([
        ...(cfg.overview_section_order ?? []),
        ...(cfg.overview_hidden_sections ?? []),
    ]);
    const extras: EntityDrawerSectionConfig[] = [];
    for (const sk of layoutKeys) {
        const key = sk.trim();
        if (!key || byKey.has(key) || wfKeys.has(key) || DRAWER_INJECTED_SECTION_KEYS.has(key)) continue;
        if (!Object.prototype.hasOwnProperty.call(fieldSectionLabels, key)) continue;
        const label = (fieldSectionLabels[key] ?? "").trim();
        extras.push({
            key,
            title: label || defaultSectionTitle(key),
            defaultExpanded: false,
            collapsible: true,
            gridCols: 2 as const,
            fields: [],
        });
    }
    if (!extras.length) return sections;
    return [...sections, ...extras];
}

function resolveDrawerCompositionSectionOrder(
    allSections: EntityDrawerSectionConfig[],
    cfg: RecordLayoutConfigJson
): string[] {
    const byKey = new Map(allSections.map((s) => [s.key, s]));
    const saved = cfg.overview_section_order;
    if (saved?.length) {
        const seen = new Set<string>();
        const order: string[] = [];
        for (const k of saved) {
            const key = k.trim();
            if (!key || seen.has(key) || !byKey.has(key)) continue;
            order.push(key);
            seen.add(key);
        }
        for (const s of allSections) {
            if (!seen.has(s.key)) order.push(s.key);
        }
        return order;
    }
    return allSections.map((s) => s.key);
}

function oppRelFieldOverride(fieldKey: string): Partial<EntityDrawerFieldConfig> | null {
    if (fieldKey === "primary_person_id") {
        return { renderHint: "link", linkTarget: { idField: "primary_person_id", entityType: "persons" } };
    }
    if (fieldKey === "location_id") {
        return { renderHint: "link", linkTarget: { idField: "location_id", entityType: "locations" } };
    }
    if (fieldKey === "primary_contact_id" || fieldKey === "contact_id") {
        return { renderHint: "link", linkTarget: { idField: "primary_contact_id", entityType: "contacts" } };
    }
    if (fieldKey === "customer_id") {
        return { renderHint: "link", linkTarget: { idField: "customer_id", entityType: "customers" } };
    }
    return null;
}

function hintFromType(t: string): EntityDrawerFieldConfig["renderHint"] {
    if (t === "phone") return "phone";
    if (t === "date") return "date";
    if (t === "datetime") return "datetime";
    if (t === "boolean") return "primary_yes_no";
    return "text";
}

function mapOppFieldDefToDrawerField(f: PreviewFieldDef): EntityDrawerFieldConfig {
    const fieldKey = f.field_key;
    const rel = oppRelFieldOverride(f.field_key);
    let baseHint = hintFromType(f.field_type);
    if (fieldKey.endsWith("_cents") || f.field_key === "discount_amount" || f.field_key === "display_total_cents") {
        baseHint = "money";
    }
    return {
        key: fieldKey,
        label: f.label ?? f.field_key,
        span: 1 as const,
        renderHint: (rel?.renderHint ?? baseHint) as EntityDrawerFieldConfig["renderHint"],
        editable: true,
        ...(rel?.linkTarget ? { linkTarget: rel.linkTarget } : {}),
    };
}

/** Mirrors `AdminEntityDrawer` opportunity overview assembly — shared with shell contract compiler. */
export function computeOpportunityOverviewSectionsLikeDrawer(
    cfg: RecordLayoutConfigJson | null,
    fieldDefs: PreviewFieldDef[],
    fieldSectionLabels: Record<string, string>,
    opts?: { applyHiddenFilter?: boolean }
): EntityDrawerSectionConfig[] {
    const applyHiddenFilter = opts?.applyHiddenFilter !== false;
    let visible = fieldDefs.filter((d) => d.is_visible_in_drawer !== false);
    visible = visible.filter((d) => !OPPORTUNITY_DRAWER_HIDE_PRICING_FIELD_KEYS.has(d.field_key));
    visible = visible.filter((d) => d.field_key !== "status");
    const oppInqLayout = cfg;
    if (oppInqLayout?.inquiry_drawer_mode === "workflow_v1") {
        visible = visible.filter((d) => !OPPORTUNITY_INQUIRY_HEADER_BODY_FIELD_KEYS.has(d.field_key));
    }

    const bySection = new Map<string, PreviewFieldDef[]>();
    for (const d of visible) {
        const sk = d.section_key ?? "details";
        if (!bySection.has(sk)) bySection.set(sk, []);
        bySection.get(sk)!.push(d);
    }
    const sectionOrder = [...bySection.entries()].sort((a, b) => {
        const aMin = Math.min(...a[1].map((f) => f.sort_order));
        const bMin = Math.min(...b[1].map((f) => f.sort_order));
        return aMin - bMin;
    });

    const sectionTitleByKey = new Map(Object.entries(fieldSectionLabels));

    const fromDefs: EntityDrawerSectionConfig[] = sectionOrder.map(([sectionKey, fields]) => ({
        key: sectionKey,
        title: sectionTitleByKey.get(sectionKey) ?? defaultSectionTitle(sectionKey),
        defaultExpanded: false,
        collapsible: true,
        gridCols: 2 as const,
        fields: fields
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((f) => mapOppFieldDefToDrawerField(f)),
    }));

    let result: EntityDrawerSectionConfig[] = [...fromDefs];
    const keys = new Set(result.map((s) => s.key));
    if (!keys.has("inquiry_children")) {
        result = [
            ...result,
            {
                key: "inquiry_children",
                title: "Inquiry children",
                defaultExpanded: true,
                collapsible: true,
                gridCols: 1,
                contentLayout: "block",
                fields: [],
                locked: true,
            },
        ];
    }

    const oppLayoutJson = cfg;
    if (oppLayoutJson?.inquiry_drawer_mode === "workflow_v1") {
        const hidden = new Set(oppLayoutJson.overview_hidden_sections ?? []);
        result = result.filter((s) => !hidden.has(s.key));
        result = result.filter((s) => !OPPORTUNITY_WORKFLOW_V1_LEGACY_OVERVIEW_SECTION_KEYS.has(s.key));

        const defByKey = new Map<string, PreviewFieldDef>();
        for (const fd of visible) {
            const prev = defByKey.get(fd.field_key);
            if (!prev || fd.sort_order < prev.sort_order) {
                defByKey.set(fd.field_key, fd);
            }
        }
        const virtuals: EntityDrawerSectionConfig[] = [];
        const wfSections = Array.isArray(oppLayoutJson.inquiry_workflow_sections) ? oppLayoutJson.inquiry_workflow_sections : [];
        for (const ws of wfSections) {
            const allowEmpty = ws.allow_empty === true;
            const fields = (ws.field_keys ?? [])
                .filter((k) => !OPPORTUNITY_INQUIRY_HEADER_BODY_FIELD_KEYS.has(k))
                .map((k) => defByKey.get(k))
                .filter((x): x is PreviewFieldDef => Boolean(x))
                .map((fd) => mapOppFieldDefToDrawerField(fd));
            if (!fields.length && !allowEmpty) continue;
            virtuals.push({
                key: ws.key,
                title: ws.title,
                defaultExpanded: ws.default_expanded !== false,
                collapsible: true,
                gridCols: 2,
                fields,
                locked: true,
            });
        }
        const tuitionSection: EntityDrawerSectionConfig = {
            key: "inquiry_tuition",
            title: "Tuition / pricing",
            defaultExpanded: false,
            collapsible: true,
            gridCols: 1,
            fields: [],
            locked: true,
        };
        const injected = new Set<string>([...virtuals.map((v) => v.key), tuitionSection.key]);
        result = [...virtuals, tuitionSection, ...result.filter((s) => !injected.has(s.key))];
    }

    let overviewSections = mergeUnifiedStatusIntoConfigOverview("opportunities", result);

    const oppDrawerCfg = cfg;
    const oppInquiryWorkflowV1 = oppDrawerCfg?.inquiry_drawer_mode === "workflow_v1";
    const oppOrder = oppDrawerCfg?.overview_section_order;
    if (oppOrder?.length && !oppInquiryWorkflowV1) {
        overviewSections = applyOverviewSectionOrder(overviewSections, oppOrder);
    }
    if (oppDrawerCfg?.suppress_body_status || oppInquiryWorkflowV1) {
        overviewSections = overviewSections.filter((s) => s.key !== "__unified_status");
    }
    if (oppInquiryWorkflowV1) {
        const savedOrder = oppDrawerCfg?.overview_section_order;
        /** Legacy default: pin inquiry children first when no explicit operator order is saved (Card 9). */
        if (!savedOrder?.length) {
            const icIdx = overviewSections.findIndex((s) => s.key === "inquiry_children");
            if (icIdx > 0) {
                const ic = overviewSections[icIdx]!;
                overviewSections = [ic, ...overviewSections.slice(0, icIdx), ...overviewSections.slice(icIdx + 1)];
            }
        }
        overviewSections = overviewSections.map((s) => (s.key === "inquiry_children" ? { ...s, defaultExpanded: true } : s));
        const stripPricingKeys = new Set(["pricing", "tuition", "tuition_pricing", "fee_schedule"]);
        if (overviewSections.some((s) => s.key === "inquiry_tuition")) {
            overviewSections = overviewSections.filter((s) => !stripPricingKeys.has(s.key));
        }
        overviewSections = overviewSections.filter((s) => !isOpportunityTourFollowUpSection(s));
        overviewSections = overviewSections.filter((s) => !isOpportunityWorkflowStandaloneExternalDuplicate(overviewSections, s));
        overviewSections = overviewSections.filter((s) => !OPPORTUNITY_WORKFLOW_V1_LEGACY_OVERVIEW_SECTION_KEYS.has(s.key));
        if (savedOrder?.length) {
            overviewSections = applyOverviewSectionOrder(overviewSections, savedOrder);
        }
    }
    if (recordOpportunityDrawerLayoutIncludesSection(oppDrawerCfg, "family_contacts")) {
        overviewSections = overviewSections.filter((s) => s.key !== "family_contacts");
    }

    overviewSections = overviewSections.filter((s) => s.key !== "tour_scheduling");

    if (applyHiddenFilter) {
        const hiddenAll = new Set(oppDrawerCfg?.overview_hidden_sections ?? []);
        if (hiddenAll.size) {
            overviewSections = overviewSections.filter((s) => !hiddenAll.has(s.key));
        }
    }

    return overviewSections;
}

export type OpportunityWorkflowV1EditorSectionRow = {
    section_key: string;
    title: string;
    kind: "workflow_virtual" | "field_section_ref" | "injected_system";
    visible: boolean;
    title_editable: boolean;
};

/** Full section list for Settings editor (includes hidden sections, preserves saved order). */
export function buildOpportunityWorkflowV1EditorSections(
    cfg: RecordLayoutConfigJson,
    fieldDefs: PreviewFieldDef[],
    fieldSectionLabels: Record<string, string>
): OpportunityWorkflowV1EditorSectionRow[] {
    const computed = computeOpportunityOverviewSectionsLikeDrawer(cfg, fieldDefs, fieldSectionLabels, {
        applyHiddenFilter: false,
    });
    const allSections = mergeExplicitCatalogSectionsInDrawerLayout(computed, cfg, fieldSectionLabels);
    const hidden = new Set(cfg.overview_hidden_sections ?? []);
    const wfKeys = new Set((cfg.inquiry_workflow_sections ?? []).map((w) => w.key));
    const byKey = new Map(allSections.map((s) => [s.key, s]));
    const order = resolveDrawerCompositionSectionOrder(allSections, cfg);

    return order.map((key) => {
        const s = byKey.get(key);
        const kind: OpportunityWorkflowV1EditorSectionRow["kind"] = wfKeys.has(key)
            ? "workflow_virtual"
            : key === "inquiry_children" || key === "inquiry_tuition" || key === "__unified_status"
              ? "injected_system"
              : "field_section_ref";
        return {
            section_key: key,
            title: s?.title ?? key.replace(/_/g, " "),
            kind,
            visible: !hidden.has(key),
            title_editable: kind === "workflow_virtual",
        };
    });
}

function toPreviewRows(sections: EntityDrawerSectionConfig[], cfg: RecordLayoutConfigJson | null): DrawerLayoutPreviewSection[] {
    const wfKeys = new Set((cfg?.inquiry_workflow_sections ?? []).map((w) => w.key));

    return sections.map((s, i) => {
        let kind: DrawerLayoutPreviewSectionKind = "field_section_ref";
        let structural: DrawerLayoutPreviewStructuralProvenance = "field_catalog";
        let detail: string | undefined;

        if (s.key === "__unified_status") {
            kind = "injected_system";
            structural = "injected_system";
            detail = "Unified status control injected from presentation template (stripped when workflow v1 or suppress_body_status).";
        } else if (s.key === "inquiry_children" || s.key === "inquiry_tuition") {
            kind = "injected_system";
            structural = "injected_system";
            detail =
                s.key === "inquiry_tuition"
                    ? "Placeholder tuition / pricing panel for inquiry workflow v1."
                    : "Child inquiries table — appended for existing opportunities.";
        } else if (cfg?.inquiry_drawer_mode === "workflow_v1" && wfKeys.has(s.key)) {
            kind = "workflow_virtual";
            structural = "workflow_generated";
            detail = "Virtual section from config_json.inquiry_workflow_sections (field_keys map into drawer-visible field_definitions).";
        } else {
            kind = "field_section_ref";
            structural = "field_catalog";
            detail = "Built from field_definitions grouped by section_key (labels from field_section_definitions when available).";
        }

        const field_keys = (s.fields ?? []).map((f) => f.key).filter(Boolean);

        return {
            position: i + 1,
            section_key: s.key,
            title: s.title ?? s.key,
            kind,
            structural_provenance: structural,
            detail,
            field_keys: field_keys.length ? field_keys : undefined,
        };
    });
}

function buildOpportunityPreview(
    cfg: RecordLayoutConfigJson,
    fieldDefs: PreviewFieldDef[],
    fieldSectionLabels: Record<string, string>
): EffectiveDrawerLayoutPreviewBundle {
    const sections = computeOpportunityOverviewSectionsLikeDrawer(cfg, fieldDefs, fieldSectionLabels);
    return { fidelity: "opportunity_runtime_mirror", sections: toPreviewRows(sections, cfg) };
}

function buildPresentationOrderedSkeleton(
    presentationEntityType: EntityPresentationType,
    cfg: RecordLayoutConfigJson
): EffectiveDrawerLayoutPreviewBundle {
    const base = (getEntityPresentation(presentationEntityType).drawer?.overviewSections ?? []) as EntityDrawerSectionConfig[];
    let overviewSections = mergeUnifiedStatusIntoConfigOverview(presentationEntityType, [...base]);

    if (presentationEntityType === "schedules" && overviewSections.length > 0) {
        const schedRank = (k: string): number => {
            if (k === "__unified_status") return -1;
            if (k === "overview" || k === "__schedule_visit_property") return 0;
            if (k === "property_service" || k === "__schedule_property_service") return 1;
            return 50;
        };
        overviewSections = [...overviewSections].sort((a, b) => schedRank(a.key) - schedRank(b.key) || a.key.localeCompare(b.key));
    }

    const fromBlocks = getSectionOrderFromScheduleLayoutBlocks(cfg.layout_blocks);
    const scheduleOrder =
        presentationEntityType === "schedules"
            ? fromBlocks?.length
                ? fromBlocks
                : cfg.overview_section_order
            : undefined;
    if (presentationEntityType === "schedules" && scheduleOrder?.length) {
        overviewSections = applyOverviewSectionOrder(overviewSections, scheduleOrder);
    }
    if (presentationEntityType === "jobs" && cfg.overview_section_order?.length) {
        overviewSections = applyOverviewSectionOrder(overviewSections, cfg.overview_section_order);
    }

    const rows: DrawerLayoutPreviewSection[] = overviewSections.map((s, i) => ({
        position: i + 1,
        section_key: s.key,
        title: s.title ?? s.key,
        kind: s.key === "__unified_status" ? ("injected_system" as const) : ("layout_static" as const),
        structural_provenance: s.key === "__unified_status" ? "injected_system" : "presentation_template",
        detail:
            presentationEntityType === "schedules" && isScheduleLayoutV2(cfg)
                ? "Order prefers layout_blocks.section_group when present; falls back to overview_section_order."
                : "Presentation overviewSections from entityPresentation + overview_section_order when set (field_definitions merges at runtime are not modeled in this skeleton).",
        field_keys: (s.fields ?? []).map((f) => f.key).filter(Boolean),
    }));

    return { fidelity: "presentation_ordered_skeleton", sections: rows };
}

function buildPersonRuntimePreview(cfg: RecordLayoutConfigJson): EffectiveDrawerLayoutPreviewBundle {
    const personRuntime = buildPersonRuntimeLayoutSettingsPreview(cfg);
    const sections: DrawerLayoutPreviewSection[] = [];

    for (const variant of personRuntime.variants) {
        for (const op of variant.operating_sections) {
            sections.push({
                position: sections.length + 1,
                section_key: op.section_key,
                title: op.label,
                kind: "layout_static",
                structural_provenance: "presentation_template",
                detail: `Operating module on ${variant.label} (${variant.variant_key}).`,
            });
        }
    }

    return {
        fidelity: "person_runtime_mirror",
        sections,
        person_runtime: personRuntime,
    };
}

/**
 * Build read-only preview rows for Settings. Opportunity uses full mirror; job/schedule use ordered skeleton.
 */
export function buildEffectiveDrawerLayoutPreview(params: {
    presentationEntityType: EntityPresentationType;
    config: RecordLayoutConfigJson;
    fieldDefinitions?: PreviewFieldDef[];
    fieldSectionLabels?: Record<string, string>;
}): EffectiveDrawerLayoutPreviewBundle {
    const labels = params.fieldSectionLabels ?? {};
    const defs = params.fieldDefinitions ?? [];

    if (params.presentationEntityType === "opportunities") {
        return buildOpportunityPreview(params.config, defs, labels);
    }
    if (params.presentationEntityType === "persons") {
        if (params.config.person_drawer_mode === "runtime_v1") {
            return buildPersonRuntimePreview(params.config);
        }
        return buildPresentationOrderedSkeleton(params.presentationEntityType, params.config);
    }
    if (params.presentationEntityType === "jobs" || params.presentationEntityType === "schedules") {
        return buildPresentationOrderedSkeleton(params.presentationEntityType, params.config);
    }
    return { fidelity: "presentation_ordered_skeleton", sections: [] };
}

/**
 * Section keys the opportunity workflow v1 drawer would show with **no** saved `overview_section_order`
 * (used to validate a full permutation when operators save explicit ordering — Card 9).
 */
export function listOpportunityWorkflowV1CanonicalSectionKeys(
    cfg: RecordLayoutConfigJson,
    fieldDefs: PreviewFieldDef[],
    fieldSectionLabels: Record<string, string>,
    options?: { proposedOrder?: string[] }
): string[] {
    if (cfg.inquiry_drawer_mode !== "workflow_v1") return [];
    const computed = computeOpportunityOverviewSectionsLikeDrawer(
        { ...cfg, overview_section_order: undefined },
        fieldDefs,
        fieldSectionLabels,
        { applyHiddenFilter: false }
    );
    const merged = mergeExplicitCatalogSectionsInDrawerLayout(computed, cfg, fieldSectionLabels);
    const keys = new Set(merged.map((s) => s.key));
    for (const raw of options?.proposedOrder ?? []) {
        const k = raw.trim();
        if (!k || keys.has(k)) continue;
        if (fieldSectionLabels[k]) keys.add(k);
    }
    return [...keys];
}

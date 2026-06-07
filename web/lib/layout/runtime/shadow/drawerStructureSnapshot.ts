/**
 * Drawer structure snapshot — normalized capture for shadow parity (Phase 3).
 *
 * Comparable tree-flattened nodes from VM drawer vs layout runtime plan.
 * Proof / telemetry only — not used in production render paths.
 */

export type DrawerStructureNodeKind =
    | "tab"
    | "section"
    | "field"
    | "field_group"
    | "widget"
    | "relationship_section"
    | "repeater";

export type DrawerStructureNode = {
    kind: DrawerStructureNodeKind;
    /** Stable comparison key (section key, refKey, widget key). */
    key: string;
    label?: string;
    refKey?: string;
    /** Dot path for reporting (e.g. overview.lead_summary.person.primary_phone). */
    path: string;
    bindingClass?: string;
};

export type DrawerStructureSnapshot = {
    source: "vm" | "layout_runtime";
    entityType: "opportunities";
    recordId?: string;
    tabs: string[];
    defaultTab?: string;
    nodes: DrawerStructureNode[];
    /** Scope note (e.g. layout models overview body only). */
    scopeNote?: string;
};

export type ShadowParityMismatchCategory =
    | "tab_missing_in_layout"
    | "tab_extra_in_layout"
    | "section_missing_in_layout"
    | "section_extra_in_layout"
    | "field_missing_in_layout"
    | "field_extra_in_layout"
    | "widget_missing_in_layout"
    | "widget_extra_in_layout"
    | "relationship_section_missing_in_layout"
    | "relationship_section_extra_in_layout"
    | "repeater_missing_in_layout"
    | "repeater_extra_in_layout"
    | "ref_key_mismatch"
    | "binding_class_mismatch";

export type ShadowParityMismatch = {
    category: ShadowParityMismatchCategory;
    vmPath?: string;
    layoutPath?: string;
    vmKey?: string;
    layoutKey?: string;
    detail: string;
};

export type ShadowParityReport = {
    recordId?: string;
    layoutKey?: string;
    layoutSource?: string;
    vmNodeCount: number;
    layoutNodeCount: number;
    matched: {
        tabs: string[];
        sections: string[];
        fields: string[];
        widgets: string[];
        relationship_sections: string[];
        repeaters: string[];
    };
    mismatches: ShadowParityMismatch[];
    missingCoverage: {
        vmOnly: string[];
        layoutOnly: string[];
    };
    parityScore: number;
    summary: string;
};

export type ShadowCoverageBucket = {
    matched: number;
    total: number;
    percent: number;
};

export type ShadowParityCoverageMetrics = {
    overall: number;
    tabs: ShadowCoverageBucket;
    sections: ShadowCoverageBucket;
    fields: ShadowCoverageBucket;
    widgets: ShadowCoverageBucket;
    relationship_sections: ShadowCoverageBucket;
    repeaters: ShadowCoverageBucket;
    binding_classes: Record<string, ShadowCoverageBucket>;
};

export type ShadowConvergenceGap = {
    category: ShadowParityMismatchCategory | "unsupported_binding" | "unmapped_vm";
    key: string;
    detail: string;
    impact: "high" | "medium" | "low";
};

export type MigrationReadinessAssessment = {
    level: "not_ready" | "partial" | "approaching" | "ready";
    parityScore: number;
    fieldCoveragePercent: number;
    blockers: string[];
    notes: string[];
};

/** Phase 4 — real-record shadow validation report (extends base parity). */
export type RealRecordShadowValidationReport = ShadowParityReport & {
    opportunityId: string;
    coverage: ShadowParityCoverageMetrics;
    topGaps: ShadowConvergenceGap[];
    unmapped: string[];
    unsupported: string[];
    extra: string[];
    readiness: MigrationReadinessAssessment;
};

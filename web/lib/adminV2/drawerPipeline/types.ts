import type { DrawerTabKey } from "@/lib/entityPresentation";
import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";

/** Entity record surface from GET /api/admin/entity (staged hydrate). */
export type DrawerRecordSurface =
    | "drawer_visible"
    | "drawer_primary"
    | "drawer_initial"
    | "full"
    | string;

/** How a drawer section participates in first paint vs deferred hydrate. */
export type DrawerSectionLifecycle =
    | "immediate"
    | "reserved_placeholder"
    | "below_fold_deferred"
    | "hidden";

export type DrawerSectionSlot = {
    section_key: string;
    lifecycle: DrawerSectionLifecycle;
    shell_min_height_class?: string;
};

/**
 * Frozen layout map — structure only. Values hydrate inside slots via render model.
 * Entity adapters compile geometry + sections; generic renderer owns composition.
 */
export type DrawerShellContract = {
    entity_type: string;
    layout_version: string;
    tabs: DrawerTabKey[];
    overview_sections: EntityDrawerSectionConfig[];
    section_slots: DrawerSectionSlot[];
    /** Adapter-specific geometry flags (typed accessors live in adapters). */
    geometry: Record<string, unknown>;
    layout_config_snapshot: Record<string, unknown>;
};

export type DrawerEnrichmentPhase = "visible" | "primary" | "full";

/**
 * Explicit hydrate phases — no single "ready" flag.
 * Warnings and layout must not key off pending primary omissions.
 */
export type DrawerEnrichmentState = {
    record_surface: DrawerRecordSurface;
    primary_loaded: boolean;
    full_pending: boolean;
    full_complete: boolean;
    /** Background `surface=full` failed after final attempt only. */
    background_full_failed: boolean;
    enrichment_held_until_interaction: boolean;
};

/** Server/client plan for staged entity GET surfaces. */
export type DrawerHydrationPlan = {
    entity_type: string;
    surfaces: {
        visible: { enabled: boolean; owner: "bootstrap" | "entity_get" };
        primary: {
            enabled: boolean;
            skip_field_registry: boolean;
            parallel_shell_attaches: string[];
        };
        full: { enabled: boolean; deferred: boolean };
    };
};

/** Per-section render instruction — structure fixed, value phase may change. */
export type DrawerSectionValuePhase = "skeleton" | "value" | "empty_confirmed" | "error";

export type DrawerSectionRenderModel = {
    section_key: string;
    lifecycle: DrawerSectionLifecycle;
    default_expanded: boolean;
    collapsible: boolean;
    value_phase: DrawerSectionValuePhase;
    shell_min_height_class?: string;
};

export type DrawerInquirySummaryColumnMode = "one" | "two";

export type DrawerTaskPreviewRenderSlot = {
    confirmed: boolean;
    open_count: number;
    open_tasks: Array<{
        id: string;
        title: string;
        due_at: string;
        status: string;
        source: string;
    }>;
    show_reminders_placeholder: boolean;
    show_operational_strip: boolean;
};

export type DrawerWhatMattersRenderSlot = {
    reserved: boolean;
    tour_from_metadata: boolean;
    show_tour_bookings_enrichment: boolean;
};

export type DrawerFamilyContactsRenderSlot = {
    use_full_panel: boolean;
    shell_reserved_additional_count: number;
    relationships_full_hydrate_failed: boolean;
    relationships_pending: boolean;
};

export type DrawerSignalTone = "neutral" | "info" | "warning" | "critical";

/** Job (and future) header signal strip — values hydrate; structure reserved at shell paint. */
export type DrawerHeaderSignalsRenderSlot = {
    reserved: boolean;
    presentation: "default" | "cleaningRecordModal";
    value_phase: DrawerSectionValuePhase;
    lines: {
        paymentLabel: string;
        paymentTone: DrawerSignalTone;
        scheduleLabel: string;
        scheduleTone: DrawerSignalTone;
        assignmentLabel: string;
        assignmentTone: DrawerSignalTone;
    } | null;
};

/** Above-fold composition owned by generic pipeline — entity adapter fills slot values only. */
export type DrawerAboveFoldRenderModel = {
    header_signals?: DrawerHeaderSignalsRenderSlot;
    inquiry_summary?: {
        column_mode: DrawerInquirySummaryColumnMode;
        show_right_column: boolean;
        family_contacts: DrawerFamilyContactsRenderSlot;
        what_matters: DrawerWhatMattersRenderSlot;
        task_preview: DrawerTaskPreviewRenderSlot;
    };
    sections: DrawerSectionRenderModel[];
};

/** Full pipeline snapshot for one open drawer entity. */
export type DrawerPipelineState = {
    shell: DrawerShellContract;
    enrichment: DrawerEnrichmentState;
    hydration_plan: DrawerHydrationPlan;
    above_fold: DrawerAboveFoldRenderModel;
};

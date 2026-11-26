/**
 * Business Processes presentation contracts — view-model shapes the Business Processes product
 * UI (Collection → Selected Process → Focused Workspace) is designed against. Some compose
 * existing lifecycle APIs today; others document Planned surfaces that must render static Planned
 * copy rather than invent fetchers or history until a real backend exists.
 *
 * These are presentation contracts only — not sources of truth and not new domain tables/APIs.
 * No new process/stage runtime, no parallel builder, no schema changes.
 *
 * See: `docs/platform/operator/business-processes-product-ui.md`
 * See: `.alloy-agent-evidence/business-processes-ui-discovery/BP-UI-DISCOVERY.md`
 */

import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";

/** Business Processes collection rail — sourced 1:1 from `GET /api/admin/lifecycle-catalog`. */
export type BusinessProcessCollectionVm = {
    processes: {
        id: LifecycleCatalogEntry["id"];
        name: string;
        stageCount: number;
        /** Never invented — derived from `workspace.runtime_status` / `department_is_active`. */
        healthHint: "healthy" | "attention" | "not-visible";
        isActive: boolean;
    }[];
};

/** Selected Process header — Name, Active/Inactive badge, meta, Edit/More actions. */
export type BusinessProcessSelectedHeaderVm = {
    id: string;
    name: string;
    isActive: boolean;
    stageCount: number;
    healthHint: "healthy" | "attention" | "not-visible";
    canDelete: boolean;
    canRepair: boolean;
};

/**
 * Overview tab — presentation only, composed from data the Focused Workspace board already
 * loads (builder stages, catalog entry, ready-check revision). Never fetches independently and
 * never fabricates a history/timeline section.
 */
export type BusinessProcessOverviewVm = {
    processId: string;
    name: string;
    isActive: boolean;
    stageLabels: string[];
    trackLabels: string[] | null;
    /** Null when Work Views have not loaded yet — omitted rather than shown as a fabricated zero. */
    workViewsCount: number | null;
    /** From the existing `lifecycle-activation/validate` ready-check, not a new health system. */
    readinessSummary: "unknown" | "pass" | "fail";
    /**
     * Org-owned process definition. Location activation exists only where the existing builder
     * already supports it; this contract does not assert a location-override matrix.
     */
    availability: {
        label: "Organization definition";
        locationOverridesSupported: false;
    };
};

/**
 * Planned: Process configuration history (stage/work-view/action/automation changes over time).
 * No event/audit table exists for Business Process configuration yet. Renders a calm empty card
 * with `data-capability="planned"` — no events are fabricated for display.
 */
export type BusinessProcessHistoryVm = {
    processId: string;
    entries: {
        id: string;
        occurredAt: string;
        title: string;
        detail: string;
        actorLabel: string | null;
        section: string | null;
    }[];
};

/**
 * Planned: process-level automation authoring (platform-triggered behavior — workflows that run
 * when records move, timers fire, or outcomes complete). `BusinessProcessAutomationShell` renders
 * this as a static Planned card only; no automation-runtime fetch is made.
 */
export type BusinessProcessAutomationVm = {
    processId: string;
    automations: {
        id: string;
        label: string;
        triggerSummary: string;
        isActive: boolean;
    }[];
};

/**
 * Planned: per-location availability overrides for an org-owned process. Distinct from the
 * truthful "Organization definition" summary already shown on the Overview tab — this contract
 * exists only so a future real override matrix has a documented shape to implement against.
 */
export type BusinessProcessLocationAvailabilityVm = {
    processId: string;
    locations: {
        locationId: string;
        locationLabel: string;
        available: boolean;
    }[];
};

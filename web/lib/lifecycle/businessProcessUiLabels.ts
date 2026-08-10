/**
 * Operator-facing Business Processes labels — user-facing copy only.
 * Internal types, APIs, and metadata keys remain lifecycle_*.
 */

export const BUSINESS_PROCESS_SETTINGS_PAGE_TITLE = "Processes";
export const BUSINESS_PROCESS_SETTINGS_PAGE_SUBTITLE =
    "Design how work moves through your organization.";

export const BUSINESS_PROCESS_CATALOG_LABEL = "Processes";
export const BUSINESS_PROCESS_CATALOG_EMPTY = "No processes yet";
export const BUSINESS_PROCESS_CATALOG_LOADING = "Loading processes…";
export const BUSINESS_PROCESS_CATALOG_VIEW_ALL = "View all";
export const BUSINESS_PROCESS_CATALOG_CREATE = "Create Process";
export const BUSINESS_PROCESS_CATALOG_SELECT_ARIA = "Select business process";
export const BUSINESS_PROCESS_CATALOG_BACK = "All processes";

/**
 * Process-level workspace navigation sections.
 * "overview" and "history" are Selected-Process header tabs only — they are deliberately
 * excluded from `CONFIGURATION_PROCESS_QUEUE_SECTIONS` (the frozen 5-item internal Configure/
 * Process/Health nav) so existing doctrine tests for that nav stay unchanged.
 */
export type BusinessProcessWorkspaceSection =
    | "overview"
    | "stages"
    | "participation"
    | "work-views"
    | "presentation"
    | "actions"
    | "automation"
    | "health"
    | "history";

export const BUSINESS_PROCESS_NAV_OVERVIEW = "Overview";
export const BUSINESS_PROCESS_NAV_PARTICIPATION = "Participation";
export const BUSINESS_PROCESS_NAV_STAGES = "Stages";
export const BUSINESS_PROCESS_NAV_WORK_VIEWS = "Work Views";
export const BUSINESS_PROCESS_NAV_PRESENTATION = "Presentation";
export const BUSINESS_PROCESS_NAV_ACTIONS = "Commands";
export const BUSINESS_PROCESS_NAV_AUTOMATION = "Automation";
export const BUSINESS_PROCESS_NAV_HEALTH = "Configuration Health";
export const BUSINESS_PROCESS_NAV_HISTORY = "History";
export const BUSINESS_PROCESS_CONFIGURATION_HEALTH_SUMMARY =
    "Checks whether this process is ready for operators.";

/** Selected-Process header tab order (product IA) — overview and history bracket the existing five. */
export const BUSINESS_PROCESS_HEADER_TABS: readonly {
    key: BusinessProcessWorkspaceSection;
    label: string;
}[] = [
    { key: "overview", label: BUSINESS_PROCESS_NAV_OVERVIEW },
    { key: "stages", label: BUSINESS_PROCESS_NAV_STAGES },
    { key: "work-views", label: BUSINESS_PROCESS_NAV_WORK_VIEWS },
    { key: "actions", label: BUSINESS_PROCESS_NAV_ACTIONS },
    { key: "automation", label: BUSINESS_PROCESS_NAV_AUTOMATION },
    { key: "health", label: "Health" },
    { key: "history", label: BUSINESS_PROCESS_NAV_HISTORY },
];

/** Deep-link section values `/settings/processes?section=` accepts — prior names included. */
const BUSINESS_PROCESS_DEEP_LINK_SECTIONS: readonly BusinessProcessWorkspaceSection[] = [
    "overview",
    "stages",
    "work-views",
    "actions",
    "automation",
    "health",
    "history",
];

/**
 * Normalizes a raw `?section=` query value into a valid Selected-Process header tab.
 * Unknown or absent values default to "overview" (the collection-first entry point).
 */
export function normalizeBusinessProcessSection(raw: string | null | undefined): BusinessProcessWorkspaceSection {
    const value = (raw ?? "").trim().toLowerCase();
    const match = BUSINESS_PROCESS_DEEP_LINK_SECTIONS.find((section) => section === value);
    return match ?? "overview";
}

/** Business Processes collection rail (left of Selected Process workspace). */
export const BUSINESS_PROCESS_COLLECTION_TITLE = "Business Processes";
export const BUSINESS_PROCESS_COLLECTION_SUBTITLE = "Manage how operational work moves through Alloy.";
export const BUSINESS_PROCESS_COLLECTION_NEW = "New Business Process";
export const BUSINESS_PROCESS_COLLECTION_SEARCH_PLACEHOLDER = "Search processes\u2026";
export const BUSINESS_PROCESS_COLLECTION_EMPTY_SEARCH = "No processes match this search.";

export const BUSINESS_PROCESS_NO_SELECTION_TITLE = "Choose a Business Process";
export const BUSINESS_PROCESS_NO_SELECTION_DESCRIPTION =
    "Select a Process to configure its stages, work views, commands, automation, and health.";

export const BUSINESS_PROCESS_EDIT_ACTION = "Edit Process";
export const BUSINESS_PROCESS_MORE_ACTION = "More";

/** Honest health hint for the collection rail — derived from catalog workspace runtime truth. */
export const BUSINESS_PROCESS_HEALTH_HINT_HEALTHY = "Healthy";
export const BUSINESS_PROCESS_HEALTH_HINT_ATTENTION = "Needs attention";
export const BUSINESS_PROCESS_HEALTH_HINT_NOT_VISIBLE = "Not visible";

/** Overview tab (presentation only — no fabricated history or invented data). */
export const BUSINESS_PROCESS_OVERVIEW_SNAPSHOT_TITLE = "Process Snapshot";
export const BUSINESS_PROCESS_OVERVIEW_JOURNEY_TITLE = "Journey";
export const BUSINESS_PROCESS_OVERVIEW_JOURNEY_EMPTY = "Add a stage to begin the journey for this process.";
export const BUSINESS_PROCESS_OVERVIEW_OPERATOR_EXPERIENCE_TITLE = "Operator Experience";
export const BUSINESS_PROCESS_OVERVIEW_READINESS_TITLE = "Configuration Readiness";
export const BUSINESS_PROCESS_OVERVIEW_READINESS_REVIEW = "Review Health";
export const BUSINESS_PROCESS_OVERVIEW_AVAILABILITY_LABEL = "Availability";
export const BUSINESS_PROCESS_OVERVIEW_AVAILABILITY_VALUE = "Organization definition";
export const BUSINESS_PROCESS_OVERVIEW_AVAILABILITY_NOTE =
    "This process is defined once for the organization. Location-level availability overrides are Planned — none are invented here.";
export const BUSINESS_PROCESS_OVERVIEW_OPEN_STAGES = "Open Stages";
export const BUSINESS_PROCESS_OVERVIEW_OPEN_WORK_VIEWS = "Open Work Views";
export const BUSINESS_PROCESS_OVERVIEW_OPEN_ACTIONS = "Open Commands";

/** History tab — Planned, no fabricated events. */
export const BUSINESS_PROCESS_HISTORY_TITLE = "History";
export const BUSINESS_PROCESS_HISTORY_PLANNED =
    "Process configuration history will appear here when available. No events are fabricated.";

/** Automation tab — calm Planned placeholder copy (existing BusinessProcessAutomationShell). */
export const BUSINESS_PROCESS_AUTOMATION_PLANNED_BODY =
    "Automation is Planned for this process. When available, you'll configure workflow triggers and platform-driven actions here.";

export const BUSINESS_PROCESS_WORK_VIEWS_INTRO =
    "Work Views define how operators focus on work in this process.";
export const BUSINESS_PROCESS_WORK_VIEW_ADD = "Add Work View";
export const BUSINESS_PROCESS_WORK_VIEW_SHOW_WORK_WHEN = "Show work when…";
export const BUSINESS_PROCESS_WORK_VIEW_SHOW_WHEN_ALL = "All work in this process";
export const BUSINESS_PROCESS_WORK_VIEW_SHOW_WHEN_CONDITIONS = "Conditions";
export const BUSINESS_PROCESS_WORK_VIEW_CATCH_ALL_HELPER =
    "All includes every eligible row in this process. Rows may come from different stages or grains.";
export const BUSINESS_PROCESS_WORK_VIEW_DEFAULT_ORDER = "Display order";
export const BUSINESS_PROCESS_WORK_VIEW_TECHNICAL_IDENTITY = "Advanced · Technical identity";
export const BUSINESS_PROCESS_WORK_VIEW_UNSAVED_HINT =
    "Work Views define how operators focus on work in this process. Save to persist configuration.";
export const BUSINESS_PROCESS_WORK_VIEW_PREVIEW_PENDING =
    "Preview runtime opens the workspace with this Work View active — filters and assigned layouts apply when saved.";

export const BUSINESS_PROCESS_SECTION_MEMBERSHIP = "Stage Membership";
export const BUSINESS_PROCESS_SECTION_MEMBERSHIP_SUMMARY =
    "Stages are rollups. Records appear in this stage when their status matches the rules below.";
export const BUSINESS_PROCESS_SECTION_REQUIRED = "Stage requirements";
export const BUSINESS_PROCESS_SECTION_REQUIRED_SUMMARY =
    "Fields recommended or required while a record is in this stage.";
export const BUSINESS_PROCESS_STAGE_REQUIREMENTS_HELPER =
    "Choose which configured fields should be recommended or required while a record is in this stage.";

/** Honest field-source note until stage requirements converge on layout field keys. */
export const BUSINESS_PROCESS_STAGE_REQUIREMENTS_FIELD_SOURCE_NOTE =
    "Fields come from your org field registry (Fields settings) plus platform enrollment defaults. Stage requiredness is stored separately from Layout placement — see configuration-ownership-doctrine.";

export const BUSINESS_PROCESS_SECTION_ACTIONS = "Commands in this stage";
export const BUSINESS_PROCESS_SECTION_ACTIONS_SUMMARY =
    "Commands available to staff while records are in this stage.";
export const BUSINESS_PROCESS_PROCESS_ACTIONS_TITLE = "Process Commands";
export const BUSINESS_PROCESS_PROCESS_ACTIONS_SUMMARY =
    "Configure which commands are available in this process and where they appear.";
export const BUSINESS_PROCESS_SECTION_READY = "Ready Check";
export const BUSINESS_PROCESS_SECTION_READY_SUMMARY =
    "Confirm this stage is ready for staff on the workspace.";
export const BUSINESS_PROCESS_SECTION_QUEUE_ADVANCED = "Queue presentation";
export const BUSINESS_PROCESS_SECTION_QUEUE_ADVANCED_SUMMARY =
    "This stage can appear as a workspace queue. Queue layout is managed in Layouts.";

export const BUSINESS_PROCESS_CREATE_TITLE = "Create a Business Process";
export const BUSINESS_PROCESS_CREATE_SUBTITLE =
    "Name the process you are building. You will configure process stages next.";
export const BUSINESS_PROCESS_CREATE_NAME_LABEL = "Process name";
export const BUSINESS_PROCESS_CREATE_DESCRIPTION_LABEL = "Process description (optional)";
export const BUSINESS_PROCESS_CREATE_SUBMIT = "Create Process";
export const BUSINESS_PROCESS_CREATE_NAME_REQUIRED = "Process name is required";

export const BUSINESS_PROCESS_STAGE_HEADER = "Process Stage";
export const BUSINESS_PROCESS_SAVE_STAGE = "Save stage";

/** Stage editor section titles (operator language). */
export const BUSINESS_PROCESS_SECTION_WHO_BELONGS = "Who belongs here?";
export const BUSINESS_PROCESS_SECTION_WHO_BELONGS_SUMMARY =
    "Which families, children, or candidates appear in this stage.";

/** Top-level stage section — groups purpose, work, success, and attention rules. */
export const BUSINESS_PROCESS_SECTION_OPERATING_PLAN = "Operating Plan";
export const BUSINESS_PROCESS_SECTION_OPERATING_PLAN_SUMMARY =
    "What staff should do in this stage: purpose, expected work, success criteria, and when records need attention. Process Commands are configured at the process level below the stage list.";

export const BUSINESS_PROCESS_SECTION_PERSPECTIVES = "Work Views";
export const BUSINESS_PROCESS_SECTION_PERSPECTIVES_SUMMARY =
    "Operational lenses staff switch between in the work unit — each maps to a synced queue lane.";
export const BUSINESS_PROCESS_PERSPECTIVES_INTRO =
    "Each work view is an operational lens staff switch between in the work unit. Configure what operators see, the mission, and visibility — presentation is authored in Layouts.";
export const BUSINESS_PROCESS_PERSPECTIVES_SINGLE_LANE_NOTE =
    "This stage exposes one work view. Multiple views appear when a stage syncs several queue lanes.";
export const BUSINESS_PROCESS_PERSPECTIVES_NO_LANES_NOTE =
    "Save this stage once to sync queue lanes, then configure work views here.";

/** Concept A — Universal Card titles and questions (stage workspace). */
export const BUSINESS_PROCESS_CARD_STATUS_MEMBERSHIP = "Status membership";
export const BUSINESS_PROCESS_CARD_STATUS_MEMBERSHIP_QUESTION = "Who belongs here?";
export const BUSINESS_PROCESS_CARD_REQUIRED = "Required information";
export const BUSINESS_PROCESS_CARD_REQUIRED_QUESTION = "What must be completed?";
export const BUSINESS_PROCESS_CARD_PERSPECTIVES = "Work Views";
export const BUSINESS_PROCESS_CARD_PERSPECTIVES_QUESTION = "How operators view this work.";
export const BUSINESS_PROCESS_CARD_PRESENTATION = "Presentation";
export const BUSINESS_PROCESS_CARD_PRESENTATION_QUESTION = "What operators see.";
export const BUSINESS_PROCESS_CARD_OPERATING_PLAN = "Operating plan";
export const BUSINESS_PROCESS_CARD_OPERATING_PLAN_QUESTION = "What staff should do in this stage.";
export const BUSINESS_PROCESS_CARD_READY = "Ready check";
export const BUSINESS_PROCESS_CARD_READY_QUESTION = "Is this stage complete?";

export const BUSINESS_PROCESS_PREVIEW_WORK_UNIT = "Preview work unit";

/** Concept A — operational lens field labels. */
export const BUSINESS_PROCESS_LENS_OPERATORS_SEE = "Operators see";
export const BUSINESS_PROCESS_LENS_MISSION = "Mission";
export const BUSINESS_PROCESS_LENS_WORK_INCLUDED = "Work included";
export const BUSINESS_PROCESS_LENS_WORK_INCLUDED_NOTE =
    "Derived from synced queue lane filters and stage membership. Editable business filters ship in a follow-up.";
export const BUSINESS_PROCESS_LENS_SORTED_BY = "Sorted by";
export const BUSINESS_PROCESS_LENS_PRESENTATION = "Presentation";
export const BUSINESS_PROCESS_LENS_VISIBLE_IN_WORK_UNIT = "Visible in work unit";
export const BUSINESS_PROCESS_LENS_PREVIEW_RUNTIME = "Preview runtime";
export const BUSINESS_PROCESS_LENS_ADVANCED_IDENTITY = "Advanced · Technical identity";
export const BUSINESS_PROCESS_LENS_OPEN_LAYOUTS = "Open in Layouts";

/** Concept A — presentation card copy. */
export const BUSINESS_PROCESS_PRESENTATION_CARD_INTRO =
    "Operators see these layouts when working {stage} records in the workspace.";
export const BUSINESS_PROCESS_PRESENTATION_QUEUE = "Queue preview";
export const BUSINESS_PROCESS_PRESENTATION_FOCUS_PANEL = "Focus Panel preview";
export const BUSINESS_PROCESS_PRESENTATION_CHANGE = "Change";
export const BUSINESS_PROCESS_PRESENTATION_SURFACE_DEFAULT_LABEL = "Surface default";
export const BUSINESS_PROCESS_PRESENTATION_SURFACE_DEFAULT_EXPLANATION =
    "Uses the published default layout for this surface.";
export const BUSINESS_PROCESS_PRESENTATION_UNPUBLISHED_WARNING =
    "Assigned layout is not published — operators may not see this presentation until it is published in Layouts.";
export const BUSINESS_PROCESS_PRESENTATION_OPEN_LAYOUTS = "Need a new layout? Author in Experience Builder:";

export const BUSINESS_PROCESS_SECTION_EXPECTED_WORK = "Expected work";
export const BUSINESS_PROCESS_SECTION_EXPECTED_WORK_SUMMARY =
    "Tasks and outcomes staff should complete while records are in this stage.";

export const BUSINESS_PROCESS_SECTION_ATTENTION = "Attention";
export const BUSINESS_PROCESS_SECTION_ATTENTION_SUMMARY =
    "When records in this stage should surface for follow-up. Off-track rules are edited in Expected work above; org-wide bucket labels are in advanced Attention defaults.";
export const BUSINESS_PROCESS_SECTION_ATTENTION_ORG_DEFAULTS_LINK = "Org-wide attention defaults";

export const BUSINESS_PROCESS_PROCESS_ACTIONS_GUIDANCE =
    "Enable and restrict commands for this process in Process Commands — not per-stage queue settings.";

export const BUSINESS_PROCESS_SECTION_PURPOSE = "Purpose";
export const BUSINESS_PROCESS_SECTION_SUCCESS = "Success Criteria";
export const BUSINESS_PROCESS_SECTION_OFF_TRACK = "Off Track Criteria";

export const BUSINESS_PROCESS_CROSS_LINK_OPEN = "Open Processes";

export const BUSINESS_PROCESS_BREADCRUMB = "Processes";

export const BUSINESS_PROCESS_SETTINGS_TILE_TITLE = "Processes";

/** Default enrollment process name for new builder processes. */
export const ENROLLMENT_PROCESS_DISPLAY_NAME = "Enrollment Process";

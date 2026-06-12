/**
 * Operator-facing Business Processes labels — user-facing copy only.
 * Internal types, APIs, and metadata keys remain lifecycle_*.
 */

export const BUSINESS_PROCESS_SETTINGS_PAGE_TITLE = "Business Processes";
export const BUSINESS_PROCESS_SETTINGS_PAGE_SUBTITLE =
    "Configure how work moves — stage membership, requirements, operating plan, and process actions.";

export const BUSINESS_PROCESS_CATALOG_LABEL = "Processes";
export const BUSINESS_PROCESS_CATALOG_EMPTY = "No processes yet";
export const BUSINESS_PROCESS_CATALOG_LOADING = "Loading processes…";
export const BUSINESS_PROCESS_CATALOG_CREATE = "Create Process";
export const BUSINESS_PROCESS_CATALOG_SELECT_ARIA = "Select business process";
export const BUSINESS_PROCESS_CATALOG_BACK = "All processes";

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

export const BUSINESS_PROCESS_SECTION_ACTIONS = "Actions in this stage";
export const BUSINESS_PROCESS_SECTION_ACTIONS_SUMMARY =
    "Actions available to staff while records are in this stage.";
export const BUSINESS_PROCESS_PROCESS_ACTIONS_TITLE = "Process Actions";
export const BUSINESS_PROCESS_PROCESS_ACTIONS_SUMMARY =
    "Configure which actions are available in this process and where they appear.";
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
    "What staff should do in this stage: purpose, expected work, success criteria, and when records need attention. Process Actions are configured at the process level below the stage list.";

export const BUSINESS_PROCESS_SECTION_EXPECTED_WORK = "Expected work";
export const BUSINESS_PROCESS_SECTION_EXPECTED_WORK_SUMMARY =
    "Tasks and outcomes staff should complete while records are in this stage.";

export const BUSINESS_PROCESS_SECTION_ATTENTION = "Attention";
export const BUSINESS_PROCESS_SECTION_ATTENTION_SUMMARY =
    "When records in this stage should surface for follow-up. Off-track rules are edited in Expected work above; org-wide bucket labels are in advanced Attention defaults.";
export const BUSINESS_PROCESS_SECTION_ATTENTION_ORG_DEFAULTS_LINK = "Org-wide attention defaults";

export const BUSINESS_PROCESS_PROCESS_ACTIONS_GUIDANCE =
    "Enable and restrict actions for this process in Process Actions — not per-stage queue settings.";

export const BUSINESS_PROCESS_SECTION_PURPOSE = "Purpose";
export const BUSINESS_PROCESS_SECTION_SUCCESS = "Success Criteria";
export const BUSINESS_PROCESS_SECTION_OFF_TRACK = "Off Track Criteria";

export const BUSINESS_PROCESS_CROSS_LINK_OPEN = "Open Business Processes";

export const BUSINESS_PROCESS_BREADCRUMB = "Business Processes";

export const BUSINESS_PROCESS_SETTINGS_TILE_TITLE = "Business Processes";

/** Default enrollment process name for new builder processes. */
export const ENROLLMENT_PROCESS_DISPLAY_NAME = "Enrollment Process";

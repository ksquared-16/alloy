/**
 * Relationship-aware Context block — config shape (aligned with UI_V2_Workspace_System_Spec).
 * UI renders from normalized view models; adapters map config + entity payloads into those models.
 */

export type WorkspaceLevel = "organization" | "department" | "work_unit" | "record";

/** Raw config as stored / returned from onboarding or backend */
export type ContextRelationshipGroupConfig = {
  key: string;
  label: string;
  source: {
    relationship_type_keys: string[];
    entity_type: string;
  };
  order: number;
  visibility: {
    levels: WorkspaceLevel[];
    roles?: string[];
  };
  display: {
    style: "list" | "compact_cards";
    max_items: number;
    default_expanded: boolean;
    preview_fields: string[];
  };
  actions: string[];
};

export type ContextBlockConfig = {
  block: "context";
  entity_type: string;
  relationship_groups: ContextRelationshipGroupConfig[];
};

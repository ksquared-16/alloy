import type { ContextBlockConfig } from "../context-config";

/** Example cleaning vertical — labels are data, not hardcoded in components */
export const DEMO_CLEANING_CONTEXT_CONFIG: ContextBlockConfig = {
  block: "context",
  entity_type: "job",
  relationship_groups: [
    {
      key: "site_contacts",
      label: "Site contacts",
      source: { relationship_type_keys: ["site_contact", "property_manager"], entity_type: "person" },
      order: 1,
      visibility: { levels: ["department", "work_unit", "record"] },
      display: {
        style: "list",
        max_items: 4,
        default_expanded: true,
        preview_fields: ["name", "phone"],
      },
      actions: ["message", "open_record"],
    },
    {
      key: "team_availability",
      label: "Team availability",
      source: { relationship_type_keys: ["assigned_team"], entity_type: "person" },
      order: 2,
      visibility: { levels: ["department", "work_unit"] },
      display: {
        style: "compact_cards",
        max_items: 6,
        default_expanded: false,
        preview_fields: ["name", "status"],
      },
      actions: ["notify", "open_record"],
    },
  ],
};

/** Example childcare vertical — same component tree, different config */
export const DEMO_CHILDCARE_CONTEXT_CONFIG: ContextBlockConfig = {
  block: "context",
  entity_type: "classroom_session",
  relationship_groups: [
    {
      key: "guardians",
      label: "Guardians",
      source: { relationship_type_keys: ["guardian", "parent"], entity_type: "person" },
      order: 1,
      visibility: { levels: ["department", "work_unit", "record"], roles: ["director", "teacher"] },
      display: {
        style: "list",
        max_items: 3,
        default_expanded: true,
        preview_fields: ["name", "phone"],
      },
      actions: ["call", "message", "open_record"],
    },
    {
      key: "room_roster",
      label: "Room roster",
      source: { relationship_type_keys: ["enrolled_child"], entity_type: "person" },
      order: 2,
      visibility: { levels: ["work_unit", "record"] },
      display: {
        style: "list",
        max_items: 8,
        default_expanded: true,
        preview_fields: ["name", "notes"],
      },
      actions: ["open_record"],
    },
  ],
};

/** Broker / MGA — carriers + in-flight submissions (demo) */
export const DEMO_INSURANCE_CONTEXT_CONFIG: ContextBlockConfig = {
  block: "context",
  entity_type: "broker_submission",
  relationship_groups: [
    {
      key: "carriers_on_file",
      label: "Carriers on file",
      source: { relationship_type_keys: ["appointed_carrier"], entity_type: "organization" },
      order: 1,
      visibility: { levels: ["department", "work_unit", "record"] },
      display: {
        style: "list",
        max_items: 6,
        default_expanded: true,
        preview_fields: ["name", "status"],
      },
      actions: ["open_record", "message"],
    },
    {
      key: "pending_quotes",
      label: "Pending carrier quotes",
      source: { relationship_type_keys: ["carrier_quote"], entity_type: "submission" },
      order: 2,
      visibility: { levels: ["department", "work_unit"] },
      display: {
        style: "compact_cards",
        max_items: 5,
        default_expanded: true,
        preview_fields: ["client", "carrier", "sla"],
      },
      actions: ["open_record", "notify"],
    },
  ],
};

/** Home cleaning — org-level context (Command center · Context & support) */
export const DEMO_COMPANY_CLEANING_CONTEXT_CONFIG: ContextBlockConfig = {
  block: "context",
  entity_type: "organization",
  relationship_groups: [
    {
      key: "regions",
      label: "Regions",
      source: { relationship_type_keys: ["operating_region"], entity_type: "region" },
      order: 1,
      visibility: { levels: ["organization"] },
      display: {
        style: "list",
        max_items: 6,
        default_expanded: true,
        preview_fields: ["name", "status"],
      },
      actions: ["open_record"],
    },
    {
      key: "managers",
      label: "Managers",
      source: { relationship_type_keys: ["reports_to"], entity_type: "person" },
      order: 2,
      visibility: { levels: ["organization"] },
      display: {
        style: "compact_cards",
        max_items: 5,
        default_expanded: false,
        preview_fields: ["name", "scope"],
      },
      actions: ["message", "open_record"],
    },
    {
      key: "escalations",
      label: "Open escalations",
      source: { relationship_type_keys: ["escalation"], entity_type: "case" },
      order: 3,
      visibility: { levels: ["organization"] },
      display: {
        style: "list",
        max_items: 4,
        default_expanded: true,
        preview_fields: ["title", "age"],
      },
      actions: ["open_record", "notify"],
    },
    {
      key: "integrations",
      label: "Active integrations",
      source: { relationship_type_keys: ["integration"], entity_type: "integration" },
      order: 4,
      visibility: { levels: ["organization"] },
      display: {
        style: "list",
        max_items: 5,
        default_expanded: false,
        preview_fields: ["name", "health"],
      },
      actions: ["open_record"],
    },
  ],
};

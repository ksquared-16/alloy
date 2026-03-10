/**
 * Entity presentation config — configurable model for list columns, drawer layout, and related records.
 * Drives admin list tables and entity drawer UI from a single source of truth.
 *
 * Extension points (TODO: persist in DB later):
 * - entity_field_registry: org-level field definitions and visibility
 * - entity_layouts: org-level layout overrides (section order, collapsed state, column spans)
 * - entity_relationship_registry: which related modules appear per entity type
 *
 * Schema suggestions for future persistence:
 * - entity_field_registry: (org_id, entity_type, field_key, label, visible, sort_order, user_editable)
 * - entity_layouts: (org_id, entity_type, layout_key e.g. 'drawer_overview', section_key, expanded, sort_order, grid_cols)
 * - entity_relationship_registry: (org_id, entity_type, related_entity_type, filter_key, label, visible, sort_order)
 */

/** Entity type keys used in presentation config. Align with AdminDrawerEntityType where applicable. */
export type EntityPresentationType =
  | "customers"
  | "locations"
  | "opportunities"
  | "subscriptions"  // booking
  | "jobs"
  | "schedules"
  | "payments"
  | "documents"
  | "vendors"
  | "contacts"
  | "customer_members"
  | "workflows"
  | "discount_redemptions";

/** Table column definition. renderHint maps to shared renderers (status, date, link, money, etc.). */
export interface EntityTableColumnConfig {
  key: string;
  label: string;
  sortable?: boolean;
  /** Hint for shared column renderer; optional. When absent, list page may use custom render. */
  renderHint?: "text" | "status" | "date" | "datetime" | "money" | "link" | "badge" | "custom";
  /** If true, this column cannot be removed by user layout config (future). */
  locked?: boolean;
}

/** Default sort for list view. */
export interface EntityDefaultSortConfig {
  key: string;
  direction: "asc" | "desc";
}

/** Drawer field definition for overview/sections. */
export interface EntityDrawerFieldConfig {
  key: string;
  label: string;
  /** Span in grid: 1 or 2 (for 2-column layout). */
  span?: 1 | 2;
  /** Hint for shared field renderer. */
  renderHint?: "text" | "date" | "datetime" | "money" | "link" | "status" | "custom";
  /** If true, field is inline-editable in overview (save on blur/Enter, cancel on Escape). Omit or false = read-only. */
  editable?: boolean;
  /** If true, field cannot be removed by user layout config (future). */
  locked?: boolean;
}

/** Drawer section definition. */
export interface EntityDrawerSectionConfig {
  key: string;
  title: string;
  /** Default expanded state. */
  defaultExpanded?: boolean;
  collapsible?: boolean;
  /** Grid columns for this section (1 or 2). */
  gridCols?: 1 | 2;
  /** Ordered list of field keys (or full field configs) to show in this section. */
  fields: EntityDrawerFieldConfig[];
  /** If true, section order/visibility cannot be changed by user layout (future). */
  locked?: boolean;
}

/** Tab/section key in drawer. Overview content can be section-driven or entity-specific. */
export type DrawerTabKey = "overview" | "related" | "financials" | "automation" | "activity" | "documents";

/** Related record module: which related-entity tabs to show (e.g. jobs, schedules, contacts). */
export interface RelatedModuleConfig {
  key: string;
  label: string;
  /** Entity type for the related list (e.g. "jobs", "schedules"). */
  entityType: string;
  /** Optional filter key on the related API (e.g. customer_id, job_id). */
  filterKey?: string;
  locked?: boolean;
}

/** Quick action in drawer header or overview. */
export interface EntityQuickActionConfig {
  key: string;
  label: string;
  /** e.g. "primary" | "secondary" | "danger" */
  variant?: "primary" | "secondary" | "danger";
  /** When true, action is shown in header; otherwise in overview. */
  inHeader?: boolean;
  locked?: boolean;
}

/** Header fields shown in drawer title area (e.g. status, type). */
export interface EntityDrawerHeaderFieldConfig {
  key: string;
  renderHint?: "status" | "text" | "badge";
  locked?: boolean;
}

/** Full presentation config for one entity type. */
export interface EntityPresentationConfig {
  entityType: EntityPresentationType;
  /** Table columns in order. */
  table: {
    columns: EntityTableColumnConfig[];
    defaultSort?: EntityDefaultSortConfig;
  };
  /** Drawer: tabs that appear (in order). */
  drawer: {
    tabs: DrawerTabKey[];
    /** Fields to show in drawer header (e.g. status badge). */
    headerFields?: EntityDrawerHeaderFieldConfig[];
    /** Layout mode for overview: 1 or 2 column. Responsive can fallback to 1. */
    layoutMode?: 1 | 2;
    /** Section definitions for overview tab (ordered). When present, overview can be rendered from config; otherwise entity-specific JSX. */
    overviewSections?: EntityDrawerSectionConfig[];
    /** Related record modules (for Related tab). */
    relatedModules?: RelatedModuleConfig[];
    /** Quick actions available for this entity. */
    quickActions?: EntityQuickActionConfig[];
  };
}

/** Registry: entity type -> full presentation config. */
const ENTITY_PRESENTATION_REGISTRY: Record<EntityPresentationType, EntityPresentationConfig> = {
  customers: {
    entityType: "customers",
    table: {
      columns: [
        { key: "name", label: "Name", sortable: true, renderHint: "text", locked: true },
        { key: "status_key", label: "Status", sortable: true, renderHint: "status", locked: true },
        { key: "_primary_contact_name", label: "Primary contact", sortable: false, renderHint: "text" },
        { key: "phone", label: "Phone", sortable: true, renderHint: "text" },
        { key: "email", label: "Email", sortable: true, renderHint: "text" },
        { key: "updated_at", label: "Updated", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "updated_at", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "financials", "activity"],
      headerFields: [{ key: "status_key", renderHint: "status", locked: true }],
      layoutMode: 2,
      overviewSections: [
        {
          key: "overview",
          title: "Overview",
          defaultExpanded: true,
          collapsible: false,
          gridCols: 2,
          fields: [
            { key: "name", label: "Name", span: 1, renderHint: "text", editable: true, locked: true },
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true, locked: true },
            { key: "_vertical_name", label: "Vertical", span: 1, renderHint: "text", locked: true },
            { key: "phone", label: "Phone", span: 1, renderHint: "text", editable: true },
            { key: "email", label: "Email", span: 1, renderHint: "text", editable: true },
            { key: "created_at", label: "Created", span: 1, renderHint: "datetime" },
            { key: "updated_at", label: "Updated", span: 1, renderHint: "datetime" },
          ],
          locked: true,
        },
        { key: "details", title: "Primary contact & location", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [], locked: true },
      ],
      relatedModules: [
        { key: "contacts", label: "Contacts", entityType: "contacts", filterKey: "customer_id", locked: true },
        { key: "locations", label: "Locations", entityType: "locations", filterKey: "customer_id", locked: true },
        { key: "opportunities", label: "Opportunities", entityType: "opportunities", filterKey: "customer_id", locked: true },
        { key: "jobs", label: "Jobs", entityType: "jobs", filterKey: "customer_id", locked: true },
        { key: "schedules", label: "Schedules", entityType: "schedules", filterKey: "customer_id", locked: true },
        { key: "payments", label: "Payments", entityType: "payments", filterKey: "customer_id", locked: true },
        { key: "documents", label: "Documents", entityType: "documents", filterKey: "customer_id", locked: true },
      ],
    },
  },
  locations: {
    entityType: "locations",
    table: {
      columns: [
        { key: "label", label: "Name", sortable: true, renderHint: "text", locked: true },
        { key: "location_type", label: "Type", sortable: true, renderHint: "text" },
        { key: "_customer_name", label: "Customer", sortable: false, renderHint: "link" },
        { key: "city", label: "City", sortable: true, renderHint: "text" },
        { key: "state", label: "State", sortable: true, renderHint: "text" },
        { key: "updated_at", label: "Updated", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "updated_at", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "activity"],
      headerFields: [],
      layoutMode: 2,
      overviewSections: [
        {
          key: "overview",
          title: "Overview",
          defaultExpanded: true,
          collapsible: false,
          gridCols: 2,
          fields: [
            { key: "label", label: "Name", span: 1, renderHint: "text", editable: true, locked: true },
            { key: "location_type", label: "Type", span: 1, renderHint: "text" },
            { key: "address1", label: "Address", span: 2, renderHint: "text", editable: true },
            { key: "address2", label: "Address 2", span: 1, renderHint: "text", editable: true },
            { key: "city", label: "City", span: 1, renderHint: "text", editable: true },
            { key: "state", label: "State", span: 1, renderHint: "text", editable: true },
            { key: "postal_code", label: "Postal code", span: 1, renderHint: "text", editable: true },
            { key: "access_notes", label: "Access notes", span: 2, renderHint: "text", editable: true },
            { key: "updated_at", label: "Updated", span: 1, renderHint: "datetime" },
          ],
          locked: true,
        },
        { key: "customer", title: "Customer", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [], locked: true },
      ],
      relatedModules: [
        { key: "customer", label: "Customer", entityType: "customers", filterKey: "customer_id", locked: true },
        { key: "jobs", label: "Jobs", entityType: "jobs", filterKey: "location_id", locked: true },
        { key: "schedules", label: "Schedules", entityType: "schedules", filterKey: "location_id", locked: true },
        { key: "documents", label: "Documents", entityType: "documents", filterKey: "location_id", locked: true },
      ],
    },
  },
  opportunities: {
    entityType: "opportunities",
    table: {
      columns: [
        { key: "name", label: "Title", sortable: true, renderHint: "text", locked: true },
        { key: "_customer_name", label: "Customer / Lead", sortable: false, renderHint: "link" },
        { key: "status_key", label: "Status", sortable: true, renderHint: "status", locked: true },
        { key: "_stage_name", label: "Stage", sortable: false, renderHint: "badge" },
        { key: "quote_total", label: "Value", sortable: true, renderHint: "money" },
        { key: "created_at", label: "Created", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "created_at", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "financials", "automation", "activity"],
      headerFields: [{ key: "status_key", renderHint: "status", locked: true }],
      layoutMode: 2,
      overviewSections: [
        {
          key: "overview",
          title: "Overview",
          defaultExpanded: true,
          collapsible: false,
          gridCols: 2,
          fields: [
            { key: "name", label: "Title", span: 2, renderHint: "text", editable: true, locked: true },
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true, locked: true },
            { key: "_stage_name", label: "Stage", span: 1, renderHint: "text" },
            { key: "quote_total", label: "Value", span: 1, renderHint: "money", editable: true },
            { key: "source", label: "Source", span: 1, renderHint: "text" },
            { key: "_owner_name", label: "Owner", span: 1, renderHint: "text" },
            { key: "created_at", label: "Created", span: 1, renderHint: "datetime" },
            { key: "_last_activity_at", label: "Last activity", span: 1, renderHint: "datetime" },
          ],
          locked: true,
        },
        { key: "customer_contact", title: "Customer / Contact", defaultExpanded: true, collapsible: true, gridCols: 2, fields: [], locked: true },
        { key: "quote", title: "Quote context", defaultExpanded: true, collapsible: true, gridCols: 2, fields: [], locked: true },
        { key: "notes", title: "Notes", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
      ],
      relatedModules: [
        { key: "booking_job", label: "Related booking / job", entityType: "jobs", filterKey: "opportunity_id", locked: true },
        { key: "documents", label: "Documents", entityType: "documents", filterKey: "opportunity_id", locked: true },
      ],
    },
  },
  subscriptions: {
    entityType: "subscriptions",
    table: {
      columns: [
        { key: "_ref", label: "Ref", sortable: false, renderHint: "text" },
        { key: "_customer_name", label: "Customer", sortable: false, renderHint: "link" },
        { key: "service_type", label: "Service", sortable: false, renderHint: "text" },
        { key: "status_key", label: "Status", sortable: true, renderHint: "status" },
        { key: "_scheduled_for", label: "Next", sortable: false, renderHint: "datetime" },
        { key: "_total_cents", label: "Total", sortable: false, renderHint: "money" },
      ],
      defaultSort: { key: "created_at", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "activity"],
      headerFields: [{ key: "status_key", renderHint: "status" }],
      layoutMode: 2,
      overviewSections: [
        {
          key: "overview",
          title: "Overview",
          defaultExpanded: true,
          collapsible: false,
          gridCols: 2,
          fields: [
            { key: "_ref", label: "Ref", span: 1, renderHint: "text" },
            { key: "status_key", label: "Status", span: 1, renderHint: "status" },
            { key: "service_type", label: "Service", span: 1, renderHint: "text" },
            { key: "frequency", label: "Frequency", span: 1, renderHint: "text" },
            { key: "_scheduled_for", label: "Scheduled for", span: 1, renderHint: "datetime" },
            { key: "_total_cents", label: "Total", span: 1, renderHint: "money" },
            { key: "created_at", label: "Created", span: 1, renderHint: "datetime" },
          ],
          locked: true,
        },
        { key: "customer", title: "Customer", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "location", title: "Location", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "pricing", title: "Pricing", defaultExpanded: true, collapsible: true, gridCols: 2, fields: [], locked: true },
        { key: "schedules", title: "Schedules", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "vendor", title: "Vendor", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "documents", title: "Documents", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
      ],
      relatedModules: [],
    },
  },
  jobs: {
    entityType: "jobs",
    table: {
      columns: [
        { key: "_ref", label: "Ref", sortable: false, renderHint: "text" },
        { key: "_customer_name", label: "Customer", sortable: true, renderHint: "link", locked: true },
        { key: "_location_label", label: "Location", sortable: false, renderHint: "text" },
        { key: "status_key", label: "Status", sortable: true, renderHint: "status", locked: true },
        { key: "_assigned_vendor_name", label: "Vendor", sortable: false, renderHint: "text" },
        { key: "_scheduled_date", label: "Scheduled", sortable: false, renderHint: "date" },
        { key: "_total_cents", label: "Total", sortable: false, renderHint: "money" },
        { key: "updated_at", label: "Updated", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "updated_at", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "financials", "activity"],
      headerFields: [{ key: "status_key", renderHint: "status", locked: true }],
      layoutMode: 2,
      overviewSections: [
        {
          key: "overview",
          title: "Overview",
          defaultExpanded: true,
          collapsible: false,
          gridCols: 2,
          fields: [
            { key: "_ref", label: "Ref", span: 1, renderHint: "text" },
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true, locked: true },
            { key: "job_type", label: "Job type", span: 1, renderHint: "text" },
            { key: "service_frequency_key", label: "Frequency", span: 1, renderHint: "text" },
            { key: "scheduled_at", label: "Scheduled at", span: 1, renderHint: "datetime", editable: true },
            { key: "gross_price_cents", label: "Gross price", span: 1, renderHint: "money", editable: true },
            { key: "internal_notes", label: "Internal notes", span: 2, renderHint: "text", editable: true },
            { key: "updated_at", label: "Updated", span: 1, renderHint: "datetime" },
          ],
          locked: true,
        },
        { key: "customer", title: "Customer", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "location", title: "Location", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "schedule", title: "Schedule", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "vendor", title: "Vendor", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "payments", title: "Payments", defaultExpanded: true, collapsible: true, gridCols: 2, fields: [], locked: true },
        { key: "documents", title: "Documents", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
      ],
      relatedModules: [
        { key: "schedules", label: "Schedules", entityType: "schedules", filterKey: "job_id", locked: true },
        { key: "payments", label: "Payments", entityType: "payments", filterKey: "job_id", locked: true },
        { key: "documents", label: "Documents", entityType: "documents", filterKey: "job_id", locked: true },
      ],
      quickActions: [
        { key: "run_payment", label: "Run payment", variant: "primary", inHeader: true, locked: true },
        { key: "mark_completed", label: "Mark completed", variant: "secondary", inHeader: true, locked: true },
        { key: "reschedule", label: "Reschedule", variant: "secondary", inHeader: false, locked: true },
      ],
    },
  },
  schedules: {
    entityType: "schedules",
    table: {
      columns: [
        { key: "start_at", label: "Date", sortable: true, renderHint: "datetime" },
        { key: "status_key", label: "Status", sortable: true, renderHint: "status" },
        { key: "_customer_name", label: "Customer", sortable: false, renderHint: "link" },
        { key: "_location_label", label: "Location", sortable: false, renderHint: "text" },
        { key: "_job_title", label: "Job", sortable: false, renderHint: "link" },
        { key: "_assigned_vendor_name", label: "Vendor", sortable: false, renderHint: "text" },
        { key: "updated_at", label: "Updated", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "start_at", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "financials", "activity"],
      headerFields: [{ key: "status_key", renderHint: "status" }],
      layoutMode: 2,
      overviewSections: [
        {
          key: "overview",
          title: "Overview",
          defaultExpanded: true,
          collapsible: false,
          gridCols: 2,
          fields: [
            { key: "start_at", label: "Start", span: 1, renderHint: "datetime", editable: true },
            { key: "end_at", label: "End", span: 1, renderHint: "datetime", editable: true },
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true },
            { key: "timezone", label: "Timezone", span: 1, renderHint: "text", editable: true },
            { key: "time_window", label: "Time window", span: 1, renderHint: "text" },
            { key: "service_type", label: "Service type", span: 1, renderHint: "text" },
            { key: "updated_at", label: "Updated", span: 1, renderHint: "datetime" },
          ],
          locked: true,
        },
        { key: "job", title: "Job", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "customer", title: "Customer", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "location", title: "Location", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "vendor", title: "Vendor", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "reschedule_history", title: "Reschedule / Cancel history", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "documents", title: "Documents", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
      ],
      relatedModules: [],
    },
  },
  payments: {
    entityType: "payments",
    table: {
      columns: [
        { key: "created_at", label: "Date", sortable: true, renderHint: "datetime" },
        { key: "_customer_name", label: "Customer", sortable: false, renderHint: "link" },
        { key: "amount_cents", label: "Amount", sortable: true, renderHint: "money" },
        { key: "method", label: "Method", sortable: false, renderHint: "text" },
        { key: "status_key", label: "Status", sortable: true, renderHint: "status" },
        { key: "updated_at", label: "Updated", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "created_at", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "activity"],
      headerFields: [{ key: "status_key", renderHint: "status" }],
      layoutMode: 2,
      overviewSections: [
        {
          key: "overview",
          title: "Overview",
          defaultExpanded: true,
          collapsible: false,
          gridCols: 2,
          fields: [
            { key: "created_at", label: "Payment date", span: 1, renderHint: "datetime" },
            { key: "status_key", label: "Status", span: 1, renderHint: "status" },
            { key: "amount_cents", label: "Amount", span: 1, renderHint: "money" },
            { key: "method", label: "Method", span: 1, renderHint: "text" },
            { key: "posted_at", label: "Posted date", span: 1, renderHint: "date" },
            { key: "provider_payment_id", label: "Reference", span: 1, renderHint: "text" },
            { key: "updated_at", label: "Updated", span: 1, renderHint: "datetime" },
          ],
          locked: true,
        },
        { key: "customer", title: "Customer", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "applied_to", title: "Applied to", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "method_reference", title: "Method / Reference", defaultExpanded: true, collapsible: true, gridCols: 2, fields: [], locked: true },
        { key: "posting", title: "Posting / Reconciliation", defaultExpanded: false, collapsible: true, gridCols: 2, fields: [], locked: true },
        { key: "ledger", title: "Ledger entries", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "documents", title: "Documents", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
      ],
      relatedModules: [],
    },
  },
  documents: {
    entityType: "documents",
    table: {
      columns: [
        { key: "name", label: "Name", sortable: true, renderHint: "text" },
        { key: "document_type", label: "Type", sortable: true, renderHint: "text" },
        { key: "_linked_record_type", label: "Linked record", sortable: false, renderHint: "text" },
        { key: "_customer_name", label: "Customer", sortable: false, renderHint: "link" },
        { key: "uploaded_at", label: "Uploaded", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "uploaded_at", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "activity"],
      headerFields: [{ key: "status_key", renderHint: "status" }],
      layoutMode: 2,
      overviewSections: [
        {
          key: "overview",
          title: "Overview",
          defaultExpanded: true,
          collapsible: false,
          gridCols: 2,
          fields: [
            { key: "name", label: "Name", span: 2, renderHint: "text" },
            { key: "document_type", label: "Type", span: 1, renderHint: "text" },
            { key: "status_key", label: "Status", span: 1, renderHint: "status" },
            { key: "_uploaded_by", label: "Uploaded by", span: 1, renderHint: "text" },
            { key: "uploaded_at", label: "Uploaded at", span: 1, renderHint: "datetime" },
            { key: "_ai_extraction_status", label: "AI extraction", span: 1, renderHint: "text" },
          ],
          locked: true,
        },
        { key: "preview_metadata", title: "Preview / Metadata", defaultExpanded: true, collapsible: true, gridCols: 2, fields: [], locked: true },
        { key: "linked_records", title: "Linked records", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "extracted_fields", title: "Extracted fields", defaultExpanded: false, collapsible: true, gridCols: 2, fields: [], locked: true },
        { key: "version_audit", title: "Version / Audit", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
      ],
      relatedModules: [],
    },
  },
  vendors: {
    entityType: "vendors",
    table: {
      columns: [
        { key: "name", label: "Name", sortable: true, renderHint: "text", locked: true },
        { key: "status_key", label: "Status", sortable: true, renderHint: "status", locked: true },
        { key: "vendor_type", label: "Type", sortable: false, renderHint: "text" },
        { key: "_coverage_area", label: "Coverage", sortable: false, renderHint: "text" },
        { key: "updated_at", label: "Updated", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "updated_at", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "financials", "activity"],
      headerFields: [{ key: "status_key", renderHint: "status", locked: true }],
      layoutMode: 2,
      overviewSections: [
        {
          key: "overview",
          title: "Overview",
          defaultExpanded: true,
          collapsible: false,
          gridCols: 2,
          fields: [
            { key: "name", label: "Name", span: 1, renderHint: "text", editable: true, locked: true },
            { key: "company_name", label: "Company", span: 1, renderHint: "text", editable: true },
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true, locked: true },
            { key: "vendor_type", label: "Type", span: 1, renderHint: "text" },
            { key: "phone", label: "Phone", span: 1, renderHint: "text", editable: true },
            { key: "email", label: "Email", span: 1, renderHint: "text", editable: true },
            { key: "address_line1", label: "Address", span: 2, renderHint: "text", editable: true },
            { key: "city", label: "City", span: 1, renderHint: "text", editable: true },
            { key: "state", label: "State", span: 1, renderHint: "text", editable: true },
            { key: "postal_code", label: "Postal code", span: 1, renderHint: "text", editable: true },
            { key: "updated_at", label: "Updated", span: 1, renderHint: "datetime" },
          ],
          locked: true,
        },
        { key: "contact_info", title: "Contact info", defaultExpanded: true, collapsible: true, gridCols: 2, fields: [], locked: true },
        { key: "tags_skills", title: "Tags / Skills", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "jobs", title: "Jobs", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "schedules", title: "Schedules", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "documents", title: "Documents", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "performance", title: "Performance / Activity", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
      ],
      relatedModules: [],
    },
  },
  contacts: {
    entityType: "contacts",
    table: {
      columns: [
        { key: "_name", label: "Name", sortable: true, renderHint: "text", locked: true },
        { key: "status_key", label: "Status", sortable: true, renderHint: "status", locked: true },
        { key: "contact_type", label: "Contact Type", sortable: true, renderHint: "text" },
        { key: "_linked_to", label: "Linked To", sortable: false, renderHint: "text" },
        { key: "_primary_contact_for", label: "Primary Contact", sortable: false, renderHint: "text" },
        { key: "email", label: "Email", sortable: true, renderHint: "text" },
        { key: "phone", label: "Phone", sortable: true, renderHint: "text" },
        { key: "_updated", label: "Updated", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "_updated", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "activity", "documents"],
      headerFields: [{ key: "status_key", renderHint: "status", locked: true }],
      layoutMode: 2,
      overviewSections: [
        {
          key: "basic_info",
          title: "Basic Info",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "first_name", label: "First name", span: 1, renderHint: "text", editable: true, locked: true },
            { key: "last_name", label: "Last name", span: 1, renderHint: "text", editable: true, locked: true },
            { key: "email", label: "Email", span: 1, renderHint: "text", editable: true },
            { key: "phone", label: "Phone", span: 1, renderHint: "text", editable: true },
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true },
            { key: "contact_type", label: "Contact Type", span: 1, renderHint: "text", editable: true },
            { key: "company_name", label: "Company name", span: 1, renderHint: "text", editable: true },
            { key: "vendor_contact_role", label: "Vendor contact role", span: 1, renderHint: "text", editable: true },
          ],
          locked: true,
        },
        {
          key: "association",
          title: "Association",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "_linked_customer_name", label: "Linked customer", span: 1, renderHint: "text" },
            { key: "_linked_vendor_name", label: "Linked vendor", span: 1, renderHint: "text" },
            { key: "_primary_contact_for", label: "Primary Contact", span: 1, renderHint: "text" },
            { key: "source", label: "Source", span: 1, renderHint: "text", editable: true },
            { key: "external_source", label: "External source", span: 1, renderHint: "text", editable: true },
            { key: "external_id", label: "External ID", span: 1, renderHint: "text", editable: true },
          ],
          locked: true,
        },
        {
          key: "address",
          title: "Address",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "address_line1", label: "Address line 1", span: 1, renderHint: "text", editable: true },
            { key: "address_line2", label: "Address line 2", span: 1, renderHint: "text", editable: true },
            { key: "city", label: "City", span: 1, renderHint: "text", editable: true },
            { key: "state", label: "State", span: 1, renderHint: "text", editable: true },
            { key: "postal_code", label: "Postal code", span: 1, renderHint: "text", editable: true },
            { key: "country", label: "Country", span: 1, renderHint: "text", editable: true },
            { key: "timezone", label: "Timezone", span: 1, renderHint: "text", editable: true },
          ],
          locked: true,
        },
        {
          key: "notes",
          title: "Notes",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 1,
          fields: [
            { key: "notes", label: "Notes", span: 1, renderHint: "text", editable: true },
          ],
          locked: true,
        },
        {
          key: "record_info",
          title: "Record Info",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "id", label: "ID", span: 1, renderHint: "text" },
            { key: "created_at", label: "Created", span: 1, renderHint: "datetime" },
            { key: "updated_at", label: "Updated", span: 1, renderHint: "datetime" },
            { key: "archived_at", label: "Archived at", span: 1, renderHint: "datetime" },
            { key: "archived_by", label: "Archived by", span: 1, renderHint: "text" },
          ],
          locked: true,
        },
      ],
      relatedModules: [
        { key: "customer", label: "Customer", entityType: "customers", filterKey: "primary_contact_id", locked: true },
        { key: "vendor", label: "Vendor", entityType: "vendors", filterKey: "primary_contact_id", locked: true },
        { key: "opportunities", label: "Opportunities", entityType: "opportunities", filterKey: "primary_contact_id", locked: true },
        { key: "jobs", label: "Jobs", entityType: "jobs", filterKey: "primary_contact_id", locked: true },
        { key: "schedules", label: "Schedules", entityType: "schedules", filterKey: "primary_contact_id", locked: true },
        { key: "documents", label: "Documents", entityType: "documents", filterKey: "owner_contact_id", locked: true },
      ],
    },
  },
  customer_members: {
    entityType: "customer_members",
    table: { columns: [], defaultSort: { key: "created_at", direction: "desc" } },
    drawer: { tabs: ["overview", "related", "activity"], layoutMode: 2, overviewSections: [], relatedModules: [] },
  },
  workflows: {
    entityType: "workflows",
    table: { columns: [], defaultSort: { key: "updated_at", direction: "desc" } },
    drawer: { tabs: ["overview", "activity"], layoutMode: 1, overviewSections: [], relatedModules: [] },
  },
  discount_redemptions: {
    entityType: "discount_redemptions",
    table: { columns: [], defaultSort: { key: "created_at", direction: "desc" } },
    drawer: { tabs: ["overview", "activity"], layoutMode: 1, overviewSections: [], relatedModules: [] },
  },
};

/**
 * Get presentation config for an entity type.
 * TODO: Merge with org-level entity_layouts / entity_field_registry when persisted.
 */
export function getEntityPresentation(entityType: EntityPresentationType): EntityPresentationConfig {
  const config = ENTITY_PRESENTATION_REGISTRY[entityType];
  if (!config) {
    return {
      entityType,
      table: { columns: [], defaultSort: { key: "updated_at", direction: "desc" } },
      drawer: { tabs: ["overview", "activity"], layoutMode: 1, overviewSections: [], relatedModules: [] },
    };
  }
  return config;
}

/** All entity types that have table config (for list pages). */
export function getEntityTypesWithTableConfig(): EntityPresentationType[] {
  return (Object.keys(ENTITY_PRESENTATION_REGISTRY) as EntityPresentationType[]).filter(
    (t) => ENTITY_PRESENTATION_REGISTRY[t].table.columns.length > 0
  );
}

/** Map AdminDrawerEntityType to EntityPresentationType (they align; this is for type safety). */
export function toPresentationType(drawerType: string): EntityPresentationType | null {
  if (drawerType in ENTITY_PRESENTATION_REGISTRY) return drawerType as EntityPresentationType;
  return null;
}

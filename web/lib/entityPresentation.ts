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
  | "persons"
  | "workflows"
  | "discount_redemptions"
  | "service_offerings"
  | "service_plan_templates"
  | "addons";

/** Table column definition. renderHint maps to shared renderers (status, date, link, money, etc.). */
export interface EntityTableColumnConfig {
  key: string;
  label: string;
  sortable?: boolean;
  /** Hint for shared column renderer; optional. When absent, list page may use custom render. */
  renderHint?: "text" | "status" | "date" | "datetime" | "money" | "link" | "badge" | "phone" | "primary_yes_no" | "custom";
  /** If true, this column cannot be removed by user layout config (future). */
  locked?: boolean;
}

/** Default sort for list view. */
export interface EntityDefaultSortConfig {
  key: string;
  direction: "asc" | "desc";
}

/** When present, link-type fields open another entity drawer (e.g. primary contact). */
export interface EntityDrawerLinkTarget {
  /** Field key on the record that holds the related entity id (e.g. primary_contact_id). */
  idField: string;
  /** Entity type to open in drawer (e.g. "contacts"). */
  entityType: string;
}

/** Drawer field definition for overview/sections. */
export interface EntityDrawerFieldConfig {
  key: string;
  label: string;
  /** Span in grid: 1 or 2 (for 2-column layout). */
  span?: 1 | 2;
  /** Hint for shared field renderer. */
  renderHint?: "text" | "date" | "datetime" | "money" | "link" | "status" | "phone" | "primary_yes_no" | "custom";
  /** If true, field is inline-editable in overview (save on blur/Enter, cancel on Escape). Omit or false = read-only. */
  editable?: boolean;
  /** If true, field cannot be removed by user layout config (future). */
  locked?: boolean;
  /** When set with renderHint "link", value is rendered as a button that opens this entity drawer. */
  linkTarget?: EntityDrawerLinkTarget;
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
  /**
   * Optional grouped blocks inside one collapsible section (e.g. Jobs → Pricing → Summary / Discount).
   * When present, overview renders these instead of top-level `fields`.
   */
  subsections?: { title: string; fields: EntityDrawerFieldConfig[] }[];
  /** If true, section order/visibility cannot be changed by user layout (future). */
  locked?: boolean;
}

/** Single Jobs drawer Pricing block: Summary + Discount (canonical net = display_total_cents). */
export function getJobUnifiedPricingSection(): EntityDrawerSectionConfig {
  return {
    key: "pricing",
    title: "Pricing",
    defaultExpanded: false,
    collapsible: true,
    gridCols: 2,
    fields: [],
    locked: true,
    subsections: [
      {
        title: "Summary",
        fields: [
          { key: "gross_price_cents", label: "Gross Price", span: 1, renderHint: "money", editable: true },
          { key: "display_total_cents", label: "Final Total (after discount)", span: 1, renderHint: "money", editable: false },
          { key: "recurring_total_cents", label: "Recurring Total", span: 1, renderHint: "money", editable: false },
          { key: "contractor_payout_cents", label: "Contractor Payout", span: 1, renderHint: "money", editable: false },
          { key: "alloy_fee_cents", label: "Platform Fee", span: 1, renderHint: "money", editable: false },
        ],
      },
      {
        title: "Discount",
        fields: [
          { key: "discount_code_id", label: "Discount code", span: 1, renderHint: "text", editable: true },
          { key: "_discount_amount_cents", label: "Discount amount", span: 1, renderHint: "money", editable: false },
          { key: "_discount_applied", label: "Discount applied", span: 1, renderHint: "primary_yes_no", editable: false },
        ],
      },
      {
        title: "Payment status (from payments)",
        fields: [
          { key: "_job_payment_original_cents", label: "Job total (priced)", span: 1, renderHint: "money", editable: false },
          { key: "_job_payment_paid_cents", label: "Total paid", span: 1, renderHint: "money", editable: false },
          { key: "_job_payment_balance_cents", label: "Balance due", span: 1, renderHint: "money", editable: false },
          { key: "_job_payment_status_label", label: "Payment state", span: 1, renderHint: "text", editable: false },
        ],
      },
    ],
  };
}

/**
 * Job **Overview** billing block: plan hint + priced total + payment rollup only.
 * Per-visit detail belongs on Related / Financials / schedule records; full line-item pricing stays on the Financials tab and inline job sections.
 */
export function getJobOverviewBillingSummarySection(): EntityDrawerSectionConfig {
  return {
    key: "pricing",
    title: "Billing summary",
    defaultExpanded: false,
    collapsible: true,
    gridCols: 2,
    fields: [],
    locked: true,
    subsections: [
      {
        title: "Plan",
        fields: [
          { key: "service_frequency_key", label: "Service frequency", span: 1, renderHint: "text", editable: false },
          { key: "is_recurring", label: "Recurring job", span: 1, renderHint: "primary_yes_no", editable: false },
        ],
      },
      {
        title: "Totals & payment status",
        fields: [
          { key: "display_total_cents", label: "Job total (priced)", span: 1, renderHint: "money", editable: false },
          { key: "recurring_total_cents", label: "Recurring total", span: 1, renderHint: "money", editable: false },
          { key: "_job_payment_paid_cents", label: "Total paid", span: 1, renderHint: "money", editable: false },
          { key: "_job_payment_balance_cents", label: "Balance due", span: 1, renderHint: "money", editable: false },
          { key: "_job_payment_status_label", label: "Payment state", span: 1, renderHint: "text", editable: false },
        ],
      },
    ],
  };
}

/** Tab/section key in drawer. Overview content can be section-driven or entity-specific. */
export type DrawerTabKey = "overview" | "related" | "financials" | "automation" | "activity" | "payments" | "documents" | "ledger";

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
        { key: "_status_display", label: "Status", sortable: true, renderHint: "status", locked: true },
        { key: "name", label: "Name", sortable: true, renderHint: "text", locked: true },
        { key: "_primary_person_name", label: "Person", sortable: false, renderHint: "text" },
        { key: "_primary_contact_name", label: "Contact (compat)", sortable: false, renderHint: "text" },
        { key: "_customer_email", label: "Email", sortable: false, renderHint: "text" },
        { key: "_customer_phone", label: "Phone", sortable: false, renderHint: "phone" },
        { key: "customer_type", label: "Customer Type", sortable: true, renderHint: "text" },
        { key: "_active_jobs_count", label: "Active Jobs", sortable: false, renderHint: "text" },
        { key: "_open_opportunities_count", label: "Open Opportunities", sortable: false, renderHint: "text" },
        { key: "_updated", label: "Updated", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "_updated", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "activity", "payments", "documents"],
      headerFields: [],
      layoutMode: 2,
      overviewSections: [
        {
          key: "account_info",
          title: "Account Info",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true, locked: true },
            { key: "name", label: "Name", span: 1, renderHint: "text", editable: true, locked: true },
            { key: "customer_type", label: "Customer Type", span: 1, renderHint: "text", editable: true },
            { key: "_vertical_name", label: "Vertical", span: 1, renderHint: "text", locked: true },
            { key: "_primary_person_name", label: "Primary Person", span: 1, renderHint: "link", locked: true, linkTarget: { idField: "_primary_person_id", entityType: "persons" } },
            { key: "_primary_contact_name", label: "Contact (compatibility)", span: 1, renderHint: "link", locked: true, linkTarget: { idField: "primary_contact_id", entityType: "contacts" } },
            { key: "stripe_customer_id", label: "Stripe Customer ID", span: 1, renderHint: "text", locked: true },
            { key: "external_source", label: "External Source", span: 1, renderHint: "text", editable: true },
            { key: "external_id", label: "External ID", span: 1, renderHint: "text", editable: true },
          ],
          locked: true,
        },
        {
          key: "person_snapshot",
          title: "Person Snapshot",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "_primary_person_name", label: "Name", span: 1, renderHint: "link", locked: true, linkTarget: { idField: "_primary_person_id", entityType: "persons" } },
            { key: "_primary_person_email", label: "Email", span: 1, renderHint: "text", locked: true },
            { key: "_primary_person_phone", label: "Phone", span: 1, renderHint: "phone", locked: true },
          ],
          locked: true,
        },
        {
          key: "contact_snapshot",
          title: "Contact Snapshot (Compatibility)",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "_primary_contact_name", label: "Contact", span: 1, renderHint: "link", locked: true, linkTarget: { idField: "primary_contact_id", entityType: "contacts" } },
            { key: "_primary_contact_email", label: "Contact email", span: 1, renderHint: "text", locked: true },
            { key: "_primary_contact_phone", label: "Contact phone", span: 1, renderHint: "phone", locked: true },
          ],
          locked: true,
        },
        {
          key: "payment_profile",
          title: "Payment Profile",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "payment_method_brand", label: "Card Brand", span: 1, renderHint: "text", locked: true },
            { key: "payment_method_last4", label: "Last 4", span: 1, renderHint: "text", locked: true },
            { key: "default_payment_method_id", label: "Default Payment Method ID", span: 1, renderHint: "text", locked: true },
            { key: "setup_intent_id", label: "Setup Intent ID", span: 1, renderHint: "text", locked: true },
            { key: "stripe_customer_id", label: "Stripe Customer ID", span: 1, renderHint: "text", locked: true },
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
            { key: "id", label: "ID", span: 1, renderHint: "text", locked: true },
            { key: "created_at", label: "Created", span: 1, renderHint: "datetime", locked: true },
            { key: "updated_at", label: "Updated", span: 1, renderHint: "datetime", locked: true },
            { key: "org_id", label: "Org ID", span: 1, renderHint: "text", locked: true },
            { key: "vertical_id", label: "Vertical ID", span: 1, renderHint: "text", locked: true },
          ],
          locked: true,
        },
        {
          key: "debug_compatibility_metadata",
          title: "Debug (compatibility metadata)",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "_metadata_email", label: "Metadata email", span: 1, renderHint: "text", locked: true },
            { key: "_metadata_phone", label: "Metadata phone", span: 1, renderHint: "phone", locked: true },
            { key: "_metadata_source", label: "Metadata source", span: 1, renderHint: "text", locked: true },
          ],
          locked: true,
        },
      ],
      relatedModules: [
        { key: "contacts", label: "Contacts", entityType: "contacts", filterKey: "customer_id", locked: true },
        { key: "locations", label: "Locations", entityType: "locations", filterKey: "customer_id", locked: true },
        { key: "opportunities", label: "Opportunities", entityType: "opportunities", filterKey: "customer_id", locked: true },
        { key: "jobs", label: "Jobs", entityType: "jobs", filterKey: "customer_id", locked: true },
        { key: "payments", label: "Payments", entityType: "payments", filterKey: "customer_id", locked: true },
        { key: "subscriptions", label: "Subscriptions", entityType: "subscriptions", filterKey: "customer_id", locked: true },
        { key: "documents", label: "Documents", entityType: "documents", filterKey: "customer_id", locked: true },
      ],
    },
  },
  locations: {
    entityType: "locations",
    table: {
      columns: [
        { key: "_status_display", label: "Status", sortable: true, renderHint: "status", locked: true },
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
      tabs: ["overview", "related", "activity", "documents"],
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
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true },
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
        {
          key: "custom_property_fields",
          title: "Property & custom fields",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [],
          locked: true,
        },
        { key: "customer", title: "Customer", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        {
          key: "relationships",
          title: "Relationships",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 1,
          fields: [],
          locked: true,
        },
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
        { key: "_status_display", label: "Status", sortable: false, renderHint: "status" },
        { key: "name", label: "Opportunity", sortable: true, renderHint: "text", locked: true },
        { key: "_customer_name", label: "Customer", sortable: false, renderHint: "text" },
        { key: "_quote_total_display", label: "Quote Total", sortable: false, renderHint: "money" },
        { key: "job_date", label: "Job Date", sortable: true, renderHint: "date" },
        { key: "source", label: "Source", sortable: false, renderHint: "text" },
        { key: "_vertical_name", label: "Vertical", sortable: false, renderHint: "text" },
        { key: "_updated", label: "Updated", sortable: true, renderHint: "datetime", locked: true },
      ],
      defaultSort: { key: "_updated", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "activity", "documents"],
      headerFields: [],
      layoutMode: 2,
      overviewSections: [
        {
          key: "opportunity_details",
          title: "Opportunity Details",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true },
            { key: "name", label: "Name", span: 1, renderHint: "text", editable: true, locked: true },
            { key: "source", label: "Source", span: 1, renderHint: "text", editable: true },
            { key: "_vertical_name", label: "Vertical", span: 1, renderHint: "text", locked: true },
            { key: "assigned_to", label: "Assigned to", span: 1, renderHint: "text", editable: true },
            { key: "lost_reason", label: "Lost reason", span: 1, renderHint: "text", editable: true },
          ],
          locked: true,
        },
        {
          key: "customer_booking",
          title: "Customer & Booking",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "_customer_name", label: "Customer", span: 1, renderHint: "link", linkTarget: { idField: "customer_id", entityType: "customers" }, locked: true },
            { key: "_primary_person_name", label: "Primary Person", span: 1, renderHint: "link", linkTarget: { idField: "primary_person_id", entityType: "persons" }, locked: true },
            { key: "_primary_contact_name", label: "Contact (compatibility)", span: 1, renderHint: "link", linkTarget: { idField: "primary_contact_id", entityType: "contacts" }, locked: true },
            { key: "_location_name", label: "Location", span: 1, renderHint: "link", linkTarget: { idField: "location_id", entityType: "locations" }, locked: true },
            { key: "job_date", label: "Job date", span: 1, renderHint: "date", editable: true },
            { key: "job_time_window", label: "Job time window", span: 1, renderHint: "text", editable: true },
            { key: "appointment_id", label: "Appointment ID", span: 1, renderHint: "text", editable: true },
          ],
          locked: true,
        },
        {
          key: "quote",
          title: "Quote",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "quote_subtotal", label: "Quote subtotal", span: 1, renderHint: "money", editable: true },
            { key: "discount_amount", label: "Discount amount", span: 1, renderHint: "money", editable: true },
            { key: "quote_total", label: "Quote total", span: 1, renderHint: "money", editable: true },
            { key: "recurring_price_cents", label: "Recurring (cents)", span: 1, renderHint: "money", locked: true },
            { key: "estimated_price_cents", label: "Estimated (cents)", span: 1, renderHint: "money", locked: true },
            { key: "monetary_value_cents", label: "Monetary value (cents)", span: 1, renderHint: "money", locked: true },
            { key: "discount_code", label: "Discount code", span: 1, renderHint: "text", editable: true },
            { key: "discount_validated_at", label: "Discount validated at", span: 1, renderHint: "datetime", locked: true },
          ],
          locked: true,
        },
        {
          key: "notes",
          title: "Notes",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 1,
          fields: [
            { key: "customer_notes", label: "Customer notes", span: 1, renderHint: "text", editable: true },
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
            { key: "id", label: "ID", span: 1, renderHint: "text", locked: true },
            { key: "created_at", label: "Created", span: 1, renderHint: "datetime", locked: true },
            { key: "updated_at", label: "Updated", span: 1, renderHint: "datetime", locked: true },
            { key: "org_id", label: "Org ID", span: 1, renderHint: "text", locked: true },
            { key: "pipeline_id", label: "Pipeline ID", span: 1, renderHint: "text", locked: true },
            { key: "_vertical_name", label: "Vertical", span: 1, renderHint: "text", locked: true },
            { key: "vertical_id", label: "Vertical ID", span: 1, renderHint: "text", locked: true },
            { key: "external_source", label: "External source", span: 1, renderHint: "text", editable: true },
            { key: "external_id", label: "External ID", span: 1, renderHint: "text", editable: true },
          ],
          locked: true,
        },
      ],
      relatedModules: [],
    },
  },
  subscriptions: {
    entityType: "subscriptions",
    table: {
      columns: [
        { key: "_status_display", label: "Status", sortable: true, renderHint: "status", locked: true },
        { key: "_ref", label: "Ref", sortable: false, renderHint: "text" },
        { key: "_customer_name", label: "Customer", sortable: false, renderHint: "link" },
        { key: "service_type", label: "Service", sortable: false, renderHint: "text" },
        { key: "_scheduled_for", label: "Next", sortable: false, renderHint: "datetime" },
        { key: "_total_cents", label: "Total", sortable: false, renderHint: "money" },
      ],
      defaultSort: { key: "created_at", direction: "desc" },
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
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true },
            { key: "_ref", label: "Ref", span: 1, renderHint: "text", locked: true },
            { key: "service_type", label: "Service", span: 1, renderHint: "text", locked: true },
            { key: "_frequency_label", label: "Frequency", span: 1, renderHint: "text", locked: true },
            { key: "_scheduled_for", label: "Scheduled for", span: 1, renderHint: "datetime", locked: true },
            { key: "_total_cents", label: "Total", span: 1, renderHint: "money", locked: true },
            { key: "start_date", label: "Start date", span: 1, renderHint: "date", locked: true },
            { key: "created_at", label: "Created", span: 1, renderHint: "datetime", locked: true },
          ],
          locked: true,
        },
        { key: "customer", title: "Customer", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "location", title: "Location", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "pricing", title: "Pricing", defaultExpanded: false, collapsible: true, gridCols: 2, fields: [], locked: true },
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
        { key: "_status_display", label: "Status", sortable: true, renderHint: "status", locked: true },
        { key: "_job_label", label: "Job", sortable: true, renderHint: "text", locked: true },
        { key: "_customer_name", label: "Customer", sortable: true, renderHint: "link", locked: true },
        { key: "_next_schedule", label: "Next Visit", sortable: false, renderHint: "datetime" },
        { key: "_vendor_name", label: "Vendor", sortable: false, renderHint: "link" },
        { key: "_price_display", label: "Price", sortable: false, renderHint: "money" },
        { key: "is_recurring", label: "Recurring", sortable: true, renderHint: "primary_yes_no" },
        { key: "_updated", label: "Updated", sortable: true, renderHint: "datetime", locked: true },
      ],
      defaultSort: { key: "_updated", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "activity", "documents", "financials"],
      headerFields: [],
      layoutMode: 2,
      overviewSections: [
        {
          key: "job_details",
          title: "Job Details",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true },
            { key: "title", label: "Title", span: 1, renderHint: "text", editable: true },
            { key: "service_key", label: "Service", span: 1, renderHint: "text", editable: true },
            { key: "job_type", label: "Job type", span: 1, renderHint: "text", editable: true },
            { key: "assigned_vendor_id", label: "Assigned vendor", span: 1, renderHint: "link", editable: true, linkTarget: { idField: "assigned_vendor_id", entityType: "vendors" } },
            { key: "is_recurring", label: "Recurring", span: 1, renderHint: "primary_yes_no", editable: true },
            { key: "service_frequency_key", label: "Frequency", span: 1, renderHint: "text", editable: true },
          ],
          locked: true,
        },
        {
          key: "customer_location",
          title: "Customer & Location",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "_customer_name", label: "Customer", span: 1, renderHint: "link", linkTarget: { idField: "customer_id", entityType: "customers" } },
            { key: "_primary_person_name", label: "Primary Person", span: 1, renderHint: "link", linkTarget: { idField: "primary_person_id", entityType: "persons" } },
            { key: "_location_name", label: "Location", span: 1, renderHint: "link", linkTarget: { idField: "location_id", entityType: "locations" } },
            { key: "_opportunity_name", label: "Opportunity", span: 1, renderHint: "link", linkTarget: { idField: "opportunity_id", entityType: "opportunities" } },
          ],
          locked: true,
        },
        {
          key: "scheduling",
          title: "Scheduling",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "scheduled_at", label: "Scheduled at", span: 1, renderHint: "datetime", editable: true },
            { key: "completed_at", label: "Completed at", span: 1, renderHint: "datetime", editable: true },
            { key: "_next_schedule", label: "Next schedule", span: 1, renderHint: "datetime" },
          ],
          locked: true,
        },
        getJobOverviewBillingSummarySection(),
        {
          key: "notes",
          title: "Notes",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 1,
          fields: [
            { key: "internal_notes", label: "Internal notes", span: 1, renderHint: "text", editable: true },
            { key: "description", label: "Description", span: 1, renderHint: "text", editable: true },
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
            { key: "external_source", label: "External source", span: 1, renderHint: "text" },
            { key: "external_id", label: "External ID", span: 1, renderHint: "text" },
            { key: "org_id", label: "Org", span: 1, renderHint: "text" },
            { key: "vertical_id", label: "Vertical", span: 1, renderHint: "text" },
          ],
          locked: true,
        },
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
        { key: "_status_display", label: "Status", sortable: true, renderHint: "status", locked: true },
        { key: "start_at", label: "Date", sortable: true, renderHint: "datetime" },
        { key: "_customer_name", label: "Customer", sortable: false, renderHint: "link" },
        { key: "_location_label", label: "Location", sortable: false, renderHint: "text" },
        { key: "_job_title", label: "Job", sortable: false, renderHint: "link" },
        { key: "_assigned_vendor_name", label: "Vendor", sortable: false, renderHint: "text" },
        { key: "updated_at", label: "Updated", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "start_at", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "financials", "documents", "activity"],
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
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true },
            { key: "start_at", label: "Start", span: 1, renderHint: "datetime", editable: true },
            { key: "end_at", label: "End", span: 1, renderHint: "datetime", editable: true },
            { key: "timezone", label: "Timezone", span: 1, renderHint: "text", editable: true },
            { key: "time_window", label: "Time window", span: 1, renderHint: "text" },
            { key: "service_type", label: "Service type", span: 1, renderHint: "text" },
            { key: "updated_at", label: "Updated", span: 1, renderHint: "datetime" },
          ],
          locked: true,
        },
        { key: "job", title: "Job", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "customer", title: "Customer", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "location", title: "Location", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "vendor", title: "Vendor", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "reschedule_history", title: "Reschedule / Cancel history", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
        { key: "documents", title: "Documents", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [], locked: true },
      ],
      relatedModules: [],
      quickActions: [
        { key: "run_payment", label: "Run payment", variant: "primary", inHeader: true, locked: true },
      ],
    },
  },
  payments: {
    entityType: "payments",
    table: {
      columns: [
        { key: "_status_display", label: "Status", sortable: true, renderHint: "status", locked: true },
        { key: "_payment_label", label: "Payment", sortable: false, renderHint: "text", locked: true },
        { key: "_customer_name", label: "Customer", sortable: false, renderHint: "link", locked: true },
        { key: "_job_label", label: "Job", sortable: false, renderHint: "link" },
        { key: "_amount_display", label: "Amount", sortable: true, renderHint: "money", locked: true },
        { key: "provider", label: "Provider", sortable: false, renderHint: "text" },
        { key: "paid_at", label: "Paid At", sortable: true, renderHint: "datetime" },
        { key: "_posted_yes_no", label: "Posted", sortable: false, renderHint: "primary_yes_no" },
        { key: "_updated", label: "Updated", sortable: true, renderHint: "datetime", locked: true },
      ],
      defaultSort: { key: "_updated", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "activity", "ledger"],
      headerFields: [],
      layoutMode: 2,
      overviewSections: [
        {
          key: "payment_details",
          title: "Payment Details",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true },
            { key: "_payment_label", label: "Payment", span: 1, renderHint: "text" },
            { key: "amount_cents", label: "Amount", span: 1, renderHint: "money" },
            { key: "currency", label: "Currency", span: 1, renderHint: "text" },
            { key: "provider", label: "Provider", span: 1, renderHint: "text" },
            { key: "provider_payment_id", label: "Provider reference", span: 1, renderHint: "text" },
            { key: "paid_at", label: "Paid at", span: 1, renderHint: "datetime", editable: true },
            { key: "posted_to_ledger_at", label: "Posted to ledger", span: 1, renderHint: "datetime" },
          ],
          locked: true,
        },
        {
          key: "linked_records",
          title: "Linked Records",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "_customer_name", label: "Customer", span: 1, renderHint: "link", linkTarget: { idField: "customer_id", entityType: "customers" } },
            { key: "_job_label", label: "Job", span: 1, renderHint: "link", linkTarget: { idField: "job_id", entityType: "jobs" } },
          ],
          locked: true,
        },
        {
          key: "notes",
          title: "Notes",
          defaultExpanded: false,
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
            { key: "org_id", label: "Org", span: 1, renderHint: "text" },
          ],
          locked: true,
        },
      ],
      relatedModules: [],
    },
  },
  service_offerings: {
    entityType: "service_offerings",
    table: {
      columns: [
        { key: "offering_name", label: "Name", sortable: true, renderHint: "text" },
        { key: "offering_key", label: "Key", sortable: true, renderHint: "text" },
        { key: "_vertical_name", label: "Vertical", sortable: false, renderHint: "text" },
        { key: "_active_yes_no", label: "Active", sortable: true, renderHint: "primary_yes_no" },
        { key: "_updated", label: "Updated", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "_updated", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "activity"],
      headerFields: [],
      layoutMode: 2,
      overviewSections: [
        {
          key: "offering_details",
          title: "Offering Details",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "offering_name", label: "Name", span: 1, renderHint: "text", editable: true },
            { key: "offering_key", label: "Key", span: 1, renderHint: "text", editable: true },
            { key: "_vertical_name", label: "Vertical", span: 1, renderHint: "text" },
            { key: "is_active", label: "Active", span: 1, renderHint: "primary_yes_no", editable: true },
            { key: "description", label: "Description", span: 2, renderHint: "text", editable: true },
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
            { key: "org_id", label: "Org", span: 1, renderHint: "text" },
            { key: "vertical_id", label: "Vertical ID", span: 1, renderHint: "text" },
          ],
          locked: true,
        },
      ],
      relatedModules: [],
    },
  },
  service_plan_templates: {
    entityType: "service_plan_templates",
    table: {
      columns: [
        { key: "_status_display", label: "Status", sortable: true, renderHint: "status", locked: true },
        { key: "plan_name", label: "Name", sortable: true, renderHint: "text" },
        { key: "plan_key", label: "Key", sortable: true, renderHint: "text" },
        { key: "_recurring_yes_no", label: "Recurring", sortable: true, renderHint: "primary_yes_no" },
        { key: "_recurrence_label", label: "Recurrence", sortable: false, renderHint: "text" },
        { key: "_active_yes_no", label: "Active", sortable: true, renderHint: "primary_yes_no" },
        { key: "_updated", label: "Updated", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "_updated", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "activity"],
      headerFields: [],
      layoutMode: 2,
      overviewSections: [
        {
          key: "plan_details",
          title: "Plan Template Details",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true },
            { key: "plan_name", label: "Name", span: 1, renderHint: "text", editable: true },
            { key: "plan_key", label: "Key", span: 1, renderHint: "text", editable: true },
            { key: "is_recurring", label: "Recurring", span: 1, renderHint: "primary_yes_no", editable: true },
            { key: "recurrence_unit", label: "Recurrence unit", span: 1, renderHint: "text", editable: true },
            { key: "recurrence_interval", label: "Recurrence interval", span: 1, renderHint: "text", editable: true },
            { key: "is_active", label: "Active", span: 1, renderHint: "primary_yes_no", editable: true },
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
            { key: "org_id", label: "Org", span: 1, renderHint: "text" },
            { key: "vertical_id", label: "Vertical ID", span: 1, renderHint: "text" },
          ],
          locked: true,
        },
      ],
      relatedModules: [],
    },
  },
  documents: {
    entityType: "documents",
    table: {
      columns: [
        { key: "_status_display", label: "Status", sortable: true, renderHint: "status", locked: true },
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
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true },
            { key: "name", label: "Name", span: 2, renderHint: "text" },
            { key: "document_type", label: "Type", span: 1, renderHint: "text" },
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
        { key: "_status_display", label: "Status", sortable: true, renderHint: "status", locked: true },
        { key: "company_name", label: "Company", sortable: true, renderHint: "text", locked: true },
        { key: "name", label: "Name", sortable: true, renderHint: "text", locked: true },
        { key: "_primary_person_name", label: "Person", sortable: false, renderHint: "text" },
        { key: "_vendor_email", label: "Email", sortable: false, renderHint: "text" },
        { key: "_vendor_phone", label: "Phone", sortable: false, renderHint: "phone" },
        { key: "payout_percent", label: "Payout", sortable: false, renderHint: "custom" },
        { key: "_jobs_count", label: "Jobs", sortable: false, renderHint: "text" },
        { key: "w9_received", label: "W9", sortable: false, renderHint: "primary_yes_no" },
        { key: "ach_verified", label: "ACH", sortable: false, renderHint: "primary_yes_no" },
        { key: "_updated", label: "Updated", sortable: true, renderHint: "datetime", locked: true },
      ],
      defaultSort: { key: "_updated", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "financials", "activity", "documents"],
      headerFields: [],
      layoutMode: 2,
      overviewSections: [
        {
          key: "account_info",
          title: "Account Info",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true },
            { key: "name", label: "Name", span: 1, renderHint: "text", editable: true, locked: true },
            { key: "company_name", label: "Company name", span: 1, renderHint: "text", editable: true },
            { key: "primary_person_id", label: "Primary person", span: 1, renderHint: "link", editable: true, linkTarget: { idField: "primary_person_id", entityType: "persons" } },
            { key: "email", label: "Email", span: 1, renderHint: "text", editable: true },
            { key: "phone", label: "Phone", span: 1, renderHint: "phone", editable: true },
            { key: "external_source", label: "External source", span: 1, renderHint: "text", editable: true },
            { key: "external_id", label: "External ID", span: 1, renderHint: "text", editable: true },
          ],
          locked: true,
        },
        {
          key: "payout_capacity",
          title: "Payout & Capacity",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "payout_percent", label: "Payout %", span: 1, renderHint: "text", editable: true },
            { key: "payout_override_type", label: "Payout override type", span: 1, renderHint: "text", editable: true },
            { key: "payout_override_value", label: "Payout override value", span: 1, renderHint: "text", editable: true },
            { key: "max_daily_jobs", label: "Max daily jobs", span: 1, renderHint: "text", editable: true },
            { key: "owns_supplies", label: "Owns supplies", span: 1, renderHint: "primary_yes_no", editable: true },
          ],
          locked: true,
        },
        {
          key: "compliance",
          title: "Compliance",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "w9_received", label: "W9 received", span: 1, renderHint: "primary_yes_no", editable: true },
            { key: "ach_verified", label: "ACH verified", span: 1, renderHint: "primary_yes_no", editable: true },
            { key: "consent_contractor_agreement", label: "Consent (contractor agreement)", span: 1, renderHint: "primary_yes_no", editable: true },
            { key: "consent_legal", label: "Consent (legal)", span: 1, renderHint: "primary_yes_no", editable: true },
            { key: "consent_marketing", label: "Consent (marketing)", span: 1, renderHint: "primary_yes_no", editable: true },
            { key: "submitted_at", label: "Submitted at", span: 1, renderHint: "datetime", locked: true },
          ],
          locked: true,
        },
        {
          key: "availability_service_area",
          title: "Availability & Service Area",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "days_available", label: "Days available", span: 1, renderHint: "custom", editable: true },
            { key: "operating_hours_open", label: "Operating hours open", span: 1, renderHint: "text", editable: true },
            { key: "operating_hours_close", label: "Operating hours close", span: 1, renderHint: "text", editable: true },
            { key: "service_area_zip_codes", label: "Service area zip codes", span: 1, renderHint: "custom", editable: true },
            { key: "address_line1", label: "Address", span: 1, renderHint: "text", editable: true },
            { key: "city", label: "City", span: 1, renderHint: "text", editable: true },
            { key: "state", label: "State", span: 1, renderHint: "text", editable: true },
            { key: "postal_code", label: "Postal code", span: 1, renderHint: "text", editable: true },
          ],
          locked: true,
        },
        {
          key: "compliance_quick_links",
          title: "Compliance (quick links)",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 1,
          fields: [],
          locked: true,
        },
        {
          key: "record_info",
          title: "Record Info",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "id", label: "ID", span: 1, renderHint: "text", locked: true },
            { key: "created_at", label: "Created", span: 1, renderHint: "datetime", locked: true },
            { key: "updated_at", label: "Updated", span: 1, renderHint: "datetime", locked: true },
            { key: "org_id", label: "Org ID", span: 1, renderHint: "text", locked: true },
          ],
          locked: true,
        },
      ],
      relatedModules: [],
    },
  },
  contacts: {
    entityType: "contacts",
    table: {
      columns: [
        { key: "_status_display", label: "Status", sortable: true, renderHint: "status", locked: true },
        { key: "_name", label: "Name", sortable: true, renderHint: "text", locked: true },
        { key: "contact_type", label: "Contact Type", sortable: true, renderHint: "text" },
        { key: "_customer_name", label: "Customer", sortable: false, renderHint: "text" },
        { key: "_is_primary_contact", label: "Primary for (customer/vendor)", sortable: false, renderHint: "primary_yes_no" },
        { key: "email", label: "Email", sortable: true, renderHint: "text" },
        { key: "phone", label: "Phone", sortable: true, renderHint: "phone" },
        { key: "_updated", label: "Updated", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "_updated", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "activity", "documents"],
      headerFields: [],
      layoutMode: 2,
      overviewSections: [
        {
          key: "basic_info",
          title: "Basic Info",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true },
            { key: "first_name", label: "First name", span: 1, renderHint: "text", editable: true, locked: true },
            { key: "last_name", label: "Last name", span: 1, renderHint: "text", editable: true, locked: true },
            { key: "email", label: "Email", span: 1, renderHint: "text", editable: true },
            { key: "phone", label: "Phone", span: 1, renderHint: "phone", editable: true },
            { key: "contact_type", label: "Contact Type", span: 1, renderHint: "text", editable: true },
            { key: "company_name", label: "Company name", span: 1, renderHint: "text", editable: true },
            { key: "vendor_contact_role", label: "Vendor contact role", span: 1, renderHint: "text", editable: true },
          ],
          locked: true,
        },
        {
          key: "association",
          title: "Association",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "_linked_customer_name", label: "Linked customer", span: 1, renderHint: "text" },
            { key: "_linked_vendor_name", label: "Linked vendor", span: 1, renderHint: "text" },
            { key: "_primary_contact_for", label: "Primary for", span: 1, renderHint: "text" },
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
          defaultExpanded: false,
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
    table: {
      columns: [
        { key: "_status_display", label: "Status", sortable: true, renderHint: "status", locked: true },
        { key: "display_name", label: "Name", sortable: true, renderHint: "text", locked: true },
        { key: "_relationship_label", label: "Relationship", sortable: false, renderHint: "text" },
        { key: "_customer_name", label: "Customer", sortable: false, renderHint: "text" },
        { key: "dob", label: "DOB", sortable: true, renderHint: "date" },
        { key: "_age", label: "Age", sortable: false, renderHint: "text" },
        { key: "_linked_contacts_count", label: "Linked Contacts", sortable: false, renderHint: "text" },
        { key: "_updated", label: "Updated", sortable: true, renderHint: "datetime", locked: true },
      ],
      defaultSort: { key: "_updated", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "activity", "documents"],
      headerFields: [],
      layoutMode: 2,
      overviewSections: [
        {
          key: "basic_info",
          title: "Basic Info",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true, locked: true },
            { key: "display_name", label: "Display name", span: 1, renderHint: "text", editable: true, locked: true },
            { key: "_relationship_label", label: "Relationship", span: 1, renderHint: "text", editable: false, locked: true },
            { key: "_customer_name", label: "Customer", span: 1, renderHint: "link", locked: true, linkTarget: { idField: "customer_id", entityType: "customers" } },
            { key: "first_name", label: "First name", span: 1, renderHint: "text", editable: true },
            { key: "last_name", label: "Last name", span: 1, renderHint: "text", editable: true },
            { key: "dob", label: "DOB", span: 1, renderHint: "date", editable: true },
            { key: "_age", label: "Age", span: 1, renderHint: "text", locked: true },
          ],
          locked: true,
        },
        {
          key: "contact_roles",
          title: "Contact Roles",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 1,
          fields: [],
          locked: true,
        },
        {
          key: "external_source",
          title: "External / Source",
          defaultExpanded: false,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "external_source", label: "External source", span: 1, renderHint: "text", editable: true },
            { key: "external_id", label: "External ID", span: 1, renderHint: "text", editable: true },
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
            { key: "id", label: "ID", span: 1, renderHint: "text", locked: true },
            { key: "created_at", label: "Created", span: 1, renderHint: "datetime", locked: true },
            { key: "updated_at", label: "Updated", span: 1, renderHint: "datetime", locked: true },
            { key: "org_id", label: "Org ID", span: 1, renderHint: "text", locked: true },
            { key: "customer_id", label: "Customer ID", span: 1, renderHint: "text", locked: true },
          ],
          locked: true,
        },
      ],
      relatedModules: [],
    },
  },
  persons: {
    entityType: "persons",
    table: {
      columns: [
        { key: "_status_display", label: "Status", sortable: true, renderHint: "status", locked: true },
        { key: "_person_name", label: "Name", sortable: true, renderHint: "text", locked: true },
        { key: "email", label: "Email", sortable: true, renderHint: "text" },
        { key: "phone", label: "Phone", sortable: true, renderHint: "phone" },
        { key: "_customer_count", label: "Customers", sortable: false, renderHint: "text" },
        { key: "_updated", label: "Updated", sortable: true, renderHint: "datetime", locked: true },
      ],
      defaultSort: { key: "_updated", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "documents"],
      headerFields: [],
      layoutMode: 2,
      overviewSections: [
        {
          key: "basic_info",
          title: "Basic Info",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "status_key", label: "Status", span: 1, renderHint: "status", editable: true, locked: true },
            { key: "first_name", label: "First name", span: 1, renderHint: "text", locked: true },
            { key: "last_name", label: "Last name", span: 1, renderHint: "text", locked: true },
            { key: "email", label: "Email", span: 1, renderHint: "text", locked: true },
            { key: "phone", label: "Phone", span: 1, renderHint: "phone", locked: true },
            { key: "created_at", label: "Created", span: 1, renderHint: "datetime", locked: true },
            { key: "updated_at", label: "Updated", span: 1, renderHint: "datetime", locked: true },
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
            { key: "id", label: "ID", span: 1, renderHint: "text", locked: true },
            { key: "org_id", label: "Org ID", span: 1, renderHint: "text", locked: true },
          ],
          locked: true,
        },
        {
          key: "relationships",
          title: "Relationships",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 1,
          fields: [],
          locked: true,
        },
      ],
      relatedModules: [
        { key: "customer_persons", label: "Customers", entityType: "customers", locked: true },
        { key: "person_relationships", label: "Relationships", entityType: "persons", locked: true },
      ],
    },
  },
  workflows: {
    entityType: "workflows",
    table: { columns: [], defaultSort: { key: "updated_at", direction: "desc" } },
    drawer: { tabs: ["overview", "activity"], layoutMode: 1, overviewSections: [], relatedModules: [] },
  },
  discount_redemptions: {
    entityType: "discount_redemptions",
    table: {
      columns: [
        { key: "_code", label: "Code", sortable: false, renderHint: "text" },
        { key: "_customer_name", label: "Customer", sortable: false, renderHint: "link" },
        { key: "_contact_name", label: "Contact", sortable: false, renderHint: "link" },
        { key: "_opportunity_name", label: "Opportunity", sortable: false, renderHint: "link" },
        { key: "_job_label", label: "Job", sortable: false, renderHint: "link" },
        { key: "_subtotal_display", label: "Subtotal", sortable: true, renderHint: "money" },
        { key: "_discount_display", label: "Discount", sortable: true, renderHint: "money" },
        { key: "_total_display", label: "Total", sortable: true, renderHint: "money" },
        { key: "created_at", label: "Created", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "created_at", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "related", "activity"],
      headerFields: [],
      layoutMode: 2,
      overviewSections: [
        {
          key: "redemption_details",
          title: "Redemption Details",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "_code", label: "Discount code", span: 1, renderHint: "text" },
            { key: "_discount_type", label: "Discount type", span: 1, renderHint: "text" },
            { key: "_discount_value", label: "Discount value", span: 1, renderHint: "text" },
            { key: "created_at", label: "Created", span: 1, renderHint: "datetime" },
            { key: "booking_attempt_id", label: "Booking attempt", span: 1, renderHint: "text" },
          ],
          locked: true,
        },
        {
          key: "linked_records",
          title: "Linked Records",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "_customer_name", label: "Customer", span: 1, renderHint: "link", linkTarget: { idField: "customer_id", entityType: "customers" } },
            { key: "_contact_name", label: "Contact", span: 1, renderHint: "link", linkTarget: { idField: "contact_id", entityType: "contacts" } },
            { key: "_opportunity_name", label: "Opportunity", span: 1, renderHint: "link", linkTarget: { idField: "opportunity_id", entityType: "opportunities" } },
            { key: "_job_label", label: "Job", span: 1, renderHint: "link", linkTarget: { idField: "job_id", entityType: "jobs" } },
          ],
          locked: true,
        },
        {
          key: "quote_impact",
          title: "Quote Impact",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "quote_subtotal", label: "Subtotal", span: 1, renderHint: "money" },
            { key: "discount_amount", label: "Discount", span: 1, renderHint: "money" },
            { key: "quote_total", label: "Total", span: 1, renderHint: "money" },
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
            { key: "discount_code_id", label: "Discount code ID", span: 1, renderHint: "text" },
            { key: "created_at", label: "Created", span: 1, renderHint: "datetime" },
          ],
          locked: true,
        },
      ],
      relatedModules: [],
    },
  },
  addons: {
    entityType: "addons",
    table: {
      columns: [
        { key: "addon_name", label: "Add-on", sortable: true, renderHint: "text" },
        { key: "addon_key", label: "Key", sortable: true, renderHint: "text" },
        { key: "_vertical_name", label: "Vertical", sortable: false, renderHint: "text" },
        { key: "amount_cents", label: "Amount", sortable: true, renderHint: "money" },
        { key: "sort_order", label: "Sort Order", sortable: true, renderHint: "text" },
        { key: "_active_yes_no", label: "Active", sortable: false, renderHint: "primary_yes_no" },
        { key: "_updated", label: "Updated", sortable: true, renderHint: "datetime" },
      ],
      defaultSort: { key: "_updated", direction: "desc" },
    },
    drawer: {
      tabs: ["overview", "activity"],
      headerFields: [],
      layoutMode: 2,
      overviewSections: [
        {
          key: "addon_details",
          title: "Add-on Details",
          defaultExpanded: true,
          collapsible: true,
          gridCols: 2,
          fields: [
            { key: "addon_name", label: "Add-on", span: 1, renderHint: "text", editable: true },
            { key: "addon_key", label: "Key", span: 1, renderHint: "text", editable: true },
            { key: "_vertical_name", label: "Vertical", span: 1, renderHint: "text" },
            { key: "amount_cents", label: "Amount", span: 1, renderHint: "money", editable: true },
            { key: "sort_order", label: "Sort Order", span: 1, renderHint: "text", editable: true },
            { key: "is_active", label: "Active", span: 1, renderHint: "primary_yes_no", editable: true },
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
            { key: "vertical_id", label: "Vertical ID", span: 1, renderHint: "text" },
          ],
          locked: true,
        },
      ],
      relatedModules: [],
    },
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

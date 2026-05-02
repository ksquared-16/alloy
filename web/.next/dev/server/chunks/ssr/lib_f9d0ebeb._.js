module.exports = [
"[project]/lib/adminFormatters.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Shared formatting helpers for admin portal.
 * Use these for consistent date and currency display in tables and drawers.
 */ __turbopack_context__.s([
    "RECURRENCE_UNIT_OPTIONS",
    ()=>RECURRENCE_UNIT_OPTIONS,
    "formatDate",
    ()=>formatDate,
    "formatDateTime",
    ()=>formatDateTime,
    "formatDateTimeLocal",
    ()=>formatDateTimeLocal,
    "formatFrequencyLabel",
    ()=>formatFrequencyLabel,
    "formatMoney",
    ()=>formatMoney,
    "formatMoneyFromCents",
    ()=>formatMoneyFromCents,
    "formatMoneyFromDollars",
    ()=>formatMoneyFromDollars,
    "formatPayoutPercent",
    ()=>formatPayoutPercent,
    "formatPhoneUS",
    ()=>formatPhoneUS,
    "formatRecurrenceLabel",
    ()=>formatRecurrenceLabel,
    "formatScheduleDrawerHeaderTitle",
    ()=>formatScheduleDrawerHeaderTitle,
    "personDisplayName",
    ()=>personDisplayName
]);
const usdOptions = {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
};
function formatMoneyFromCents(value) {
    if (value === null || value === undefined) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(num)) return "-";
    return new Intl.NumberFormat("en-US", usdOptions).format(num / 100);
}
function formatMoneyFromDollars(value) {
    if (value === null || value === undefined) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(num)) return "-";
    return new Intl.NumberFormat("en-US", usdOptions).format(num);
}
function formatMoney(value, fieldName) {
    if (value === null || value === undefined) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(num)) return "-";
    const isCents = fieldName?.endsWith("_cents") ?? false;
    const dollars = isCents ? num / 100 : num;
    return new Intl.NumberFormat("en-US", usdOptions).format(dollars);
}
function formatPayoutPercent(value) {
    if (value === null || value === undefined) return "—";
    const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : Number(value);
    if (Number.isNaN(n)) return "—";
    const display = n > 0 && n <= 1 ? n * 100 : n;
    return `${display}%`;
}
function formatDate(value) {
    if (value === null || value === undefined) return "-";
    const d = typeof value === "object" ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC"
    }).format(d);
}
function formatFrequencyLabel(cadence, interval) {
    const c = (cadence ?? "month").toLowerCase();
    const n = Math.max(1, Number(interval) || 1);
    if (c === "week") return n === 1 ? "Every 1 week" : `Every ${n} weeks`;
    return n === 1 ? "Every 1 month" : `Every ${n} months`;
}
function formatPhoneUS(value) {
    if (value == null || value === "") return "—";
    const digits = String(value).replace(/\D/g, "");
    if (digits.length < 10) return String(value);
    const area = digits.slice(-10, -7);
    const mid = digits.slice(-7, -4);
    const last = digits.slice(-4);
    return `${area}-${mid}-${last}`;
}
function formatDateTime(value) {
    if (value === null || value === undefined) return "-";
    const d = typeof value === "object" ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC"
    }).format(d);
}
function formatDateTimeLocal(value) {
    if (value === null || value === undefined) return "-";
    const d = typeof value === "object" ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    const s = new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    }).format(d);
    return s.replace(",", "").replace(/\s+/g, " ").trim();
}
const RECURRENCE_UNIT_OPTIONS = [
    {
        value: "day",
        label: "Day"
    },
    {
        value: "week",
        label: "Week"
    },
    {
        value: "month",
        label: "Month"
    },
    {
        value: "quarter",
        label: "Quarter"
    },
    {
        value: "year",
        label: "Year"
    }
];
function formatRecurrenceLabel(unit, interval) {
    if (!unit || interval == null || interval < 1) return null;
    const i = Math.max(1, Number(interval) || 1);
    const u = unit.toLowerCase();
    if (u === "day" && i === 1) return "Daily";
    if (u === "day") return `Every ${i} days`;
    if (u === "week" && i === 1) return "Weekly";
    if (u === "week") return `Every ${i} weeks`;
    if (u === "month" && i === 1) return "Monthly";
    if (u === "month") return `Every ${i} months`;
    if (u === "quarter" && i === 1) return "Quarterly";
    if (u === "quarter") return `Every ${i} quarters`;
    if (u === "year" && i === 1) return "Annually";
    if (u === "year") return `Every ${i} years`;
    return `${i} ${u}(s)`;
}
function personDisplayName(o) {
    if (!o) return "—";
    const full = o.full_name?.trim();
    if (full) return full;
    const parts = [
        o.first_name,
        o.last_name
    ].filter(Boolean).map((s)=>String(s).trim());
    return parts.length ? parts.join(" ") : "—";
}
function formatScheduleDrawerHeaderTitle(iso, timeZone) {
    if (iso == null || String(iso).trim() === "") return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const tz = timeZone && String(timeZone).trim() ? String(timeZone).trim() : undefined;
    const dateParts = new Intl.DateTimeFormat("en-US", {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
        timeZone: tz
    }).formatToParts(d);
    const month = dateParts.find((p)=>p.type === "month")?.value ?? "";
    const day = dateParts.find((p)=>p.type === "day")?.value ?? "";
    const year = dateParts.find((p)=>p.type === "year")?.value ?? "";
    const dateStr = `${month}/${day}/${year}`;
    const tp = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
        timeZone: tz
    }).formatToParts(d);
    const hourRaw = tp.find((p)=>p.type === "hour")?.value ?? "12";
    const minRaw = tp.find((p)=>p.type === "minute")?.value ?? "00";
    const dayPeriod = (tp.find((p)=>p.type === "dayPeriod")?.value ?? "am").toLowerCase();
    const isPm = dayPeriod.startsWith("p");
    let hour12 = parseInt(hourRaw, 10);
    if (Number.isNaN(hour12)) hour12 = 12;
    if (hour12 === 0) hour12 = 12;
    const minNum = parseInt(minRaw, 10);
    const suffix = isPm ? "p" : "a";
    let timeCompact;
    if (!Number.isNaN(minNum) && minNum === 0) {
        timeCompact = `${hour12}${suffix}`;
    } else {
        const mm = Number.isNaN(minNum) ? "00" : String(minNum).padStart(2, "0");
        timeCompact = `${hour12}${mm}${suffix}`;
    }
    return `${dateStr} · ${timeCompact}`;
}
}),
"[project]/lib/admin/v1DocumentEntities.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "V1_DOCUMENT_ENTITY_OPTIONS",
    ()=>V1_DOCUMENT_ENTITY_OPTIONS,
    "V1_DOCUMENT_ENTITY_VALUES",
    ()=>V1_DOCUMENT_ENTITY_VALUES,
    "drawerTypeForDocumentEntity",
    ()=>drawerTypeForDocumentEntity,
    "isV1DocumentEntityType",
    ()=>isV1DocumentEntityType
]);
const V1_DOCUMENT_ENTITY_VALUES = [
    "customer",
    "vendor",
    "opportunity",
    "contact",
    "person",
    "job",
    "schedule"
];
function isV1DocumentEntityType(v) {
    return V1_DOCUMENT_ENTITY_VALUES.includes(v);
}
const V1_DOCUMENT_ENTITY_OPTIONS = [
    {
        value: "customer",
        label: "Customer",
        drawerType: "customers"
    },
    {
        value: "vendor",
        label: "Vendor",
        drawerType: "vendors"
    },
    {
        value: "opportunity",
        label: "Opportunity",
        drawerType: "opportunities"
    },
    {
        value: "contact",
        label: "Contact",
        drawerType: "contacts"
    },
    {
        value: "person",
        label: "Person",
        drawerType: "persons"
    },
    {
        value: "job",
        label: "Job",
        drawerType: "jobs"
    },
    {
        value: "schedule",
        label: "Schedule",
        drawerType: "schedules"
    }
];
function drawerTypeForDocumentEntity(entityType) {
    if (!entityType) return null;
    const row = V1_DOCUMENT_ENTITY_OPTIONS.find((o)=>o.value === entityType);
    return row?.drawerType ?? null;
}
}),
"[project]/lib/workflowVocab.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Single source of truth for workflow editor vocabulary (V1).
 * Canonical entity types: customer, contact, job, schedule, opportunity, vendor, location.
 */ __turbopack_context__.s([
    "WORKFLOW_CONDITION_OPERATORS",
    ()=>WORKFLOW_CONDITION_OPERATORS,
    "WORKFLOW_ENTITY_ID_QUICK_FILL",
    ()=>WORKFLOW_ENTITY_ID_QUICK_FILL,
    "WORKFLOW_ENTITY_TYPES",
    ()=>WORKFLOW_ENTITY_TYPES,
    "WORKFLOW_EVENT_TYPES",
    ()=>WORKFLOW_EVENT_TYPES,
    "WORKFLOW_FIELD_PATHS_BY_ENTITY_TYPE",
    ()=>WORKFLOW_FIELD_PATHS_BY_ENTITY_TYPE
]);
const WORKFLOW_ENTITY_TYPES = [
    "customer",
    "contact",
    "job",
    "schedule",
    "opportunity",
    "vendor",
    "location"
];
const WORKFLOW_EVENT_TYPES = [
    "booking_confirmed",
    "specialty_quote_started",
    "quote_started",
    "job_action",
    "job_default_vendor_applied",
    "schedule_created",
    "schedule_vendor_assigned",
    "action_link_consumed",
    "job_rescheduled",
    "job_canceled",
    "job_completed",
    "payment_succeeded",
    "payment_failed"
];
const WORKFLOW_FIELD_PATHS_BY_ENTITY_TYPE = {
    job: [
        {
            value: "job.id",
            label: "job.id"
        },
        {
            value: "job.title",
            label: "job.title"
        },
        {
            value: "job.scheduled_at",
            label: "job.scheduled_at"
        },
        {
            value: "job.service_frequency_key",
            label: "job.service_frequency_key"
        },
        {
            value: "job.postal_code",
            label: "job.postal_code"
        },
        {
            value: "job.is_recurring",
            label: "job.is_recurring"
        },
        {
            value: "schedule.id",
            label: "schedule.id"
        },
        {
            value: "schedule.start_at",
            label: "schedule.start_at"
        },
        {
            value: "schedule.end_at",
            label: "schedule.end_at"
        },
        {
            value: "schedule.timezone",
            label: "schedule.timezone"
        },
        {
            value: "schedule.duration_minutes",
            label: "schedule.duration_minutes"
        },
        {
            value: "contact.id",
            label: "contact.id"
        },
        {
            value: "contact.first_name",
            label: "contact.first_name"
        },
        {
            value: "contact.last_name",
            label: "contact.last_name"
        },
        {
            value: "contact.email",
            label: "contact.email"
        },
        {
            value: "contact.phone",
            label: "contact.phone"
        },
        {
            value: "customer.id",
            label: "customer.id"
        },
        {
            value: "customer.name",
            label: "customer.name"
        },
        {
            value: "customer.postal_code",
            label: "customer.postal_code"
        },
        {
            value: "opportunity.id",
            label: "opportunity.id"
        },
        {
            value: "opportunity.postal_code",
            label: "opportunity.postal_code"
        },
        {
            value: "opportunity.job_date",
            label: "opportunity.job_date"
        },
        {
            value: "opportunity.job_time_window",
            label: "opportunity.job_time_window"
        },
        {
            value: "opportunity.pipeline_stage_id",
            label: "opportunity.pipeline_stage_id"
        },
        {
            value: "location.beds",
            label: "location.beds"
        },
        {
            value: "location.baths",
            label: "location.baths"
        },
        {
            value: "location.home_type_key",
            label: "location.home_type_key"
        },
        {
            value: "location.access_method_key",
            label: "location.access_method_key"
        },
        {
            value: "location.square_footage_tier_key",
            label: "location.square_footage_tier_key"
        },
        {
            value: "location.square_footage_tier_label",
            label: "location.square_footage_tier_label (human-readable tier)"
        },
        {
            value: "location.postal_code",
            label: "location.postal_code"
        },
        {
            value: "formatted_start_at",
            label: "formatted_start_at (booking_confirmed SMS)"
        },
        {
            value: "booking_price",
            label: "booking_price (USD string)"
        },
        {
            value: "booking_vendor_payout",
            label: "booking_vendor_payout (vendor-offer SMS; USD string)"
        },
        {
            value: "booking_pay_and_vendor_payout",
            label: "booking_pay_and_vendor_payout (Pay: price + payout; vendor-offer SMS)"
        },
        {
            value: "booking_bedrooms",
            label: "booking_bedrooms (legacy → resolves location.beds)"
        },
        {
            value: "booking_bathrooms",
            label: "booking_bathrooms (legacy → resolves location.baths)"
        },
        {
            value: "booking_square_footage",
            label: "booking_square_footage (legacy → tier key / location.square_footage_tier_key)"
        }
    ],
    opportunity: [
        {
            value: "opportunity.id",
            label: "opportunity.id"
        },
        {
            value: "opportunity.name",
            label: "opportunity.name"
        },
        {
            value: "opportunity.postal_code",
            label: "opportunity.postal_code"
        },
        {
            value: "opportunity.job_date",
            label: "opportunity.job_date"
        },
        {
            value: "opportunity.job_time_window",
            label: "opportunity.job_time_window"
        },
        {
            value: "contact.id",
            label: "contact.id"
        },
        {
            value: "contact.first_name",
            label: "contact.first_name"
        },
        {
            value: "contact.email",
            label: "contact.email"
        },
        {
            value: "customer.id",
            label: "customer.id"
        },
        {
            value: "customer.name",
            label: "customer.name"
        }
    ],
    contact: [
        {
            value: "contact.id",
            label: "contact.id"
        },
        {
            value: "contact.first_name",
            label: "contact.first_name"
        },
        {
            value: "contact.last_name",
            label: "contact.last_name"
        },
        {
            value: "contact.email",
            label: "contact.email"
        },
        {
            value: "contact.phone",
            label: "contact.phone"
        },
        {
            value: "customer.id",
            label: "customer.id"
        },
        {
            value: "customer.name",
            label: "customer.name"
        }
    ],
    customer: [
        {
            value: "customer.id",
            label: "customer.id"
        },
        {
            value: "customer.name",
            label: "customer.name"
        },
        {
            value: "customer.postal_code",
            label: "customer.postal_code"
        }
    ],
    schedule: [
        {
            value: "schedule.id",
            label: "schedule.id"
        },
        {
            value: "schedule.start_at",
            label: "schedule.start_at"
        },
        {
            value: "schedule.end_at",
            label: "schedule.end_at"
        },
        {
            value: "schedule.timezone",
            label: "schedule.timezone"
        },
        {
            value: "schedule.duration_minutes",
            label: "schedule.duration_minutes"
        },
        {
            value: "job.id",
            label: "job.id"
        },
        {
            value: "job.title",
            label: "job.title"
        }
    ],
    vendor: [
        {
            value: "vendor.id",
            label: "vendor.id"
        },
        {
            value: "vendor.name",
            label: "vendor.name"
        },
        {
            value: "vendor.email",
            label: "vendor.email"
        },
        {
            value: "vendor.phone",
            label: "vendor.phone"
        },
        {
            value: "vendor.vendor_status_id",
            label: "vendor.vendor_status_id"
        },
        {
            value: "vendor.primary_contact_id",
            label: "vendor.primary_contact_id"
        }
    ],
    location: [
        {
            value: "location.id",
            label: "location.id"
        },
        {
            value: "location.postal_code",
            label: "location.postal_code"
        },
        {
            value: "location.beds",
            label: "location.beds"
        },
        {
            value: "location.baths",
            label: "location.baths"
        },
        {
            value: "location.home_type_key",
            label: "location.home_type_key"
        },
        {
            value: "location.access_method_key",
            label: "location.access_method_key"
        },
        {
            value: "location.square_footage_tier_key",
            label: "location.square_footage_tier_key"
        },
        {
            value: "location.city",
            label: "location.city"
        },
        {
            value: "location.state",
            label: "location.state"
        }
    ]
};
const WORKFLOW_CONDITION_OPERATORS = [
    "eq",
    "neq",
    "contains",
    "gt",
    "lt",
    "gte",
    "lte",
    "in",
    "not_in",
    "is_null",
    "not_null",
    "exists"
];
const WORKFLOW_ENTITY_ID_QUICK_FILL = [
    {
        value: "job.id",
        label: "job.id"
    },
    {
        value: "contact.id",
        label: "contact.id"
    },
    {
        value: "customer.id",
        label: "customer.id"
    },
    {
        value: "opportunity.id",
        label: "opportunity.id"
    },
    {
        value: "schedule.id",
        label: "schedule.id"
    },
    {
        value: "vendor.id",
        label: "vendor.id"
    },
    {
        value: "location.id",
        label: "location.id"
    }
];
}),
"[project]/lib/entityPresentation.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

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
 */ /** Entity type keys used in presentation config. Align with AdminDrawerEntityType where applicable. */ __turbopack_context__.s([
    "getEntityPresentation",
    ()=>getEntityPresentation,
    "getEntityTypesWithTableConfig",
    ()=>getEntityTypesWithTableConfig,
    "getJobOverviewBillingSummarySection",
    ()=>getJobOverviewBillingSummarySection,
    "getJobPricingBreakdownSection",
    ()=>getJobPricingBreakdownSection,
    "getJobUnifiedPricingSection",
    ()=>getJobUnifiedPricingSection,
    "toPresentationType",
    ()=>toPresentationType
]);
function getJobUnifiedPricingSection() {
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
                    {
                        key: "gross_price_cents",
                        label: "Gross Price",
                        span: 1,
                        renderHint: "money",
                        editable: true
                    },
                    {
                        key: "display_total_cents",
                        label: "Final Total (after discount)",
                        span: 1,
                        renderHint: "money",
                        editable: false
                    },
                    {
                        key: "recurring_total_cents",
                        label: "Recurring Total",
                        span: 1,
                        renderHint: "money",
                        editable: false
                    },
                    {
                        key: "contractor_payout_cents",
                        label: "Contractor Payout",
                        span: 1,
                        renderHint: "money",
                        editable: false
                    },
                    {
                        key: "alloy_fee_cents",
                        label: "Platform Fee",
                        span: 1,
                        renderHint: "money",
                        editable: false
                    }
                ]
            },
            {
                title: "Discount",
                fields: [
                    {
                        key: "discount_code_id",
                        label: "Discount code",
                        span: 1,
                        renderHint: "text",
                        editable: true
                    },
                    {
                        key: "_discount_amount_cents",
                        label: "Discount amount",
                        span: 1,
                        renderHint: "money",
                        editable: false
                    },
                    {
                        key: "_discount_applied",
                        label: "Discount applied",
                        span: 1,
                        renderHint: "primary_yes_no",
                        editable: false
                    }
                ]
            },
            {
                title: "Payment status (from payments)",
                fields: [
                    {
                        key: "_job_payment_original_cents",
                        label: "Job total (priced)",
                        span: 1,
                        renderHint: "money",
                        editable: false
                    },
                    {
                        key: "_job_payment_paid_cents",
                        label: "Total paid",
                        span: 1,
                        renderHint: "money",
                        editable: false
                    },
                    {
                        key: "_job_payment_balance_cents",
                        label: "Balance due",
                        span: 1,
                        renderHint: "money",
                        editable: false
                    },
                    {
                        key: "_job_payment_status_label",
                        label: "Payment state",
                        span: 1,
                        renderHint: "text",
                        editable: false
                    }
                ]
            }
        ]
    };
}
function getJobPricingBreakdownSection() {
    return {
        key: "job_pricing_breakdown",
        title: "Pricing breakdown",
        defaultExpanded: true,
        collapsible: true,
        gridCols: 1,
        fields: [],
        locked: true
    };
}
function getJobOverviewBillingSummarySection() {
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
                    {
                        key: "service_frequency_key",
                        label: "Service frequency",
                        span: 1,
                        renderHint: "text",
                        editable: false
                    },
                    {
                        key: "is_recurring",
                        label: "Recurring job",
                        span: 1,
                        renderHint: "primary_yes_no",
                        editable: false
                    }
                ]
            },
            {
                title: "Totals & payment status",
                fields: [
                    {
                        key: "total_cents",
                        label: "Job total (priced)",
                        span: 1,
                        renderHint: "money",
                        editable: false
                    },
                    {
                        key: "recurring_total_cents",
                        label: "Recurring total",
                        span: 1,
                        renderHint: "money",
                        editable: false
                    },
                    {
                        key: "_job_payment_paid_cents",
                        label: "Total paid",
                        span: 1,
                        renderHint: "money",
                        editable: false
                    },
                    {
                        key: "_job_payment_balance_cents",
                        label: "Balance due",
                        span: 1,
                        renderHint: "money",
                        editable: false
                    },
                    {
                        key: "_job_payment_status_label",
                        label: "Payment state",
                        span: 1,
                        renderHint: "text",
                        editable: false
                    }
                ]
            }
        ]
    };
}
/** Registry: entity type -> full presentation config. */ const ENTITY_PRESENTATION_REGISTRY = {
    customers: {
        entityType: "customers",
        table: {
            columns: [
                {
                    key: "_status_display",
                    label: "Status",
                    sortable: true,
                    renderHint: "status",
                    locked: true
                },
                {
                    key: "customer_number",
                    label: "Cust #",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "name",
                    label: "Name",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "_primary_person_name",
                    label: "Person",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_primary_contact_name",
                    label: "Contact (compat)",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_customer_email",
                    label: "Email",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_customer_phone",
                    label: "Phone",
                    sortable: false,
                    renderHint: "phone"
                },
                {
                    key: "customer_type",
                    label: "Customer Type",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "_active_jobs_count",
                    label: "Active Jobs",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_open_opportunities_count",
                    label: "Open Opportunities",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_updated",
                    label: "Updated",
                    sortable: true,
                    renderHint: "datetime"
                }
            ],
            defaultSort: {
                key: "_updated",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "related",
                "activity",
                "payments",
                "documents"
            ],
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
                        {
                            key: "status_key",
                            label: "Status",
                            span: 1,
                            renderHint: "status",
                            editable: true,
                            locked: true
                        },
                        {
                            key: "name",
                            label: "Name",
                            span: 1,
                            renderHint: "text",
                            editable: true,
                            locked: true
                        },
                        {
                            key: "customer_type",
                            label: "Customer Type",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "_vertical_name",
                            label: "Vertical",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_primary_person_name",
                            label: "Primary Person",
                            span: 1,
                            renderHint: "link",
                            locked: true,
                            linkTarget: {
                                idField: "_primary_person_id",
                                entityType: "persons"
                            }
                        },
                        {
                            key: "_primary_contact_name",
                            label: "Contact (compatibility)",
                            span: 1,
                            renderHint: "link",
                            locked: true,
                            linkTarget: {
                                idField: "primary_contact_id",
                                entityType: "contacts"
                            }
                        },
                        {
                            key: "stripe_customer_id",
                            label: "Stripe Customer ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "external_source",
                            label: "External Source",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "external_id",
                            label: "External ID",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "person_snapshot",
                    title: "Person Snapshot",
                    defaultExpanded: true,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "_primary_person_name",
                            label: "Name",
                            span: 1,
                            renderHint: "link",
                            locked: true,
                            linkTarget: {
                                idField: "_primary_person_id",
                                entityType: "persons"
                            }
                        },
                        {
                            key: "_primary_person_email",
                            label: "Email",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_primary_person_phone",
                            label: "Phone",
                            span: 1,
                            renderHint: "phone",
                            locked: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "contact_snapshot",
                    title: "Contact Snapshot (Compatibility)",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "_primary_contact_name",
                            label: "Contact",
                            span: 1,
                            renderHint: "link",
                            locked: true,
                            linkTarget: {
                                idField: "primary_contact_id",
                                entityType: "contacts"
                            }
                        },
                        {
                            key: "_primary_contact_email",
                            label: "Contact email",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_primary_contact_phone",
                            label: "Contact phone",
                            span: 1,
                            renderHint: "phone",
                            locked: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "payment_profile",
                    title: "Payment Profile",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "payment_method_brand",
                            label: "Card Brand",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "payment_method_last4",
                            label: "Last 4",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "default_payment_method_id",
                            label: "Default Payment Method ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "setup_intent_id",
                            label: "Setup Intent ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "stripe_customer_id",
                            label: "Stripe Customer ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "record_info",
                    title: "Record Info",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "id",
                            label: "ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "created_at",
                            label: "Created",
                            span: 1,
                            renderHint: "datetime",
                            locked: true
                        },
                        {
                            key: "updated_at",
                            label: "Updated",
                            span: 1,
                            renderHint: "datetime",
                            locked: true
                        },
                        {
                            key: "org_id",
                            label: "Org ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "vertical_id",
                            label: "Vertical ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "debug_compatibility_metadata",
                    title: "Debug (compatibility metadata)",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "_metadata_email",
                            label: "Metadata email",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_metadata_phone",
                            label: "Metadata phone",
                            span: 1,
                            renderHint: "phone",
                            locked: true
                        },
                        {
                            key: "_metadata_source",
                            label: "Metadata source",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        }
                    ],
                    locked: true
                }
            ],
            relatedModules: [
                {
                    key: "contacts",
                    label: "Contacts",
                    entityType: "contacts",
                    filterKey: "customer_id",
                    locked: true
                },
                {
                    key: "locations",
                    label: "Locations",
                    entityType: "locations",
                    filterKey: "customer_id",
                    locked: true
                },
                {
                    key: "opportunities",
                    label: "Opportunities",
                    entityType: "opportunities",
                    filterKey: "customer_id",
                    locked: true
                },
                {
                    key: "jobs",
                    label: "Jobs",
                    entityType: "jobs",
                    filterKey: "customer_id",
                    locked: true
                },
                {
                    key: "payments",
                    label: "Payments",
                    entityType: "payments",
                    filterKey: "customer_id",
                    locked: true
                },
                {
                    key: "subscriptions",
                    label: "Subscriptions",
                    entityType: "subscriptions",
                    filterKey: "customer_id",
                    locked: true
                },
                {
                    key: "documents",
                    label: "Documents",
                    entityType: "documents",
                    filterKey: "customer_id",
                    locked: true
                }
            ]
        }
    },
    locations: {
        entityType: "locations",
        table: {
            columns: [
                {
                    key: "_status_display",
                    label: "Status",
                    sortable: true,
                    renderHint: "status",
                    locked: true
                },
                {
                    key: "location_number",
                    label: "Loc #",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "label",
                    label: "Name",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "location_type",
                    label: "Type",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "_customer_name",
                    label: "Customer",
                    sortable: false,
                    renderHint: "link"
                },
                {
                    key: "city",
                    label: "City",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "state",
                    label: "State",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "updated_at",
                    label: "Updated",
                    sortable: true,
                    renderHint: "datetime"
                }
            ],
            defaultSort: {
                key: "updated_at",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "related",
                "activity",
                "documents"
            ],
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
                        {
                            key: "status_key",
                            label: "Status",
                            span: 1,
                            renderHint: "status",
                            editable: true
                        },
                        {
                            key: "label",
                            label: "Name",
                            span: 1,
                            renderHint: "text",
                            editable: true,
                            locked: true
                        },
                        {
                            key: "location_type",
                            label: "Type",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "address1",
                            label: "Address",
                            span: 2,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "address2",
                            label: "Address 2",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "city",
                            label: "City",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "state",
                            label: "State",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "postal_code",
                            label: "Postal code",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "_access_method_label",
                            label: "Access method",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "access_code",
                            label: "Code",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "has_pets",
                            label: "Pets on site",
                            span: 1,
                            renderHint: "primary_yes_no",
                            editable: true
                        },
                        {
                            key: "_service_home_type_label",
                            label: "Home type",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_service_square_footage_display",
                            label: "Square footage",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_service_bedrooms",
                            label: "Bedrooms",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_service_bathrooms",
                            label: "Bathrooms",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "access_notes",
                            label: "Access notes",
                            span: 2,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "updated_at",
                            label: "Updated",
                            span: 1,
                            renderHint: "datetime"
                        }
                    ],
                    locked: true
                },
                {
                    key: "custom_property_fields",
                    title: "Property & custom fields",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [],
                    locked: true
                },
                {
                    key: "customer",
                    title: "Customer",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                },
                {
                    key: "relationships",
                    title: "Relationships",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                }
            ],
            relatedModules: [
                {
                    key: "customer",
                    label: "Customer",
                    entityType: "customers",
                    filterKey: "customer_id",
                    locked: true
                },
                {
                    key: "jobs",
                    label: "Jobs",
                    entityType: "jobs",
                    filterKey: "location_id",
                    locked: true
                },
                {
                    key: "schedules",
                    label: "Schedules",
                    entityType: "schedules",
                    filterKey: "location_id",
                    locked: true
                },
                {
                    key: "documents",
                    label: "Documents",
                    entityType: "documents",
                    filterKey: "location_id",
                    locked: true
                }
            ]
        }
    },
    opportunities: {
        entityType: "opportunities",
        table: {
            columns: [
                {
                    key: "_status_display",
                    label: "Status",
                    sortable: false,
                    renderHint: "status"
                },
                {
                    key: "opportunity_number",
                    label: "Opp #",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "name",
                    label: "Opportunity",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "_customer_name",
                    label: "Customer",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_quote_total_display",
                    label: "Quote Total",
                    sortable: false,
                    renderHint: "money"
                },
                {
                    key: "job_date",
                    label: "Job Date",
                    sortable: true,
                    renderHint: "date"
                },
                {
                    key: "source",
                    label: "Source",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_vertical_name",
                    label: "Vertical",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_updated",
                    label: "Updated",
                    sortable: true,
                    renderHint: "datetime",
                    locked: true
                }
            ],
            defaultSort: {
                key: "_updated",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "related",
                "activity",
                "documents"
            ],
            headerFields: [],
            layoutMode: 2,
            overviewSections: [
                {
                    key: "opportunity_details",
                    title: "Opportunity Details",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "status_key",
                            label: "Status",
                            span: 1,
                            renderHint: "status",
                            editable: true
                        },
                        {
                            key: "name",
                            label: "Name",
                            span: 1,
                            renderHint: "text",
                            editable: true,
                            locked: true
                        },
                        {
                            key: "source",
                            label: "Source",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "_vertical_name",
                            label: "Vertical",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "assigned_to",
                            label: "Assigned to",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "lost_reason",
                            label: "Lost reason",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "customer_booking",
                    title: "Customer & Booking",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "_customer_name",
                            label: "Customer",
                            span: 1,
                            renderHint: "link",
                            linkTarget: {
                                idField: "customer_id",
                                entityType: "customers"
                            },
                            locked: true
                        },
                        {
                            key: "_primary_person_name",
                            label: "Primary Person",
                            span: 1,
                            renderHint: "link",
                            linkTarget: {
                                idField: "primary_person_id",
                                entityType: "persons"
                            },
                            locked: true
                        },
                        {
                            key: "_primary_contact_name",
                            label: "Contact (compatibility)",
                            span: 1,
                            renderHint: "link",
                            linkTarget: {
                                idField: "primary_contact_id",
                                entityType: "contacts"
                            },
                            locked: true
                        },
                        {
                            key: "_location_name",
                            label: "Location",
                            span: 1,
                            renderHint: "link",
                            linkTarget: {
                                idField: "location_id",
                                entityType: "locations"
                            },
                            locked: true
                        },
                        {
                            key: "job_date",
                            label: "Job date",
                            span: 1,
                            renderHint: "date",
                            editable: true
                        },
                        {
                            key: "job_time_window",
                            label: "Job time window",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "appointment_id",
                            label: "Appointment ID",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "quote",
                    title: "Quote",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "quote_subtotal",
                            label: "Quote subtotal",
                            span: 1,
                            renderHint: "money",
                            editable: true
                        },
                        {
                            key: "discount_amount",
                            label: "Discount amount",
                            span: 1,
                            renderHint: "money",
                            editable: true
                        },
                        {
                            key: "quote_total",
                            label: "Quote total",
                            span: 1,
                            renderHint: "money",
                            editable: true
                        },
                        {
                            key: "recurring_price_cents",
                            label: "Recurring (cents)",
                            span: 1,
                            renderHint: "money",
                            locked: true
                        },
                        {
                            key: "estimated_price_cents",
                            label: "Estimated (cents)",
                            span: 1,
                            renderHint: "money",
                            locked: true
                        },
                        {
                            key: "monetary_value_cents",
                            label: "Monetary value (cents)",
                            span: 1,
                            renderHint: "money",
                            locked: true
                        },
                        {
                            key: "discount_code",
                            label: "Discount code",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "discount_validated_at",
                            label: "Discount validated at",
                            span: 1,
                            renderHint: "datetime",
                            locked: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "notes",
                    title: "Notes",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [
                        {
                            key: "customer_notes",
                            label: "Customer notes",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "record_info",
                    title: "Record Info",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "id",
                            label: "ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "created_at",
                            label: "Created",
                            span: 1,
                            renderHint: "datetime",
                            locked: true
                        },
                        {
                            key: "updated_at",
                            label: "Updated",
                            span: 1,
                            renderHint: "datetime",
                            locked: true
                        },
                        {
                            key: "org_id",
                            label: "Org ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "pipeline_id",
                            label: "Pipeline ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_vertical_name",
                            label: "Vertical",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "vertical_id",
                            label: "Vertical ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "external_source",
                            label: "External source",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "external_id",
                            label: "External ID",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                }
            ],
            relatedModules: []
        }
    },
    subscriptions: {
        entityType: "subscriptions",
        table: {
            columns: [
                {
                    key: "_status_display",
                    label: "Status",
                    sortable: true,
                    renderHint: "status",
                    locked: true
                },
                {
                    key: "_ref",
                    label: "Ref",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_customer_name",
                    label: "Customer",
                    sortable: false,
                    renderHint: "link"
                },
                {
                    key: "service_type",
                    label: "Service",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_scheduled_for",
                    label: "Next",
                    sortable: false,
                    renderHint: "datetime"
                },
                {
                    key: "_total_cents",
                    label: "Total",
                    sortable: false,
                    renderHint: "money"
                }
            ],
            defaultSort: {
                key: "created_at",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "related",
                "activity"
            ],
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
                        {
                            key: "status",
                            label: "Status",
                            span: 1,
                            renderHint: "status",
                            editable: true
                        },
                        {
                            key: "_ref",
                            label: "Ref",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "service_type",
                            label: "Service",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_frequency_label",
                            label: "Frequency",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_scheduled_for",
                            label: "Scheduled for",
                            span: 1,
                            renderHint: "datetime",
                            locked: true
                        },
                        {
                            key: "_total_cents",
                            label: "Total",
                            span: 1,
                            renderHint: "money",
                            locked: true
                        },
                        {
                            key: "start_date",
                            label: "Start date",
                            span: 1,
                            renderHint: "date",
                            locked: true
                        },
                        {
                            key: "created_at",
                            label: "Created",
                            span: 1,
                            renderHint: "datetime",
                            locked: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "customer",
                    title: "Customer",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                },
                {
                    key: "location",
                    title: "Location",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                },
                {
                    key: "pricing",
                    title: "Pricing",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [],
                    locked: true
                },
                {
                    key: "schedules",
                    title: "Schedules",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                },
                {
                    key: "vendor",
                    title: "Vendor",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                },
                {
                    key: "documents",
                    title: "Documents",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                }
            ],
            relatedModules: []
        }
    },
    jobs: {
        entityType: "jobs",
        table: {
            columns: [
                {
                    key: "_status_display",
                    label: "Status",
                    sortable: true,
                    renderHint: "status",
                    locked: true
                },
                {
                    key: "job_number",
                    label: "Job #",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "_job_label",
                    label: "Job",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "_customer_name",
                    label: "Customer",
                    sortable: true,
                    renderHint: "link",
                    locked: true
                },
                {
                    key: "_next_schedule",
                    label: "Next Visit",
                    sortable: false,
                    renderHint: "datetime"
                },
                {
                    key: "_vendor_name",
                    label: "Vendor",
                    sortable: false,
                    renderHint: "link"
                },
                {
                    key: "_work_unit_label",
                    label: "Work unit",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_price_display",
                    label: "Price",
                    sortable: false,
                    renderHint: "money"
                },
                {
                    key: "is_recurring",
                    label: "Recurring",
                    sortable: true,
                    renderHint: "primary_yes_no"
                },
                {
                    key: "_updated",
                    label: "Updated",
                    sortable: true,
                    renderHint: "datetime",
                    locked: true
                }
            ],
            defaultSort: {
                key: "_updated",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "rrs_overview",
                "related",
                "activity",
                "documents",
                "financials"
            ],
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
                        {
                            key: "status_key",
                            label: "Status",
                            span: 1,
                            renderHint: "status",
                            editable: true
                        },
                        {
                            key: "title",
                            label: "Title",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "service_key",
                            label: "Service",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "job_type",
                            label: "Job type",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "assigned_vendor_id",
                            label: "Assigned vendor",
                            span: 1,
                            renderHint: "link",
                            editable: true,
                            linkTarget: {
                                idField: "assigned_vendor_id",
                                entityType: "vendors"
                            }
                        },
                        {
                            key: "work_unit_id",
                            label: "Work unit",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "is_recurring",
                            label: "Recurring",
                            span: 1,
                            renderHint: "primary_yes_no",
                            editable: true
                        },
                        {
                            key: "service_frequency_key",
                            label: "Frequency",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "property_service",
                    title: "Property / service details",
                    defaultExpanded: true,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "_service_home_type_label",
                            label: "Home type",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_service_square_footage_display",
                            label: "Square footage",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_service_bedrooms",
                            label: "Bedrooms",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_service_bathrooms",
                            label: "Bathrooms",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "customer_location",
                    title: "Customer & Location",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "_customer_name",
                            label: "Customer",
                            span: 1,
                            renderHint: "link",
                            linkTarget: {
                                idField: "customer_id",
                                entityType: "customers"
                            }
                        },
                        {
                            key: "_primary_person_name",
                            label: "Primary Person",
                            span: 1,
                            renderHint: "link",
                            linkTarget: {
                                idField: "primary_person_id",
                                entityType: "persons"
                            }
                        },
                        {
                            key: "_location_name",
                            label: "Location",
                            span: 1,
                            renderHint: "link",
                            linkTarget: {
                                idField: "location_id",
                                entityType: "locations"
                            }
                        },
                        {
                            key: "_opportunity_name",
                            label: "Opportunity",
                            span: 1,
                            renderHint: "link",
                            linkTarget: {
                                idField: "opportunity_id",
                                entityType: "opportunities"
                            }
                        }
                    ],
                    locked: true
                },
                {
                    key: "scheduling",
                    title: "Scheduling",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "scheduled_at",
                            label: "Scheduled at",
                            span: 1,
                            renderHint: "datetime",
                            editable: true
                        },
                        {
                            key: "completed_at",
                            label: "Completed at",
                            span: 1,
                            renderHint: "datetime",
                            editable: true
                        },
                        {
                            key: "_next_schedule",
                            label: "Next schedule",
                            span: 1,
                            renderHint: "datetime"
                        }
                    ],
                    locked: true
                },
                getJobPricingBreakdownSection(),
                getJobOverviewBillingSummarySection(),
                {
                    key: "notes",
                    title: "Notes",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [
                        {
                            key: "internal_notes",
                            label: "Internal notes",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "description",
                            label: "Description",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "record_info",
                    title: "Record Info",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "id",
                            label: "ID",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "created_at",
                            label: "Created",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "updated_at",
                            label: "Updated",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "external_source",
                            label: "External source",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "external_id",
                            label: "External ID",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "org_id",
                            label: "Org",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "vertical_id",
                            label: "Vertical",
                            span: 1,
                            renderHint: "text"
                        }
                    ],
                    locked: true
                }
            ],
            relatedModules: [
                {
                    key: "schedules",
                    label: "Schedules",
                    entityType: "schedules",
                    filterKey: "job_id",
                    locked: true
                },
                {
                    key: "payments",
                    label: "Payments",
                    entityType: "payments",
                    filterKey: "job_id",
                    locked: true
                },
                {
                    key: "documents",
                    label: "Documents",
                    entityType: "documents",
                    filterKey: "job_id",
                    locked: true
                }
            ],
            quickActions: [
                {
                    key: "run_payment",
                    label: "Run payment",
                    variant: "primary",
                    inHeader: true,
                    locked: true
                },
                {
                    key: "assign_vendor",
                    label: "Assign vendor",
                    variant: "secondary",
                    inHeader: true,
                    locked: true
                },
                {
                    key: "mark_completed",
                    label: "Mark completed",
                    variant: "secondary",
                    inHeader: true,
                    locked: true
                },
                {
                    key: "reschedule",
                    label: "Reschedule",
                    variant: "secondary",
                    inHeader: false,
                    locked: true
                }
            ]
        }
    },
    schedules: {
        entityType: "schedules",
        table: {
            columns: [
                {
                    key: "_status_display",
                    label: "Status",
                    sortable: true,
                    renderHint: "status",
                    locked: true
                },
                {
                    key: "schedule_number",
                    label: "Sched #",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "start_at",
                    label: "Date",
                    sortable: true,
                    renderHint: "datetime"
                },
                {
                    key: "_customer_name",
                    label: "Account",
                    sortable: false,
                    renderHint: "link"
                },
                {
                    key: "_location_label",
                    label: "Location",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_job_title",
                    label: "Job",
                    sortable: false,
                    renderHint: "link"
                },
                {
                    key: "_assigned_vendor_name",
                    label: "Cleaner",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "updated_at",
                    label: "Updated",
                    sortable: true,
                    renderHint: "datetime"
                }
            ],
            defaultSort: {
                key: "start_at",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "related",
                "financials",
                "documents",
                "activity"
            ],
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
                        {
                            key: "status_key",
                            label: "Status",
                            span: 1,
                            renderHint: "status",
                            editable: true
                        },
                        {
                            key: "start_at",
                            label: "Start time",
                            span: 1,
                            renderHint: "datetime",
                            editable: true
                        },
                        {
                            key: "assigned_vendor_id",
                            label: "Assigned cleaner",
                            span: 1,
                            renderHint: "link",
                            editable: false,
                            linkTarget: {
                                idField: "assigned_vendor_id",
                                entityType: "vendors"
                            }
                        },
                        {
                            key: "end_at",
                            label: "End",
                            span: 1,
                            renderHint: "datetime",
                            editable: true
                        },
                        {
                            key: "timezone",
                            label: "Timezone",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "time_window",
                            label: "Time window",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "service_type",
                            label: "Service",
                            span: 1,
                            renderHint: "text",
                            editable: false
                        },
                        {
                            key: "price_cents",
                            label: "Price",
                            span: 1,
                            renderHint: "money",
                            editable: false
                        },
                        {
                            key: "_customer_name",
                            label: "Account",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "_contact_phone",
                            label: "Phone",
                            span: 1,
                            renderHint: "phone"
                        },
                        {
                            key: "_contact_email",
                            label: "Email",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "_location_label",
                            label: "Address",
                            span: 2,
                            renderHint: "text"
                        },
                        {
                            key: "updated_at",
                            label: "Updated",
                            span: 1,
                            renderHint: "datetime"
                        }
                    ],
                    locked: true
                },
                {
                    key: "property_service",
                    title: "Property / service details",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "_service_home_type_label",
                            label: "Home type",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_service_square_footage_display",
                            label: "Square footage",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_service_bedrooms",
                            label: "Bedrooms",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "_service_bathrooms",
                            label: "Bathrooms",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "job",
                    title: "Job",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                },
                {
                    key: "customer",
                    title: "Customer",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                },
                {
                    key: "location",
                    title: "Location",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                },
                {
                    key: "vendor",
                    title: "Vendor",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                },
                {
                    key: "reschedule_history",
                    title: "Reschedule / Cancel history",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                },
                {
                    key: "documents",
                    title: "Documents",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                }
            ],
            relatedModules: [],
            quickActions: [
                {
                    key: "run_payment",
                    label: "Run payment",
                    variant: "primary",
                    inHeader: true,
                    locked: true
                },
                {
                    key: "assign_vendor",
                    label: "Assign vendor",
                    variant: "secondary",
                    inHeader: true,
                    locked: true
                }
            ]
        }
    },
    payments: {
        entityType: "payments",
        table: {
            columns: [
                {
                    key: "status",
                    label: "Status",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "_payment_label",
                    label: "Payment",
                    sortable: false,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "_customer_name",
                    label: "Customer",
                    sortable: false,
                    renderHint: "link",
                    locked: true
                },
                {
                    key: "_job_label",
                    label: "Job",
                    sortable: false,
                    renderHint: "link"
                },
                {
                    key: "_amount_display",
                    label: "Amount",
                    sortable: true,
                    renderHint: "money",
                    locked: true
                },
                {
                    key: "processor",
                    label: "Processor",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "processor_transaction_id",
                    label: "Txn / ref",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "allocated_amount_cents",
                    label: "Allocated",
                    sortable: true,
                    renderHint: "money"
                },
                {
                    key: "unallocated_amount_cents",
                    label: "Unallocated",
                    sortable: true,
                    renderHint: "money"
                },
                {
                    key: "allocation_state",
                    label: "Alloc.",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "received_at",
                    label: "Received",
                    sortable: true,
                    renderHint: "datetime"
                },
                {
                    key: "posted_at",
                    label: "Posted",
                    sortable: true,
                    renderHint: "datetime"
                },
                {
                    key: "_updated",
                    label: "Updated",
                    sortable: true,
                    renderHint: "datetime",
                    locked: true
                }
            ],
            defaultSort: {
                key: "_updated",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "related",
                "activity",
                "ledger"
            ],
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
                        {
                            key: "status",
                            label: "Status (canonical)",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "status_key",
                            label: "Status key (config)",
                            span: 1,
                            renderHint: "status",
                            editable: true
                        },
                        {
                            key: "_payment_label",
                            label: "Payment label",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "amount_cents",
                            label: "Amount",
                            span: 1,
                            renderHint: "money"
                        },
                        {
                            key: "currency",
                            label: "Currency",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "processor",
                            label: "Processor",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "processor_transaction_id",
                            label: "Processor transaction id",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "provider_payment_id",
                            label: "Provider ref (legacy)",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "received_at",
                            label: "Received at",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "posted_at",
                            label: "Posted at",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "paid_at",
                            label: "Paid at (legacy)",
                            span: 1,
                            renderHint: "datetime",
                            editable: true
                        },
                        {
                            key: "posted_to_ledger_at",
                            label: "Posted to ledger",
                            span: 1,
                            renderHint: "datetime"
                        }
                    ],
                    locked: true
                },
                {
                    key: "payment_allocations",
                    title: "Allocations",
                    defaultExpanded: true,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                },
                {
                    key: "linked_records",
                    title: "Linked Records",
                    defaultExpanded: true,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "_customer_name",
                            label: "Customer",
                            span: 1,
                            renderHint: "link",
                            linkTarget: {
                                idField: "customer_id",
                                entityType: "customers"
                            }
                        },
                        {
                            key: "_job_label",
                            label: "Job",
                            span: 1,
                            renderHint: "link",
                            linkTarget: {
                                idField: "job_id",
                                entityType: "jobs"
                            }
                        }
                    ],
                    locked: true
                },
                {
                    key: "notes",
                    title: "Notes",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [
                        {
                            key: "notes",
                            label: "Notes",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "record_info",
                    title: "Record Info",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "id",
                            label: "ID",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "created_at",
                            label: "Created",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "updated_at",
                            label: "Updated",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "org_id",
                            label: "Org",
                            span: 1,
                            renderHint: "text"
                        }
                    ],
                    locked: true
                }
            ],
            relatedModules: []
        }
    },
    service_offerings: {
        entityType: "service_offerings",
        table: {
            columns: [
                {
                    key: "offering_name",
                    label: "Name",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "offering_key",
                    label: "Key",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "_vertical_name",
                    label: "Vertical",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_active_yes_no",
                    label: "Active",
                    sortable: true,
                    renderHint: "primary_yes_no"
                },
                {
                    key: "_updated",
                    label: "Updated",
                    sortable: true,
                    renderHint: "datetime"
                }
            ],
            defaultSort: {
                key: "_updated",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "related",
                "activity"
            ],
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
                        {
                            key: "offering_name",
                            label: "Name",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "offering_key",
                            label: "Key",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "_vertical_name",
                            label: "Vertical",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "is_active",
                            label: "Active",
                            span: 1,
                            renderHint: "primary_yes_no",
                            editable: true
                        },
                        {
                            key: "description",
                            label: "Description",
                            span: 2,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "record_info",
                    title: "Record Info",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "id",
                            label: "ID",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "created_at",
                            label: "Created",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "updated_at",
                            label: "Updated",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "org_id",
                            label: "Org",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "vertical_id",
                            label: "Vertical ID",
                            span: 1,
                            renderHint: "text"
                        }
                    ],
                    locked: true
                }
            ],
            relatedModules: []
        }
    },
    service_plan_templates: {
        entityType: "service_plan_templates",
        table: {
            columns: [
                {
                    key: "_status_display",
                    label: "Status",
                    sortable: true,
                    renderHint: "status",
                    locked: true
                },
                {
                    key: "plan_name",
                    label: "Name",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "plan_key",
                    label: "Key",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "_recurring_yes_no",
                    label: "Recurring",
                    sortable: true,
                    renderHint: "primary_yes_no"
                },
                {
                    key: "_recurrence_label",
                    label: "Recurrence",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_active_yes_no",
                    label: "Active",
                    sortable: true,
                    renderHint: "primary_yes_no"
                },
                {
                    key: "_updated",
                    label: "Updated",
                    sortable: true,
                    renderHint: "datetime"
                }
            ],
            defaultSort: {
                key: "_updated",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "related",
                "activity"
            ],
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
                        {
                            key: "status_key",
                            label: "Status",
                            span: 1,
                            renderHint: "status",
                            editable: true
                        },
                        {
                            key: "plan_name",
                            label: "Name",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "plan_key",
                            label: "Key",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "is_recurring",
                            label: "Recurring",
                            span: 1,
                            renderHint: "primary_yes_no",
                            editable: true
                        },
                        {
                            key: "recurrence_unit",
                            label: "Recurrence unit",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "recurrence_interval",
                            label: "Recurrence interval",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "is_active",
                            label: "Active",
                            span: 1,
                            renderHint: "primary_yes_no",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "record_info",
                    title: "Record Info",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "id",
                            label: "ID",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "created_at",
                            label: "Created",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "updated_at",
                            label: "Updated",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "org_id",
                            label: "Org",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "vertical_id",
                            label: "Vertical ID",
                            span: 1,
                            renderHint: "text"
                        }
                    ],
                    locked: true
                }
            ],
            relatedModules: []
        }
    },
    documents: {
        entityType: "documents",
        table: {
            columns: [
                {
                    key: "_status_display",
                    label: "Status",
                    sortable: true,
                    renderHint: "status",
                    locked: true
                },
                {
                    key: "name",
                    label: "Name",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "document_type",
                    label: "Type",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "_linked_record_type",
                    label: "Linked record",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_customer_name",
                    label: "Customer",
                    sortable: false,
                    renderHint: "link"
                },
                {
                    key: "uploaded_at",
                    label: "Uploaded",
                    sortable: true,
                    renderHint: "datetime"
                }
            ],
            defaultSort: {
                key: "uploaded_at",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "related",
                "activity"
            ],
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
                        {
                            key: "status_key",
                            label: "Status",
                            span: 1,
                            renderHint: "status",
                            editable: true
                        },
                        {
                            key: "name",
                            label: "Name",
                            span: 2,
                            renderHint: "text"
                        },
                        {
                            key: "document_type",
                            label: "Type",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "_uploaded_by",
                            label: "Uploaded by",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "uploaded_at",
                            label: "Uploaded at",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "_ai_extraction_status",
                            label: "AI extraction",
                            span: 1,
                            renderHint: "text"
                        }
                    ],
                    locked: true
                },
                {
                    key: "preview_metadata",
                    title: "Preview / Metadata",
                    defaultExpanded: true,
                    collapsible: true,
                    gridCols: 2,
                    fields: [],
                    locked: true
                },
                {
                    key: "linked_records",
                    title: "Linked records",
                    defaultExpanded: true,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                },
                {
                    key: "extracted_fields",
                    title: "Extracted fields",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [],
                    locked: true
                },
                {
                    key: "version_audit",
                    title: "Version / Audit",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                }
            ],
            relatedModules: []
        }
    },
    vendors: {
        entityType: "vendors",
        table: {
            columns: [
                {
                    key: "_status_display",
                    label: "Status",
                    sortable: true,
                    renderHint: "status",
                    locked: true
                },
                {
                    key: "vendor_number",
                    label: "Vendor #",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "company_name",
                    label: "Company",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "name",
                    label: "Name",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "_primary_person_name",
                    label: "Person",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_vendor_email",
                    label: "Email",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_vendor_phone",
                    label: "Phone",
                    sortable: false,
                    renderHint: "phone"
                },
                {
                    key: "payout_percent",
                    label: "Payout",
                    sortable: false,
                    renderHint: "custom"
                },
                {
                    key: "_jobs_count",
                    label: "Jobs",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "w9_received",
                    label: "W9",
                    sortable: false,
                    renderHint: "primary_yes_no"
                },
                {
                    key: "ach_verified",
                    label: "ACH",
                    sortable: false,
                    renderHint: "primary_yes_no"
                },
                {
                    key: "_updated",
                    label: "Updated",
                    sortable: true,
                    renderHint: "datetime",
                    locked: true
                }
            ],
            defaultSort: {
                key: "_updated",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "related",
                "financials",
                "activity",
                "documents"
            ],
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
                        {
                            key: "status_key",
                            label: "Status",
                            span: 1,
                            renderHint: "status",
                            editable: true
                        },
                        {
                            key: "name",
                            label: "Name",
                            span: 1,
                            renderHint: "text",
                            editable: true,
                            locked: true
                        },
                        {
                            key: "company_name",
                            label: "Company name",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "primary_person_id",
                            label: "Primary person",
                            span: 1,
                            renderHint: "link",
                            editable: true,
                            linkTarget: {
                                idField: "primary_person_id",
                                entityType: "persons"
                            }
                        },
                        {
                            key: "email",
                            label: "Email",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "phone",
                            label: "Phone",
                            span: 1,
                            renderHint: "phone",
                            editable: true
                        },
                        {
                            key: "external_source",
                            label: "External source",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "external_id",
                            label: "External ID",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "payout_capacity",
                    title: "Payout & Capacity",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "payout_percent",
                            label: "Payout %",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "payout_override_type",
                            label: "Payout override type",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "payout_override_value",
                            label: "Payout override value",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "max_daily_jobs",
                            label: "Max daily jobs",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "owns_supplies",
                            label: "Owns supplies",
                            span: 1,
                            renderHint: "primary_yes_no",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "compliance",
                    title: "Compliance",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "w9_received",
                            label: "W9 received",
                            span: 1,
                            renderHint: "primary_yes_no",
                            editable: true
                        },
                        {
                            key: "ach_verified",
                            label: "ACH verified",
                            span: 1,
                            renderHint: "primary_yes_no",
                            editable: true
                        },
                        {
                            key: "consent_contractor_agreement",
                            label: "Consent (contractor agreement)",
                            span: 1,
                            renderHint: "primary_yes_no",
                            editable: true
                        },
                        {
                            key: "consent_legal",
                            label: "Consent (legal)",
                            span: 1,
                            renderHint: "primary_yes_no",
                            editable: true
                        },
                        {
                            key: "consent_marketing",
                            label: "Consent (marketing)",
                            span: 1,
                            renderHint: "primary_yes_no",
                            editable: true
                        },
                        {
                            key: "submitted_at",
                            label: "Submitted at",
                            span: 1,
                            renderHint: "datetime",
                            locked: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "availability_service_area",
                    title: "Availability & Service Area",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "days_available",
                            label: "Days available",
                            span: 1,
                            renderHint: "custom",
                            editable: true
                        },
                        {
                            key: "operating_hours_open",
                            label: "Operating hours open",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "operating_hours_close",
                            label: "Operating hours close",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "service_area_zip_codes",
                            label: "Service area zip codes",
                            span: 1,
                            renderHint: "custom",
                            editable: true
                        },
                        {
                            key: "address_line1",
                            label: "Address",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "city",
                            label: "City",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "state",
                            label: "State",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "postal_code",
                            label: "Postal code",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "compliance_quick_links",
                    title: "Compliance (quick links)",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                },
                {
                    key: "record_info",
                    title: "Record Info",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "id",
                            label: "ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "created_at",
                            label: "Created",
                            span: 1,
                            renderHint: "datetime",
                            locked: true
                        },
                        {
                            key: "updated_at",
                            label: "Updated",
                            span: 1,
                            renderHint: "datetime",
                            locked: true
                        },
                        {
                            key: "org_id",
                            label: "Org ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        }
                    ],
                    locked: true
                }
            ],
            relatedModules: []
        }
    },
    contacts: {
        entityType: "contacts",
        table: {
            columns: [
                {
                    key: "_status_display",
                    label: "Status",
                    sortable: true,
                    renderHint: "status",
                    locked: true
                },
                {
                    key: "_name",
                    label: "Name",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "contact_type",
                    label: "Contact Type",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "_customer_name",
                    label: "Customer",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_is_primary_contact",
                    label: "Primary for (customer/vendor)",
                    sortable: false,
                    renderHint: "primary_yes_no"
                },
                {
                    key: "email",
                    label: "Email",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "phone",
                    label: "Phone",
                    sortable: true,
                    renderHint: "phone"
                },
                {
                    key: "_updated",
                    label: "Updated",
                    sortable: true,
                    renderHint: "datetime"
                }
            ],
            defaultSort: {
                key: "_updated",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "related",
                "activity",
                "documents"
            ],
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
                        {
                            key: "status_key",
                            label: "Status",
                            span: 1,
                            renderHint: "status",
                            editable: true
                        },
                        {
                            key: "first_name",
                            label: "First name",
                            span: 1,
                            renderHint: "text",
                            editable: true,
                            locked: true
                        },
                        {
                            key: "last_name",
                            label: "Last name",
                            span: 1,
                            renderHint: "text",
                            editable: true,
                            locked: true
                        },
                        {
                            key: "email",
                            label: "Email",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "phone",
                            label: "Phone",
                            span: 1,
                            renderHint: "phone",
                            editable: true
                        },
                        {
                            key: "contact_type",
                            label: "Contact Type",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "company_name",
                            label: "Company name",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "vendor_contact_role",
                            label: "Vendor contact role",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "association",
                    title: "Association",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "_linked_customer_name",
                            label: "Linked customer",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "_linked_vendor_name",
                            label: "Linked vendor",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "_primary_contact_for",
                            label: "Primary for",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "source",
                            label: "Source",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "external_source",
                            label: "External source",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "external_id",
                            label: "External ID",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "address",
                    title: "Address",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "address_line1",
                            label: "Address line 1",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "address_line2",
                            label: "Address line 2",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "city",
                            label: "City",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "state",
                            label: "State",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "postal_code",
                            label: "Postal code",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "country",
                            label: "Country",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "timezone",
                            label: "Timezone",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "notes",
                    title: "Notes",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [
                        {
                            key: "notes",
                            label: "Notes",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "record_info",
                    title: "Record Info",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "id",
                            label: "ID",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "created_at",
                            label: "Created",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "updated_at",
                            label: "Updated",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "archived_at",
                            label: "Archived at",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "archived_by",
                            label: "Archived by",
                            span: 1,
                            renderHint: "text"
                        }
                    ],
                    locked: true
                }
            ],
            relatedModules: [
                {
                    key: "customer",
                    label: "Customer",
                    entityType: "customers",
                    filterKey: "primary_contact_id",
                    locked: true
                },
                {
                    key: "vendor",
                    label: "Vendor",
                    entityType: "vendors",
                    filterKey: "primary_contact_id",
                    locked: true
                },
                {
                    key: "opportunities",
                    label: "Opportunities",
                    entityType: "opportunities",
                    filterKey: "primary_contact_id",
                    locked: true
                },
                {
                    key: "jobs",
                    label: "Jobs",
                    entityType: "jobs",
                    filterKey: "primary_contact_id",
                    locked: true
                },
                {
                    key: "schedules",
                    label: "Schedules",
                    entityType: "schedules",
                    filterKey: "primary_contact_id",
                    locked: true
                },
                {
                    key: "documents",
                    label: "Documents",
                    entityType: "documents",
                    filterKey: "owner_contact_id",
                    locked: true
                }
            ]
        }
    },
    customer_members: {
        entityType: "customer_members",
        table: {
            columns: [
                {
                    key: "_status_display",
                    label: "Status",
                    sortable: true,
                    renderHint: "status",
                    locked: true
                },
                {
                    key: "display_name",
                    label: "Name",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "_relationship_label",
                    label: "Relationship",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_customer_name",
                    label: "Customer",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "dob",
                    label: "DOB",
                    sortable: true,
                    renderHint: "date"
                },
                {
                    key: "_age",
                    label: "Age",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_linked_contacts_count",
                    label: "Linked Contacts",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_updated",
                    label: "Updated",
                    sortable: true,
                    renderHint: "datetime",
                    locked: true
                }
            ],
            defaultSort: {
                key: "_updated",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "related",
                "activity",
                "documents"
            ],
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
                        {
                            key: "status_key",
                            label: "Status",
                            span: 1,
                            renderHint: "status",
                            editable: true,
                            locked: true
                        },
                        {
                            key: "display_name",
                            label: "Display name",
                            span: 1,
                            renderHint: "text",
                            editable: true,
                            locked: true
                        },
                        {
                            key: "_relationship_label",
                            label: "Relationship",
                            span: 1,
                            renderHint: "text",
                            editable: false,
                            locked: true
                        },
                        {
                            key: "_customer_name",
                            label: "Customer",
                            span: 1,
                            renderHint: "link",
                            locked: true,
                            linkTarget: {
                                idField: "customer_id",
                                entityType: "customers"
                            }
                        },
                        {
                            key: "first_name",
                            label: "First name",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "last_name",
                            label: "Last name",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "dob",
                            label: "DOB",
                            span: 1,
                            renderHint: "date",
                            editable: true
                        },
                        {
                            key: "_age",
                            label: "Age",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "contact_roles",
                    title: "Contact Roles",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                },
                {
                    key: "external_source",
                    title: "External / Source",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "external_source",
                            label: "External source",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "external_id",
                            label: "External ID",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "record_info",
                    title: "Record Info",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "id",
                            label: "ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "created_at",
                            label: "Created",
                            span: 1,
                            renderHint: "datetime",
                            locked: true
                        },
                        {
                            key: "updated_at",
                            label: "Updated",
                            span: 1,
                            renderHint: "datetime",
                            locked: true
                        },
                        {
                            key: "org_id",
                            label: "Org ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "customer_id",
                            label: "Customer ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        }
                    ],
                    locked: true
                }
            ],
            relatedModules: []
        }
    },
    persons: {
        entityType: "persons",
        table: {
            columns: [
                {
                    key: "_status_display",
                    label: "Status",
                    sortable: true,
                    renderHint: "status",
                    locked: true
                },
                {
                    key: "person_number",
                    label: "Person #",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "_person_name",
                    label: "Name",
                    sortable: true,
                    renderHint: "text",
                    locked: true
                },
                {
                    key: "email",
                    label: "Email",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "phone",
                    label: "Phone",
                    sortable: true,
                    renderHint: "phone"
                },
                {
                    key: "_customer_count",
                    label: "Customers",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_updated",
                    label: "Updated",
                    sortable: true,
                    renderHint: "datetime",
                    locked: true
                }
            ],
            defaultSort: {
                key: "_updated",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "related",
                "documents"
            ],
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
                        {
                            key: "status_key",
                            label: "Status",
                            span: 1,
                            renderHint: "status",
                            editable: true,
                            locked: true
                        },
                        {
                            key: "first_name",
                            label: "First name",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "last_name",
                            label: "Last name",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "email",
                            label: "Email",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "phone",
                            label: "Phone",
                            span: 1,
                            renderHint: "phone",
                            locked: true
                        },
                        {
                            key: "created_at",
                            label: "Created",
                            span: 1,
                            renderHint: "datetime",
                            locked: true
                        },
                        {
                            key: "updated_at",
                            label: "Updated",
                            span: 1,
                            renderHint: "datetime",
                            locked: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "record_info",
                    title: "Record Info",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "id",
                            label: "ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        },
                        {
                            key: "org_id",
                            label: "Org ID",
                            span: 1,
                            renderHint: "text",
                            locked: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "relationships",
                    title: "Relationships",
                    defaultExpanded: true,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true
                }
            ],
            relatedModules: [
                {
                    key: "customer_persons",
                    label: "Customers",
                    entityType: "customers",
                    locked: true
                },
                {
                    key: "person_relationships",
                    label: "Relationships",
                    entityType: "persons",
                    locked: true
                }
            ]
        }
    },
    workflows: {
        entityType: "workflows",
        table: {
            columns: [],
            defaultSort: {
                key: "updated_at",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "activity"
            ],
            layoutMode: 1,
            overviewSections: [],
            relatedModules: []
        }
    },
    discount_redemptions: {
        entityType: "discount_redemptions",
        table: {
            columns: [
                {
                    key: "_code",
                    label: "Code",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "_customer_name",
                    label: "Customer",
                    sortable: false,
                    renderHint: "link"
                },
                {
                    key: "_contact_name",
                    label: "Contact",
                    sortable: false,
                    renderHint: "link"
                },
                {
                    key: "_opportunity_name",
                    label: "Opportunity",
                    sortable: false,
                    renderHint: "link"
                },
                {
                    key: "_job_label",
                    label: "Job",
                    sortable: false,
                    renderHint: "link"
                },
                {
                    key: "_subtotal_display",
                    label: "Subtotal",
                    sortable: true,
                    renderHint: "money"
                },
                {
                    key: "_discount_display",
                    label: "Discount",
                    sortable: true,
                    renderHint: "money"
                },
                {
                    key: "_total_display",
                    label: "Total",
                    sortable: true,
                    renderHint: "money"
                },
                {
                    key: "created_at",
                    label: "Created",
                    sortable: true,
                    renderHint: "datetime"
                }
            ],
            defaultSort: {
                key: "created_at",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "related",
                "activity"
            ],
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
                        {
                            key: "_code",
                            label: "Discount code",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "_discount_type",
                            label: "Discount type",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "_discount_value",
                            label: "Discount value",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "created_at",
                            label: "Created",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "booking_attempt_id",
                            label: "Booking attempt",
                            span: 1,
                            renderHint: "text"
                        }
                    ],
                    locked: true
                },
                {
                    key: "linked_records",
                    title: "Linked Records",
                    defaultExpanded: true,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "_customer_name",
                            label: "Customer",
                            span: 1,
                            renderHint: "link",
                            linkTarget: {
                                idField: "customer_id",
                                entityType: "customers"
                            }
                        },
                        {
                            key: "_contact_name",
                            label: "Contact",
                            span: 1,
                            renderHint: "link",
                            linkTarget: {
                                idField: "contact_id",
                                entityType: "contacts"
                            }
                        },
                        {
                            key: "_opportunity_name",
                            label: "Opportunity",
                            span: 1,
                            renderHint: "link",
                            linkTarget: {
                                idField: "opportunity_id",
                                entityType: "opportunities"
                            }
                        },
                        {
                            key: "_job_label",
                            label: "Job",
                            span: 1,
                            renderHint: "link",
                            linkTarget: {
                                idField: "job_id",
                                entityType: "jobs"
                            }
                        }
                    ],
                    locked: true
                },
                {
                    key: "quote_impact",
                    title: "Quote Impact",
                    defaultExpanded: true,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "quote_subtotal",
                            label: "Subtotal",
                            span: 1,
                            renderHint: "money"
                        },
                        {
                            key: "discount_amount",
                            label: "Discount",
                            span: 1,
                            renderHint: "money"
                        },
                        {
                            key: "quote_total",
                            label: "Total",
                            span: 1,
                            renderHint: "money"
                        }
                    ],
                    locked: true
                },
                {
                    key: "record_info",
                    title: "Record Info",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "id",
                            label: "ID",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "discount_code_id",
                            label: "Discount code ID",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "created_at",
                            label: "Created",
                            span: 1,
                            renderHint: "datetime"
                        }
                    ],
                    locked: true
                }
            ],
            relatedModules: []
        }
    },
    addons: {
        entityType: "addons",
        table: {
            columns: [
                {
                    key: "addon_name",
                    label: "Add-on",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "addon_key",
                    label: "Key",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "_vertical_name",
                    label: "Vertical",
                    sortable: false,
                    renderHint: "text"
                },
                {
                    key: "amount_cents",
                    label: "Amount",
                    sortable: true,
                    renderHint: "money"
                },
                {
                    key: "sort_order",
                    label: "Sort Order",
                    sortable: true,
                    renderHint: "text"
                },
                {
                    key: "_active_yes_no",
                    label: "Active",
                    sortable: false,
                    renderHint: "primary_yes_no"
                },
                {
                    key: "_updated",
                    label: "Updated",
                    sortable: true,
                    renderHint: "datetime"
                }
            ],
            defaultSort: {
                key: "_updated",
                direction: "desc"
            }
        },
        drawer: {
            tabs: [
                "overview",
                "activity"
            ],
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
                        {
                            key: "addon_name",
                            label: "Add-on",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "addon_key",
                            label: "Key",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "_vertical_name",
                            label: "Vertical",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "amount_cents",
                            label: "Amount",
                            span: 1,
                            renderHint: "money",
                            editable: true
                        },
                        {
                            key: "sort_order",
                            label: "Sort Order",
                            span: 1,
                            renderHint: "text",
                            editable: true
                        },
                        {
                            key: "is_active",
                            label: "Active",
                            span: 1,
                            renderHint: "primary_yes_no",
                            editable: true
                        }
                    ],
                    locked: true
                },
                {
                    key: "record_info",
                    title: "Record Info",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 2,
                    fields: [
                        {
                            key: "id",
                            label: "ID",
                            span: 1,
                            renderHint: "text"
                        },
                        {
                            key: "created_at",
                            label: "Created",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "updated_at",
                            label: "Updated",
                            span: 1,
                            renderHint: "datetime"
                        },
                        {
                            key: "vertical_id",
                            label: "Vertical ID",
                            span: 1,
                            renderHint: "text"
                        }
                    ],
                    locked: true
                }
            ],
            relatedModules: []
        }
    }
};
function getEntityPresentation(entityType) {
    const config = ENTITY_PRESENTATION_REGISTRY[entityType];
    if (!config) {
        return {
            entityType,
            table: {
                columns: [],
                defaultSort: {
                    key: "updated_at",
                    direction: "desc"
                }
            },
            drawer: {
                tabs: [
                    "overview",
                    "activity"
                ],
                layoutMode: 1,
                overviewSections: [],
                relatedModules: []
            }
        };
    }
    return config;
}
function getEntityTypesWithTableConfig() {
    return Object.keys(ENTITY_PRESENTATION_REGISTRY).filter((t)=>ENTITY_PRESENTATION_REGISTRY[t].table.columns.length > 0);
}
function toPresentationType(drawerType) {
    if (drawerType in ENTITY_PRESENTATION_REGISTRY) return drawerType;
    return null;
}
}),
"[project]/lib/admin/overviewRelationshipLabels.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** UUID v4 pattern — used to avoid showing raw ids in overview when a label exists on the record. */ __turbopack_context__.s([
    "isUuidLike",
    ()=>isUuidLike,
    "resolveOverviewRelationshipLabel",
    ()=>resolveOverviewRelationshipLabel
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuidLike(value) {
    return typeof value === "string" && UUID_RE.test(value.trim());
}
function resolveOverviewRelationshipLabel(record, fieldKey, opts) {
    const tryKeys = [
        fieldKey,
        opts?.linkIdField
    ].filter((k)=>typeof k === "string" && k.length > 0);
    const seen = new Set();
    for (const k of tryKeys){
        if (seen.has(k)) continue;
        seen.add(k);
        const label = labelForRelationshipKey(record, k);
        if (label) return label;
    }
    return null;
}
function nonEmpty(s) {
    if (s == null) return null;
    const t = String(s).trim();
    return t.length > 0 ? t : null;
}
/** Prefer Batch-2 `_relationship_displays` keyed by FK column (e.g. `customer_id`). */ function labelFromRelationshipDisplays(record, fkColumn) {
    const raw = record._relationship_displays;
    if (!raw || typeof raw !== "object") return null;
    const entry = raw[fkColumn];
    if (!entry || typeof entry !== "object") return null;
    const label = nonEmpty(entry.label);
    if (label) return label;
    const rn = entry.record_number;
    if (rn != null && rn !== "") {
        const n = typeof rn === "number" ? rn : Number(rn);
        if (Number.isFinite(n)) return `#${n}`;
    }
    return null;
}
function labelForRelationshipKey(record, k) {
    const fromApi = labelFromRelationshipDisplays(record, k);
    if (fromApi) return fromApi;
    switch(k){
        case "job_id":
            return nonEmpty(record._job_title ?? record._job_label);
        case "location_id":
            return nonEmpty(record._location_label ?? record._location_name);
        case "customer_id":
            return nonEmpty(record._customer_name);
        case "_customer_name":
            return nonEmpty(record._customer_name);
        case "_location_name":
            return nonEmpty(record._location_name ?? record._location_label);
        case "_opportunity_name":
            return nonEmpty(record._opportunity_name);
        case "_primary_person_name":
            return nonEmpty(record._primary_person_name);
        case "primary_contact_id":
            return nonEmpty(record._primary_contact_name ?? record._contact_name);
        case "contact_id":
            return nonEmpty(record._primary_contact_name ?? record._contact_name);
        case "primary_person_id":
            return nonEmpty(record._primary_person_name);
        case "person_id":
            return nonEmpty(record._person_name ?? record._primary_person_name);
        case "opportunity_id":
            return nonEmpty(record._opportunity_name);
        case "assigned_vendor_id":
            return nonEmpty(record._assigned_vendor_name ?? record._vendor_name);
        case "vendor_id":
            return nonEmpty(record._linked_vendor_name ?? record._vendor_name ?? record._assigned_vendor_name);
        case "customer_subscription_id":
            return nonEmpty(record._customer_subscription_label);
        case "vertical_id":
            return nonEmpty(record._vertical_name);
        case "pipeline_stage_id":
            return nonEmpty(record._pipeline_stage_name ?? record._stage_name);
        case "pipeline_id":
            return nonEmpty(record._pipeline_name);
        case "discount_program_id":
            return nonEmpty(record._discount_program_label);
        case "discount_code_id":
            return nonEmpty(record.discount_code ?? record._discount_label);
        default:
            return null;
    }
}
}),
"[project]/lib/admin/scheduleOverviewLabels.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Schedule drawer Overview: explicit mapping for FK columns → hydrated labels from GET /api/admin/entity/schedules/:id.
 * Do not rely on generic UUID heuristics for these keys.
 */ __turbopack_context__.s([
    "SCHEDULE_OVERVIEW_RELATIONSHIP_FIELD_KEYS",
    ()=>SCHEDULE_OVERVIEW_RELATIONSHIP_FIELD_KEYS,
    "scheduleOverviewRelationshipReadLabel",
    ()=>scheduleOverviewRelationshipReadLabel
]);
const SCHEDULE_OVERVIEW_RELATIONSHIP_FIELD_KEYS = [
    "job_id",
    "location_id",
    "assigned_vendor_id",
    "customer_subscription_id"
];
const SCHEDULE_REL_KEY_SET = new Set(SCHEDULE_OVERVIEW_RELATIONSHIP_FIELD_KEYS);
function trimNonEmpty(s) {
    if (s == null) return null;
    const t = String(s).trim();
    return t.length > 0 ? t : null;
}
function hasNonEmptyFk(record, fkKey) {
    const v = record[fkKey];
    if (v == null) return false;
    return String(v).trim() !== "";
}
function scheduleOverviewRelationshipReadLabel(record, fieldKey) {
    const k = fieldKey.trim();
    if (!SCHEDULE_REL_KEY_SET.has(k)) {
        return undefined;
    }
    switch(k){
        case "job_id":
            if (!hasNonEmptyFk(record, "job_id")) return undefined;
            return trimNonEmpty(record._job_title) ?? "";
        case "location_id":
            if (!hasNonEmptyFk(record, "location_id") && !hasNonEmptyFk(record, "_location_id")) return undefined;
            return trimNonEmpty(record._location_label ?? record._location_name) ?? "";
        case "assigned_vendor_id":
            if (!hasNonEmptyFk(record, "assigned_vendor_id")) return "Unassigned";
            return trimNonEmpty(record._assigned_vendor_name ?? record._vendor_name) ?? "—";
        case "customer_subscription_id":
            if (!hasNonEmptyFk(record, "customer_subscription_id")) return undefined;
            return trimNonEmpty(record._customer_subscription_label) ?? "";
        default:
            return undefined;
    }
}
}),
"[project]/lib/admin/scheduleCanceledStatus.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** True when a schedule workflow key represents a canceled visit (UI must not PATCH this; use POST …/cancel). */ __turbopack_context__.s([
    "isScheduleCanceledStatusKey",
    ()=>isScheduleCanceledStatusKey
]);
function isScheduleCanceledStatusKey(statusKey) {
    const k = String(statusKey ?? "").trim().toLowerCase();
    return k === "canceled" || k === "cancelled";
}
}),
"[project]/lib/admin/scheduleOverviewRows.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SCHEDULE_OVERVIEW_ROW_TOKEN_TO_FIELD_KEY",
    ()=>SCHEDULE_OVERVIEW_ROW_TOKEN_TO_FIELD_KEY,
    "collectScheduleRowResolvedKeys",
    ()=>collectScheduleRowResolvedKeys,
    "flattenOverviewFieldIndex",
    ()=>flattenOverviewFieldIndex,
    "resolveScheduleOverviewRowFieldKey",
    ()=>resolveScheduleOverviewRowFieldKey,
    "scheduleOverviewRowTokenLabel",
    ()=>scheduleOverviewRowTokenLabel,
    "scheduleSectionsAfterRowExtraction",
    ()=>scheduleSectionsAfterRowExtraction
]);
const SCHEDULE_OVERVIEW_ROW_TOKEN_TO_FIELD_KEY = {
    start_at: "start_at",
    end_at: "end_at",
    assigned_vendor: "assigned_vendor_id",
    status: "status_key",
    customer_name: "_customer_name",
    /** Alias for config / AI — same as customer_name */ account_name: "_customer_name",
    phone: "_contact_phone",
    email: "_contact_email",
    address: "_location_label",
    service: "service_type",
    price: "price_cents"
};
/** Human-readable labels for layout tokens (config-driven; stable for owners + future tooling). */ const SCHEDULE_ROW_TOKEN_LABELS = {
    start_at: "Start time",
    end_at: "End",
    assigned_vendor: "Assigned vendor",
    status: "Status",
    customer_name: "Account",
    account_name: "Account",
    phone: "Phone",
    email: "Email",
    address: "Address",
    service: "Service",
    price: "Price"
};
function resolveScheduleOverviewRowFieldKey(token) {
    const t = token.trim();
    return SCHEDULE_OVERVIEW_ROW_TOKEN_TO_FIELD_KEY[t] ?? t;
}
function scheduleOverviewRowTokenLabel(token) {
    const t = token.trim();
    if (SCHEDULE_ROW_TOKEN_LABELS[t]) return SCHEDULE_ROW_TOKEN_LABELS[t];
    const k = resolveScheduleOverviewRowFieldKey(token);
    if (k !== t) return k.replace(/^_/g, "").replace(/_/g, " ");
    return t.split("_").map((w)=>w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
function flattenOverviewFieldIndex(sections) {
    const m = new Map();
    for (const s of sections){
        for (const f of s.fields ?? [])m.set(f.key, f);
        for (const sub of s.subsections ?? []){
            for (const f of sub.fields ?? [])m.set(f.key, f);
        }
    }
    return m;
}
function collectScheduleRowResolvedKeys(rows) {
    const keys = new Set();
    for (const row of rows){
        for (const tok of row){
            keys.add(resolveScheduleOverviewRowFieldKey(tok));
        }
    }
    return keys;
}
function scheduleSectionsAfterRowExtraction(sections, rowKeys, customSectionContent) {
    const out = [];
    for (const s of sections){
        if (s.key === "__unified_status" && rowKeys.has("status_key")) {
            continue;
        }
        const fields = (s.fields ?? []).filter((f)=>!rowKeys.has(f.key));
        const subsections = s.subsections?.map((sub)=>({
                ...sub,
                fields: (sub.fields ?? []).filter((f)=>!rowKeys.has(f.key))
            })).filter((sub)=>(sub.fields?.length ?? 0) > 0);
        const next = {
            ...s,
            fields,
            subsections
        };
        const hasTop = (next.fields?.length ?? 0) > 0;
        const hasSubs = (next.subsections?.length ?? 0) > 0;
        const hasCustom = customSectionContent[next.key] != null;
        if (hasTop || hasSubs || hasCustom) out.push(next);
    }
    return out;
}
}),
"[project]/lib/admin/scheduleFieldPresentation.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Visual hierarchy for schedule overview snapshot cells (config keys → tier).
 * Does not alter record_layouts or snapshot payloads — presentation only.
 */ __turbopack_context__.s([
    "getScheduleOverviewFieldTier",
    ()=>getScheduleOverviewFieldTier
]);
const PRIMARY_KEYS = new Set([
    "start_at",
    "_customer_name",
    "assigned_vendor_id"
]);
const SECONDARY_KEYS = new Set([
    "status_key",
    "_contact_phone",
    "_contact_email",
    "_location_label",
    "end_at"
]);
const SUPPORTING_KEYS = new Set([
    "service_type",
    "price_cents"
]);
function getScheduleOverviewFieldTier(fieldKey) {
    const k = fieldKey.trim();
    if (PRIMARY_KEYS.has(k)) return "primary";
    if (SECONDARY_KEYS.has(k)) return "secondary";
    if (SUPPORTING_KEYS.has(k)) return "supporting";
    return "secondary";
}
}),
"[project]/lib/admin/scheduleRecordSnapshot.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Schedule “snapshot” — single composed view of operational schedule data for admin UI.
 * Lives under record_layouts / overview_rows: layout stays config-driven; values come from here.
 */ __turbopack_context__.s([
    "computeScheduleHydratedDisplay",
    ()=>computeScheduleHydratedDisplay,
    "computeScheduleSnapshot",
    ()=>computeScheduleSnapshot,
    "computeScheduleSnapshotFromHydratedRecord",
    ()=>computeScheduleSnapshotFromHydratedRecord,
    "getContactEmailRaw",
    ()=>getContactEmailRaw,
    "getScheduleSnapshot",
    ()=>getScheduleSnapshot,
    "resolveScheduleCustomerDisplayName",
    ()=>resolveScheduleCustomerDisplayName,
    "resolveSchedulePriceCents",
    ()=>resolveSchedulePriceCents,
    "resolveScheduleServiceDisplay",
    ()=>resolveScheduleServiceDisplay,
    "scheduleOverviewValueFromSnapshot",
    ()=>scheduleOverviewValueFromSnapshot,
    "shouldHideContactEmailDuplicate",
    ()=>shouldHideContactEmailDuplicate,
    "shouldShowScheduleContactEmailRow",
    ()=>shouldShowScheduleContactEmailRow
]);
function trimStr(v) {
    if (v == null) return "";
    return String(v).trim();
}
function resolveCustomerNameLine(input) {
    const fromCust = trimStr(input.customer?.name);
    if (fromCust) return fromCust;
    const pn = trimStr(input.primaryPersonName);
    if (pn) return pn;
    const pc = trimStr(input.primaryContactDisplayName);
    if (pc) return pc;
    const ct = input.contact;
    if (ct) {
        const nm = [
            trimStr(ct.first_name),
            trimStr(ct.last_name)
        ].filter(Boolean).join(" ").trim();
        if (nm) return nm;
        const em = trimStr(ct.email);
        if (em) return em;
    }
    return "";
}
function resolveLocationAddress(input) {
    const top = trimStr(input.location?.preferredLabel);
    if (top) return top;
    const loc = input.location;
    if (!loc) return null;
    const line = [
        loc.address1,
        loc.city,
        loc.state,
        loc.postal_code
    ].map(trimStr).filter(Boolean).join(", ");
    return line || null;
}
function resolveServiceLabel(schedule, job) {
    const direct = trimStr(schedule.service_type);
    if (direct) return direct.replace(/_/g, " ");
    const j = job;
    if (!j) return null;
    const sk = trimStr(j.service_key ?? j.job_type);
    if (sk) return sk.replace(/_/g, " ");
    return null;
}
function resolvePriceCents(schedule, job) {
    const raw = schedule.price_cents;
    if (raw != null && raw !== "") {
        const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
        if (Number.isFinite(n)) return n;
    }
    if (!job) return null;
    const jn = (typeof job.display_total_cents === "number" ? job.display_total_cents : null) ?? (typeof job.gross_price_cents === "number" ? job.gross_price_cents : null) ?? (typeof job.estimated_total_cents === "number" ? job.estimated_total_cents : null);
    if (jn != null && Number.isFinite(Number(jn))) return Number(jn);
    return null;
}
function computeScheduleSnapshot(input) {
    const nameLine = resolveCustomerNameLine(input);
    const emailRaw = trimStr(input.contact?.email) || null;
    const phoneRaw = trimStr(input.contact?.phone) || null;
    const emailSuppressedAsDuplicate = Boolean(emailRaw && nameLine && emailRaw.toLowerCase() === nameLine.toLowerCase());
    const sched = input.schedule;
    const job = input.job;
    return {
        customer: {
            name: nameLine,
            email: emailRaw,
            phone: phoneRaw,
            emailSuppressedAsDuplicate
        },
        vendor: {
            name: trimStr(input.vendor?.name) || null
        },
        location: {
            address: resolveLocationAddress(input)
        },
        service: {
            label: resolveServiceLabel(sched, job),
            price: resolvePriceCents(sched, job)
        },
        timing: {
            start_at: sched.start_at != null && String(sched.start_at).trim() !== "" ? String(sched.start_at) : null,
            end_at: sched.end_at != null && String(sched.end_at).trim() !== "" ? String(sched.end_at) : null,
            timezone: sched.timezone != null && String(sched.timezone).trim() !== "" ? String(sched.timezone) : null
        }
    };
}
function computeScheduleSnapshotFromHydratedRecord(record) {
    const job = record._job ?? null;
    const customer = record._customer ?? null;
    const locRow = record._location;
    const location = locRow ? {
        preferredLabel: record._location_label ?? record._location_name,
        address1: locRow.address1,
        city: locRow.city,
        state: locRow.state,
        postal_code: locRow.postal_code
    } : {
        preferredLabel: record._location_label ?? record._location_name,
        address1: null,
        city: null,
        state: null,
        postal_code: null
    };
    const vStub = record._vendor;
    const jvStub = record._job_assigned_vendor;
    const vendorName = trimStr(record._assigned_vendor_name) || trimStr(vStub?.name) || trimStr(jvStub?.name) || null;
    return computeScheduleSnapshot({
        schedule: {
            start_at: record.start_at,
            end_at: record.end_at,
            timezone: record.timezone,
            service_type: record.service_type,
            price_cents: record.price_cents
        },
        job,
        customer,
        location,
        vendor: vendorName ? {
            name: vendorName
        } : null,
        contact: record._contact ?? null,
        primaryPersonName: trimStr(record._primary_person_name) || null,
        primaryContactDisplayName: trimStr(record._primary_contact_name ?? record._contact_name) || null
    });
}
function shouldShowScheduleContactEmailRow(record) {
    const s = getScheduleSnapshot(record);
    if (s.customer.emailSuppressedAsDuplicate) return false;
    const em = trimStr(s.customer.email);
    return em.length > 0;
}
function getScheduleSnapshot(record) {
    const existing = record._schedule_snapshot;
    if (existing && typeof existing === "object" && existing.customer && existing.service) {
        return existing;
    }
    return computeScheduleSnapshotFromHydratedRecord(record);
}
function scheduleOverviewValueFromSnapshot(snap, fieldKey) {
    const k = fieldKey.trim();
    switch(k){
        case "_customer_name":
            return snap.customer.name || undefined;
        case "_contact_email":
            return snap.customer.emailSuppressedAsDuplicate ? "—" : snap.customer.email ?? undefined;
        case "_contact_phone":
            return snap.customer.phone ?? undefined;
        case "service_type":
            return snap.service.label ?? undefined;
        case "price_cents":
            return snap.service.price === null ? undefined : snap.service.price;
        case "_location_label":
            return snap.location.address ?? undefined;
        case "start_at":
            return snap.timing.start_at ?? undefined;
        case "end_at":
            return snap.timing.end_at ?? undefined;
        default:
            return undefined;
    }
}
function computeScheduleHydratedDisplay(out) {
    const snap = computeScheduleSnapshotFromHydratedRecord(out);
    out._schedule_snapshot = snap;
    if (snap.customer.name) {
        out._customer_name = snap.customer.name;
    }
    out._contact_email_duplicate_of_customer = snap.customer.emailSuppressedAsDuplicate;
}
function resolveScheduleCustomerDisplayName(record) {
    return getScheduleSnapshot(record).customer.name;
}
function getContactEmailRaw(record) {
    return getScheduleSnapshot(record).customer.email ?? "";
}
function shouldHideContactEmailDuplicate(record, customerDisplay) {
    const em = getContactEmailRaw(record);
    if (!em || !customerDisplay.trim()) return false;
    return em.toLowerCase() === customerDisplay.trim().toLowerCase();
}
function resolveScheduleServiceDisplay(record) {
    return getScheduleSnapshot(record).service.label ?? "";
}
function resolveSchedulePriceCents(record) {
    return getScheduleSnapshot(record).service.price;
}
}),
"[project]/lib/recordChrome/scheduleLayoutConfig.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Schedule record `config_json.layout_blocks` — structured presentation (v2+).
 * Field entries use the same tokens as `overview_rows` (see `scheduleOverviewRows.ts`).
 */ __turbopack_context__.s([
    "collectResolvedKeysFromScheduleLayoutBlocks",
    ()=>collectResolvedKeysFromScheduleLayoutBlocks,
    "getSectionOrderFromScheduleLayoutBlocks",
    ()=>getSectionOrderFromScheduleLayoutBlocks,
    "isScheduleLayoutV2",
    ()=>isScheduleLayoutV2
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewRows$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/scheduleOverviewRows.ts [app-ssr] (ecmascript)");
;
function isScheduleLayoutV2(config) {
    return config?.version === 2 && Array.isArray(config.layout_blocks) && config.layout_blocks.length > 0;
}
function getSectionOrderFromScheduleLayoutBlocks(blocks) {
    if (!blocks?.length) return null;
    for (const b of blocks){
        if (b.type === "section_group" && b.sections?.length) return [
            ...b.sections
        ];
    }
    return null;
}
function collectResolvedKeysFromScheduleLayoutBlocks(blocks) {
    const keys = new Set();
    for (const b of blocks){
        if (b.type === "snapshot") {
            for (const g of b.groups){
                for (const tok of g.fields){
                    keys.add((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewRows$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveScheduleOverviewRowFieldKey"])(tok));
                }
            }
        } else if (b.type === "secondary_summary") {
            for (const tok of b.fields){
                keys.add((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$scheduleOverviewRows$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveScheduleOverviewRowFieldKey"])(tok));
            }
        }
    }
    return keys;
}
}),
"[project]/lib/admin/opportunityOverviewLabels.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Opportunity drawer Overview: explicit FK → hydrated labels from GET /api/admin/entity/opportunities/:id.
 * Do not rely on generic UUID heuristics for these keys.
 */ __turbopack_context__.s([
    "OPPORTUNITY_OVERVIEW_RELATIONSHIP_FIELD_KEYS",
    ()=>OPPORTUNITY_OVERVIEW_RELATIONSHIP_FIELD_KEYS,
    "opportunityOverviewRelationshipReadLabel",
    ()=>opportunityOverviewRelationshipReadLabel,
    "opportunityOverviewStatusBadgeLabel",
    ()=>opportunityOverviewStatusBadgeLabel
]);
const OPPORTUNITY_OVERVIEW_RELATIONSHIP_FIELD_KEYS = [
    "customer_id",
    "primary_person_id",
    "primary_contact_id",
    "contact_id",
    "location_id",
    "vertical_id",
    "pipeline_stage_id"
];
const OPP_REL_KEY_SET = new Set(OPPORTUNITY_OVERVIEW_RELATIONSHIP_FIELD_KEYS);
function trimNonEmpty(s) {
    if (s == null) return null;
    const t = String(s).trim();
    return t.length > 0 ? t : null;
}
function hasNonEmptyFk(record, fkKey) {
    const v = record[fkKey];
    if (v == null) return false;
    return String(v).trim() !== "";
}
function opportunityOverviewRelationshipReadLabel(record, fieldKey) {
    const k = fieldKey.trim();
    if (!OPP_REL_KEY_SET.has(k)) {
        return undefined;
    }
    switch(k){
        case "customer_id":
            if (!hasNonEmptyFk(record, "customer_id")) return undefined;
            return trimNonEmpty(record._customer_name) ?? "";
        case "primary_person_id":
            if (!hasNonEmptyFk(record, "primary_person_id")) return undefined;
            return trimNonEmpty(record._primary_person_name) ?? "";
        case "primary_contact_id":
            if (!hasNonEmptyFk(record, "primary_contact_id")) return undefined;
            return trimNonEmpty(record._primary_contact_name ?? record._contact_name) ?? "";
        case "contact_id":
            if (!hasNonEmptyFk(record, "contact_id") && !hasNonEmptyFk(record, "primary_contact_id")) return undefined;
            return trimNonEmpty(record._primary_contact_name ?? record._contact_name) ?? "";
        case "location_id":
            if (!hasNonEmptyFk(record, "location_id") && !hasNonEmptyFk(record, "_location_id")) return undefined;
            return trimNonEmpty(record._location_label ?? record._location_name) ?? "";
        case "vertical_id":
            if (!hasNonEmptyFk(record, "vertical_id")) return undefined;
            return trimNonEmpty(record._vertical_name) ?? "";
        case "pipeline_stage_id":
            if (!hasNonEmptyFk(record, "pipeline_stage_id")) return undefined;
            return trimNonEmpty(record._pipeline_stage_name ?? record._stage_name) ?? "";
        default:
            return undefined;
    }
}
function opportunityOverviewStatusBadgeLabel(record) {
    const disp = trimNonEmpty(record._status_display);
    if (disp) return disp;
    const stage = trimNonEmpty(record._pipeline_stage_name ?? record._stage_name);
    if (stage) return stage;
    return null;
}
}),
"[project]/lib/admin/actions/applyRegistryResolvedActionClient.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "applyRegistryResolvedActionClient",
    ()=>applyRegistryResolvedActionClient
]);
async function applyRegistryResolvedActionClient(a, host) {
    if (a.action_type === "open_form") {
        const formKey = a.payload?.form_key != null ? String(a.payload.form_key).trim() : "";
        if (formKey && host.openForm) {
            host.openForm({
                form_key: formKey,
                action: a
            });
        }
        return {
            ok: true
        };
    }
    if (a.action_type === "navigate") {
        const href = a.payload?.href != null ? String(a.payload.href) : "";
        if (href) host.router.push(href);
        return {
            ok: true
        };
    }
    if (a.action_type === "external_link") {
        const href = a.payload?.href != null ? String(a.payload.href) : "";
        if (href) window.open(href, "_blank", "noopener,noreferrer");
        return {
            ok: true
        };
    }
    if (a.action_type === "open_drawer") {
        const d = a.payload?.drawer && typeof a.payload.drawer === "object" ? a.payload.drawer : {};
        const idFrom = d.idFrom != null ? String(d.idFrom) : "";
        const resolvedId = idFrom === "entity_id" && host.entityId?.trim() ? host.entityId.trim() : host.entityId?.trim() ?? "";
        if (!resolvedId) return {
            ok: true
        };
        const entityType = String(d.entityType ?? "opportunities").trim().toLowerCase();
        const defSurf = d.defaultSurface != null ? String(d.defaultSurface) : null;
        if (entityType === "jobs" || entityType === "job") {
            host.openDrawer({
                type: "jobs",
                id: resolvedId,
                jobRecordSurface: "drawer"
            });
            return {
                ok: true
            };
        }
        if (entityType === "schedules" || entityType === "schedule") {
            host.openDrawer({
                type: "schedules",
                id: resolvedId
            });
            return {
                ok: true
            };
        }
        if (defSurf === "quote_intake" || a.key === "start_quote") {
            host.openDrawer({
                type: "opportunities",
                id: resolvedId,
                defaultOpportunitySurface: "quote_intake"
            });
            return {
                ok: true
            };
        }
        host.openDrawer({
            type: "opportunities",
            id: resolvedId
        });
        return {
            ok: true
        };
    }
    if (a.action_type === "ui_intent") {
        const p = a.payload && typeof a.payload === "object" ? a.payload : {};
        const intent = p.intent != null ? String(p.intent).trim() : "";
        const message = p.message != null ? String(p.message).trim() : "";
        if (intent === "review_automations") {
            host.router.push("/adminV2/workflows");
            return {
                ok: true
            };
        }
        if (intent === "create_inquiry") {
            window.alert("Coming next: Create inquiry in AdminV2.");
            return {
                ok: true
            };
        }
        if (intent === "open_enrollment_pipeline") {
            if (host.departmentId?.trim()) {
                host.router.push(`/adminV2/workspace/dept/${encodeURIComponent(host.departmentId.trim())}`);
            } else {
                host.router.push("/adminV2/workspace");
            }
            return {
                ok: true
            };
        }
        if (intent === "view_needs_attention") {
            const href = host.needsAttentionHref?.trim();
            if (href) {
                host.router.push(href);
                return {
                    ok: true
                };
            }
            if (host.departmentId?.trim()) {
                host.router.push(`/adminV2/workspace/dept/${encodeURIComponent(host.departmentId.trim())}`);
            } else {
                host.router.push("/adminV2/workspace");
            }
            return {
                ok: true
            };
        }
        if (message) {
            window.alert(message);
            return {
                ok: true
            };
        }
        return {
            ok: true
        };
    }
    const entityId = host.entityId?.trim();
    if (!entityId) {
        console.warn("[applyRegistryResolvedActionClient] mutating action needs entity_id", {
            key: a.key
        });
        return {
            ok: false,
            error: "entity_id required"
        };
    }
    const res = await fetch("/api/admin/actions/execute", {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            action_key: a.key,
            entity_type: "opportunity",
            entity_id: entityId,
            context: host.context
        })
    });
    const json = await res.json().catch(()=>({}));
    if (!res.ok || !json.ok) {
        console.warn("[applyRegistryResolvedActionClient] execute failed", json.error);
        return {
            ok: false,
            error: json.error ?? "Execute failed"
        };
    }
    const er = json.execution_result;
    if (er?.kind === "open_drawer") {
        if (er.drawer?.defaultSurface === "quote_intake") {
            host.openDrawer({
                type: "opportunities",
                id: entityId,
                defaultOpportunitySurface: "quote_intake"
            });
        } else {
            host.openDrawer({
                type: "opportunities",
                id: entityId
            });
        }
        if (host.invalidate) host.invalidate({
            entity_type: "opportunity",
            entity_id: entityId,
            action_key: a.key
        });
        else host.router.refresh();
        return {
            ok: true,
            execution_result: er
        };
    }
    if (er?.kind === "navigate" && er.href) {
        host.router.push(String(er.href));
        return {
            ok: true,
            execution_result: er
        };
    }
    if (er?.kind === "external_link" && er.href) {
        window.open(String(er.href), "_blank", "noopener,noreferrer");
        return {
            ok: true,
            execution_result: er
        };
    }
    if (host.invalidate) host.invalidate({
        entity_type: "opportunity",
        entity_id: entityId,
        action_key: a.key
    });
    else host.router.refresh();
    return {
        ok: true,
        execution_result: er
    };
}
}),
"[project]/lib/admin/deleteConfig.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Admin delete configuration: which entity types support hard delete (admin/super-user only).
 * Used by UI to show/hide delete and by API to enforce.
 * Tier A: config / lower-risk records — hard delete allowed.
 * Tier B: operational records — use archive/deactivate; no hard delete in this pass.
 * Tier C: financial/posted — no delete.
 */ __turbopack_context__.s([
    "ADMIN_HARD_DELETE_ENTITY_TYPES",
    ()=>ADMIN_HARD_DELETE_ENTITY_TYPES,
    "ENTITY_TYPE_TO_DELETE_API_PATH",
    ()=>ENTITY_TYPE_TO_DELETE_API_PATH,
    "canHardDeleteEntityType",
    ()=>canHardDeleteEntityType,
    "getDeleteApiPath",
    ()=>getDeleteApiPath
]);
const ADMIN_HARD_DELETE_ENTITY_TYPES = [
    "service_offerings",
    "service_plan_templates",
    "addons"
];
const ENTITY_TYPE_TO_DELETE_API_PATH = {
    pricing_modes: "pricing-modes",
    pricing_dimensions: "pricing-dimensions",
    pricing_dimension_values: "pricing-dimension-values",
    service_offerings: "service-offerings",
    service_plan_templates: "service-plan-templates",
    addons: "addons",
    discounts: "discounts"
};
function getDeleteApiPath(type, id) {
    const path = ENTITY_TYPE_TO_DELETE_API_PATH[type];
    if (!path) return null;
    return `/api/admin/${path}/${id}`;
}
function canHardDeleteEntityType(type) {
    return ADMIN_HARD_DELETE_ENTITY_TYPES.includes(type);
}
}),
"[project]/lib/admin/validateDiscountCode.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Validate a discount code for a job and compute discount_amount (cents).
 * Used by POST/PATCH jobs to ensure code is active, in date range, and (when applicable) matches job vertical.
 * Returns { error: string } or { discount_amount_cents: number; code: string }.
 */ __turbopack_context__.s([
    "computeDiscountCents",
    ()=>computeDiscountCents,
    "validateDiscountCodeForJob",
    ()=>validateDiscountCodeForJob
]);
function computeDiscountCents(gross_price_cents, codeRow) {
    const gross = Math.max(0, Math.round(gross_price_cents));
    const type = String(codeRow.discount_type ?? "").trim().toLowerCase();
    const val = codeRow.discount_value;
    if (type === "percent") {
        const percent = Math.min(100, Math.max(0, Number(val) ?? 0));
        return Math.round(gross * percent / 100);
    }
    if (type === "fixed") {
        const dollars = Number(val) ?? 0;
        const cents = Math.round(dollars * 100);
        return Math.min(gross, Math.max(0, cents));
    }
    return 0;
}
function validateDiscountCodeForJob(codeRow, gross_price_cents, job_vertical_slug) {
    if (!codeRow) {
        return {
            error: "Discount code not found"
        };
    }
    if (codeRow.is_active !== true) {
        return {
            error: "Discount code is not active"
        };
    }
    const now = new Date().toISOString();
    if (codeRow.starts_at != null && codeRow.starts_at > now) {
        return {
            error: "Discount code is not yet valid"
        };
    }
    if (codeRow.ends_at != null && codeRow.ends_at < now) {
        return {
            error: "Discount code has expired"
        };
    }
    const appliesTo = (codeRow.applies_to_vertical_slug ?? "").trim() || null;
    if (appliesTo && job_vertical_slug !== appliesTo) {
        return {
            error: "Discount code does not apply to this job's vertical"
        };
    }
    const discount_amount_cents = computeDiscountCents(gross_price_cents, codeRow);
    return {
        discount_amount_cents,
        code: codeRow.code ?? ""
    };
}
}),
"[project]/lib/admin/jobDiscountSelection.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Job discount selection: unified tokens (program:uuid | code:uuid), resolution for admin jobs,
 * and compatibility with legacy discount_codes + migrated programs (legacy_discount_code_id).
 */ __turbopack_context__.s([
    "buildJobDiscountDisplayLabel",
    ()=>buildJobDiscountDisplayLabel,
    "computeJobDiscountOptionPreviewCents",
    ()=>computeJobDiscountOptionPreviewCents,
    "discountProgramRowSelectableForJobAdmin",
    ()=>discountProgramRowSelectableForJobAdmin,
    "fetchJobDiscountOptionsForAdmin",
    ()=>fetchJobDiscountOptionsForAdmin,
    "formatProgramOptionLabel",
    ()=>formatProgramOptionLabel,
    "inferJobDiscountSelectionToken",
    ()=>inferJobDiscountSelectionToken,
    "inferOpportunityDiscountSelectionToken",
    ()=>inferOpportunityDiscountSelectionToken,
    "parseJobDiscountSelectionInput",
    ()=>parseJobDiscountSelectionInput,
    "programViewRowToPreviewFields",
    ()=>programViewRowToPreviewFields,
    "resolveJobDiscountSelection",
    ()=>resolveJobDiscountSelection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$validateDiscountCode$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/validateDiscountCode.ts [app-ssr] (ecmascript)");
;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parseJobDiscountSelectionInput(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const idx = s.indexOf(":");
    if (idx > 0) {
        const prefix = s.slice(0, idx).toLowerCase();
        const id = s.slice(idx + 1).trim();
        if (!id || !UUID_RE.test(id)) return null;
        if (prefix === "program") return {
            kind: "program",
            programId: id
        };
        if (prefix === "code") return {
            kind: "legacy_code",
            codeId: id
        };
        return null;
    }
    if (UUID_RE.test(s)) return {
        kind: "legacy_code",
        codeId: s
    };
    return null;
}
function formatProgramOptionLabel(code, programType) {
    const c = (code ?? "").trim() || "(no code)";
    const t = (programType ?? "").trim() || "program";
    return `${c} — ${t}`;
}
function computeJobDiscountOptionPreviewCents(option, grossCents) {
    const gross = Math.max(0, Math.round(grossCents));
    const type = (option.discount_type ?? "").toLowerCase();
    const val = option.discount_value;
    if (type === "percent") {
        const percent = Math.min(100, Math.max(0, Number(val) ?? 0));
        return Math.round(gross * percent / 100);
    }
    if (type === "fixed") {
        const dollars = Number(val) ?? 0;
        const cents = Math.round(dollars * 100);
        return Math.min(gross, Math.max(0, cents));
    }
    return 0;
}
function discountProgramRowSelectableForJobAdmin(row) {
    const st = String(row.status ?? "").trim().toLowerCase();
    if (st && st !== "active") return false;
    const now = Date.now();
    const vf = row.valid_from;
    const vt = row.valid_to;
    if (typeof vf === "string" && vf && new Date(vf).getTime() > now) return false;
    if (typeof vt === "string" && vt && new Date(vt).getTime() < now) return false;
    return true;
}
async function loadVerticalSlugsForProgram(supabase, programId) {
    const { data, error } = await supabase.from("discount_program_qualifiers").select("value_json").eq("discount_program_id", programId).eq("qualifier_type", "vertical_slug_in");
    if (error || !data?.length) return [];
    const slugs = new Set();
    for (const q of data){
        const v = q.value_json;
        if (v && typeof v === "object" && !Array.isArray(v)) {
            const vals = v.values;
            if (Array.isArray(vals)) {
                for (const x of vals){
                    const s = String(x).trim();
                    if (s) slugs.add(s);
                }
            }
        }
    }
    return [
        ...slugs
    ];
}
function computeDiscountCentsFromProgramView(row, grossCents) {
    const gross = Math.max(0, Math.round(grossCents));
    const benefitType = String(row.primary_benefit_type ?? "").trim();
    if (benefitType === "percent_off") {
        const bps = Number(row.primary_benefit_percent_basis_points ?? row.percent_basis_points ?? 0);
        const percent = Math.min(100, Math.max(0, bps / 100));
        return Math.round(gross * percent / 100);
    }
    if (benefitType === "fixed_amount_off") {
        const cents = Math.round(Number(row.primary_benefit_amount_cents ?? row.amount_cents ?? 0));
        return Math.min(gross, Math.max(0, cents));
    }
    if (benefitType === "free_service") {
        return gross;
    }
    return 0;
}
async function resolveJobDiscountSelection(supabase, parsed, grossCents, jobVerticalSlug, orgId) {
    if (!parsed) {
        return {
            ok: true,
            value: {
                discount_code_id: null,
                discount_program_id: null,
                discount_code: null,
                discount_amount: 0,
                discounted: false
            }
        };
    }
    if (parsed.kind === "legacy_code") {
        const { data: codeRow, error: codeErr } = await supabase.from("discount_codes").select("id, code, is_active, discount_type, discount_value, applies_to_vertical_slug, starts_at, ends_at").eq("id", parsed.codeId).maybeSingle();
        if (codeErr) return {
            ok: false,
            error: codeErr.message
        };
        const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$validateDiscountCode$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["validateDiscountCodeForJob"])(codeRow, grossCents, jobVerticalSlug);
        if ("error" in result) return {
            ok: false,
            error: result.error
        };
        return {
            ok: true,
            value: {
                discount_code_id: parsed.codeId,
                discount_program_id: null,
                discount_code: result.code,
                discount_amount: result.discount_amount_cents,
                discounted: true
            }
        };
    }
    const { data: row, error } = await supabase.from("discount_programs_admin_v").select("*").eq("id", parsed.programId).maybeSingle();
    if (error) return {
        ok: false,
        error: error.message
    };
    if (!row) return {
        ok: false,
        error: "Discount program not found"
    };
    const r = row;
    const rowOrg = r.org_id;
    if (rowOrg && rowOrg !== orgId) {
        return {
            ok: false,
            error: "Discount program does not belong to your org"
        };
    }
    if (!discountProgramRowSelectableForJobAdmin(r)) {
        return {
            ok: false,
            error: "Discount program is not active or is outside its valid dates"
        };
    }
    const verticalSlugs = await loadVerticalSlugsForProgram(supabase, parsed.programId);
    if (verticalSlugs.length > 0) {
        const jobV = (jobVerticalSlug ?? "").trim();
        if (!jobV || !verticalSlugs.includes(jobV)) {
            return {
                ok: false,
                error: "Discount program does not apply to this job's vertical"
            };
        }
    }
    const discount_amount = computeDiscountCentsFromProgramView(r, grossCents);
    const legacyId = r.legacy_discount_code_id ?? null;
    const codeStr = r.code ?? "";
    return {
        ok: true,
        value: {
            discount_program_id: parsed.programId,
            discount_code_id: legacyId,
            discount_code: codeStr || null,
            discount_amount,
            discounted: true
        }
    };
}
function inferOpportunityDiscountSelectionToken(opp) {
    const pid = opp.discount_program_id ?? null;
    if (pid) return `program:${pid}`;
    const cid = opp.discount_code_id ?? null;
    if (cid) return `code:${cid}`;
    return "";
}
async function inferJobDiscountSelectionToken(supabase, job) {
    const pid = job.discount_program_id ?? null;
    if (pid) return `program:${pid}`;
    const cid = job.discount_code_id ?? null;
    if (!cid) return "";
    const { data: prog } = await supabase.from("discount_programs").select("id").eq("legacy_discount_code_id", cid).maybeSingle();
    const found = prog;
    if (found?.id) return `program:${found.id}`;
    return `code:${cid}`;
}
async function buildJobDiscountDisplayLabel(supabase, job) {
    const pid = job.discount_program_id ?? null;
    if (pid) {
        const { data: v } = await supabase.from("discount_programs_admin_v").select("code, name, program_type").eq("id", pid).maybeSingle();
        const vr = v;
        if (vr) {
            const code = (vr.code ?? "").trim();
            const name = (vr.name ?? "").trim();
            const pt = (vr.program_type ?? "").trim() || "program";
            if (name && code) return `${code} — ${pt} (${name})`;
            return formatProgramOptionLabel(code || name || null, pt);
        }
    }
    const cid = job.discount_code_id ?? null;
    if (cid) {
        const { data: dc } = await supabase.from("discount_codes").select("code").eq("id", cid).maybeSingle();
        const c = dc?.code;
        if (c) return `${c} — legacy code`;
    }
    if (job.discount_code && String(job.discount_code).trim()) {
        return String(job.discount_code).trim();
    }
    return null;
}
function programViewRowToPreviewFields(row) {
    const benefitType = String(row.primary_benefit_type ?? "").trim();
    const firstOnly = row.first_time_customer_only === true;
    if (benefitType === "percent_off") {
        const bps = Number(row.primary_benefit_percent_basis_points ?? 0);
        return {
            discount_type: "percent",
            discount_value: bps / 100,
            first_job_only: firstOnly
        };
    }
    if (benefitType === "fixed_amount_off") {
        const cents = Number(row.primary_benefit_amount_cents ?? 0);
        return {
            discount_type: "fixed",
            discount_value: cents / 100,
            first_job_only: firstOnly
        };
    }
    if (benefitType === "free_service") {
        return {
            discount_type: "percent",
            discount_value: 100,
            first_job_only: firstOnly
        };
    }
    return {
        discount_type: null,
        discount_value: null,
        first_job_only: firstOnly
    };
}
async function fetchJobDiscountOptionsForAdmin(supabase, orgId, verticalSlug) {
    const now = new Date().toISOString();
    const { data: progRows, error: pe } = await supabase.from("discount_programs_admin_v").select("*").or(`org_id.eq.${orgId},org_id.is.null`).order("code", {
        ascending: true
    }).limit(500);
    if (pe) throw new Error(pe.message);
    const programs = (progRows ?? []).filter((raw)=>discountProgramRowSelectableForJobAdmin(raw));
    const programIds = programs.map((p)=>p.id).filter(Boolean);
    const verticalMap = new Map();
    if (programIds.length > 0) {
        const { data: quals } = await supabase.from("discount_program_qualifiers").select("discount_program_id, value_json").in("discount_program_id", programIds).eq("qualifier_type", "vertical_slug_in");
        for (const q of quals ?? []){
            const pid = q.discount_program_id;
            const v = q.value_json;
            const parts = [];
            if (v && typeof v === "object" && !Array.isArray(v)) {
                const vals = v.values;
                if (Array.isArray(vals)) {
                    for (const x of vals){
                        const s = String(x).trim();
                        if (s) parts.push(s);
                    }
                }
            }
            if (parts.length) verticalMap.set(pid, parts.join(","));
        }
    }
    const options = [];
    const legacyLinked = new Set();
    for (const raw of programs){
        const r = raw;
        const id = r.id;
        const legacy = r.legacy_discount_code_id ?? null;
        if (legacy) legacyLinked.add(legacy);
        const applies = verticalMap.get(id) ?? null;
        if (verticalSlug && applies) {
            const list = applies.split(",").map((s)=>s.trim()).filter(Boolean);
            if (list.length > 0 && !list.includes(verticalSlug)) continue;
        }
        const preview = programViewRowToPreviewFields(r);
        const code = r.code ?? "";
        const pt = r.program_type ?? null;
        options.push({
            value: `program:${id}`,
            label: formatProgramOptionLabel(code, pt),
            code: code || "(no code)",
            discount_type: preview.discount_type,
            discount_value: preview.discount_value,
            applies_to_vertical_slug: applies,
            first_job_only: preview.first_job_only,
            program_id: id,
            legacy_code_id: legacy,
            program_type: pt
        });
    }
    let cq = supabase.from("discount_codes").select("id, code, discount_type, discount_value, applies_to_vertical_slug, first_job_only").eq("is_active", true).or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gte.${now}`).order("code", {
        ascending: true
    });
    if (verticalSlug) {
        cq = cq.or(`applies_to_vertical_slug.is.null,applies_to_vertical_slug.eq.${verticalSlug}`);
    }
    const { data: codes, error: ce } = await cq;
    if (ce) throw new Error(ce.message);
    for (const raw of codes ?? []){
        const row = raw;
        if (legacyLinked.has(row.id)) continue;
        const t = String(row.discount_type ?? "").trim().toLowerCase();
        const dt = t === "percent" ? "percent" : t === "fixed" ? "fixed" : null;
        const dv = dt ? Number(row.discount_value) : null;
        options.push({
            value: `code:${row.id}`,
            label: `${(row.code ?? "").trim() || row.id.slice(0, 8)} — legacy code`,
            code: row.code ?? "",
            discount_type: dt,
            discount_value: dv != null && Number.isFinite(dv) ? dv : null,
            applies_to_vertical_slug: row.applies_to_vertical_slug ?? null,
            first_job_only: row.first_job_only ?? null,
            program_id: null,
            legacy_code_id: row.id,
            program_type: null
        });
    }
    return options.sort((a, b)=>a.label.localeCompare(b.label));
}
}),
"[project]/lib/admin/vendorOptionLabel.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Human-readable labels for vendor dropdowns and job/schedule display.
 * Value saved to DB remains vendors.id; labels are presentation-only.
 */ __turbopack_context__.s([
    "buildVendorIdToLabelMap",
    ()=>buildVendorIdToLabelMap,
    "formatVendorOptionLabel",
    ()=>formatVendorOptionLabel,
    "vendorRowToDisplayStub",
    ()=>vendorRowToDisplayStub,
    "vendorsToSelectOptions",
    ()=>vendorsToSelectOptions
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-ssr] (ecmascript)");
;
function formatVendorOptionLabel(v) {
    const company = v.company_name?.trim();
    if (company) return company;
    const person = [
        v.primary_person?.first_name,
        v.primary_person?.last_name
    ].filter(Boolean).join(" ").trim();
    if (person) return person;
    const name = v.name?.trim();
    if (name) return name;
    const email = v.email?.trim();
    if (email) return email;
    const phone = v.phone?.trim();
    if (phone) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatPhoneUS"])(phone);
    return `${v.id.slice(0, 8)}…`;
}
function buildVendorIdToLabelMap(vendorRows, persons) {
    const pmap = new Map(persons.map((p)=>[
            p.id,
            p
        ]));
    const m = new Map();
    for (const r of vendorRows){
        const person = r.primary_person_id ? pmap.get(r.primary_person_id) ?? null : null;
        m.set(r.id, formatVendorOptionLabel({
            id: r.id,
            name: r.name,
            company_name: r.company_name,
            email: r.email,
            phone: r.phone,
            primary_person: person ?? null
        }));
    }
    return m;
}
function vendorsToSelectOptions(vendorRows, personById) {
    return vendorRows.map((r)=>{
        const person = r.primary_person_id ? personById.get(r.primary_person_id) ?? null : null;
        const label = formatVendorOptionLabel({
            id: r.id,
            name: r.name,
            company_name: r.company_name,
            email: r.email,
            phone: r.phone,
            primary_person: person
        });
        return {
            id: r.id,
            name: r.name ?? null,
            label
        };
    });
}
function vendorRowToDisplayStub(row, person) {
    return {
        id: row.id,
        name: formatVendorOptionLabel({
            id: row.id,
            name: row.name,
            company_name: row.company_name,
            email: row.email,
            phone: row.phone,
            primary_person: person
        })
    };
}
}),
"[project]/lib/admin/unifiedDrawerStatus.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ENTITY_TYPES_WITH_UNIFIED_DRAWER_STATUS",
    ()=>ENTITY_TYPES_WITH_UNIFIED_DRAWER_STATUS,
    "extractCanonicalStatusFieldFromPresentation",
    ()=>extractCanonicalStatusFieldFromPresentation,
    "mergeUnifiedStatusIntoConfigOverview",
    ()=>mergeUnifiedStatusIntoConfigOverview
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$entityPresentation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/entityPresentation.ts [app-ssr] (ecmascript)");
;
const ENTITY_TYPES_WITH_UNIFIED_DRAWER_STATUS = new Set([
    "jobs",
    "schedules",
    "opportunities",
    "vendors",
    "customers",
    "persons",
    "locations",
    "documents",
    "contacts",
    "customer_members",
    "subscriptions"
]);
/** Strip these so a single canonical status control can be injected (no raw FK rows). */ const LEGACY_STATUS_FIELD_KEYS = new Set([
    "status_key",
    "_status_display",
    "job_status_id",
    "schedule_status_id",
    "vendor_status_id",
    "payment_status_id"
]);
function cloneField(f) {
    return {
        ...f,
        ...f.linkTarget ? {
            linkTarget: {
                ...f.linkTarget
            }
        } : {}
    };
}
function extractCanonicalStatusFieldFromPresentation(t) {
    const sections = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$entityPresentation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getEntityPresentation"])(t).drawer?.overviewSections ?? [];
    const allFields = [];
    for (const s of sections){
        for (const f of s.fields ?? [])allFields.push(f);
        for (const sub of s.subsections ?? []){
            for (const f of sub.fields ?? [])allFields.push(f);
        }
    }
    const statusKeyField = allFields.find((f)=>f.renderHint === "status" && f.key === "status_key");
    if (statusKeyField) return cloneField(statusKeyField);
    const displayOnly = allFields.find((f)=>f.renderHint === "status" && f.key === "_status_display");
    return displayOnly ? cloneField(displayOnly) : null;
}
function stripFields(fields) {
    return fields.filter((f)=>!LEGACY_STATUS_FIELD_KEYS.has(f.key));
}
function stripSection(s) {
    const fields = stripFields(s.fields ?? []);
    const subsections = s.subsections?.map((sub)=>({
            ...sub,
            fields: stripFields(sub.fields ?? [])
        })).filter((sub)=>sub.fields.length > 0);
    return {
        ...s,
        fields,
        subsections
    };
}
function mergeUnifiedStatusIntoConfigOverview(presentationType, sections) {
    if (!ENTITY_TYPES_WITH_UNIFIED_DRAWER_STATUS.has(presentationType)) {
        return sections;
    }
    if (sections.length === 0) {
        return sections;
    }
    const canonical = extractCanonicalStatusFieldFromPresentation(presentationType);
    if (!canonical) return sections;
    const stripped = sections.filter((s)=>s.key !== "__unified_status").map((s)=>stripSection(s));
    const statusSection = {
        key: "__unified_status",
        title: "Status",
        defaultExpanded: true,
        collapsible: false,
        gridCols: 2,
        fields: [
            {
                ...canonical,
                label: canonical.label || "Status",
                locked: true
            }
        ],
        locked: true
    };
    let result = [
        statusSection,
        ...stripped
    ];
    if (presentationType === "jobs") {
        const jobSectionRank = {
            __unified_status: -1,
            job_details: 0,
            property_service: 1,
            customer_location: 2,
            scheduling: 3,
            job_pricing_breakdown: 4,
            pricing: 5,
            notes: 6,
            record_info: 7
        };
        const rank = (k)=>jobSectionRank[k] !== undefined ? jobSectionRank[k] : 50;
        result = [
            ...result
        ].sort((a, b)=>rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
    }
    return result;
}
}),
"[project]/lib/visualContext/contextRegistry.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEPARTMENT_KEY_TO_DEFAULT_VISUAL_CONTEXT",
    ()=>DEPARTMENT_KEY_TO_DEFAULT_VISUAL_CONTEXT,
    "LANE_KEY_TO_VISUAL_CONTEXT",
    ()=>LANE_KEY_TO_VISUAL_CONTEXT,
    "NEUTRAL_CONTEXT_KEY",
    ()=>NEUTRAL_CONTEXT_KEY,
    "VISUAL_CONTEXT_KEY_ALIASES",
    ()=>VISUAL_CONTEXT_KEY_ALIASES,
    "VISUAL_CONTEXT_REGISTRY",
    ()=>VISUAL_CONTEXT_REGISTRY,
    "accentFamilyForContextKey",
    ()=>accentFamilyForContextKey,
    "alloyFamilyForContextKey",
    ()=>alloyFamilyForContextKey,
    "getRegistryEntry",
    ()=>getRegistryEntry,
    "isRegisteredVisualContextKey",
    ()=>isRegisteredVisualContextKey
]);
const NEUTRAL_CONTEXT_KEY = "neutral";
const VISUAL_CONTEXT_REGISTRY = {
    [NEUTRAL_CONTEXT_KEY]: {
        alloyFamily: "neutral"
    },
    /** Lane / work — calendar-day visits */ scheduled_today: {
        alloyFamily: "alloy_blue"
    },
    unassigned: {
        alloyFamily: "amber",
        amberEmphasis: "standard"
    },
    needs_attention: {
        alloyFamily: "amber",
        amberEmphasis: "strong"
    },
    /** Coordination / flow — default “ops” feel without department naming */ coordination: {
        alloyFamily: "bend_pine"
    },
    /** Department-default semantics (not org names): forward motion / pipeline */ momentum: {
        alloyFamily: "alloy_blue"
    },
    hospitality: {
        alloyFamily: "amber",
        amberEmphasis: "standard"
    },
    steadiness: {
        alloyFamily: "midnight_blue"
    }
};
const LANE_KEY_TO_VISUAL_CONTEXT = {
    scheduled_today: "scheduled_today",
    unassigned: "unassigned",
    needs_attention: "needs_attention"
};
const DEPARTMENT_KEY_TO_DEFAULT_VISUAL_CONTEXT = {
    operations: "coordination",
    finance: "neutral",
    growth: "momentum",
    customer_experience: "hospitality",
    system: "neutral",
    revenue: "momentum",
    team: "neutral"
};
const VISUAL_CONTEXT_KEY_ALIASES = {
    operations: "coordination",
    schedule_today: "scheduled_today",
    needs_attention_lane: "needs_attention",
    unassigned_lane: "unassigned"
};
function isRegisteredVisualContextKey(key) {
    return Object.prototype.hasOwnProperty.call(VISUAL_CONTEXT_REGISTRY, key);
}
function getRegistryEntry(key) {
    return VISUAL_CONTEXT_REGISTRY[key] ?? VISUAL_CONTEXT_REGISTRY[NEUTRAL_CONTEXT_KEY];
}
function alloyFamilyForContextKey(key) {
    return getRegistryEntry(key).alloyFamily;
}
function accentFamilyForContextKey(key) {
    return alloyFamilyForContextKey(key);
}
}),
"[project]/lib/visualContext/contextResolver.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "departmentKeyToAccentFamily",
    ()=>departmentKeyToAccentFamily,
    "resolveVisualContext",
    ()=>resolveVisualContext,
    "resolveVisualContextKey",
    ()=>resolveVisualContextKey
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextRegistry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/visualContext/contextRegistry.ts [app-ssr] (ecmascript)");
;
function normalizeKey(raw) {
    if (raw == null) return null;
    const t = String(raw).trim();
    return t.length > 0 ? t : null;
}
/** Map explicit / stored keys to a registered semantic context key. */ function resolveCanonicalContextKey(raw) {
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextRegistry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isRegisteredVisualContextKey"])(raw)) return raw;
    const mapped = __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextRegistry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["VISUAL_CONTEXT_KEY_ALIASES"][raw];
    if (mapped && (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextRegistry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isRegisteredVisualContextKey"])(mapped)) return mapped;
    return __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextRegistry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NEUTRAL_CONTEXT_KEY"];
}
function resolveVisualContextKey(input) {
    const explicit = normalizeKey(input.visualContextKey);
    if (explicit) {
        return resolveCanonicalContextKey(explicit);
    }
    const lane = normalizeKey(input.laneKey);
    if (lane && __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextRegistry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LANE_KEY_TO_VISUAL_CONTEXT"][lane]) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextRegistry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LANE_KEY_TO_VISUAL_CONTEXT"][lane];
    }
    const wu = normalizeKey(input.workUnitVisualContextKey);
    if (wu) {
        return resolveCanonicalContextKey(wu);
    }
    const deptDefault = normalizeKey(input.departmentDefaultVisualContextKey);
    if (deptDefault) {
        return resolveCanonicalContextKey(deptDefault);
    }
    const deptKey = normalizeKey(input.departmentKey);
    if (deptKey && __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextRegistry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DEPARTMENT_KEY_TO_DEFAULT_VISUAL_CONTEXT"][deptKey]) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextRegistry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DEPARTMENT_KEY_TO_DEFAULT_VISUAL_CONTEXT"][deptKey];
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextRegistry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NEUTRAL_CONTEXT_KEY"];
}
function resolveVisualContext(input) {
    const contextKey = resolveVisualContextKey(input);
    const entry = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextRegistry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getRegistryEntry"])(contextKey);
    const out = {
        contextKey,
        alloyFamily: entry.alloyFamily
    };
    if (entry.amberEmphasis) {
        out.amberEmphasis = entry.amberEmphasis;
    }
    return out;
}
function departmentKeyToAccentFamily(departmentKey) {
    return resolveVisualContext({
        departmentKey
    }).alloyFamily;
}
}),
"[project]/lib/visualContext/accentFamily.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Lane-level micro-bias on layer strength (not a separate color system).
 * Applied in `contextStyle.ts` after operational context resolution.
 */ __turbopack_context__.s([
    "laneKeyToVisualBias",
    ()=>laneKeyToVisualBias
]);
function laneKeyToVisualBias(laneKey) {
    if (!laneKey) return 0;
    switch(laneKey){
        case "scheduled_today":
            return 0.12;
        case "needs_attention":
            return 0.08;
        case "unassigned":
            return 0.04;
        default:
            return 0;
    }
}
}),
"[project]/lib/visualContext/shellBaseTokens.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "adminWorkspaceActionStyle",
    ()=>adminWorkspaceActionStyle,
    "departmentWorkspaceShellBaseStyle",
    ()=>departmentWorkspaceShellBaseStyle
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
;
const adminWorkspaceActionStyle = {
    ["--admin-action-primary-bg"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].midnightForge,
    ["--admin-action-primary-fg"]: "#ffffff",
    ["--admin-action-secondary-border"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
    ["--admin-action-secondary-bg"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
    ["--admin-action-secondary-fg"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
    ["--admin-action-tertiary-fg"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
    ["--admin-action-exception-bg"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].accent,
    ["--admin-action-exception-fg"]: "#ffffff"
};
const departmentWorkspaceShellBaseStyle = {
    ...adminWorkspaceActionStyle,
    backgroundColor: "transparent",
    color: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
    ["--d-text-primary"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].textPrimary,
    ["--d-page-bg"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].background,
    ["--d-border"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].border,
    ["--d-muted"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].textSecondary,
    ["--d-surface"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface,
    ["--d-brand"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].primary,
    ["--d-pine"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].secondary,
    ["--d-top-wash"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].kpiRailWash,
    ["--d-panel"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].chromeDeckBg,
    ["--d-panel-quiet"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandRailWash,
    ["--d-rail"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandRail,
    ["--d-field-veil"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].canvasFieldWash,
    ["--d-ambient-core"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientLifeBloomMid,
    ["--d-kpi-tint"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].kpiBandBusinessLight,
    ["--d-kpi-ai-tint"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].kpiBandAiLight,
    ["--d-summary-wash"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].maskOverlay,
    ["--d-boundary-inset"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].adminV2BoundaryAmberInset,
    ["--d-kpi-band-shadow"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].kpiBandShadow,
    ["--d-admin-amber"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].adminV2BoundaryAmber,
    ["--d-rail-hairline"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorCommandHairline,
    ["--d-rail-sep"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].inspectorChamberSeparation,
    ["--d-ambient-edge"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientLifeBloomEdge,
    ["--d-field-depth"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].canvasFieldDepth,
    ["--d-card-shadow"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].cardShadow
};
}),
"[project]/lib/visualContext/contextStyle.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "alloyFamilyToWorkspaceTileTone",
    ()=>alloyFamilyToWorkspaceTileTone,
    "mergeOperationalVisualTokens",
    ()=>mergeOperationalVisualTokens,
    "operationalWorkspaceShellStyle",
    ()=>operationalWorkspaceShellStyle,
    "recordSurfaceContextStyle",
    ()=>recordSurfaceContextStyle,
    "workspaceTileContextStyle",
    ()=>workspaceTileContextStyle
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/styles/tokens/colors.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextResolver$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/visualContext/contextResolver.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$accentFamily$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/visualContext/accentFamily.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$shellBaseTokens$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/visualContext/shellBaseTokens.ts [app-ssr] (ecmascript)");
;
;
;
;
/** Layer intensity: workspace light → department medium → work_unit strong → record focused. */ const LAYER_STRENGTH = {
    workspace: 0.2,
    department: 0.42,
    work_unit: 0.78,
    record: 0.52
};
function alloyFamilyToWorkspaceTileTone(family) {
    switch(family){
        case "alloy_blue":
            return "blue";
        case "bend_pine":
            return "pine";
        case "amber":
            return "amber";
        case "midnight_blue":
            return "neutral";
        case "neutral":
        default:
            return "neutral";
    }
}
function chromaForAlloyFamily(family) {
    switch(family){
        case "alloy_blue":
            return {
                primary: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].alloyBlue,
                secondary: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].bendPine
            };
        case "bend_pine":
            return {
                primary: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].alloyBlue,
                secondary: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].bendPine
            };
        case "amber":
            return {
                primary: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["brand"].accent,
                secondary: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].bendPine
            };
        case "midnight_blue":
            return {
                primary: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].midnightForge,
                secondary: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].bendPine
            };
        case "neutral":
        default:
            return {
                primary: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].midnightForge,
                secondary: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].bendPine
            };
    }
}
/**
 * Context as signal, not surface tint: headers stay white; one right-edge rail carries identity.
 * Work panels use rails / rules / optional very light wash only.
 */ function buildContextualPresentationTokens(resolved, strength) {
    const { primary, secondary } = chromaForAlloyFamily(resolved.alloyFamily);
    const fam = resolved.alloyFamily;
    const t = Math.min(1, strength);
    let labelAccent = primary;
    if (fam === "bend_pine") labelAccent = secondary;
    if (fam === "neutral" || fam === "midnight_blue") labelAccent = __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].midnightForge;
    /** Subtle vertical accent on the right edge of header/control deck (not a full-width wash). */ const headerRailOpacity = Math.min(0.62, 0.28 + t * 0.22);
    const headerRailAccent = fam === "amber" ? `color-mix(in srgb, ${primary} ${Math.round(headerRailOpacity * 100)}%, #ffffff)` : fam === "bend_pine" ? `color-mix(in srgb, ${secondary} ${Math.round(headerRailOpacity * 100)}%, #ffffff)` : `color-mix(in srgb, ${primary} ${Math.round(headerRailOpacity * 100)}%, #ffffff)`;
    const rail = fam === "amber" ? `color-mix(in srgb, ${primary} 48%, var(--d-border))` : fam === "bend_pine" ? `color-mix(in srgb, ${secondary} 52%, var(--d-border))` : `color-mix(in srgb, ${primary} 45%, var(--d-border))`;
    const sectionWash = `color-mix(in srgb, #ffffff 96%, ${fam === "bend_pine" ? secondary : primary} 4%)`;
    return {
        ["--vc-label-accent"]: labelAccent,
        ["--vc-header-rail-accent"]: headerRailAccent,
        ["--vc-section-rail"]: rail,
        ["--vc-section-panel-wash"]: sectionWash
    };
}
function mergeTokensForResolved(resolved, layer, laneKey) {
    let strength = LAYER_STRENGTH[layer] + (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$accentFamily$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["laneKeyToVisualBias"])(laneKey) * 0.12;
    if (resolved.alloyFamily === "amber" && resolved.amberEmphasis === "strong") {
        strength = Math.min(1, strength * 1.12);
    }
    strength = Math.min(1, strength);
    const family = resolved.alloyFamily;
    const { primary, secondary } = chromaForAlloyFamily(family);
    const mixTowardPrimary = (base, pct)=>`color-mix(in srgb, ${primary} ${Math.round(pct * strength * 100)}%, ${base})`;
    const mixTowardSecondary = (base, pct)=>`color-mix(in srgb, ${secondary} ${Math.round(pct * strength * 100)}%, ${base})`;
    let pineSlot = secondary;
    let brandSlot = primary;
    switch(family){
        case "alloy_blue":
            pineSlot = mixTowardPrimary(secondary, 0.55);
            brandSlot = mixTowardPrimary(primary, 0.25);
            break;
        case "bend_pine":
            pineSlot = secondary;
            brandSlot = primary;
            break;
        case "amber":
            pineSlot = mixTowardSecondary(secondary, 0.35);
            brandSlot = primary;
            break;
        case "midnight_blue":
            pineSlot = mixTowardPrimary(secondary, 0.2);
            brandSlot = mixTowardPrimary(primary, 0.18);
            break;
        case "neutral":
        default:
            pineSlot = mixTowardPrimary(secondary, 0.15);
            brandSlot = primary;
            break;
    }
    const ambientCore = mixTowardSecondary(__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].ambientLifeBloomMid, 0.85);
    const fieldVeil = mixTowardPrimary(__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].canvasFieldWash, 0.5);
    const kpiBusiness = mixTowardSecondary(__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["derived"].kpiBandBusinessLight, 0.9);
    const presentation = buildContextualPresentationTokens(resolved, strength);
    return {
        ...presentation,
        ["--d-pine"]: pineSlot,
        ["--d-brand"]: brandSlot,
        ["--d-ambient-core"]: ambientCore,
        ["--d-field-veil"]: fieldVeil,
        ["--d-kpi-tint"]: kpiBusiness,
        ["--vc-alloy-family"]: family,
        ["--vc-context-key"]: "",
        ["--vc-layer-strength"]: String(strength)
    };
}
function mergeOperationalVisualTokens(input) {
    const { layer, ...hints } = input;
    const resolved = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextResolver$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveVisualContext"])(hints);
    const merged = mergeTokensForResolved(resolved, layer, hints.laneKey);
    return {
        ...merged,
        ["--vc-context-key"]: resolved.contextKey
    };
}
function operationalWorkspaceShellStyle(input) {
    return {
        ...__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$shellBaseTokens$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["departmentWorkspaceShellBaseStyle"],
        ...mergeOperationalVisualTokens(input)
    };
}
function workspaceTileContextStyle(hints) {
    const resolved = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextResolver$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveVisualContext"])(hints);
    const strength = LAYER_STRENGTH.workspace;
    const { primary, secondary } = chromaForAlloyFamily(resolved.alloyFamily);
    const family = resolved.alloyFamily;
    const edge = family === "alloy_blue" ? `color-mix(in srgb, ${primary} ${Math.round(14 + 22 * strength)}%, transparent)` : family === "amber" ? `color-mix(in srgb, ${primary} ${Math.round(12 + 18 * strength)}%, transparent)` : family === "bend_pine" ? `color-mix(in srgb, ${secondary} ${Math.round(16 + 24 * strength)}%, transparent)` : family === "midnight_blue" ? `color-mix(in srgb, ${primary} ${Math.round(10 + 14 * strength)}%, transparent)` : `color-mix(in srgb, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].midnightForge} ${Math.round(8 + 10 * strength)}%, transparent)`;
    return {
        ["--vc-tile-rail"]: edge,
        ["--vc-alloy-family"]: family,
        ["--vc-context-key"]: resolved.contextKey
    };
}
function recordSurfaceContextStyle(hints) {
    const resolved = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextResolver$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveVisualContext"])(hints);
    const merged = mergeOperationalVisualTokens({
        ...hints,
        layer: "record"
    });
    let strength = Math.min(1, LAYER_STRENGTH.record + (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$accentFamily$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["laneKeyToVisualBias"])(hints.laneKey) * 0.12);
    if (resolved.alloyFamily === "amber" && resolved.amberEmphasis === "strong") {
        strength = Math.min(1, strength * 1.08);
    }
    /** Record modal: Bend Pine–led chrome — precise, not themed; semantic resolver unchanged above. */ const pine = __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].bendPine;
    const rim = `color-mix(in srgb, ${pine} ${Math.round(26 + 18 * strength)}%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].surface})`;
    const labelForRecord = `color-mix(in srgb, ${pine} 38%, ${__TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["palette"].midnightForge})`;
    const headerRailRecord = `color-mix(in srgb, ${pine} 52%, #ffffff)`;
    const tabUnderline = `color-mix(in srgb, ${pine} 55%, transparent)`;
    return {
        ...__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$shellBaseTokens$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["departmentWorkspaceShellBaseStyle"],
        ...merged,
        ["--vc-record-rim"]: rim,
        ["--vc-label-accent"]: labelForRecord,
        ["--vc-header-rail-accent"]: headerRailRecord,
        ["--vc-drawer-header-bg"]: "#ffffff",
        ["--vc-drawer-body-veil"]: __TURBOPACK__imported__module__$5b$project$5d2f$styles$2f$tokens$2f$colors$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["neutral"].background,
        ["--vc-record-tab-underline"]: tabUnderline
    };
}
}),
"[project]/lib/visualContext/index.ts [app-ssr] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextRegistry$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/visualContext/contextRegistry.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextResolver$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/visualContext/contextResolver.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$contextStyle$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/visualContext/contextStyle.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$shellBaseTokens$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/visualContext/shellBaseTokens.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$visualContext$2f$accentFamily$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/visualContext/accentFamily.ts [app-ssr] (ecmascript)");
;
;
;
;
;
}),
"[project]/lib/workspace/workspaceChildcareInquiryOptionSets.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WORKSPACE_OPTION_SET_CHILDCARE_PROGRAM_URL",
    ()=>WORKSPACE_OPTION_SET_CHILDCARE_PROGRAM_URL,
    "WORKSPACE_OPTION_SET_CHILDCARE_SCHEDULE_URL",
    ()=>WORKSPACE_OPTION_SET_CHILDCARE_SCHEDULE_URL,
    "loadWorkspaceChildcareInquiryOptionSets",
    ()=>loadWorkspaceChildcareInquiryOptionSets,
    "prefetchWorkspaceChildcareInquiryOptionSets",
    ()=>prefetchWorkspaceChildcareInquiryOptionSets
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceAdminFetchDedupe.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace/workspaceDataFetch.ts [app-ssr] (ecmascript)");
;
;
const WORKSPACE_OPTION_SET_CHILDCARE_PROGRAM_URL = "/api/admin/option-sets/childcare_program_type";
const WORKSPACE_OPTION_SET_CHILDCARE_SCHEDULE_URL = "/api/admin/option-sets/childcare_schedule_type";
const OPTION_SET_TTL_MS = 1500;
async function loadWorkspaceChildcareInquiryOptionSets(init) {
    const i = init ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceDataFetch$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["workspaceDataFetchInit"])();
    const [programRes, scheduleRes] = await Promise.all([
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["dedupeAdminFetchWithTtl"])(WORKSPACE_OPTION_SET_CHILDCARE_PROGRAM_URL, i, OPTION_SET_TTL_MS),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2f$workspaceAdminFetchDedupe$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["dedupeAdminFetchWithTtl"])(WORKSPACE_OPTION_SET_CHILDCARE_SCHEDULE_URL, i, OPTION_SET_TTL_MS)
    ]);
    return {
        programRes,
        scheduleRes
    };
}
function prefetchWorkspaceChildcareInquiryOptionSets(init) {
    void loadWorkspaceChildcareInquiryOptionSets(init);
}
}),
"[project]/lib/enrollment/formatTourDateTime.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "formatTourDateTime",
    ()=>formatTourDateTime
]);
function formatTourDateTime(tourDateRaw, tourTimeRaw) {
    const tourDate = typeof tourDateRaw === "string" ? tourDateRaw.trim() : "";
    const tourTime = typeof tourTimeRaw === "string" ? tourTimeRaw.trim() : "";
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tourDate);
    const mmddyyyy = dateMatch ? `${dateMatch[2]}/${dateMatch[3]}/${dateMatch[1]}` : "";
    // Accept HTML <input type="time"> output: "HH:MM"
    const timeMatch24 = /^(\d{1,2}):(\d{2})$/.exec(tourTime);
    let hmAmPm = "";
    if (timeMatch24) {
        const hh = Math.min(23, Math.max(0, Number(timeMatch24[1])));
        const mm = Math.min(59, Math.max(0, Number(timeMatch24[2])));
        const ampm = hh >= 12 ? "PM" : "AM";
        const h12 = hh % 12 === 0 ? 12 : hh % 12;
        hmAmPm = `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
    } else if (tourTime) {
        // Light normalization for "9:30AM" / "9:30 am" etc.
        const m = /^(\d{1,2}):(\d{2})\s*([AaPp])[Mm]$/.exec(tourTime.replace(/\s+/g, ""));
        if (m) hmAmPm = `${Number(m[1])}:${m[2]} ${m[3].toUpperCase()}M`;
    }
    const hasDate = Boolean(mmddyyyy);
    const hasTime = Boolean(hmAmPm);
    if (!hasDate) return {
        display: "—",
        hasDate: false,
        hasTime: false
    };
    if (!hasTime) return {
        display: mmddyyyy,
        hasDate: true,
        hasTime: false
    };
    return {
        display: `${mmddyyyy} ${hmAmPm}`,
        hasDate: true,
        hasTime: true
    };
}
}),
"[project]/lib/config/queueDefinitionSchema.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "queueConfigSchema",
    ()=>queueConfigSchema,
    "queueDefinitionV1Schema",
    ()=>queueDefinitionV1Schema,
    "queueFilterSchema",
    ()=>queueFilterSchema,
    "validateQueueDefinition",
    ()=>validateQueueDefinition
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z>");
;
const StatusFilterSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal("status"),
    operator: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal("in"),
    values: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string())
}).strict();
const FieldFilterSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal("field"),
    field_key: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    operator: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "eq",
        "gt",
        "lt"
    ]),
    value: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].unknown()
}).strict();
const DateFilterSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal("date"),
    field: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    operator: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "today",
        "past_due"
    ])
}).strict();
const AssignmentFilterSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal("assignment"),
    operator: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "is_null",
        "equals"
    ]),
    value: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional()
}).strict().superRefine((val, ctx)=>{
    if (val.operator === "equals" && !val.value) {
        ctx.addIssue({
            code: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].ZodIssueCode.custom,
            message: "assignment.equals requires value",
            path: [
                "value"
            ]
        });
    }
    if (val.operator === "is_null" && val.value !== undefined) {
        ctx.addIssue({
            code: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].ZodIssueCode.custom,
            message: "assignment.is_null must not include value",
            path: [
                "value"
            ]
        });
    }
});
const ExceptionFilterSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal("exception"),
    operator: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal("exists"),
    exception_types: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string()).optional()
}).strict();
const queueFilterSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].union([
    StatusFilterSchema,
    FieldFilterSchema,
    DateFilterSchema,
    AssignmentFilterSchema,
    ExceptionFilterSchema
]).readonly();
const queueConfigSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    key: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1),
    label: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1),
    description: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional(),
    filters: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(queueFilterSchema),
    sort: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
        field: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1),
        direction: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
            "asc",
            "desc"
        ])
    }).strict()).optional(),
    limit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().int().positive().optional(),
    priority: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "standard",
        "attention",
        "critical"
    ]).optional(),
    display: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "list",
        "cards"
    ]).optional(),
    group_by: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1).optional()
}).strict().readonly();
const queueUiRowPreviewSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    variant: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "crm_compact",
        "basic"
    ]).default("basic"),
    fields: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "title",
        "status",
        "primary_contact",
        "phone",
        "email",
        "child_name",
        "program",
        "desired_start_date",
        "tour_date"
    ])).default([
        "title",
        "status"
    ]),
    actions: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "open",
        "call",
        "email"
    ])).default([
        "open"
    ])
}).strict();
const queueUiSectionSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    key: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1),
    label: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1),
    tone: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "standard",
        "attention",
        "critical"
    ]).optional(),
    queue_keys: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1)).nonempty()
}).strict();
const queueUiSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    layout: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "pipeline_with_attention",
        "single_section"
    ]).default("single_section"),
    primary_total_label: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1).optional(),
    primary_total_queue: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1).optional(),
    sections: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(queueUiSectionSchema).nonempty().optional(),
    row_preview: queueUiRowPreviewSchema.optional()
}).strict();
const queueDefinitionV1Schema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    version: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal(1),
    entity_type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        "job",
        "schedule",
        "opportunity"
    ]),
    queues: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(queueConfigSchema).nonempty(),
    ui: queueUiSchema.optional()
}).strict().readonly();
function validateQueueDefinition(input) {
    return queueDefinitionV1Schema.parse(input);
}
}),
"[project]/lib/recordChrome/types.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "applyOverviewSectionOrder",
    ()=>applyOverviewSectionOrder,
    "recordOpportunityDrawerLayoutIncludesSection",
    ()=>recordOpportunityDrawerLayoutIncludesSection
]);
function applyOverviewSectionOrder(sections, order) {
    if (!order?.length) return sections;
    const byKey = new Map(sections.map((s)=>[
            s.key,
            s
        ]));
    const used = new Set();
    const out = [];
    for (const k of order){
        const s = byKey.get(k);
        if (s && !used.has(k)) {
            out.push(s);
            used.add(k);
        }
    }
    for (const s of sections){
        if (!used.has(s.key)) out.push(s);
    }
    return out;
}
function recordOpportunityDrawerLayoutIncludesSection(cfg, sectionKey) {
    if (!cfg) return false;
    const order = cfg.overview_section_order;
    if (Array.isArray(order) && order.some((k)=>k === sectionKey)) return true;
    const ws = cfg.inquiry_workflow_sections;
    if (Array.isArray(ws) && ws.some((s)=>s?.key === sectionKey)) return true;
    return false;
}
}),
"[project]/lib/admin/adHocChargeTypes.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Admin ad-hoc charge categories (UI + request metadata).
 * Map to ledger / revenue rules in a later pass; backend may ignore until wired.
 */ __turbopack_context__.s([
    "AD_HOC_CHARGE_TYPE_OPTIONS",
    ()=>AD_HOC_CHARGE_TYPE_OPTIONS
]);
const AD_HOC_CHARGE_TYPE_OPTIONS = [
    {
        value: "service_balance",
        label: "Service balance"
    },
    {
        value: "additional_service",
        label: "Additional service"
    },
    {
        value: "fee_adjustment",
        label: "Fee / adjustment"
    },
    {
        value: "deposit",
        label: "Deposit"
    },
    {
        value: "other",
        label: "Other"
    }
];
}),
"[project]/lib/admin/paymentRunFeedback.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "adminPaymentRunFeedback",
    ()=>adminPaymentRunFeedback
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-ssr] (ecmascript)");
;
function adminPaymentRunFeedback(json, httpOk) {
    const status = typeof json.status === "string" ? json.status : null;
    const amountCents = typeof json.amount_cents === "number" ? json.amount_cents : null;
    const amt = amountCents != null && Number.isFinite(amountCents) ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatMoneyFromCents"])(amountCents) : null;
    const succeeded = httpOk && json.ok === true;
    if (succeeded) {
        const parts = [
            "Payment succeeded"
        ];
        if (amt) parts.push(amt);
        if (status) parts.push(`Processor: ${status}`);
        return {
            ok: true,
            message: parts.join(" · ")
        };
    }
    const err = typeof json.error === "string" && json.error.trim() || typeof json.detail === "string" && json.detail.trim() || "Payment failed";
    const parts = [
        err
    ];
    if (amt) parts.push(`Amount: ${amt}`);
    if (status) parts.push(`Processor: ${status}`);
    return {
        ok: false,
        message: parts.join(" · ")
    };
}
}),
"[project]/lib/admin/jobPaymentSummary.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Job-level payment summary derived from payments rows (not job status).
 *
 * @deprecated For server-side job balance and paid totals, use `computeJobBalanceSnapshot` and
 *   `getPostedAllocatedCentsForJob` from `@/lib/admin/jobPaymentBalances` instead of
 *   `computeJobPaymentSummary` / `sumPaidAmountCents`. When the job has non-void `charges`, those
 *   helpers use charge totals and `payment_allocations.charge_id` (plus legacy null-charge job rows).
 */ __turbopack_context__.s([
    "computeJobPaymentSummary",
    ()=>computeJobPaymentSummary,
    "effectivePaymentRowStatusKey",
    ()=>effectivePaymentRowStatusKey,
    "formatCanonicalPaymentStatusForDisplay",
    ()=>formatCanonicalPaymentStatusForDisplay,
    "getCanonicalPaymentStatusVariant",
    ()=>getCanonicalPaymentStatusVariant,
    "isPaymentRowFailed",
    ()=>isPaymentRowFailed,
    "isPaymentRowPaid",
    ()=>isPaymentRowPaid,
    "jobPaymentStatusKeyLabel",
    ()=>jobPaymentStatusKeyLabel,
    "legacyPaymentStatusKeyFromSnapshot",
    ()=>legacyPaymentStatusKeyFromSnapshot,
    "paymentRowStatusBadgeProps",
    ()=>paymentRowStatusBadgeProps,
    "paymentRowStatusDisplayLabel",
    ()=>paymentRowStatusDisplayLabel,
    "sumPaidAmountCents",
    ()=>sumPaidAmountCents
]);
function legacyPaymentStatusKeyFromSnapshot(snap) {
    const { job_total_cents, paid_amount_cents, outstanding_balance_cents } = snap;
    if (!paid_amount_cents || paid_amount_cents <= 0) return "unpaid";
    if (job_total_cents != null && job_total_cents > 0 && outstanding_balance_cents != null && outstanding_balance_cents <= 0) {
        return "paid";
    }
    if (outstanding_balance_cents != null && outstanding_balance_cents > 0) return "partial";
    return "partial";
}
function effectivePaymentRowStatusKey(row) {
    const canon = row.status != null && String(row.status).trim() !== "" ? String(row.status).trim().toLowerCase() : "";
    if (canon === "posted") return "paid";
    if (canon === "failed") return "failed";
    if (canon === "voided") return "voided";
    if (canon === "pending") return "pending";
    const paidAt = row.paid_at != null && String(row.paid_at).trim() !== "";
    if (paidAt) return "paid";
    const fromNested = row.payment_statuses?.key != null ? String(row.payment_statuses.key).trim().toLowerCase() : "";
    const sk = (row.status_key != null ? String(row.status_key) : "").trim().toLowerCase();
    const k = fromNested || sk;
    if (k === "paid" || k === "succeeded" || k === "complete" || k === "completed") return "paid";
    if (k === "failed") return "failed";
    if (k) return k;
    return "pending";
}
function isPaymentRowPaid(row) {
    return effectivePaymentRowStatusKey(row) === "paid";
}
function isPaymentRowFailed(row) {
    return effectivePaymentRowStatusKey(row) === "failed";
}
function sumPaidAmountCents(rows) {
    let t = 0;
    for (const row of rows){
        if (!isPaymentRowPaid(row)) continue;
        const n = row.amount_cents;
        if (typeof n === "number" && Number.isFinite(n) && n > 0) t += Math.round(n);
    }
    return t;
}
function computeJobPaymentSummary(originalAmountCents, rows) {
    const paid_amount_cents = sumPaidAmountCents(rows);
    const balance_due_cents = originalAmountCents != null && Number.isFinite(originalAmountCents) && originalAmountCents > 0 ? Math.max(0, Math.round(originalAmountCents) - paid_amount_cents) : null;
    const hasRows = rows.length > 0;
    const anyPaid = paid_amount_cents > 0;
    const allFailed = hasRows && rows.every((r)=>{
        const st = effectivePaymentRowStatusKey(r);
        return st === "failed";
    });
    let payment_status_key;
    if (allFailed && !anyPaid) {
        payment_status_key = "failed";
    } else if (!anyPaid) {
        payment_status_key = "unpaid";
    } else if (balance_due_cents != null && balance_due_cents > 0) {
        payment_status_key = "partial";
    } else if (balance_due_cents != null && balance_due_cents <= 0 && originalAmountCents != null && originalAmountCents > 0) {
        payment_status_key = "paid";
    } else {
        payment_status_key = "partial";
    }
    return {
        original_amount_cents: originalAmountCents != null && Number.isFinite(originalAmountCents) && originalAmountCents > 0 ? Math.round(originalAmountCents) : null,
        paid_amount_cents,
        balance_due_cents,
        payment_status_key
    };
}
function jobPaymentStatusKeyLabel(key) {
    switch(key){
        case "unpaid":
            return "Unpaid";
        case "partial":
            return "Partially paid";
        case "paid":
            return "Paid in full";
        case "failed":
            return "Payment failed";
        default:
            return key;
    }
}
function formatCanonicalPaymentStatusForDisplay(status) {
    const s = (status ?? "").trim().toLowerCase();
    if (!s) return "—";
    if (s === "posted") return "Posted";
    if (s === "pending") return "Pending";
    if (s === "failed") return "Failed";
    if (s === "voided") return "Voided";
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function paymentRowStatusDisplayLabel(row) {
    const raw = row.status != null && String(row.status).trim() !== "" ? String(row.status).trim().toLowerCase() : "";
    if (raw) return formatCanonicalPaymentStatusForDisplay(row.status);
    const legacy = effectivePaymentRowStatusKey(row);
    if (legacy === "paid") return "Posted";
    if (legacy === "pending") return "Pending";
    if (legacy === "failed") return "Failed";
    if (legacy === "voided") return "Voided";
    return legacy ? legacy.charAt(0).toUpperCase() + legacy.slice(1) : "—";
}
function getCanonicalPaymentStatusVariant(canonicalStatus) {
    const s = (canonicalStatus ?? "").trim().toLowerCase();
    if (s === "posted") return "success";
    if (s === "pending") return "info";
    if (s === "failed") return "error";
    if (s === "voided") return "neutral";
    return "neutral";
}
function variantForLegacyEffectivePaymentKey(legacy) {
    const k = legacy.toLowerCase();
    if (k === "paid") return "success";
    if (k === "pending") return "info";
    if (k === "failed") return "error";
    if (k === "voided") return "neutral";
    return "neutral";
}
function paymentRowStatusBadgeProps(row) {
    const raw = row.status != null && String(row.status).trim() !== "" ? String(row.status).trim().toLowerCase() : "";
    if (raw) {
        return {
            label: formatCanonicalPaymentStatusForDisplay(row.status),
            variant: getCanonicalPaymentStatusVariant(row.status)
        };
    }
    return {
        label: paymentRowStatusDisplayLabel(row),
        variant: variantForLegacyEffectivePaymentKey(effectivePaymentRowStatusKey(row))
    };
}
}),
"[project]/lib/recordChrome/opportunityRecordActionMap.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Maps `record_actions.event_key` for entity_type=opportunity → PATCH /api/admin/opportunities/[id] body.
 * Keeps execution aligned with admin mutation + assertAllowedStatusKey + emitStatusChangedEvent.
 */ __turbopack_context__.s([
    "OPPORTUNITY_RECORD_ACTION_EVENT_KEYS",
    ()=>OPPORTUNITY_RECORD_ACTION_EVENT_KEYS,
    "mapOpportunityRecordActionToPatch",
    ()=>mapOpportunityRecordActionToPatch
]);
const OPPORTUNITY_RECORD_ACTION_EVENT_KEYS = [
    "qualify_opportunity",
    "start_quote",
    "mark_won",
    "mark_lost"
];
function mapOpportunityRecordActionToPatch(eventKey) {
    switch(eventKey){
        case "qualify_opportunity":
            return {
                status_key: "contacted"
            };
        case "start_quote":
            return {
                status_key: "tour_scheduled"
            };
        case "mark_won":
            return {
                status_key: "enrolled"
            };
        case "mark_lost":
            return {
                status_key: "lost",
                lost_reason: "Marked lost (workspace)"
            };
        default:
            return null;
    }
}
}),
"[project]/lib/recordChrome/executeOpportunityRecordAction.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "executeOpportunityRecordAction",
    ()=>executeOpportunityRecordAction
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$recordChrome$2f$opportunityRecordActionMap$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/recordChrome/opportunityRecordActionMap.ts [app-ssr] (ecmascript)");
;
async function executeOpportunityRecordAction(params) {
    const body = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$recordChrome$2f$opportunityRecordActionMap$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["mapOpportunityRecordActionToPatch"])(params.eventKey);
    if (!body) {
        return {
            ok: false,
            error: "Unsupported action"
        };
    }
    const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(params.opportunityId)}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
    const json = await res.json().catch(()=>({}));
    if (!res.ok) {
        return {
            ok: false,
            error: json.error ?? "Request failed",
            status: res.status
        };
    }
    return {
        ok: true,
        data: json
    };
}
}),
"[project]/lib/admin/activitySignals.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Activity Signals V1 — derived from workflow_events + org config (metadata.activity_signal_rules).
 * No persisted derived state; no hardcoded thresholds.
 */ __turbopack_context__.s([
    "enrichOpportunityQueueRowsWithActivitySignals",
    ()=>enrichOpportunityQueueRowsWithActivitySignals,
    "fetchLatestWorkflowEventByOpportunityId",
    ()=>fetchLatestWorkflowEventByOpportunityId,
    "formatActivityRelativeShort",
    ()=>formatActivityRelativeShort,
    "getActivitySignalForEntity",
    ()=>getActivitySignalForEntity,
    "parseActivitySignalRulesFromMetadata",
    ()=>parseActivitySignalRulesFromMetadata,
    "resolveActivitySignalRules",
    ()=>resolveActivitySignalRules,
    "summarizeWorkflowEventForSignal",
    ()=>summarizeWorkflowEventForSignal
]);
function normalizeRulesEntityType(raw) {
    const s = raw.trim().toLowerCase();
    if (s === "opportunity") return "opportunities";
    return s;
}
function resolveActivitySignalRules(workUnitMetadata, departmentMetadata) {
    const fromWu = parseActivitySignalRulesFromMetadata(workUnitMetadata);
    if (fromWu?.length) return fromWu;
    return parseActivitySignalRulesFromMetadata(departmentMetadata);
}
function parseActivitySignalRulesFromMetadata(metadata) {
    if (!metadata || typeof metadata !== "object") return null;
    const root = metadata;
    const raw = root.activity_signal_rules;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const out = [];
    for (const entry of raw){
        if (!entry || typeof entry !== "object") continue;
        const o = entry;
        const key = typeof o.key === "string" ? o.key.trim() : "";
        const entity_type = typeof o.entity_type === "string" ? o.entity_type.trim() : "";
        const label = typeof o.label === "string" ? o.label.trim() : "";
        const thresholdRaw = o.threshold_minutes;
        const threshold_minutes = typeof thresholdRaw === "number" && Number.isFinite(thresholdRaw) ? thresholdRaw : NaN;
        const severity = o.severity;
        if (!key || !entity_type || !label) continue;
        if (![
            "low",
            "medium",
            "high"
        ].includes(String(severity))) continue;
        if (!(threshold_minutes >= 0)) continue;
        let status_keys;
        if (Array.isArray(o.status_keys)) {
            const sk = o.status_keys.filter((x)=>typeof x === "string").map((x)=>x.trim()).filter(Boolean);
            if (sk.length) status_keys = sk;
        }
        out.push({
            key,
            entity_type,
            status_keys,
            threshold_minutes,
            severity: severity,
            label
        });
    }
    return out.length ? out : null;
}
function summarizeWorkflowEventForSignal(ev) {
    const t = (ev.event_type ?? "").trim();
    const p = ev.payload && typeof ev.payload === "object" ? ev.payload : {};
    if (t === "message_received") return "SMS received";
    if (t === "message_sent") return "SMS sent";
    if (t === "opportunity_status_changed" || t === "entity_status_changed") {
        const o = p.old_status_key != null ? String(p.old_status_key) : "—";
        const n = p.new_status_key != null ? String(p.new_status_key) : "—";
        return `Status: ${o} → ${n}`;
    }
    if (t === "note_added") return "Note added";
    if (t === "action_executed") {
        const k = p.action_key != null ? String(p.action_key) : "";
        return k ? `Action: ${k}` : "Action executed";
    }
    return t || "Activity";
}
function formatActivityRelativeShort(iso, nowMs) {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    const diffMs = Math.max(0, nowMs - t);
    const s = Math.floor(diffMs / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    if (m > 0) return `${m}m ago`;
    return "just now";
}
function getActivitySignalForEntity(input) {
    const nowMs = input.nowMs ?? Date.now();
    const sorted = [
        ...input.events
    ].sort((a, b)=>Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
    const latest = sorted[0] ?? null;
    const last_activity_at = latest?.occurred_at ?? null;
    const last_activity_type = latest?.event_type ?? null;
    const last_activity_summary = latest ? summarizeWorkflowEventForSignal(latest) : null;
    const rules = input.rules;
    if (!rules?.length || !last_activity_at) {
        return {
            last_activity_at,
            last_activity_type,
            last_activity_summary,
            stale_signal: null
        };
    }
    const eventMs = Date.parse(last_activity_at);
    if (!Number.isFinite(eventMs)) {
        return {
            last_activity_at,
            last_activity_type,
            last_activity_summary,
            stale_signal: null
        };
    }
    const ageMinutes = (nowMs - eventMs) / 60_000;
    const sk = input.entity.status_key != null ? String(input.entity.status_key).trim() : "";
    for (const rule of rules){
        if (normalizeRulesEntityType(rule.entity_type) !== "opportunities") continue;
        const allowStatuses = rule.status_keys;
        if (allowStatuses?.length) {
            if (!allowStatuses.includes(sk)) continue;
        }
        if (ageMinutes > rule.threshold_minutes) {
            return {
                last_activity_at,
                last_activity_type,
                last_activity_summary,
                stale_signal: {
                    key: rule.key,
                    label: rule.label,
                    severity: rule.severity,
                    threshold_minutes: rule.threshold_minutes
                }
            };
        }
    }
    return {
        last_activity_at,
        last_activity_type,
        last_activity_summary,
        stale_signal: null
    };
}
function collapseLatestEventPerEntity(rows) {
    const m = new Map();
    for (const row of rows){
        const id = row.entity_id != null ? String(row.entity_id).trim() : "";
        if (!id || m.has(id)) continue;
        m.set(id, row);
    }
    return m;
}
function mergeLatestMaps(a, b) {
    for (const [id, row] of b){
        const existing = a.get(id);
        if (!existing) {
            a.set(id, row);
            continue;
        }
        if (Date.parse(row.occurred_at) > Date.parse(existing.occurred_at)) {
            a.set(id, row);
        }
    }
}
async function fetchLatestWorkflowEventByOpportunityId(supabase, orgId, opportunityIds) {
    const unique = [
        ...new Set(opportunityIds.map((x)=>String(x).trim()).filter(Boolean))
    ];
    const latest = new Map();
    if (!unique.length) return latest;
    const chunkSize = 80;
    for(let i = 0; i < unique.length; i += chunkSize){
        const chunk = unique.slice(i, i + chunkSize);
        const limit = Math.min(6000, Math.max(200, chunk.length * 40));
        const { data, error } = await supabase.from("workflow_events").select("occurred_at, event_type, entity_id, payload").eq("org_id", orgId).eq("entity_type", "opportunities").in("entity_id", chunk).order("occurred_at", {
            ascending: false
        }).limit(limit);
        if (error) {
            throw new Error(`fetchLatestWorkflowEventByOpportunityId: ${error.message}`);
        }
        const rows = data ?? [];
        mergeLatestMaps(latest, collapseLatestEventPerEntity(rows));
    }
    return latest;
}
async function enrichOpportunityQueueRowsWithActivitySignals(params) {
    const rules = resolveActivitySignalRules(params.workUnitMetadata, params.departmentMetadata);
    const ids = params.rows.map((r)=>r.id);
    let latestById = new Map();
    try {
        latestById = await fetchLatestWorkflowEventByOpportunityId(params.supabase, params.orgId, ids);
    } catch  {
        latestById = new Map();
    }
    const nowMs = params.nowMs ?? Date.now();
    return params.rows.map((row)=>{
        const ev = latestById.get(row.id);
        const events = ev ? [
            ev
        ] : [];
        const sig = getActivitySignalForEntity({
            events,
            entity: {
                id: row.id,
                status_key: row.status_key
            },
            rules,
            nowMs
        });
        return {
            ...row,
            last_activity_at: sig.last_activity_at,
            last_activity_type: sig.last_activity_type,
            last_activity_summary: sig.last_activity_summary,
            stale_signal: sig.stale_signal
        };
    });
}
}),
"[project]/lib/admin/activityTimelineFormat.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Generic Activity Log / workflow_event display formatting (frontend-only).
 * Entity-specific label maps are passed via options — no workflow_events changes.
 */ __turbopack_context__.s([
    "chooseLatestDatedNoteLine",
    ()=>chooseLatestDatedNoteLine,
    "extractDatedNoteLineTimestampMs",
    ()=>extractDatedNoteLineTimestampMs,
    "formatActivityQueueNotesBlobPreview",
    ()=>formatActivityQueueNotesBlobPreview,
    "formatActivitySummaryHumanizingKeys",
    ()=>formatActivitySummaryHumanizingKeys,
    "formatActivityTimelineEvent",
    ()=>formatActivityTimelineEvent,
    "formatDatedNoteLinePreview",
    ()=>formatDatedNoteLinePreview,
    "formatQueueNoteDateTime",
    ()=>formatQueueNoteDateTime,
    "getActivityTimelineActorLabel",
    ()=>getActivityTimelineActorLabel,
    "humanizeSnakeCaseToken",
    ()=>humanizeSnakeCaseToken,
    "parseBracketedTimestamp",
    ()=>parseBracketedTimestamp,
    "parseLineLeadingDate",
    ()=>parseLineLeadingDate,
    "truncateNoteLine",
    ()=>truncateNoteLine
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/adminFormatters.ts [app-ssr] (ecmascript)");
;
const DEFAULT_INBOUND_MESSAGE_TYPES = [
    "message_received"
];
const NOTE_LINE_MAX = 120;
function lookupMapLabel(map, key) {
    if (!map || !key) return undefined;
    return map[key] ?? map[key.toLowerCase()];
}
function strOrEmpty(v) {
    return v != null && String(v).trim() !== "" ? String(v).trim() : "";
}
function firstNonEmpty(...vals) {
    for (const v of vals){
        const s = strOrEmpty(v);
        if (s) return s;
    }
    return "";
}
function humanizeSnakeCaseToken(raw, statusKeyLabels) {
    const s = raw.trim();
    if (!s) return "";
    const lower = s.toLowerCase();
    const fromMap = lookupMapLabel(statusKeyLabels, lower);
    if (fromMap) return fromMap;
    if (!/^[a-z][a-z0-9_]*$/i.test(s)) return s;
    return s.split("_").filter(Boolean).map((w)=>w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
function formatActivitySummaryHumanizingKeys(summary, statusKeyLabels) {
    const s = summary.trim();
    if (!s) return s;
    const arrowSplit = s.split(/\s*(?:→|->)\s*/);
    if (arrowSplit.length >= 2) {
        return arrowSplit.map((part)=>{
            const p = part.trim();
            if (!p) return p;
            if (/^[a-z][a-z0-9_]*$/i.test(p)) return humanizeSnakeCaseToken(p, statusKeyLabels);
            return p;
        }).filter(Boolean).join(" → ");
    }
    const tokens = s.split(/\s+/);
    return tokens.map((tok)=>{
        const clean = tok.replace(/^[,;.]+|[,;.]+$/g, "");
        if (/^[a-z][a-z0-9_]*$/i.test(clean)) return humanizeSnakeCaseToken(clean, statusKeyLabels);
        return tok;
    }).join(" ");
}
function readActorObject(payload) {
    const a = payload.actor;
    if (a && typeof a === "object" && !Array.isArray(a)) return a;
    return null;
}
function toTypeSet(list) {
    if (!list?.length) return new Set();
    return new Set(list.map((x)=>x.trim().toLowerCase()).filter(Boolean));
}
function inboundMessageTypeSet(options) {
    if (options?.messageChannelInboundTypes?.length) {
        return toTypeSet(options.messageChannelInboundTypes);
    }
    return new Set(DEFAULT_INBOUND_MESSAGE_TYPES.map((x)=>x.toLowerCase()));
}
function getActivityTimelineActorLabel(payload, eventType, options) {
    const inbound = inboundMessageTypeSet(options);
    const et = (eventType ?? "").trim();
    const etLower = et.toLowerCase();
    const actorObj = readActorObject(payload);
    const actorString = typeof payload.actor === "string" && payload.actor.trim() ? payload.actor.trim().toLowerCase() : "";
    const actorType = strOrEmpty(actorObj?.type).toLowerCase() || actorString || strOrEmpty(payload.actor_type).toLowerCase();
    const name = firstNonEmpty(payload.actor_name, payload.actor_display_name, payload.user_name, payload.staff_name, actorObj?.name, actorObj?.full_name, actorObj?.display_name);
    const email = firstNonEmpty(payload.actor_email, payload.user_email, actorObj?.email);
    if (name) return name;
    if (email) return email;
    if (inbound.has(etLower) && actorType === "contact") return "Contact";
    if (actorType === "contact") return "Contact";
    if (actorType === "system") return "System";
    if (actorType === "automation" || actorType === "workflow" || actorType === "runner") return "Automation";
    const source = strOrEmpty(payload.source).toLowerCase();
    const trigger = strOrEmpty(payload.trigger).toLowerCase();
    if (source === "automation" || source === "workflow" || trigger === "automation" || trigger === "workflow") {
        return "Automation";
    }
    if (payload.actor_user_id != null && String(payload.actor_user_id).trim()) return "Staff";
    if (actorString === "system") return "System";
    if (actorString === "automation") return "Automation";
    return "—";
}
function resolveEventTitle(eventType, options) {
    const t = (eventType ?? "").trim();
    if (!t) return options.defaultEmptyEventTitle ?? "Event";
    const mapped = lookupMapLabel(options.eventTypeLabels, t);
    if (mapped) return mapped;
    return humanizeSnakeCaseToken(t.replace(/\.+/g, "_"), options.statusKeyLabels);
}
function resolveEventDetail(event, options) {
    const t = (event.event_type ?? "").trim();
    const tLower = t.toLowerCase();
    const payload = event.payload;
    const statusKeys = options.statusKeyLabels;
    const summaryRaw = payload.summary;
    if (typeof summaryRaw === "string" && summaryRaw.trim()) {
        return formatActivitySummaryHumanizingKeys(summaryRaw.trim(), statusKeys);
    }
    const transitionTypes = toTypeSet(options.statusTransitionEventTypes);
    if (transitionTypes.size > 0 && transitionTypes.has(tLower)) {
        const o = strOrEmpty(payload.old_status_key);
        const n = strOrEmpty(payload.new_status_key);
        const oL = o ? humanizeSnakeCaseToken(o, statusKeys) : "—";
        const nL = n ? humanizeSnakeCaseToken(n, statusKeys) : "—";
        return `${oL} → ${nL}`;
    }
    const actionTypes = toTypeSet(options.actionEventTypes);
    if (actionTypes.size > 0 && actionTypes.has(tLower)) {
        const k = strOrEmpty(payload.action_key);
        return k ? humanizeSnakeCaseToken(k.replace(/\./g, "_"), statusKeys) : null;
    }
    return null;
}
function formatActivityTimelineEvent(event, options = {}) {
    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload : {};
    const title = resolveEventTitle(event.event_type, options);
    const detail = resolveEventDetail({
        ...event,
        payload
    }, options);
    const actorLabel = getActivityTimelineActorLabel(payload, event.event_type, options);
    return {
        title,
        detail,
        actorLabel
    };
}
function formatQueueNoteDateTime(ms) {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return "";
    const s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$adminFormatters$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatDateTimeLocal"])(d);
    return s === "-" ? "" : s;
}
function parseBracketedTimestamp(line) {
    const trimmed = line.trim();
    const m = trimmed.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
    if (!m) return null;
    const ts = m[1].trim();
    const ms = Date.parse(ts);
    if (!Number.isFinite(ms)) return null;
    return {
        rest: m[2].trim().replace(/\s+/g, " "),
        ms
    };
}
function parseLineLeadingDate(line) {
    const trimmed = line.trim();
    const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/);
    if (iso) {
        const ms = Date.parse(iso[0]);
        if (Number.isFinite(ms)) {
            const rest = trimmed.slice(iso[0].length).replace(/^\s*[—\-:|\t]+\s*/, "").trim().replace(/\s+/g, " ");
            return {
                rest,
                ms
            };
        }
    }
    const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
    if (us) {
        const month = Number(us[1]);
        const day = Number(us[2]);
        let y = Number(us[3]);
        if (y < 100) y += 2000;
        const ms = Date.UTC(y, month - 1, day, 0, 0, 0, 0);
        if (Number.isFinite(ms)) {
            const rest = trimmed.slice(us[0].length).replace(/^\s*[—\-:|\t]+\s*/, "").trim().replace(/\s+/g, " ");
            return {
                rest,
                ms
            };
        }
    }
    return null;
}
function extractDatedNoteLineTimestampMs(line) {
    const b = parseBracketedTimestamp(line);
    if (b) return b.ms;
    const p = parseLineLeadingDate(line);
    return p ? p.ms : null;
}
function chooseLatestDatedNoteLine(lines) {
    const scored = lines.map((line)=>({
            line,
            ms: extractDatedNoteLineTimestampMs(line)
        }));
    const dated = scored.filter((s)=>s.ms != null);
    if (dated.length) {
        dated.sort((a, b)=>b.ms - a.ms);
        return dated[0].line;
    }
    return lines[lines.length - 1];
}
function truncateNoteLine(text, maxLen = NOTE_LINE_MAX) {
    const t = text.trim();
    if (t.length <= maxLen) return t;
    return `${t.slice(0, maxLen)}…`;
}
function formatDatedNoteLinePreview(line, opts) {
    const trimmed = line.trim().replace(/\s+/g, " ");
    if (!trimmed) return null;
    const dateFirst = Boolean(opts?.dateFirst);
    const bracket = parseBracketedTimestamp(trimmed);
    if (bracket) {
        const dateStr = formatQueueNoteDateTime(bracket.ms);
        const body = bracket.rest;
        if (!body) return dateStr || null;
        const bodyShort = truncateNoteLine(body);
        if (!dateStr) return bodyShort;
        return dateFirst ? `${dateStr} · ${bodyShort}` : `${bodyShort} · ${dateStr}`;
    }
    const parsed = parseLineLeadingDate(trimmed);
    if (parsed) {
        const dateStr = formatQueueNoteDateTime(parsed.ms);
        const body = parsed.rest;
        if (body) {
            const bodyShort = truncateNoteLine(body);
            if (!dateStr) return bodyShort;
            return dateFirst ? `${dateStr} · ${bodyShort}` : `${bodyShort} · ${dateStr}`;
        }
        return dateStr || null;
    }
    return truncateNoteLine(trimmed);
}
function formatActivityQueueNotesBlobPreview(raw, opts) {
    const blob = (raw ?? "").trim();
    if (!blob) return null;
    const lines = blob.split(/\r?\n/).map((l)=>l.trim()).filter(Boolean);
    const pick = lines.length === 0 ? blob.replace(/\s+/g, " ") : lines.length === 1 ? lines[0] : chooseLatestDatedNoteLine(lines);
    return formatDatedNoteLinePreview(pick, opts);
}
}),
"[project]/lib/admin/opportunityActivityTimelineFormat.ts [app-ssr] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

/**
 * Opportunity Activity Log / queue chrome — thin config on generic activity formatters.
 */ __turbopack_context__.s([
    "OPPORTUNITY_ACTIVITY_STATUS_KEY_LABELS",
    ()=>OPPORTUNITY_ACTIVITY_STATUS_KEY_LABELS,
    "formatOpportunityActivityTimelineEvent",
    ()=>formatOpportunityActivityTimelineEvent,
    "formatOpportunityQueueNotesPreview",
    ()=>formatOpportunityQueueNotesPreview,
    "getWorkflowActivityActorLabel",
    ()=>getWorkflowActivityActorLabel,
    "getWorkflowActivityEventDetail",
    ()=>getWorkflowActivityEventDetail,
    "getWorkflowActivityEventTitle",
    ()=>getWorkflowActivityEventTitle,
    "humanizeOpportunitySnakeCaseToken",
    ()=>humanizeOpportunitySnakeCaseToken,
    "opportunityActivityTimelineOptions",
    ()=>opportunityActivityTimelineOptions
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$activityTimelineFormat$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/admin/activityTimelineFormat.ts [app-ssr] (ecmascript)");
;
const OPPORTUNITY_ACTIVITY_STATUS_KEY_LABELS = {
    new_inquiry: "New Inquiry",
    contact_attempted: "Contact Attempted",
    tour_scheduled: "Tour Scheduled"
};
const OPPORTUNITY_EVENT_TYPE_LABELS = {
    opportunity_status_changed: "Status changed",
    entity_status_changed: "Status changed",
    message_received: "SMS received",
    message_sent: "SMS sent",
    note_added: "Note added",
    action_executed: "Action completed"
};
const opportunityActivityTimelineOptions = {
    eventTypeLabels: OPPORTUNITY_EVENT_TYPE_LABELS,
    statusKeyLabels: OPPORTUNITY_ACTIVITY_STATUS_KEY_LABELS,
    statusTransitionEventTypes: [
        "opportunity_status_changed",
        "entity_status_changed"
    ],
    actionEventTypes: [
        "action_executed"
    ]
};
function formatOpportunityActivityTimelineEvent(event) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$activityTimelineFormat$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatActivityTimelineEvent"])(event, opportunityActivityTimelineOptions);
}
function getWorkflowActivityEventTitle(eventType) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$activityTimelineFormat$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatActivityTimelineEvent"])({
        event_type: eventType,
        payload: {}
    }, opportunityActivityTimelineOptions).title;
}
function getWorkflowActivityEventDetail(eventType, payload) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$activityTimelineFormat$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatActivityTimelineEvent"])({
        event_type: eventType,
        payload
    }, opportunityActivityTimelineOptions).detail;
}
function getWorkflowActivityActorLabel(payload, eventType) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$activityTimelineFormat$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getActivityTimelineActorLabel"])(payload, eventType, opportunityActivityTimelineOptions);
}
;
function formatOpportunityQueueNotesPreview(raw) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$activityTimelineFormat$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatActivityQueueNotesBlobPreview"])(raw, {
        dateFirst: true
    });
}
function humanizeOpportunitySnakeCaseToken(raw) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$admin$2f$activityTimelineFormat$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["humanizeSnakeCaseToken"])(raw, OPPORTUNITY_ACTIVITY_STATUS_KEY_LABELS);
}
;
}),
"[project]/lib/quoteIntake/workflows/opportunityCleaningQuoteV1.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OPPORTUNITY_CLEANING_QUOTE_INTAKE_V1",
    ()=>OPPORTUNITY_CLEANING_QUOTE_INTAKE_V1,
    "getQuoteIntakeWorkflowOrThrow",
    ()=>getQuoteIntakeWorkflowOrThrow
]);
const OPPORTUNITY_CLEANING_QUOTE_INTAKE_V1 = {
    workflow_key: "opportunity_cleaning_quote_v1",
    entity_type: "opportunity",
    vertical_slug: "cleaning",
    label: "Cleaning quote",
    fields: [
        {
            id: "sqft_tier",
            quote_input_key: "square_footage",
            label: "Square footage",
            input: "select",
            required: true,
            sort_order: 10,
            option_source: {
                kind: "cleaning_catalog",
                key: "square_footage_tiers"
            },
            pricing_role: "square_footage_tier"
        },
        {
            id: "frequency",
            quote_input_key: "frequency",
            label: "Frequency",
            input: "select",
            required: true,
            sort_order: 20,
            option_source: {
                kind: "cleaning_catalog",
                key: "pricing_frequencies"
            },
            pricing_role: "cleaning_frequency"
        },
        {
            id: "cleaning_type",
            quote_input_key: "cleaning_type",
            label: "Cleaning type",
            input: "select",
            required: true,
            sort_order: 30,
            option_source: {
                kind: "option_set",
                set_key: "cleaning_type"
            },
            pricing_role: "cleaning_service",
            full_width: true
        },
        {
            id: "bedrooms",
            quote_input_key: "bedrooms",
            label: "Bedrooms",
            input: "select",
            required: false,
            sort_order: 40,
            option_source: {
                kind: "option_set",
                set_key: "bedrooms_booking"
            },
            pricing_role: "none"
        },
        {
            id: "bathrooms",
            quote_input_key: "bathrooms",
            label: "Bathrooms",
            input: "select",
            required: false,
            sort_order: 50,
            option_source: {
                kind: "option_set",
                set_key: "bathrooms_booking"
            },
            pricing_role: "none"
        },
        {
            id: "addons",
            quote_input_key: "add_ons",
            label: "Add-ons",
            input: "multiselect",
            required: false,
            sort_order: 60,
            option_source: {
                kind: "cleaning_catalog",
                key: "addons"
            },
            pricing_role: "addons",
            full_width: true
        }
    ]
};
function getQuoteIntakeWorkflowOrThrow(workflowKey) {
    if (workflowKey === OPPORTUNITY_CLEANING_QUOTE_INTAKE_V1.workflow_key) {
        return OPPORTUNITY_CLEANING_QUOTE_INTAKE_V1;
    }
    throw new Error(`Unknown quote intake workflow: ${workflowKey}`);
}
}),
];

//# sourceMappingURL=lib_f9d0ebeb._.js.map
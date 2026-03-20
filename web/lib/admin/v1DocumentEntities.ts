import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";

/** Canonical `documents.entity_type` values supported for V1 association flows. */
export const V1_DOCUMENT_ENTITY_VALUES = [
    "customer",
    "vendor",
    "opportunity",
    "contact",
    "person",
    "job",
    "schedule",
] as const;

export type V1DocumentEntityValue = (typeof V1_DOCUMENT_ENTITY_VALUES)[number];

export function isV1DocumentEntityType(v: string): v is V1DocumentEntityValue {
    return (V1_DOCUMENT_ENTITY_VALUES as readonly string[]).includes(v);
}

/** UI labels + drawer deep-link for admin table rows. */
export const V1_DOCUMENT_ENTITY_OPTIONS: {
    value: V1DocumentEntityValue;
    label: string;
    drawerType: AdminDrawerEntityType;
}[] = [
    { value: "customer", label: "Customer", drawerType: "customers" },
    { value: "vendor", label: "Vendor", drawerType: "vendors" },
    { value: "opportunity", label: "Opportunity", drawerType: "opportunities" },
    { value: "contact", label: "Contact", drawerType: "contacts" },
    { value: "person", label: "Person", drawerType: "persons" },
    { value: "job", label: "Job", drawerType: "jobs" },
    { value: "schedule", label: "Schedule", drawerType: "schedules" },
];

export function drawerTypeForDocumentEntity(entityType: string | null | undefined): AdminDrawerEntityType | null {
    if (!entityType) return null;
    const row = V1_DOCUMENT_ENTITY_OPTIONS.find((o) => o.value === entityType);
    return row?.drawerType ?? null;
}

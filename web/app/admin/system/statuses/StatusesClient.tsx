"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";

const ENTITY_TYPE_TO_LABEL_KEY: Record<string, string> = {
    opportunity: "opportunities",
    opportunities: "opportunities",
    job: "jobs",
    jobs: "jobs",
    schedule: "schedules",
    schedules: "schedules",
    customer: "customers",
    customers: "customers",
    contact: "contacts",
    contacts: "contacts",
    vendor: "vendors",
    vendors: "vendors",
};

const FALLBACK_LABELS: Record<string, string> = {
    opportunity: "Opportunity",
    opportunities: "Opportunities",
    job: "Job",
    jobs: "Jobs",
    schedule: "Schedule",
    schedules: "Schedules",
    customer: "Customer",
    customers: "Customers",
    contact: "Contact",
    contacts: "Contacts",
    vendor: "Vendor",
    vendors: "Vendors",
};

function entityTypeDisplayLabel(entityType: string, labels: Record<string, { singular: string | null; plural: string | null }>): string {
    const key = ENTITY_TYPE_TO_LABEL_KEY[entityType] ?? entityType;
    const entry = labels[key];
    const singular = entry?.singular ?? entry?.plural;
    return singular ?? FALLBACK_LABELS[entityType] ?? FALLBACK_LABELS[key] ?? entityType;
}

export default function StatusesClient() {
    const searchParams = useSearchParams();
    const entityType = searchParams.get("entity_type")?.trim() ?? "";
    const { labels } = useEntityLabels();
    const filterLabel = entityType ? entityTypeDisplayLabel(entityType, labels ?? {}) : "";

    return (
        <>
            <AdminPageHeader
                title="Statuses"
                subtitle="Configure job statuses, schedule statuses, assignment statuses, and other workflow statuses."
            />
            {entityType && (
                <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-[#e6e8ec] bg-[#F4F6F9] px-4 py-3 text-sm">
                    <span className="text-[#31394d]">Filtered to: <strong>{filterLabel}</strong></span>
                    <Link
                        href="/admin/system/statuses"
                        className="text-alloy-blue hover:underline font-medium"
                    >
                        Clear filter
                    </Link>
                </div>
            )}
            <div className="max-w-2xl">
                <div className="p-6 bg-alloy-stone/20 rounded-lg border border-alloy-stone/30">
                    <p className="text-alloy-midnight/80 text-sm font-medium">Coming soon</p>
                    <p className="text-alloy-midnight/60 text-sm mt-1">
                        Status configuration will be scoped by entity type. When available, create/edit will default to the filtered entity type.
                    </p>
                </div>
            </div>
        </>
    );
}

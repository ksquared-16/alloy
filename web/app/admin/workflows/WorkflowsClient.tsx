"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import PrimaryButton from "@/components/PrimaryButton";
import { formatDateTime } from "@/lib/adminFormatters";

function entityTypeFilterLabel(entityType: string, labels: Record<string, { singular: string | null; plural: string | null }>): string {
    const key = entityType === "opportunity" ? "opportunities" : entityType === "job" ? "jobs" : entityType === "schedule" ? "schedules" : entityType === "customer" ? "customers" : entityType === "contact" ? "contacts" : entityType === "vendor" ? "vendors" : entityType;
    const entry = labels[key];
    return (entry?.singular ?? entry?.plural) ?? entityType.charAt(0).toUpperCase() + entityType.slice(1);
}

interface Workflow {
    id: string;
    name: string;
    description: string | null;
    event_type: string | null;
    entity_type: string | null;
    enabled: boolean;
    created_at: string;
    updated_at: string;
}

interface WorkflowsClientProps {
    initialData: Workflow[];
    error?: string;
}

export default function WorkflowsClient({
    initialData,
    error,
}: WorkflowsClientProps) {
    const searchParams = useSearchParams();
    const entityType = searchParams.get("entity_type")?.trim() ?? "";
    const { openDrawer } = useAdminDrawer();
    const { labels } = useEntityLabels();
    const title = labels?.workflows?.plural ?? "Workflows";
    const filterLabel = entityType ? entityTypeFilterLabel(entityType, labels ?? {}) : "";

    const data = useMemo(() => {
        if (!entityType) return initialData;
        return initialData.filter((w) => (w.entity_type ?? "").toLowerCase() === entityType.toLowerCase());
    }, [initialData, entityType]);

    const openNewWorkflow = () => {
        openDrawer({
            type: "workflows",
            id: "new",
            ...(entityType ? { defaultWorkflowEntityType: entityType } : {}),
        });
    };

    const columns = [
        { key: "name", label: "Name", sortable: true },
        { key: "enabled", label: "Enabled", sortable: true, render: (v: boolean) => (v ? "Yes" : "No") },
        { key: "event_type", label: "Event type", sortable: true },
        { key: "entity_type", label: "Entity type", sortable: true },
        { key: "updated_at", label: "Updated", sortable: true, render: (v: string) => formatDateTime(v) },
    ];

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-alloy-midnight">{title}</h1>
                <PrimaryButton onClick={openNewWorkflow}>
                    New workflow
                </PrimaryButton>
            </div>
            {entityType && (
                <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-[#e6e8ec] bg-[#F4F6F9] px-4 py-3 text-sm">
                    <span className="text-[#31394d]">Filtered to: <strong>{filterLabel}</strong></span>
                    <Link
                        href="/admin/workflows"
                        className="text-alloy-blue hover:underline font-medium"
                    >
                        Clear filter
                    </Link>
                </div>
            )}
            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                    Error: {error}
                </div>
            )}
            <DataTable
                data={data}
                columns={columns}
                onRowClick={(row) => openDrawer({ type: "workflows", id: (row as Workflow).id })}
            />
        </div>
    );
}

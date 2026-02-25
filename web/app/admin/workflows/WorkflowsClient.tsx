"use client";

import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import PrimaryButton from "@/components/PrimaryButton";
import { formatDateTime } from "@/lib/adminFormatters";

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
    const { openDrawer } = useAdminDrawer();
    const { labels } = useEntityLabels();
    const title = labels?.workflows?.plural ?? "Workflows";

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
                <PrimaryButton onClick={() => openDrawer({ type: "workflows", id: "new" })}>
                    New workflow
                </PrimaryButton>
            </div>
            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                    Error: {error}
                </div>
            )}
            <DataTable
                data={initialData}
                columns={columns}
                onRowClick={(row) => openDrawer({ type: "workflows", id: (row as Workflow).id })}
            />
        </div>
    );
}

"use client";

import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { formatDateTime } from "@/lib/adminFormatters";

interface Contact {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  customer_id: string | null;
  external_id: string | null;
}

interface ContactsClientProps {
  initialData: Contact[];
  error?: string;
}

export default function ContactsClient({
  initialData,
  error,
}: ContactsClientProps) {
  const { openDrawer } = useAdminDrawer();

  const columns = [
    { key: "created_at", label: "Created", sortable: true, render: (v: string) => formatDateTime(v) },
    { key: "first_name", label: "First Name", sortable: true },
    { key: "last_name", label: "Last Name", sortable: true },
    { key: "email", label: "Email", sortable: true },
    { key: "phone", label: "Phone", sortable: true },
    { key: "status", label: "Status", sortable: true },
    { key: "customer_id", label: "Customer ID", sortable: false },
    { key: "external_id", label: "External ID", sortable: false },
  ];

  const filters = [
    {
      key: "status",
      label: "Status",
      type: "select" as const,
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-alloy-midnight mb-6">Contacts</h1>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
          Error: {error}
        </div>
      )}

      <DataTable
        data={initialData}
        columns={columns}
        filters={filters}
        onRowClick={(row) => openDrawer({ type: "contacts", id: row.id })}
      />
    </div>
  );
}


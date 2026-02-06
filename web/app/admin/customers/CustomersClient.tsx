"use client";

import { useMemo } from "react";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAdminVertical } from "@/contexts/AdminVerticalContext";
import { formatDateTime } from "@/lib/adminFormatters";

interface Customer {
  id: string;
  created_at: string;
  name: string | null;
  status: string | null;
  stripe_customer_id: string | null;
  default_payment_method_id: string | null;
  vertical_id: string | null;
  external_id: string | null;
}

interface CustomersClientProps {
  initialData: Customer[];
  error?: string;
}

export default function CustomersClient({
  initialData,
  error,
}: CustomersClientProps) {
  const { openDrawer } = useAdminDrawer();
  const { selectedVerticalId } = useAdminVertical();
  const data = useMemo(() => {
    if (!selectedVerticalId) return initialData;
    return initialData.filter((r) => r.vertical_id === selectedVerticalId);
  }, [initialData, selectedVerticalId]);

  const columns = [
    { key: "created_at", label: "Created", sortable: true, render: (v: string) => formatDateTime(v) },
    { key: "name", label: "Name", sortable: true },
    { key: "status", label: "Status", sortable: true },
    { key: "stripe_customer_id", label: "Stripe Customer ID", sortable: false },
    {
      key: "default_payment_method_id",
      label: "Payment Method ID",
      sortable: false,
    },
    { key: "vertical_id", label: "Vertical ID", sortable: false },
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
      <h1 className="text-3xl font-bold text-alloy-midnight mb-6">Customers</h1>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
          Error: {error}
        </div>
      )}

      <DataTable
        data={data}
        columns={columns}
        filters={filters}
        onRowClick={(row) => openDrawer({ type: "customers", id: row.id })}
      />
    </div>
  );
}


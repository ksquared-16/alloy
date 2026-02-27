"use client";

import { useMemo, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAdminVertical } from "@/contexts/AdminVerticalContext";
import { formatDateTime } from "@/lib/adminFormatters";
import { StatusBadge } from "@/components/admin/StatusBadge";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";

interface Customer {
  id: string;
  created_at: string;
  name: string | null;
  status: string | null;
  status_key: string | null;
  stripe_customer_id: string | null;
  default_payment_method_id: string | null;
  vertical_id: string | null;
  external_id: string | null;
  _vertical_name?: string | null;
}

interface CustomersClientProps {
  initialData: Customer[];
  error?: string;
}

type StatusOption = { status_key: string; status_label: string | null };

export default function CustomersClient({
  initialData,
  error,
}: CustomersClientProps) {
  const { openDrawer } = useAdminDrawer();
  const { selectedVerticalId } = useAdminVertical();
  const { labels } = useEntityLabels();
  const searchParams = useSearchParams();
  const router = useRouter();
  const title = labels?.customers?.plural ?? "Customers";
  const statusKeyParam = searchParams.get("status_key") ?? "";

  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  useEffect(() => {
    fetch("/api/admin/status-definitions?entity_type=customers")
      .then((r) => r.ok ? r.json() : { statuses: [] })
      .then((j: { statuses?: StatusOption[] }) => setStatusOptions((j.statuses ?? []).filter((s) => s.status_key)));
  }, []);

  const data = useMemo(() => {
    if (!selectedVerticalId) return initialData;
    return initialData.filter((r) => r.vertical_id === selectedVerticalId);
  }, [initialData, selectedVerticalId]);

  const columns = [
    { key: "created_at", label: "Created", sortable: true, render: (v: string) => formatDateTime(v) },
    { key: "name", label: "Name", sortable: true },
    { key: "status", label: "Status", sortable: true, render: (_: unknown, row: Customer) => <StatusBadge label={row.status} /> },
    { key: "_vertical_name", label: "Vertical", sortable: false, render: (_: unknown, row: Customer) => row._vertical_name ?? "—" },
  ];

  const filters = [
    { key: "status", label: "Status", type: "select" as const, options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
  ];

  return (
    <div>
      <AdminPageHeader title={title} subtitle="Customer records and verticals." />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
          Error: {error}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-sm text-[#45506c]">Status:</label>
        <select
          value={statusKeyParam}
          onChange={(e) => {
            const v = e.target.value;
            const next = new URLSearchParams(searchParams.toString());
            if (v) next.set("status_key", v); else next.delete("status_key");
            router.push(`/admin/customers?${next.toString()}`);
          }}
          className="rounded-md border border-[#e6e8ec] px-3 py-1.5 text-sm"
        >
          <option value="">All</option>
          {statusOptions.map((s) => (
            <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>
          ))}
        </select>
      </div>

      <DataTable
        data={data}
        columns={columns}
        filters={filters}
        onRowClick={(row) => openDrawer({ type: "customers", id: row.id })}
      />
    </div>
  );
}


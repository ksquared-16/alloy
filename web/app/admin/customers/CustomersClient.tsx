"use client";

import { useMemo, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAdminVertical } from "@/contexts/AdminVerticalContext";
import { StatusBadge } from "@/components/admin/StatusBadge";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";
import { Filter } from "lucide-react";

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
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState(statusKeyParam);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/admin/status-definitions?entity_type=customers")
      .then((r) => r.ok ? r.json() : { statuses: [] })
      .then((j: { statuses?: StatusOption[] }) => setStatusOptions((j.statuses ?? []).filter((s) => s.status_key)));
  }, []);

  useEffect(() => {
    setFilterStatus(statusKeyParam);
  }, [statusKeyParam]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const data = useMemo(() => {
    if (!selectedVerticalId) return initialData;
    return initialData.filter((r) => r.vertical_id === selectedVerticalId);
  }, [initialData, selectedVerticalId]);

  const applyFilter = () => {
    const next = new URLSearchParams(searchParams.toString());
    if (filterStatus) next.set("status_key", filterStatus);
    else next.delete("status_key");
    router.push(`/admin/customers?${next.toString()}`);
    setFilterOpen(false);
  };

  const clearFilter = () => {
    setFilterStatus("");
    router.push("/admin/customers");
    setFilterOpen(false);
  };

  const columns = useMemo(
    () =>
      buildEntityTableColumns<Customer>("customers", {
        status_key: (_, row) => <StatusBadge label={row.status ?? row.status_key} />,
      }),
    []
  );

  const filterTrigger = (
    <div className="relative" ref={filterRef}>
      <button
        type="button"
        onClick={() => setFilterOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm font-medium text-alloy-midnight/80 hover:bg-alloy-stone/50 focus:outline-none focus:ring-2 focus:ring-alloy-blue/20 ${filterOpen ? "border-alloy-blue/50 ring-2 ring-alloy-blue/20" : ""}`}
        aria-expanded={filterOpen}
        aria-haspopup="true"
      >
        <Filter className="h-4 w-4 text-alloy-muted" />
        Filter
        {statusKeyParam && (
          <span className="h-1.5 w-1.5 rounded-full bg-alloy-blue" aria-hidden />
        )}
      </button>
      {filterOpen && (
        <div className="absolute left-0 top-full z-20 mt-1.5 w-56 rounded-lg border border-alloy-stone/40 bg-white p-4 shadow-lg">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-alloy-muted">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
              >
                <option value="">All</option>
                {statusOptions.map((s) => (
                  <option key={s.status_key} value={s.status_key}>
                    {s.status_label ?? s.status_key}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={applyFilter}
                className="rounded-lg bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30"
              >
                Apply
              </button>
              {statusKeyParam && (
                <button
                  type="button"
                  onClick={clearFilter}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-alloy-muted hover:text-alloy-midnight hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <AdminListPageHeader title={title} toolbarLeft={filterTrigger} />
      <div className="pt-4">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Error: {error}
          </div>
        )}
        <DataTable
        data={data}
        columns={columns}
        filters={[]}
        onRowClick={(row) => openDrawer({ type: "customers", id: row.id })}
        />
      </div>
    </div>
  );
}

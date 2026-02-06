"use client";

import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { formatDateTime, formatMoneyFromDollars } from "@/lib/adminFormatters";

interface DiscountRedemption {
  id: string;
  created_at: string;
  discount_code: string | null;
  quote_subtotal: number | null;
  discount_amount: number | null;
  quote_total: number | null;
  contact_id: string | null;
  opportunity_id: string | null;
  job_id: string | null;
}

interface DiscountRedemptionsClientProps {
  initialData: DiscountRedemption[];
  error?: string;
}

export default function DiscountRedemptionsClient({
  initialData,
  error,
}: DiscountRedemptionsClientProps) {
  const { openDrawer } = useAdminDrawer();

  const columns = [
    { key: "created_at", label: "Created", sortable: true, render: (v: string) => formatDateTime(v) },
    { key: "discount_code", label: "Discount Code", sortable: true },
    { key: "quote_subtotal", label: "Subtotal", sortable: true, render: (v: number | null) => formatMoneyFromDollars(v) },
    { key: "discount_amount", label: "Discount", sortable: true, render: (v: number | null) => formatMoneyFromDollars(v) },
    { key: "quote_total", label: "Total", sortable: true, render: (v: number | null) => formatMoneyFromDollars(v) },
    { key: "contact_id", label: "Contact ID", sortable: false },
    { key: "opportunity_id", label: "Opportunity ID", sortable: false },
    { key: "job_id", label: "Job ID", sortable: false },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-alloy-midnight mb-6">
        Discount Redemptions
      </h1>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
          Error: {error}
        </div>
      )}

      <DataTable
        data={initialData}
        columns={columns}
        onRowClick={(row) => openDrawer({ type: "discount_redemptions", id: row.id })}
      />
    </div>
  );
}


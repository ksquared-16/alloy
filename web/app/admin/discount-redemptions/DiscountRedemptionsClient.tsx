"use client";

import { useState } from "react";
import DataTable from "@/components/admin/DataTable";
import Drawer from "@/components/admin/Drawer";

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
  const [selectedRow, setSelectedRow] = useState<DiscountRedemption | null>(
    null
  );

  const columns = [
    { key: "created_at", label: "Created", sortable: true },
    { key: "discount_code", label: "Discount Code", sortable: true },
    {
      key: "quote_subtotal",
      label: "Subtotal",
      sortable: true,
      render: (value: number | null) =>
        value ? `$${(value / 100).toFixed(2)}` : "-",
    },
    {
      key: "discount_amount",
      label: "Discount",
      sortable: true,
      render: (value: number | null) =>
        value ? `$${(value / 100).toFixed(2)}` : "-",
    },
    {
      key: "quote_total",
      label: "Total",
      sortable: true,
      render: (value: number | null) =>
        value ? `$${(value / 100).toFixed(2)}` : "-",
    },
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
        onRowClick={setSelectedRow}
      />

      <Drawer
        isOpen={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        title={`Redemption: ${selectedRow?.discount_code || selectedRow?.id}`}
      >
        {selectedRow && (
          <div className="space-y-4">
            <div>
              <strong className="text-alloy-midnight/70">ID:</strong>{" "}
              {selectedRow.id}
            </div>
            <div>
              <strong className="text-alloy-midnight/70">Created:</strong>{" "}
              {new Date(selectedRow.created_at).toLocaleString()}
            </div>
            <div>
              <strong className="text-alloy-midnight/70">Discount Code:</strong>{" "}
              {selectedRow.discount_code || "-"}
            </div>
            <div>
              <strong className="text-alloy-midnight/70">Subtotal:</strong>{" "}
              {selectedRow.quote_subtotal
                ? `$${(selectedRow.quote_subtotal / 100).toFixed(2)}`
                : "-"}
            </div>
            <div>
              <strong className="text-alloy-midnight/70">Discount Amount:</strong>{" "}
              {selectedRow.discount_amount
                ? `$${(selectedRow.discount_amount / 100).toFixed(2)}`
                : "-"}
            </div>
            <div>
              <strong className="text-alloy-midnight/70">Total:</strong>{" "}
              {selectedRow.quote_total
                ? `$${(selectedRow.quote_total / 100).toFixed(2)}`
                : "-"}
            </div>
            <div>
              <strong className="text-alloy-midnight/70">Contact ID:</strong>{" "}
              {selectedRow.contact_id || "-"}
            </div>
            <div>
              <strong className="text-alloy-midnight/70">Opportunity ID:</strong>{" "}
              {selectedRow.opportunity_id || "-"}
            </div>
            <div>
              <strong className="text-alloy-midnight/70">Job ID:</strong>{" "}
              {selectedRow.job_id || "-"}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}


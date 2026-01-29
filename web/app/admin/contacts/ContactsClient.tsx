"use client";

import { useState } from "react";
import DataTable from "@/components/admin/DataTable";
import Drawer from "@/components/admin/Drawer";

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
  const [selectedRow, setSelectedRow] = useState<Contact | null>(null);

  const columns = [
    { key: "created_at", label: "Created", sortable: true },
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
        onRowClick={setSelectedRow}
      />

      <Drawer
        isOpen={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        title={`Contact: ${selectedRow?.first_name || ""} ${selectedRow?.last_name || ""}`.trim() || selectedRow?.id || "Contact"}
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
              <strong className="text-alloy-midnight/70">First Name:</strong>{" "}
              {selectedRow.first_name || "-"}
            </div>
            <div>
              <strong className="text-alloy-midnight/70">Last Name:</strong>{" "}
              {selectedRow.last_name || "-"}
            </div>
            <div>
              <strong className="text-alloy-midnight/70">Email:</strong>{" "}
              {selectedRow.email || "-"}
            </div>
            <div>
              <strong className="text-alloy-midnight/70">Phone:</strong>{" "}
              {selectedRow.phone || "-"}
            </div>
            <div>
              <strong className="text-alloy-midnight/70">Status:</strong>{" "}
              {selectedRow.status || "-"}
            </div>
            <div>
              <strong className="text-alloy-midnight/70">Customer ID:</strong>{" "}
              {selectedRow.customer_id || "-"}
            </div>
            <div>
              <strong className="text-alloy-midnight/70">External ID:</strong>{" "}
              {selectedRow.external_id || "-"}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}


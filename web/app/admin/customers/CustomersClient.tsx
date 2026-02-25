"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import DataTable from "@/components/admin/DataTable";
import Drawer from "@/components/admin/Drawer";

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

type Member = {
  id: string;
  customer_id: string;
  display_name: string | null;
  relationship: string | null;
  first_name: string | null;
  last_name: string | null;
  dob: string | null;
  is_active: boolean;
  created_at: string;
};

const MEMBER_LABEL_PLURAL = "Members";
const MEMBER_LABEL_SINGULAR = "Member";

interface CustomersClientProps {
  initialData: Customer[];
  error?: string;
}

export default function CustomersClient({
  initialData,
  error,
}: CustomersClientProps) {
  const [selectedRow, setSelectedRow] = useState<Customer | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const fetchMembers = useCallback(async (customerId: string) => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/admin/customer-members?customer_id=${encodeURIComponent(customerId)}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) setMembers((json as { members?: Member[] }).members ?? []);
      else setMembers([]);
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedRow?.id) fetchMembers(selectedRow.id);
    else setMembers([]);
  }, [selectedRow?.id, fetchMembers]);

  const columns = [
    { key: "created_at", label: "Created", sortable: true },
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
        data={initialData}
        columns={columns}
        filters={filters}
        onRowClick={setSelectedRow}
      />

      <Drawer
        isOpen={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        title={`Customer: ${selectedRow?.name || selectedRow?.id}`}
      >
        {selectedRow && (
          <div className="space-y-6">
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
                <strong className="text-alloy-midnight/70">Name:</strong>{" "}
                {selectedRow.name || "-"}
              </div>
              <div>
                <strong className="text-alloy-midnight/70">Status:</strong>{" "}
                {selectedRow.status || "-"}
              </div>
              <div>
                <strong className="text-alloy-midnight/70">Stripe Customer ID:</strong>{" "}
                {selectedRow.stripe_customer_id || "-"}
              </div>
              <div>
                <strong className="text-alloy-midnight/70">Payment Method ID:</strong>{" "}
                {selectedRow.default_payment_method_id || "-"}
              </div>
              <div>
                <strong className="text-alloy-midnight/70">Vertical ID:</strong>{" "}
                {selectedRow.vertical_id || "-"}
              </div>
              <div>
                <strong className="text-alloy-midnight/70">External ID:</strong>{" "}
                {selectedRow.external_id || "-"}
              </div>
            </div>

            <div className="border-t border-alloy-stone/30 pt-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold text-alloy-midnight">{MEMBER_LABEL_PLURAL}</h3>
                <Link
                  href={`/admin/customer-members?customer_id=${encodeURIComponent(selectedRow.id)}`}
                  className="text-sm font-medium text-alloy-blue hover:underline"
                >
                  Add {MEMBER_LABEL_SINGULAR}
                </Link>
              </div>
              {membersLoading ? (
                <p className="text-sm text-alloy-midnight/60">Loading…</p>
              ) : members.length === 0 ? (
                <p className="text-sm text-alloy-midnight/60">No {MEMBER_LABEL_PLURAL.toLowerCase()} yet.</p>
              ) : (
                <ul className="space-y-2">
                  {members.map((m) => (
                    <li key={m.id} className="text-sm text-alloy-midnight/80">
                      {m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.id}
                      {m.relationship ? ` · ${m.relationship}` : ""}
                      {m.dob ? ` · DOB ${m.dob}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}


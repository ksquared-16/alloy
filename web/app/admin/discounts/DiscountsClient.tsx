"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/admin/DataTable";
import Drawer from "@/components/admin/Drawer";
import PrimaryButton from "@/components/PrimaryButton";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";
import { AdminDeleteConfirmModal } from "@/components/admin/AdminDeleteConfirmModal";

interface Discount {
  id: string;
  code: string;
  is_active: boolean;
  discount_type: string;
  discount_value: number;
  first_job_only: boolean;
  starts_at: string | null;
  ends_at: string | null;
  applies_to_vertical_slug: string | null;
  ghl_tag: string | null;
  created_at: string;
}

interface DiscountsClientProps {
  initialData?: Discount[];
  error?: string;
}

export default function DiscountsClient({
  initialData: initialDataProp,
  error: errorProp,
}: DiscountsClientProps) {
  const { canMutate } = useAdminAuth();
  const [clientData, setClientData] = useState<Discount[] | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [loading, setLoading] = useState(typeof initialDataProp === "undefined");
  const [selectedRow, setSelectedRow] = useState<Discount | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<Discount>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const readOnly = !canMutate;

  const fetchDiscounts = useCallback(async () => {
    setLoading(true);
    setClientError(null);
    try {
      const res = await fetch("/api/admin/discounts");
      const data = await res.json();
      if (res.ok) setClientData(Array.isArray(data) ? data : []);
      else setClientError((data as { error?: string }).error ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof initialDataProp === "undefined") fetchDiscounts();
  }, [initialDataProp, fetchDiscounts]);

  const initialData = initialDataProp ?? clientData ?? [];
  const error = errorProp ?? clientError;

  const columns = [
    {
      key: "created_at",
      label: "Created",
      sortable: true,
      render: (value: string) => formatDateTime(value),
    },
    { key: "code", label: "Code", sortable: true },
    {
      key: "is_active",
      label: "Active",
      sortable: true,
      render: (value: boolean) => (value ? "Yes" : "No"),
    },
    { key: "discount_type", label: "Type", sortable: true },
    {
      key: "discount_value",
      label: "Value",
      sortable: true,
      render: (value: number, row: Discount) =>
        row.discount_type === "percent"
          ? `${value}%`
          : formatMoneyFromCents(value),
    },
    {
      key: "first_job_only",
      label: "First Job Only",
      sortable: true,
      render: (value: boolean) => (value ? "Yes" : "No"),
    },
    {
      key: "starts_at",
      label: "Starts",
      sortable: true,
      render: (value: string | null) => (value ? formatDateTime(value) : "-"),
    },
    {
      key: "ends_at",
      label: "Ends",
      sortable: true,
      render: (value: string | null) => (value ? formatDateTime(value) : "-"),
    },
    {
      key: "applies_to_vertical_slug",
      label: "Vertical",
      sortable: true,
    },
  ];

  const filters = [
    {
      key: "is_active",
      label: "Active",
      type: "select" as const,
      options: [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ],
    },
    {
      key: "discount_type",
      label: "Type",
      type: "select" as const,
      options: [
        { value: "percent", label: "Percent" },
        { value: "fixed", label: "Fixed" },
      ],
    },
  ];

  const handleEdit = (row: Discount) => {
    setSelectedRow(row);
    setFormData(row);
    setIsEditing(true);
    setIsCreating(false);
  };

  const handleCreate = () => {
    setSelectedRow(null);
    setFormData({
      code: "",
      is_active: true,
      discount_type: "percent",
      discount_value: 0,
      first_job_only: false,
      starts_at: null,
      ends_at: null,
      applies_to_vertical_slug: null,
      ghl_tag: null,
    });
    setIsCreating(true);
    setIsEditing(false);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const url = isCreating
        ? "/api/admin/discounts"
        : `/api/admin/discounts/${selectedRow?.id}`;
      const method = isCreating ? "POST" : "PATCH";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save discount");
      }

      if (typeof initialDataProp === "undefined") fetchDiscounts();
      else window.location.reload();
    } catch (err: any) {
      setSubmitError(err.message || "Failed to save discount");
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-alloy-midnight">Discounts</h1>
        {canMutate && (
          <PrimaryButton onClick={handleCreate}>Create Discount</PrimaryButton>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
          Error: {error}
        </div>
      )}

      {loading && typeof initialDataProp === "undefined" && (
        <div className="mb-4 p-4 bg-alloy-stone/10 rounded-md text-sm text-alloy-midnight/80">
          Loading discounts…
        </div>
      )}

      <DataTable
        data={initialData}
        columns={columns}
        filters={filters}
        onRowClick={handleEdit}
      />

      <Drawer
        isOpen={isEditing || isCreating}
        onClose={() => {
          setIsEditing(false);
          setIsCreating(false);
          setSelectedRow(null);
          setFormData({});
          setSubmitError(null);
          setDeleteConfirmOpen(false);
        }}
        title={readOnly ? `View Discount: ${selectedRow?.code}` : isCreating ? "Create Discount" : `Edit Discount: ${selectedRow?.code}`}
        headerActions={
          canMutate && isEditing && selectedRow ? (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="px-3 py-1.5 text-sm border border-alloy-ember/50 text-alloy-ember rounded-md hover:bg-alloy-ember/10"
            >
              Delete
            </button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {submitError && !readOnly && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
              {submitError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">
              Code *
            </label>
            <input
              type="text"
              value={formData.code || ""}
              onChange={(e) =>
                setFormData({ ...formData, code: e.target.value.toUpperCase() })
              }
              disabled={readOnly}
              className="w-full px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue disabled:bg-alloy-stone/20 disabled:cursor-not-allowed"
              required
            />
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active ?? false}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
                disabled={readOnly}
                className="rounded"
              />
              <span className="text-sm font-medium text-alloy-midnight/70">
                Active
              </span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">
              Type *
            </label>
            <select
              value={formData.discount_type || "percent"}
              onChange={(e) =>
                setFormData({ ...formData, discount_type: e.target.value })
              }
              disabled={readOnly}
              className="w-full px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue disabled:bg-alloy-stone/20 disabled:cursor-not-allowed"
            >
              <option value="percent">Percent</option>
              <option value="fixed">Fixed Amount</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">
              Value * ({formData.discount_type === "percent" ? "%" : "cents"})
            </label>
            <input
              type="number"
              value={formData.discount_value ?? 0}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  discount_value: parseFloat(e.target.value) || 0,
                })
              }
              disabled={readOnly}
              className="w-full px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue disabled:bg-alloy-stone/20 disabled:cursor-not-allowed"
              required
            />
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.first_job_only ?? false}
                onChange={(e) =>
                  setFormData({ ...formData, first_job_only: e.target.checked })
                }
                disabled={readOnly}
                className="rounded"
              />
              <span className="text-sm font-medium text-alloy-midnight/70">
                First Job Only
              </span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">
              Starts At
            </label>
            <input
              type="datetime-local"
              value={
                formData.starts_at
                  ? new Date(formData.starts_at).toISOString().slice(0, 16)
                  : ""
              }
              onChange={(e) =>
                setFormData({
                  ...formData,
                  starts_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
              disabled={readOnly}
              className="w-full px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue disabled:bg-alloy-stone/20 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">
              Ends At
            </label>
            <input
              type="datetime-local"
              value={
                formData.ends_at
                  ? new Date(formData.ends_at).toISOString().slice(0, 16)
                  : ""
              }
              onChange={(e) =>
                setFormData({
                  ...formData,
                  ends_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
              disabled={readOnly}
              className="w-full px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue disabled:bg-alloy-stone/20 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">
              Applies To Vertical Slug
            </label>
            <input
              type="text"
              value={formData.applies_to_vertical_slug || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  applies_to_vertical_slug: e.target.value || null,
                })
              }
              disabled={readOnly}
              className="w-full px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue disabled:bg-alloy-stone/20 disabled:cursor-not-allowed"
              placeholder="e.g., cleaning"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">
              GHL Tag
            </label>
            <input
              type="text"
              value={formData.ghl_tag || ""}
              onChange={(e) =>
                setFormData({ ...formData, ghl_tag: e.target.value || null })
              }
              disabled={readOnly}
              className="w-full px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue disabled:bg-alloy-stone/20 disabled:cursor-not-allowed"
            />
          </div>

          <div className="flex gap-4 pt-4">
            {readOnly ? (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setIsCreating(false);
                  setSelectedRow(null);
                  setFormData({});
                }}
                className="px-4 py-2 border border-alloy-stone/80 rounded-md hover:bg-alloy-stone transition-colors"
              >
                Close
              </button>
            ) : (
              <>
                <PrimaryButton
                  onClick={handleSubmit}
                  disabled={isSubmitting || !formData.code}
                >
                  {isSubmitting ? "Saving..." : "Save"}
                </PrimaryButton>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setIsCreating(false);
                    setSelectedRow(null);
                    setFormData({});
                    setSubmitError(null);
                  }}
                  className="px-4 py-2 border border-alloy-stone/80 rounded-md hover:bg-alloy-stone transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </Drawer>
      <AdminDeleteConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => { setDeleteConfirmOpen(false); setSubmitError(null); }}
        onConfirm={async () => {
          if (!selectedRow?.id) return;
          setDeleteSaving(true);
          setSubmitError(null);
          try {
            const res = await fetch(`/api/admin/discounts/${selectedRow.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              setSubmitError((json.error as string) || "Delete failed");
              return;
            }
            setDeleteConfirmOpen(false);
            setIsEditing(false);
            setIsCreating(false);
            setSelectedRow(null);
            setFormData({});
            if (typeof initialDataProp === "undefined") fetchDiscounts();
            else window.location.reload();
          } finally {
            setDeleteSaving(false);
          }
        }}
        recordLabel={selectedRow?.code ?? "this discount code"}
        entityTypeLabel="discount code"
        isLoading={deleteSaving}
      />
    </div>
  );
}


"use client";

import { useState } from "react";
import DataTable from "@/components/admin/DataTable";
import Drawer from "@/components/admin/Drawer";
import PrimaryButton from "@/components/PrimaryButton";
import { formatDateTime } from "@/lib/adminFormatters";

interface Vertical {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  settings: Record<string, any> | null;
  created_at: string;
}

interface VerticalsClientProps {
  initialData: Vertical[];
  error?: string;
}

export default function VerticalsClient({
  initialData,
  error,
}: VerticalsClientProps) {
  const [selectedRow, setSelectedRow] = useState<Vertical | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<Vertical>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const columns = [
    {
      key: "created_at",
      label: "Created",
      sortable: true,
      render: (value: string) => formatDateTime(value),
    },
    { key: "name", label: "Name", sortable: true },
    { key: "slug", label: "Slug", sortable: true },
    {
      key: "is_active",
      label: "Active",
      sortable: true,
      render: (value: boolean) => (value ? "Yes" : "No"),
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
  ];

  const handleEdit = (row: Vertical) => {
    setSelectedRow(row);
    setFormData(row);
    setIsEditing(true);
    setIsCreating(false);
  };

  const handleCreate = () => {
    setSelectedRow(null);
    setFormData({
      name: "",
      slug: "",
      is_active: true,
      settings: {},
    });
    setIsCreating(true);
    setIsEditing(false);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const url = isCreating
        ? "/api/admin/verticals"
        : `/api/admin/verticals/${selectedRow?.id}`;
      const method = isCreating ? "POST" : "PATCH";

      // Ensure settings is always an object, never null
      const payload = {
        ...formData,
        settings: formData.settings && typeof formData.settings === 'object' 
          ? formData.settings 
          : {},
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save vertical");
      }

      // Refresh page to show updated data
      window.location.reload();
    } catch (err: any) {
      setSubmitError(err.message || "Failed to save vertical");
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-alloy-midnight">Verticals</h1>
        <PrimaryButton onClick={handleCreate}>Create Vertical</PrimaryButton>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
          Error: {error}
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
        }}
        title={isCreating ? "Create Vertical" : `Edit Vertical: ${selectedRow?.name}`}
      >
        <div className="space-y-4">
          {submitError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
              {submitError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">
              Slug *
            </label>
            <input
              type="text"
              value={formData.slug || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  slug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                })
              }
              className="w-full px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue"
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
                className="rounded"
              />
              <span className="text-sm font-medium text-alloy-midnight/70">
                Active
              </span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">
              Settings (JSON)
            </label>
            <textarea
              value={
                formData.settings
                  ? JSON.stringify(formData.settings, null, 2)
                  : "{}"
              }
              onChange={(e) => {
                try {
                  const parsed = e.target.value.trim()
                    ? JSON.parse(e.target.value)
                    : {};
                  setFormData({ ...formData, settings: parsed });
                } catch {
                  // Invalid JSON, keep as is for now
                }
              }}
              className="w-full px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue font-mono text-sm"
              rows={6}
              placeholder='{"key": "value"}'
            />
          </div>

          <div className="flex gap-4 pt-4">
            <PrimaryButton
              onClick={handleSubmit}
              disabled={isSubmitting || !formData.name || !formData.slug}
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
          </div>
        </div>
      </Drawer>
    </div>
  );
}


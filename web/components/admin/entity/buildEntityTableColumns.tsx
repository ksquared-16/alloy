"use client";

import { getEntityPresentation, type EntityPresentationType, type EntityTableColumnConfig } from "@/lib/entityPresentation";
import { formatDate, formatDateTime, formatMoneyFromCents, formatMoneyFromDollars, formatPhoneUS } from "@/lib/adminFormatters";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { getStatusVariant } from "@/components/admin/StatusBadge";

/**
 * Build DataTable columns from entity presentation config.
 * Uses renderHint for default rendering; pass overrides for custom render per key.
 * TODO: When entity_field_registry is persisted, merge visibility/order from org config.
 */
/** Column shape compatible with DataTable. */
export interface EntityTableColumn<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
}

export function buildEntityTableColumns<T extends object>(
  entityType: EntityPresentationType,
  overrides?: Partial<Record<string, (value: unknown, row: T) => React.ReactNode>>
): EntityTableColumn<T>[] {
  const config = getEntityPresentation(entityType);
  const columns = config.table.columns;
  if (!columns.length) return [];

  return columns.map((col: EntityTableColumnConfig) => {
    const overrideRender = overrides?.[col.key];
    const render =
      overrideRender ??
      defaultRenderForHint<T>(col.renderHint ?? "text", col.key);
    return {
      key: col.key as keyof T | string,
      label: col.label,
      sortable: col.sortable,
      render,
    };
  });
}

function defaultRenderForHint<T>(
  hint: string,
  key: string
): (value: unknown, row: T) => React.ReactNode {
  const getVal = (row: T) => {
    const k = key as keyof T;
    return row[k] as unknown;
  };
  switch (hint) {
    case "status":
      return (_value: unknown, row: T) => {
        const v = getVal(row);
        const label = v != null ? String(v) : null;
        return <StatusBadge label={label} variant={getStatusVariant(label)} />;
      };
    case "datetime":
      return (value: unknown) => (value != null && value !== "" ? formatDateTime(String(value)) : "—");
    case "date":
      return (value: unknown) => (value != null && value !== "" ? formatDate(String(value)) : "—");
    case "money": {
      return (value: unknown, row: T) => {
        const v = value ?? getVal(row);
        if (v == null || v === "") return "—";
        const n = Number(v);
        if (Number.isNaN(n)) return String(v);
        if (key.toLowerCase().includes("cents") || key.toLowerCase().includes("_cents")) {
          return formatMoneyFromCents(n);
        }
        return formatMoneyFromDollars(n);
      };
    }
    case "link":
      return (value: unknown) => (value != null && value !== "" ? String(value) : "—");
    case "badge":
      return (value: unknown) => (value != null && value !== "" ? String(value) : "—");
    case "primary_yes_no":
      return (_value: unknown, row: T) => {
        const v = getVal(row);
        return v === true ? "Yes" : "No";
      };
    case "phone":
      return (value: unknown) => (value != null && value !== "" ? formatPhoneUS(String(value)) : "—");
    case "text":
    default:
      return (value: unknown) => (value != null && value !== "" ? String(value) : "—");
  }
}

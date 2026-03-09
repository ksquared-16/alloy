"use client";

import { ReactNode } from "react";

const LABEL_CLASS = "text-alloy-slate text-sm font-medium";
const VALUE_CLASS = "ml-2 text-alloy-forge text-sm";

/**
 * Shared field container for entity drawer: consistent label/value spacing, padding, and alignment.
 * Use for both half-width (span 1) and full-width (span 2) fields — same shell, span controls width.
 */
interface EntityDrawerFieldProps {
  label: string;
  value: ReactNode;
  /** Span in grid: 1 or 2. Default 1. Full-width uses same component, col-span-2. */
  span?: 1 | 2;
  /** When provided, shown instead of value (e.g. input for edit mode). */
  editNode?: ReactNode;
  /** When true, show editNode; otherwise show value. */
  isEditing?: boolean;
  className?: string;
}

export default function EntityDrawerField({ label, value, span = 1, editNode, isEditing, className = "" }: EntityDrawerFieldProps) {
  const showEdit = isEditing && editNode != null;
  return (
    <div
      className={`py-2 min-h-[2rem] ${span === 2 ? "col-span-2" : ""} ${className}`}
      data-entity-field
      data-span={span}
    >
      <span className={LABEL_CLASS}>{label}:</span>
      {showEdit ? (
        <div className="mt-0.5">{editNode}</div>
      ) : (
        <span className={VALUE_CLASS}>{value ?? "—"}</span>
      )}
    </div>
  );
}
